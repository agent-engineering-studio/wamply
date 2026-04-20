from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.permissions import require_admin
from src.auth.jwt import CurrentUser
from src.dependencies import get_db, get_redis

router = APIRouter(prefix="/admin")


@router.get("/overview")
async def admin_overview(request: Request, user: CurrentUser = Depends(require_admin)):
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
async def admin_plans(request: Request, user: CurrentUser = Depends(require_admin)):
    db = get_db(request)
    rows = await db.fetch(
        "SELECT id, name, slug, price_cents, max_campaigns_month, max_contacts, "
        "max_messages_month, max_templates, max_team_members "
        "FROM plans WHERE active = true ORDER BY price_cents ASC"
    )
    return {"plans": [{**dict(r), "id": str(r["id"])} for r in rows]}


@router.get("/users")
async def admin_users(request: Request, user: CurrentUser = Depends(require_admin)):
    db = get_db(request)
    users = await db.fetch(
        "SELECT u.id, u.email, u.role::text, u.full_name, u.created_at, "
        "  (au.banned_until IS NOT NULL AND au.banned_until > now()) AS banned "
        "FROM users u LEFT JOIN auth.users au ON au.id = u.id "
        "ORDER BY u.created_at DESC"
    )
    user_ids = [r["id"] for r in users]
    if not user_ids:
        return {"users": []}
    subs = await db.fetch(
        "SELECT s.user_id, s.status, p.name as plan_name, p.slug as plan_slug FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = ANY($1)",
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
            "subscription": {"status": sub["status"], "plans": {"name": sub["plan_name"], "slug": sub["plan_slug"]}} if sub else None,
            "messages_used": usg["messages_used"] if usg else 0,
            "banned": bool(u["banned"]),
        })
    return {"users": enriched}


@router.get("/campaigns")
async def admin_campaigns(request: Request, user: CurrentUser = Depends(require_admin)):
    db = get_db(request)
    rows = await db.fetch(
        """SELECT c.id, c.name, c.status, c.stats, c.started_at,
                  u.email as user_email, u.full_name as user_full_name
           FROM campaigns c JOIN users u ON u.id = c.user_id
           WHERE c.status IN ('running', 'scheduled')
           ORDER BY c.started_at DESC NULLS LAST"""
    )
    campaigns = []
    for r in rows:
        campaigns.append({
            "id": str(r["id"]), "name": r["name"], "status": r["status"],
            "stats": r["stats"],
            "started_at": r["started_at"].isoformat() if r["started_at"] else None,
            "user": {"email": r["user_email"], "full_name": r["user_full_name"]},
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
    user: CurrentUser = Depends(require_admin),
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
