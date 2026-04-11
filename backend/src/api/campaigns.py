import json

from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db, get_redis
from src.services.plan_limits import check_plan_limit

router = APIRouter(prefix="/campaigns")


def _serialize_row(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
        elif hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


@router.get("")
async def list_campaigns(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    status: str | None = None,
):
    db = get_db(request)
    if status:
        rows = await db.fetch(
            "SELECT * FROM campaigns WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC",
            user.id, status,
        )
    else:
        rows = await db.fetch(
            "SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC",
            user.id,
        )
    return {"campaigns": [_serialize_row(r) for r in rows]}


@router.post("", status_code=201)
async def create_campaign(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    redis = get_redis(request)
    await check_plan_limit(db, redis, user.id, "campaigns")

    body = await request.json()
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Il nome della campagna è obbligatorio.")

    scheduled_at = body.get("scheduled_at")
    row = await db.fetchrow(
        """INSERT INTO campaigns (user_id, name, template_id, group_id, segment_query, status, scheduled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *""",
        user.id, name, body.get("template_id"), body.get("group_id"),
        json.dumps(body.get("segment_query", {})),
        "scheduled" if scheduled_at else "draft", scheduled_at,
    )
    return _serialize_row(row)


@router.get("/{campaign_id}")
async def get_campaign(
    request: Request, campaign_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    row = await db.fetchrow(
        """SELECT c.*, t.name as template_name, t.category as template_category
           FROM campaigns c LEFT JOIN templates t ON t.id = c.template_id
           WHERE c.id = $1 AND c.user_id = $2""",
        campaign_id, user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")
    return _serialize_row(row)


@router.put("/{campaign_id}")
async def update_campaign(
    request: Request, campaign_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ["name", "template_id", "group_id", "segment_query", "status", "scheduled_at"]:
        if key in body:
            fields.append(f"{key} = ${idx}")
            val = body[key]
            if key == "segment_query" and isinstance(val, dict):
                val = json.dumps(val)
            params.append(val)
            idx += 1
    if not fields:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare.")
    params.extend([campaign_id, user.id])
    row = await db.fetchrow(
        f"UPDATE campaigns SET {', '.join(fields)}, updated_at = now() WHERE id = ${idx} AND user_id = ${idx + 1} RETURNING *",
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")
    return _serialize_row(row)


@router.post("/{campaign_id}/launch")
async def launch_campaign(
    request: Request, campaign_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    redis = get_redis(request)
    await check_plan_limit(db, redis, user.id, "campaigns")

    row = await db.fetchrow(
        "SELECT id, status FROM campaigns WHERE id = $1 AND user_id = $2",
        campaign_id, user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Campagna non trovata.")
    if row["status"] not in ("draft", "scheduled"):
        raise HTTPException(status_code=400, detail=f"La campagna è in stato '{row['status']}'.")

    await redis.lpush("campaigns", campaign_id)
    await db.execute(
        "UPDATE campaigns SET status = 'running', started_at = now() WHERE id = $1",
        campaign_id,
    )
    return {"success": True, "campaign_id": str(row["id"]), "launched": True}
