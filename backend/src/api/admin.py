from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.permissions import require_admin, require_staff
from src.auth.jwt import CurrentUser
from src.dependencies import get_db, get_redis

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
        "SELECT id, name, slug, price_cents, max_campaigns_month, max_contacts, "
        "max_messages_month, max_templates, max_team_members "
        "FROM plans WHERE active = true ORDER BY price_cents ASC"
    )
    return {"plans": [{**dict(r), "id": str(r["id"])} for r in rows]}


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
    user: CurrentUser = Depends(require_staff),
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


VALID_ROLES = {"user", "collaborator", "admin"}


@router.patch("/users/{user_id}/role")
async def admin_update_user_role(
    request: Request,
    user_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Change the target user's role. Admin-only. Prevents demoting the last
    active admin."""
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

    if target["role"] == "admin" and new_role != "admin":
        active = await _count_active_admins(db)
        if active <= 1:
            raise HTTPException(
                status_code=400,
                detail="Deve esistere almeno un amministratore attivo.",
            )

    await db.execute(
        "UPDATE users SET role = $1::user_role, updated_at = now() WHERE id = $2",
        new_role,
        user_id,
    )
    return {"role": new_role}


# ── AI Costs dashboard ────────────────────────────────────────

@router.get("/ai/costs")
async def admin_ai_costs(
    request: Request,
    user: CurrentUser = Depends(require_staff),
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
    user: CurrentUser = Depends(require_staff),
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
