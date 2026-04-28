import json
import uuid
from datetime import date

import asyncpg
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.permissions import require_admin, require_permission, require_staff
from src.auth.jwt import CurrentUser
from src.dependencies import get_db, get_redis
from src.services.role_change_emails import send_role_change_email

logger = structlog.get_logger()

router = APIRouter(prefix="/admin")


@router.get("/overview")
async def admin_overview(request: Request, user: CurrentUser = Depends(require_staff)):
    db = get_db(request)
    total_users = await db.fetchval("SELECT count(*) FROM users")
    subs = await db.fetch(
        "SELECT s.plan_id, p.price_cents, p.slug FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status = 'active'"
    )
    mrr = sum(r["price_cents"] for r in subs)
    today = date.today()
    today_usage = await db.fetch("SELECT messages_used FROM usage_counters WHERE period_start = $1", today)
    messages_today = sum(r["messages_used"] for r in today_usage)
    active_campaigns = await db.fetchval("SELECT count(*) FROM campaigns WHERE status = 'running'")
    plan_breakdown: dict[str, int] = {}
    for s in subs:
        slug = s["slug"] or "unknown"
        plan_breakdown[slug] = plan_breakdown.get(slug, 0) + 1
    return {
        "total_users": total_users or 0,
        "mrr_cents": mrr,
        "messages_today": messages_today,
        "active_campaigns": active_campaigns or 0,
        "plan_breakdown": plan_breakdown,
    }


@router.get("/plans")
async def admin_plans(request: Request, user: CurrentUser = Depends(require_staff)):
    db = get_db(request)
    rows = await db.fetch(
        "SELECT id, name, display_name, slug, price_cents, "
        "max_campaigns_month, max_contacts, max_messages_month, "
        "max_templates, max_team_members, "
        "msg_included, overage_rates, ai_features, active_segments "
        "FROM plans WHERE active = true ORDER BY price_cents ASC"
    )
    def _serialize(r):
        d = dict(r)
        d["id"] = str(d["id"])
        if d.get("active_segments") is None:
            d["active_segments"] = []
        return d
    return {"plans": [_serialize(r) for r in rows]}


@router.get("/users")
async def admin_users(request: Request, user: CurrentUser = Depends(require_staff)):
    db = get_db(request)
    users = await db.fetch(
        "SELECT u.id, u.email, u.role::text, u.full_name, u.created_at, "
        "  (au.banned_until IS NOT NULL AND au.banned_until > now()) AS banned, "
        "  (au.email_confirmed_at IS NOT NULL) AS email_confirmed "
        "FROM users u LEFT JOIN auth.users au ON au.id = u.id "
        "ORDER BY u.created_at DESC"
    )
    user_ids = [r["id"] for r in users]
    if not user_ids:
        return {"users": []}
    subs = await db.fetch(
        "SELECT s.user_id, s.status::text as status, s.current_period_end, "
        "       p.name as plan_name, p.slug as plan_slug "
        "FROM subscriptions s JOIN plans p ON p.id = s.plan_id "
        "WHERE s.user_id = ANY($1)",
        user_ids,
    )
    usage = await db.fetch("SELECT user_id, messages_used FROM usage_counters WHERE user_id = ANY($1)", user_ids)
    sub_map = {str(s["user_id"]): s for s in subs}
    usage_map = {str(u["user_id"]): u for u in usage}
    enriched = []
    for u in users:
        uid = str(u["id"])
        sub = sub_map.get(uid)
        usg = usage_map.get(uid)
        enriched.append({
            "id": uid, "email": u["email"], "role": u["role"], "full_name": u["full_name"],
            "created_at": u["created_at"].isoformat() if u["created_at"] else None,
            "subscription": {
                "status": sub["status"],
                "current_period_end": sub["current_period_end"].isoformat() if sub.get("current_period_end") else None,
                "plans": {"name": sub["plan_name"], "slug": sub["plan_slug"]},
            } if sub else None,
            "messages_used": usg["messages_used"] if usg else 0,
            "banned": bool(u["banned"]),
            "email_confirmed": bool(u["email_confirmed"]),
        })
    return {"users": enriched}


@router.get("/campaigns")
async def admin_campaigns(request: Request, user: CurrentUser = Depends(require_staff)):
    db = get_db(request)
    rows = await db.fetch(
        """SELECT c.id, c.name, c.status::text, c.stats, c.started_at, c.completed_at, c.created_at,
                  u.email as user_email, u.full_name as user_full_name,
                  t.name as template_name
           FROM campaigns c
           JOIN users u ON u.id = c.user_id
           LEFT JOIN templates t ON t.id = c.template_id
           ORDER BY c.created_at DESC NULLS LAST"""
    )
    campaigns = []
    for r in rows:
        campaigns.append({
            "id": str(r["id"]), "name": r["name"], "status": r["status"],
            "stats": r["stats"],
            "started_at": r["started_at"].isoformat() if r["started_at"] else None,
            "completed_at": r["completed_at"].isoformat() if r["completed_at"] else None,
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "user": {"email": r["user_email"], "full_name": r["user_full_name"]},
            "template": {"name": r["template_name"]} if r["template_name"] else None,
        })
    return {"campaigns": campaigns}


