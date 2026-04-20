import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db, get_redis
from src.services.ai_template import generate_template, improve_template
from src.services.plan_limits import (
    check_plan_limit,
    increment_ai_template_ops,
)

IMPROVE_CACHE_TTL = 86400  # 24h

router = APIRouter(prefix="/templates")


_JSONB_COLUMNS = {"components"}


def _serialize_row(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
        elif hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif k in _JSONB_COLUMNS and isinstance(v, str):
            try:
                d[k] = json.loads(v)
            except (ValueError, TypeError):
                pass
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


@router.post("/generate", status_code=201)
async def generate_template_ai(
    request: Request, user: CurrentUser = Depends(get_current_user)
):
    """Generate a WhatsApp template from a natural-language prompt via Claude."""
    db = get_db(request)
    redis = get_redis(request)
    await check_plan_limit(db, redis, user.id, "ai_template_ops")

    body = await request.json()
    prompt = (body.get("prompt") or "").strip()
    language = body.get("language", "it")
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt obbligatorio.")
    if len(prompt) > 500:
        raise HTTPException(status_code=400, detail="Prompt troppo lungo (max 500 caratteri).")

    try:
        generated = await generate_template(prompt, language)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"AI error: {e}") from e

    row = await db.fetchrow(
        """INSERT INTO templates (user_id, name, language, category, components, status)
           VALUES ($1, $2, $3, $4, $5, 'draft') RETURNING *""",
        user.id,
        generated.name,
        generated.language,
        generated.category,
        json.dumps([{"type": "body", "text": generated.body}]),
    )
    await increment_ai_template_ops(db, redis, user.id)

    return {
        **_serialize_row(row),
        "generated_body": generated.body,
        "generated_variables": generated.variables,
    }


@router.post("/improve")
async def improve_template_ai(
    request: Request, user: CurrentUser = Depends(get_current_user)
):
    """Return 3 stylistic variants (short/warm/professional) of a template body.

    Redis cache 24h keyed on SHA-256(body). Cache hit = free (no quota used).
    """
    db = get_db(request)
    redis = get_redis(request)

    body = await request.json()
    text = (body.get("body") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="body obbligatorio.")
    if len(text) > 1024:
        raise HTTPException(status_code=400, detail="body troppo lungo (max 1024).")

    cache_key = f"ai:improve:{hashlib.sha256(text.encode()).hexdigest()}"
    cached = await redis.get(cache_key)
    if cached:
        return {"cached": True, **json.loads(cached)}

    await check_plan_limit(db, redis, user.id, "ai_template_ops")

    try:
        result = await improve_template(text)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"AI error: {e}") from e

    payload = {"variants": [v.model_dump() for v in result.variants]}
    await redis.set(cache_key, json.dumps(payload), ex=IMPROVE_CACHE_TTL)
    await increment_ai_template_ops(db, redis, user.id)
    return {"cached": False, **payload}


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
