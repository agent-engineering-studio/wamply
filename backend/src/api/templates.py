import json

from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db, get_redis
from src.services.plan_limits import check_plan_limit

router = APIRouter(prefix="/templates")


def _serialize_row(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
        elif hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


@router.get("")
async def list_templates(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    rows = await db.fetch(
        "SELECT * FROM templates WHERE user_id = $1 AND status != 'archived' "
        "ORDER BY created_at DESC",
        user.id,
    )
    return {"templates": [_serialize_row(r) for r in rows]}


@router.post("", status_code=201)
async def create_template(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    redis = get_redis(request)
    await check_plan_limit(db, redis, user.id, "templates")
    body = await request.json()
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Il nome del template è obbligatorio.")
    row = await db.fetchrow(
        """INSERT INTO templates (user_id, name, language, category, components, status)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *""",
        user.id, name, body.get("language", "it"), body.get("category", "marketing"),
        json.dumps(body.get("components", [])), body.get("status", "approved"),
    )
    return _serialize_row(row)


@router.get("/{template_id}")
async def get_template(request: Request, template_id: str, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    row = await db.fetchrow(
        "SELECT * FROM templates WHERE id = $1 AND user_id = $2 AND status != 'archived'",
        template_id, user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template non trovato.")
    return _serialize_row(row)


@router.put("/{template_id}")
async def update_template(request: Request, template_id: str, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ["name", "language", "category", "components", "status"]:
        if key in body:
            fields.append(f"{key} = ${idx}")
            val = body[key]
            if key == "components" and isinstance(val, list):
                val = json.dumps(val)
            params.append(val)
            idx += 1
    if not fields:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare.")
    params.extend([template_id, user.id])
    row = await db.fetchrow(
        f"UPDATE templates SET {', '.join(fields)}, updated_at = now() WHERE id = ${idx} AND user_id = ${idx + 1} RETURNING *",
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template non trovato.")
    return _serialize_row(row)


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    request: Request, template_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    row = await db.fetchrow(
        "UPDATE templates SET status = 'archived', updated_at = now() "
        "WHERE id = $1 AND user_id = $2 AND status != 'archived' "
        "RETURNING id",
        template_id, user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template non trovato.")
    return None
