from datetime import date

from fastapi import APIRouter, Depends, Request

from src.auth.permissions import require_admin
from src.auth.jwt import CurrentUser
from src.dependencies import get_db

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


@router.get("/users")
async def admin_users(request: Request, user: CurrentUser = Depends(require_admin)):
    db = get_db(request)
    users = await db.fetch("SELECT id, email, role::text, full_name, created_at FROM users ORDER BY created_at DESC")
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