VALID_PLAN_SLUGS = {"starter", "professional", "enterprise"}


async def _count_active_admins(db) -> int:
    """Count admins that can still sign in (not banned)."""
    return await db.fetchval(
        "SELECT count(*) FROM users u "
        "LEFT JOIN auth.users au ON au.id = u.id "
        "WHERE u.role = 'admin' "
        "AND (au.banned_until IS NULL OR au.banned_until <= now())"
    )


async def _target_is_admin(db, user_id: str) -> bool:
    row = await db.fetchrow("SELECT role FROM users WHERE id = $1", user_id)
    return bool(row) and row["role"] == "admin"


async def _target_is_active_admin(db, user_id: str) -> bool:
    """True if the user is admin AND not currently banned."""
    return bool(
        await db.fetchval(
            "SELECT 1 FROM users u "
            "LEFT JOIN auth.users au ON au.id = u.id "
            "WHERE u.id = $1 AND u.role = 'admin' "
            "AND (au.banned_until IS NULL OR au.banned_until <= now())",
            user_id,
        )
    )


@router.put("/users/{user_id}/plan")
async def admin_update_user_plan(
    request: Request,
    user_id: str,
    user: CurrentUser = Depends(require_admin),
):
    db = get_db(request)
    redis = get_redis(request)
    body = await request.json()
    plan_slug = body.get("plan_slug")

    if not plan_slug or plan_slug not in VALID_PLAN_SLUGS:
        raise HTTPException(
            status_code=400,
            detail=f"plan_slug obbligatorio, valori ammessi: {sorted(VALID_PLAN_SLUGS)}",
        )

    plan = await db.fetchrow(
        "SELECT id, name, slug FROM plans WHERE slug = $1 AND active = true",
        plan_slug,
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Piano non trovato.")

    target = await db.fetchrow("SELECT id FROM users WHERE id = $1", user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Utente non trovato.")

    updated = await db.fetchrow(
        "UPDATE subscriptions SET plan_id = $1, status = 'active', updated_at = now() "
        "WHERE user_id = $2 AND status = 'active' RETURNING id",
        plan["id"],
        user_id,
    )
    if not updated:
        await db.execute(
            "INSERT INTO subscriptions (user_id, plan_id, status) VALUES ($1, $2, 'active')",
            user_id,
            plan["id"],
        )

    await redis.delete(f"plan:{user_id}")

    return {
        "subscription": {
            "status": "active",
            "plans": {"name": plan["name"], "slug": plan["slug"]},
        }
    }


@router.patch("/users/{user_id}")
async def admin_patch_user(
    request: Request,
    user_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Patch an admin-mutable field on a user. Currently supports `banned: bool`
    which sets/clears auth.users.banned_until (permanent ban via 'infinity')."""
    if user_id == str(user.id):
        raise HTTPException(
            status_code=400, detail="Non puoi modificare il tuo stesso account."
        )

    body = await request.json()
    if "banned" not in body or not isinstance(body["banned"], bool):
        raise HTTPException(status_code=400, detail="Campo 'banned' (bool) obbligatorio.")

    db = get_db(request)
    target = await db.fetchrow(
        "SELECT id FROM auth.users WHERE id = $1", user_id
    )
    if not target:
        raise HTTPException(status_code=404, detail="Utente non trovato.")

    if body["banned"] and await _target_is_admin(db, user_id):
        active = await _count_active_admins(db)
        if active <= 1:
            raise HTTPException(
                status_code=400,
                detail="Deve esistere almeno un amministratore attivo.",
            )

    if body["banned"]:
        async with db.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    "UPDATE auth.users SET banned_until = '9999-12-31 23:59:59+00'::timestamptz WHERE id = $1",
                    user_id,
                )
                # Revoke all refresh tokens and destroy sessions so the user
                # cannot keep using an access token already in their browser.
                await conn.execute(
                    "UPDATE auth.refresh_tokens SET revoked = true WHERE user_id = $1",
                    user_id,
                )
                await conn.execute(
                    "DELETE FROM auth.sessions WHERE user_id = $1", user_id
                )
    else:
        await db.execute(
            "UPDATE auth.users SET banned_until = NULL WHERE id = $1",
            user_id,
        )
    return {"banned": body["banned"]}


@router.post("/users/{user_id}/reset-password", status_code=204)
async def admin_reset_user_password(
    request: Request,
    user_id: str,
    user: CurrentUser = Depends(require_permission("admin.users.edit")),
):
    """Set a new password for the target user by updating
    auth.users.encrypted_password via bcrypt. Revokes all their existing
    sessions so the next login must use the new password."""
    body = await request.json()
    new_password = body.get("password")
    if not isinstance(new_password, str) or len(new_password) < 10:
        raise HTTPException(
            status_code=400,
            detail="Password deve essere almeno 10 caratteri.",
        )

    db = get_db(request)
    target = await db.fetchrow("SELECT id FROM auth.users WHERE id = $1", user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Utente non trovato.")

    async with db.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE auth.users SET encrypted_password = crypt($1, gen_salt('bf')), "
                "updated_at = now() WHERE id = $2",
                new_password,
                user_id,
            )
            await conn.execute(
                "UPDATE auth.refresh_tokens SET revoked = true WHERE user_id = $1",
                user_id,
            )
            await conn.execute(
                "DELETE FROM auth.sessions WHERE user_id = $1", user_id
            )
    return None


@router.delete("/users/{user_id}", status_code=204)
async def admin_delete_user(
    request: Request,
    user_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Hard-delete a user: wipes public.users (CASCADE removes app data)
    then auth.users so GoTrue can no longer authenticate the account."""
    if user_id == str(user.id):
        raise HTTPException(
            status_code=400, detail="Non puoi eliminare il tuo stesso account."
        )

    db = get_db(request)
    redis = get_redis(request)

    target = await db.fetchrow("SELECT id, role::text FROM users WHERE id = $1", user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Utente non trovato.")

    if await _target_is_active_admin(db, user_id):
        active = await _count_active_admins(db)
        if active <= 1:
            raise HTTPException(
                status_code=400,
                detail="Deve esistere almeno un amministratore attivo.",
            )

    async with db.acquire() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM public.users WHERE id = $1", user_id)
            await conn.execute("DELETE FROM auth.users WHERE id = $1", user_id)

    await redis.delete(f"plan:{user_id}")
    return None


VALID_ROLES = {"user", "collaborator", "sales", "admin"}


@router.patch("/users/{user_id}/role")
async def admin_update_user_role(
    request: Request,
    user_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Change the target user's role. Admin-only. Prevents demoting the last
    active admin. Writes an audit_log row and sends a branded notification
    email. Email failures are logged but do not abort the request."""
    if user_id == str(user.id):
        raise HTTPException(status_code=400, detail="Non puoi modificare il tuo ruolo.")

    body = await request.json()
    new_role = body.get("role")
    if new_role not in VALID_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"role obbligatorio, valori ammessi: {sorted(VALID_ROLES)}",
        )

    db = get_db(request)
    target = await db.fetchrow("SELECT role::text FROM users WHERE id = $1", user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Utente non trovato.")

    old_role = target["role"]

    # No-op: no update, no audit, no email.
    if old_role == new_role:
        return {"role": new_role, "previous_role": old_role}

    if old_role == "admin" and new_role != "admin":
        active = await _count_active_admins(db)
        if active <= 1:
            raise HTTPException(
                status_code=400,
                detail="Deve esistere almeno un amministratore attivo.",
            )

    async with db.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE users SET role = $1::user_role, updated_at = now() WHERE id = $2",
                new_role,
                user_id,
            )
            await conn.execute(
                "INSERT INTO audit_log (actor_id, action, target_id, metadata) "
                "VALUES ($1, 'role_change', $2, $3::jsonb)",
                user.id,
                user_id,
                json.dumps({"old": old_role, "new": new_role}),
            )

    # Fire-and-forget: role change stands even if email fails.
    try:
        await send_role_change_email(db, user_id, old_role, new_role, user.email)
    except Exception as exc:
        logger.warning("role_change_email_unexpected_error", error=str(exc))

    return {"role": new_role, "previous_role": old_role}


@router.get("/me/permissions")
async def admin_me_permissions(
    request: Request,
    user: CurrentUser = Depends(require_staff),
):
    """Return the calling user's role and flattened permission set.
    Used by the frontend to gate admin tabs and destructive buttons."""
    db = get_db(request)
    rows = await db.fetch(
        "SELECT permission FROM role_permissions WHERE role = $1::user_role",
        user.role,
    )
    return {"role": user.role, "permissions": [r["permission"] for r in rows]}


# ── AI Costs dashboard ────────────────────────────────────────

@router.get("/ai/costs")
async def admin_ai_costs(
    request: Request,
    user: CurrentUser = Depends(require_permission("admin.ai_costs.view")),
    days: int = 30,
):
    """Aggregates from ai_usage_ledger for the last N days (default 30).

    Returns KPIs, breakdown by model, by operation, timeline per day,
    and top 10 users by credits consumed (system_key only — BYOK users
    don't cost us anything, but we track them separately for analytics).
    """
    days = max(1, min(days, 365))
    db = get_db(request)

    # Total KPIs (system_key only = our Anthropic spend)
    kpis = await db.fetchrow(
        f"""SELECT
              COALESCE(SUM(credits), 0)::numeric(12,2)              AS total_credits,
              COALESCE(SUM(estimated_cost_usd), 0)::numeric(12,4)   AS total_cost_usd,
              COALESCE(SUM(tokens_in), 0)                           AS total_tokens_in,
              COALESCE(SUM(tokens_out), 0)                          AS total_tokens_out,
              COUNT(*)                                              AS total_calls,
              COUNT(DISTINCT user_id)                               AS active_users
           FROM ai_usage_ledger
           WHERE source = 'system_key'
             AND created_at >= now() - interval '{days} days'"""
    )

    # BYOK stats (not our cost, but useful to see who's using what)
    byok = await db.fetchrow(
        f"""SELECT
              COUNT(*)                                              AS total_calls,
              COUNT(DISTINCT user_id)                               AS active_users,
              COALESCE(SUM(tokens_in), 0)                           AS tokens_in,
              COALESCE(SUM(tokens_out), 0)                          AS tokens_out
           FROM ai_usage_ledger
           WHERE source = 'byok'
             AND created_at >= now() - interval '{days} days'"""
    )

    # By model
    by_model = await db.fetch(
        f"""SELECT
              model,
              COUNT(*)                                              AS calls,
              COALESCE(SUM(credits), 0)::numeric(12,2)              AS credits,
              COALESCE(SUM(estimated_cost_usd), 0)::numeric(12,4)   AS cost_usd
           FROM ai_usage_ledger
           WHERE source = 'system_key'
             AND created_at >= now() - interval '{days} days'
           GROUP BY model
           ORDER BY cost_usd DESC"""
    )

    # By operation
    by_operation = await db.fetch(
        f"""SELECT
              operation,
              COUNT(*)                                              AS calls,
              COALESCE(SUM(credits), 0)::numeric(12,2)              AS credits,
              COALESCE(SUM(estimated_cost_usd), 0)::numeric(12,4)   AS cost_usd
           FROM ai_usage_ledger
           WHERE source = 'system_key'
             AND created_at >= now() - interval '{days} days'
           GROUP BY operation
           ORDER BY credits DESC"""
    )

    # Daily timeline (for chart)
    timeline = await db.fetch(
        f"""SELECT
              date_trunc('day', created_at)::date                   AS day,
              COALESCE(SUM(credits), 0)::numeric(12,2)              AS credits,
              COALESCE(SUM(estimated_cost_usd), 0)::numeric(12,4)   AS cost_usd
           FROM ai_usage_ledger
           WHERE source = 'system_key'
             AND created_at >= now() - interval '{days} days'
           GROUP BY day
           ORDER BY day ASC"""
    )

    # Top 10 users
    top_users = await db.fetch(
        f"""SELECT
              l.user_id,
              u.email,
              u.full_name,
              COUNT(*)                                              AS calls,
              COALESCE(SUM(l.credits), 0)::numeric(12,2)            AS credits,
              COALESCE(SUM(l.estimated_cost_usd), 0)::numeric(12,4) AS cost_usd
           FROM ai_usage_ledger l
           JOIN users u ON u.id = l.user_id
           WHERE l.source = 'system_key'
             AND l.created_at >= now() - interval '{days} days'
           GROUP BY l.user_id, u.email, u.full_name
           ORDER BY credits DESC
           LIMIT 10"""
    )

    return {
        "days": days,
        "system_key": {
            "total_credits": float(kpis["total_credits"]),
            "total_cost_usd": float(kpis["total_cost_usd"]),
            "total_tokens_in": int(kpis["total_tokens_in"]),
            "total_tokens_out": int(kpis["total_tokens_out"]),
            "total_calls": int(kpis["total_calls"]),
            "active_users": int(kpis["active_users"]),
        },
        "byok": {
            "total_calls": int(byok["total_calls"]),
            "active_users": int(byok["active_users"]),
            "tokens_in": int(byok["tokens_in"]),
            "tokens_out": int(byok["tokens_out"]),
        },
        "by_model": [
            {
                "model": r["model"],
                "calls": int(r["calls"]),
                "credits": float(r["credits"]),
                "cost_usd": float(r["cost_usd"]),
            }
            for r in by_model
        ],
        "by_operation": [
            {
                "operation": r["operation"],
                "calls": int(r["calls"]),
                "credits": float(r["credits"]),
                "cost_usd": float(r["cost_usd"]),
            }
            for r in by_operation
        ],
        "timeline": [
            {
                "day": r["day"].isoformat() if r["day"] else None,
                "credits": float(r["credits"]),
                "cost_usd": float(r["cost_usd"]),
            }
            for r in timeline
        ],
        "top_users": [
            {
                "user_id": str(r["user_id"]),
                "email": r["email"],
                "full_name": r["full_name"],
                "calls": int(r["calls"]),
                "credits": float(r["credits"]),
                "cost_usd": float(r["cost_usd"]),
            }
            for r in top_users
        ],
    }


@router.get("/ai/revenue")
async def admin_ai_revenue(
    request: Request,
    user: CurrentUser = Depends(require_permission("admin.ai_revenue.view")),
    days: int = 30,
):
    """Revenue breakdown between subscription (recurring) and top-up (one-shot).

    MRR: sum of active subscriptions' plan price.
    Top-up revenue: completed ai_credit_purchases in the window.
    Includes 'heavy top-up buyers' (>=3 purchases in window) to suggest
    upgrades to Enterprise.
    """
    days = max(1, min(days, 365))
    db = get_db(request)

    # MRR (current snapshot, not windowed)
    mrr_row = await db.fetchrow(
        """SELECT COALESCE(SUM(p.price_cents), 0) AS mrr_cents
           FROM subscriptions s JOIN plans p ON p.id = s.plan_id
           WHERE s.status = 'active' AND p.slug != 'free'"""
    )

    # Subscription MRR by plan
    mrr_by_plan = await db.fetch(
        """SELECT p.name, p.slug, COUNT(*) AS subs, p.price_cents,
                  (COUNT(*) * p.price_cents)::integer AS total_cents
           FROM subscriptions s JOIN plans p ON p.id = s.plan_id
           WHERE s.status = 'active' AND p.slug != 'free'
           GROUP BY p.name, p.slug, p.price_cents
           ORDER BY p.price_cents ASC"""
    )

    # Top-up revenue (completed purchases in window)
    topup_kpis = await db.fetchrow(
        f"""SELECT
              COALESCE(SUM(amount_cents), 0)::integer                AS total_cents,
              COUNT(*)                                               AS purchases,
              COUNT(DISTINCT user_id)                                AS buyers,
              COALESCE(SUM(credits_purchased), 0)::integer           AS credits_sold
           FROM ai_credit_purchases
           WHERE status = 'completed'
             AND completed_at >= now() - interval '{days} days'"""
    )

    # Top-up by pack
    topup_by_pack = await db.fetch(
        f"""SELECT
              pack_slug,
              COUNT(*)                                               AS purchases,
              COALESCE(SUM(amount_cents), 0)::integer                AS total_cents,
              COALESCE(SUM(credits_purchased), 0)::integer           AS credits
           FROM ai_credit_purchases
           WHERE status = 'completed'
             AND completed_at >= now() - interval '{days} days'
           GROUP BY pack_slug
           ORDER BY total_cents DESC"""
    )

    # Heavy buyers — 3+ purchases in window = candidate for upgrade suggestion
    heavy_buyers = await db.fetch(
        f"""SELECT
              u.id AS user_id,
              u.email,
              u.full_name,
              COUNT(*)                                               AS purchases,
              COALESCE(SUM(acp.amount_cents), 0)::integer            AS total_cents
           FROM ai_credit_purchases acp
           JOIN users u ON u.id = acp.user_id
           WHERE acp.status = 'completed'
             AND acp.completed_at >= now() - interval '{days} days'
           GROUP BY u.id, u.email, u.full_name
           HAVING COUNT(*) >= 3
           ORDER BY purchases DESC, total_cents DESC
           LIMIT 20"""
    )

    return {
        "days": days,
        "subscription": {
            "mrr_cents": int(mrr_row["mrr_cents"]),
            "by_plan": [
                {
                    "name": r["name"],
                    "slug": r["slug"],
                    "subs": int(r["subs"]),
                    "price_cents": int(r["price_cents"]),
                    "total_cents": int(r["total_cents"]),
                }
                for r in mrr_by_plan
            ],
        },
        "topup": {
            "total_cents": int(topup_kpis["total_cents"]),
            "purchases": int(topup_kpis["purchases"]),
            "buyers": int(topup_kpis["buyers"]),
            "credits_sold": int(topup_kpis["credits_sold"]),
            "by_pack": [
                {
                    "pack_slug": r["pack_slug"],
                    "purchases": int(r["purchases"]),
                    "total_cents": int(r["total_cents"]),
                    "credits": int(r["credits"]),
                }
                for r in topup_by_pack
            ],
        },
        "heavy_buyers": [
            {
                "user_id": str(r["user_id"]),
                "email": r["email"],
                "full_name": r["full_name"],
                "purchases": int(r["purchases"]),
                "total_cents": int(r["total_cents"]),
            }
            for r in heavy_buyers
        ],
    }



# ── Stripe configuration / payments admin ────────────────────

@router.get("/stripe/status")
async def admin_stripe_status(
    request: Request,
    user: CurrentUser = Depends(require_admin),
):
    """Snapshot of Stripe configuration + last 50 webhook events.

    Powers the admin "Pagamenti" tab. Resolves keys via DB (system_config,
    encrypted) with env fallback. Never returns the secret key in plaintext.
    """
    import os
    import stripe as _stripe
    from src.services.billing import (
        resolve_stripe_secret_key,
        resolve_stripe_webhook_secret,
        resolve_stripe_publishable_key,
        SYSCFG_STRIPE_SECRET,
        SYSCFG_STRIPE_WEBHOOK,
        SYSCFG_STRIPE_PUBLISHABLE,
    )

    db = get_db(request)
    secret_key = await resolve_stripe_secret_key(db)
    webhook_secret = await resolve_stripe_webhook_secret(db)
    publishable = await resolve_stripe_publishable_key(db)
    app_url = os.getenv("APP_URL", "")

    # Tell the operator where each value comes from so they can decide
    # whether to migrate it from .env to the DB-backed admin form.
    db_keys = {
        r["key"]: True
        for r in await db.fetch(
            "SELECT key FROM system_config WHERE key = ANY($1::text[])",
            [SYSCFG_STRIPE_SECRET, SYSCFG_STRIPE_WEBHOOK, SYSCFG_STRIPE_PUBLISHABLE],
        )
    }
    sources = {
        "secret_key": "db" if db_keys.get(SYSCFG_STRIPE_SECRET) else ("env" if os.getenv("STRIPE_SECRET_KEY") else None),
        "webhook_secret": "db" if db_keys.get(SYSCFG_STRIPE_WEBHOOK) else ("env" if os.getenv("STRIPE_WEBHOOK_SECRET") else None),
        "publishable_key": "db" if db_keys.get(SYSCFG_STRIPE_PUBLISHABLE) else ("env" if os.getenv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") else None),
    }

    mode = None
    if secret_key.startswith("sk_test_"):
        mode = "test"
    elif secret_key.startswith("sk_live_"):
        mode = "live"

    # Live ping — verifies the secret is valid without exposing it.
    balance_ok = False
    balance_error: str | None = None
    if secret_key:
        try:
            _stripe.api_key = secret_key
            _stripe.Balance.retrieve()
            balance_ok = True
        except Exception as e:  # noqa: BLE001
            balance_error = str(e)[:300]

    # Plan price IDs from DB (stripe_price_id column on plans).
    # display_name is the β+ v2 user-facing name (Avvio/Essenziale/Plus/Premium);
    # falls back to `name` for plans seeded before migration 026.
    plans = await db.fetch(
        "SELECT id, slug, name, display_name, price_cents, stripe_price_id "
        "FROM plans WHERE active = true AND slug != 'free' "
        "ORDER BY price_cents ASC"
    )

    # Top-up packs: now DB-backed (migration 030). The stripe_price_id can come
    # from DB or fall back to ENV (legacy). The admin tab uses /admin/topup-packs
    # for full CRUD; here we surface a compact summary for the checklist.
    from src.services.credit_topup import list_packs_admin
    topup_pack_rows = await list_packs_admin(db)
    topup_packs = [
        {
            "slug": p["slug"],
            "credits": p["credits"],
            "amount_cents": p["amount_cents"],
            "price_id": p["stripe_price_id"] or "",
            "source": p["stripe_price_id_source"],
            "active": p["active"],
        }
        for p in topup_pack_rows
    ]

    # Recent webhook events for the activity log.
    events = await db.fetch(
        "SELECT stripe_event_id, event_type, status, error_message, payload_summary, received_at "
        "FROM stripe_webhook_events ORDER BY received_at DESC LIMIT 50"
    )

    last_event = events[0]["received_at"] if events else None

    webhook_path = "/api/v1/billing/webhook"
    webhook_url = f"{app_url}{webhook_path}" if app_url else webhook_path

    checklist = {
        "secret_key": bool(secret_key),
        "webhook_secret": bool(webhook_secret),
        "publishable_key": bool(publishable),
        "balance_ok": balance_ok,
        "all_plans_priced": all(bool(p["stripe_price_id"]) for p in plans),
        "all_topups_priced": all(bool(p["price_id"]) for p in topup_packs),
        "webhook_received_recently": last_event is not None,
    }

    return {
        "mode": mode,
        "balance_ok": balance_ok,
        "balance_error": balance_error,
        "publishable_key_preview": publishable[:12] + "..." if publishable else None,
        "webhook_url": webhook_url,
        "checklist": checklist,
        "sources": sources,
        "plans": [
            {
                "id": str(p["id"]),
                "slug": p["slug"],
                "name": p["name"],
                "display_name": p["display_name"],
                "price_cents": p["price_cents"],
                "stripe_price_id": p["stripe_price_id"],
            }
            for p in plans
        ],
        "topup_packs": topup_packs,
        "webhook_events": [
            {
                "stripe_event_id": e["stripe_event_id"],
                "event_type": e["event_type"],
                "status": e["status"],
                "error_message": e["error_message"],
                "payload_summary": e["payload_summary"],
                "received_at": e["received_at"].isoformat() if e["received_at"] else None,
            }
            for e in events
        ],
    }


@router.patch("/plans/{plan_id}/stripe-price-id")
async def admin_update_plan_stripe_price_id(
    plan_id: str,
    request: Request,
    user: CurrentUser = Depends(require_admin),
):
    """Update the Stripe Price ID for a plan from the admin UI."""
    body = await request.json()
    raw = body.get("stripe_price_id")
    price_id = (raw or "").strip() or None

    if price_id and not price_id.startswith("price_"):
        raise HTTPException(
            status_code=400,
            detail="Lo Stripe Price ID deve iniziare con 'price_'.",
        )

    db = get_db(request)
    # NB: `plans` table has no updated_at column (see migrations/004); don't add it here.
    try:
        plan_uuid = uuid.UUID(plan_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="ID piano non valido.")
    row = await db.fetchrow(
        "UPDATE plans SET stripe_price_id = $1 "
        "WHERE id = $2 RETURNING id, slug, stripe_price_id",
        price_id, plan_uuid,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Piano non trovato.")

    logger.info(
        "admin_stripe_price_updated",
        admin_id=str(user.id),
        plan_id=str(row["id"]),
        slug=row["slug"],
        price_id=price_id,
    )
    return {"id": str(row["id"]), "slug": row["slug"], "stripe_price_id": row["stripe_price_id"]}


# ── Top-up packs CRUD + Stripe sync (admin-only) ─────────────

@router.get("/topup-packs")
async def admin_list_topup_packs(
    request: Request,
    user: CurrentUser = Depends(require_admin),
):
    """Full top-up pack catalog with Stripe linkage and inactive entries."""
    from src.services.credit_topup import list_packs_admin
    db = get_db(request)
    return {"packs": await list_packs_admin(db)}


def _validate_topup_payload(body: dict, *, partial: bool) -> dict:
    """Coerce + validate a topup pack request body. Raises HTTPException(400) on bad input."""
    out: dict = {}

    def take_str(key: str, *, allow_empty: bool = False, max_len: int = 200):
        if key in body:
            v = body[key]
            if v is None and allow_empty:
                out[key] = None
                return
            if not isinstance(v, str):
                raise HTTPException(status_code=400, detail=f"{key} deve essere stringa.")
            v = v.strip()
            if not v and not allow_empty:
                raise HTTPException(status_code=400, detail=f"{key} non può essere vuoto.")
            if len(v) > max_len:
                raise HTTPException(status_code=400, detail=f"{key} troppo lungo (max {max_len}).")
            out[key] = v or None

    def take_int(key: str, *, minimum: int | None = None):
        if key in body:
            v = body[key]
            if isinstance(v, bool) or not isinstance(v, int):
                raise HTTPException(status_code=400, detail=f"{key} deve essere intero.")
            if minimum is not None and v < minimum:
                raise HTTPException(status_code=400, detail=f"{key} deve essere ≥ {minimum}.")
            out[key] = v

    take_str("slug")
    take_str("name")
    take_int("credits", minimum=1)
    take_int("amount_cents", minimum=1)
    take_str("currency")
    take_str("badge", allow_empty=True, max_len=50)
    take_str("stripe_product_id", allow_empty=True)
    take_str("stripe_price_id", allow_empty=True)
    take_int("sort_order", minimum=0)

    if "active" in body:
        if not isinstance(body["active"], bool):
            raise HTTPException(status_code=400, detail="active deve essere booleano.")
        out["active"] = body["active"]

    if "stripe_price_id" in out and out["stripe_price_id"] and not out["stripe_price_id"].startswith("price_"):
        raise HTTPException(status_code=400, detail="stripe_price_id deve iniziare con 'price_'.")
    if "stripe_product_id" in out and out["stripe_product_id"] and not out["stripe_product_id"].startswith("prod_"):
        raise HTTPException(status_code=400, detail="stripe_product_id deve iniziare con 'prod_'.")

    if not partial:
        # On create, require core fields.
        for required in ("slug", "name", "credits", "amount_cents"):
            if required not in out:
                raise HTTPException(status_code=400, detail=f"{required} obbligatorio.")

    return out


@router.post("/topup-packs")
async def admin_create_topup_pack(
    request: Request,
    user: CurrentUser = Depends(require_admin),
):
    """Create a new top-up pack. Slug must be unique."""
    from src.services.credit_topup import _row_to_dict
    body = await request.json()
    data = _validate_topup_payload(body, partial=False)
    db = get_db(request)

    try:
        row = await db.fetchrow(
            """INSERT INTO topup_packs
               (slug, name, credits, amount_cents, currency, badge,
                stripe_product_id, stripe_price_id, active, sort_order)
               VALUES ($1, $2, $3, $4, COALESCE($5, 'eur'), $6, $7, $8, COALESCE($9, true), COALESCE($10, 0))
               RETURNING id, slug, name, credits, amount_cents, currency, badge,
                         stripe_product_id, stripe_price_id, active, sort_order,
                         created_at, updated_at""",
            data["slug"], data["name"], data["credits"], data["amount_cents"],
            data.get("currency"), data.get("badge"),
            data.get("stripe_product_id"), data.get("stripe_price_id"),
            data.get("active"), data.get("sort_order"),
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=409, detail=f"Slug '{data['slug']}' già esistente.")

    logger.info("admin_topup_pack_created", admin_id=str(user.id), slug=row["slug"])
    return _row_to_dict(row, include_admin=True)


@router.patch("/topup-packs/{pack_id}")
async def admin_update_topup_pack(
    pack_id: str,
    request: Request,
    user: CurrentUser = Depends(require_admin),
):
    """Update a top-up pack. Any subset of fields can be sent."""
    from src.services.credit_topup import _row_to_dict
    body = await request.json()
    data = _validate_topup_payload(body, partial=True)
    if not data:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare.")

    try:
        pack_uuid = uuid.UUID(pack_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="ID pack non valido.")

    # Build dynamic SET clause
    set_parts = []
    args: list = []
    for i, (key, value) in enumerate(data.items(), start=1):
        set_parts.append(f"{key} = ${i}")
        args.append(value)
    args.append(pack_uuid)

    db = get_db(request)
    try:
        row = await db.fetchrow(
            f"""UPDATE topup_packs SET {', '.join(set_parts)}
                WHERE id = ${len(args)}
                RETURNING id, slug, name, credits, amount_cents, currency, badge,
                          stripe_product_id, stripe_price_id, active, sort_order,
                          created_at, updated_at""",
            *args,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=409, detail="Slug già usato da un altro pack.")

    if not row:
        raise HTTPException(status_code=404, detail="Pack non trovato.")

    logger.info("admin_topup_pack_updated", admin_id=str(user.id), slug=row["slug"], fields=list(data.keys()))
    return _row_to_dict(row, include_admin=True)


@router.delete("/topup-packs/{pack_id}")
async def admin_delete_topup_pack(
    pack_id: str,
    request: Request,
    user: CurrentUser = Depends(require_admin),
):
    """Soft-delete (deactivate) a top-up pack. We never hard-delete because
    historical purchases reference pack_slug for reporting."""
    try:
        pack_uuid = uuid.UUID(pack_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="ID pack non valido.")
    db = get_db(request)
    row = await db.fetchrow(
        "UPDATE topup_packs SET active = false WHERE id = $1 RETURNING slug",
        pack_uuid,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Pack non trovato.")
    logger.info("admin_topup_pack_deactivated", admin_id=str(user.id), slug=row["slug"])
    return {"slug": row["slug"], "active": False}


@router.post("/topup-packs/sync-from-stripe")
async def admin_sync_topup_packs_from_stripe(
    request: Request,
    user: CurrentUser = Depends(require_admin),
):
    """Pull-sync from Stripe: match Products tagged metadata.wamply_type=topup
    and metadata.wamply_slug=<slug>, link their first active one_time price
    into topup_packs.stripe_price_id.

    Stripe is read-only here. To create products/prices, do it manually on
    Stripe Dashboard with the required metadata, then run this sync.
    """
    from src.services.credit_topup import sync_topup_packs_from_stripe
    db = get_db(request)
    try:
        result = await sync_topup_packs_from_stripe(db)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    logger.info(
        "admin_topup_sync_from_stripe",
        admin_id=str(user.id),
        examined=result["examined"],
        linked=len(result["linked"]),
        skipped=len(result["skipped"]),
    )
    return result


@router.post("/stripe/credentials")
async def admin_save_stripe_credentials(
    request: Request,
    user: CurrentUser = Depends(require_admin),
):
    """Save Stripe API credentials into system_config (encrypted) so the
    operator can rotate them without touching .env or redeploying.

    Body: { secret_key?, webhook_secret?, publishable_key? }
    Empty string clears the value (falls back to env).
    Missing field leaves the existing value untouched.
    """
    from src.services.encryption import encrypt
    from src.services.billing import (
        SYSCFG_STRIPE_SECRET,
        SYSCFG_STRIPE_WEBHOOK,
        SYSCFG_STRIPE_PUBLISHABLE,
    )

    body = await request.json()
    db = get_db(request)

    updates: list[tuple[str, str, str]] = []  # (key, label, raw_value)

    if "secret_key" in body:
        raw = (body.get("secret_key") or "").strip()
        if raw and not (raw.startswith("sk_test_") or raw.startswith("sk_live_")):
            raise HTTPException(
                status_code=400,
                detail="La secret key deve iniziare con sk_test_ o sk_live_.",
            )
        updates.append((SYSCFG_STRIPE_SECRET, "secret_key", raw))

    if "webhook_secret" in body:
        raw = (body.get("webhook_secret") or "").strip()
        if raw and not raw.startswith("whsec_"):
            raise HTTPException(
                status_code=400,
                detail="Il webhook secret deve iniziare con whsec_.",
            )
        updates.append((SYSCFG_STRIPE_WEBHOOK, "webhook_secret", raw))

    if "publishable_key" in body:
        raw = (body.get("publishable_key") or "").strip()
        if raw and not (raw.startswith("pk_test_") or raw.startswith("pk_live_")):
            raise HTTPException(
                status_code=400,
                detail="La publishable key deve iniziare con pk_test_ o pk_live_.",
            )
        updates.append((SYSCFG_STRIPE_PUBLISHABLE, "publishable_key", raw))

    if not updates:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare.")

    saved: list[str] = []
    cleared: list[str] = []
    for key, label, raw in updates:
        if raw == "":
            await db.execute("DELETE FROM system_config WHERE key = $1", key)
            cleared.append(label)
        else:
            ciphertext = encrypt(raw)
            await db.execute(
                """INSERT INTO system_config (key, value, updated_at)
                   VALUES ($1, $2, now())
                   ON CONFLICT (key) DO UPDATE
                     SET value = EXCLUDED.value, updated_at = now()""",
                key, ciphertext,
            )
            saved.append(label)

    logger.info(
        "admin_stripe_credentials_updated",
        admin_id=str(user.id),
        saved=saved,
        cleared=cleared,
    )
    return {"saved": saved, "cleared": cleared}
