import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db, get_redis
from src.services.ai_template import (
    check_compliance,
    generate_template,
    improve_template,
    translate_template,
)

SUPPORTED_LANGUAGES = {"it", "en", "es", "de", "fr"}
from src.services.plan_limits import (
    check_plan_limit,
    increment_ai_template_ops,
)

IMPROVE_CACHE_TTL = 86400  # 24h

router = APIRouter(prefix="/templates")


_JSONB_COLUMNS = {"components", "compliance_report"}


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


@router.post("/{template_id}/compliance-check")
async def check_template_compliance(
    request: Request,
    template_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Run AI compliance check on a template body; persist the report."""
    db = get_db(request)
    redis = get_redis(request)

    row = await db.fetchrow(
        "SELECT id, category, language, components FROM templates "
        "WHERE id = $1 AND user_id = $2 AND status != 'archived'",
        template_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template non trovato.")

    components = row["components"]
    if isinstance(components, str):
        components = json.loads(components)
    body_text = ""
    for c in components or []:
        if isinstance(c, dict) and c.get("type", "").lower() == "body":
            body_text = c.get("text") or ""
            break
    if not body_text:
        raise HTTPException(status_code=400, detail="Template senza body.")

    await check_plan_limit(db, redis, user.id, "ai_template_ops")

    try:
        report = await check_compliance(
            body_text, category=row["category"], language=row["language"]
        )
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"AI error: {e}") from e

    from datetime import datetime, timezone

    report_payload = {
        **report.model_dump(),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.execute(
        "UPDATE templates SET compliance_report = $1::jsonb, updated_at = now() "
        "WHERE id = $2 AND user_id = $3",
        json.dumps(report_payload),
        template_id,
        user.id,
    )
    await increment_ai_template_ops(db, redis, user.id)
    return report_payload


@router.post("/{template_id}/translate")
async def translate_template_ai(
    request: Request,
    template_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Translate a template into multiple target languages. Each translation
    creates a new draft template row linked via source_template_id.
    Partial success supported: returns per-language outcome."""
    db = get_db(request)
    redis = get_redis(request)

    body_payload = await request.json()
    targets_raw = body_payload.get("target_languages") or []
    if not isinstance(targets_raw, list) or not targets_raw:
        raise HTTPException(
            status_code=400, detail="target_languages (array) obbligatorio."
        )
    targets = [t for t in targets_raw if t in SUPPORTED_LANGUAGES]
    if not targets:
        raise HTTPException(
            status_code=400,
            detail=f"Lingue supportate: {sorted(SUPPORTED_LANGUAGES)}",
        )

    row = await db.fetchrow(
        "SELECT id, name, language, category, components FROM templates "
        "WHERE id = $1 AND user_id = $2 AND status != 'archived'",
        template_id,
        user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template non trovato.")

    # Block translating into the source language.
    targets = [t for t in targets if t != row["language"]]
    if not targets:
        raise HTTPException(
            status_code=400,
            detail="Le lingue richieste coincidono con quella del template.",
        )

    components = row["components"]
    if isinstance(components, str):
        components = json.loads(components)
    source_body = ""
    for c in components or []:
        if isinstance(c, dict) and c.get("type", "").lower() == "body":
            source_body = c.get("text") or ""
            break
    if not source_body:
        raise HTTPException(status_code=400, detail="Template senza body.")

    # Check plan up-front (uses 1 op; we'll re-check in the loop per language).
    await check_plan_limit(db, redis, user.id, "ai_template_ops")

    results: list[dict] = []
    for target in targets:
        try:
            # Per-language quota check (ensures we stop when limit reached mid-batch).
            await check_plan_limit(db, redis, user.id, "ai_template_ops")
            translated = await translate_template(
                name=row["name"],
                body=source_body,
                source_language=row["language"],
                target_language=target,
            )
            new_components = [{"type": "body", "text": translated.body}]
            new_row = await db.fetchrow(
                """INSERT INTO templates
                   (user_id, name, language, category, components, status, source_template_id)
                   VALUES ($1, $2, $3, $4, $5, 'pending_review', $6)
                   RETURNING id""",
                user.id,
                translated.name,
                target,
                row["category"],
                json.dumps(new_components),
                template_id,
            )
            await increment_ai_template_ops(db, redis, user.id)
            results.append(
                {
                    "language": target,
                    "ok": True,
                    "template_id": str(new_row["id"]),
                    "name": translated.name,
                }
            )
        except HTTPException as e:
            # Quota exhausted mid-batch → stop, record remaining as failed.
            results.append({"language": target, "ok": False, "error": e.detail})
            break
        except Exception as e:  # noqa: BLE001 — record failure per language
            results.append({"language": target, "ok": False, "error": str(e)})

    return {"results": results}


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
