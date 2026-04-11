from datetime import date

from fastapi import APIRouter, Depends, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db

router = APIRouter()


@router.get("/me/plan")
async def get_my_plan(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)

    sub = await db.fetchrow(
        "SELECT plan_id, status, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = $1",
        user.id,
    )
    if not sub:
        return {"error": "Nessun abbonamento trovato."}, 404

    plan = await db.fetchrow("SELECT * FROM plans WHERE id = $1", sub["plan_id"])
    if not plan:
        return {"error": "Piano non trovato."}, 500

    usage = await db.fetchrow(
        "SELECT campaigns_used, messages_used, contacts_count FROM usage_counters WHERE user_id = $1 AND period_start = $2",
        user.id,
        date.today(),
    )

    plan_dict = dict(plan)
    for k, v in plan_dict.items():
        if hasattr(v, "hex"):
            plan_dict[k] = str(v)
        elif isinstance(v, date):
            plan_dict[k] = v.isoformat()

    return {
        "plan": plan_dict,
        "usage": dict(usage) if usage else {"campaigns_used": 0, "messages_used": 0, "contacts_count": 0},
        "subscription": {
            "status": sub["status"],
            "current_period_end": sub["current_period_end"].isoformat() if sub["current_period_end"] else None,
            "cancel_at_period_end": sub["cancel_at_period_end"],
        },
    }
