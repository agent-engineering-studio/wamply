import hashlib
import json
import logging

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db, get_redis
from src.services.storage import (
    StorageError,
    resolve_template_media_path,
    save_template_media,
)
from src.services.ai_template import (
    check_compliance,
    generate_template,
    improve_template,
    translate_template,
)
from src.services.ai_credits import (
    reserve_credits,
    commit_credits,
    resolve_api_key,
)
from src.services.ai_feature_gating import require_ai_feature
from src.services.plan_limits import check_plan_limit
from src.services.twilio_content import (
    create_content,
    delete_content,
    submit_for_whatsapp_approval,
)

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = {"it", "en", "es", "de", "fr"}

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

    body = await request.json()
    prompt = (body.get("prompt") or "").strip()
    language = body.get("language", "it")
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt obbligatorio.")
    if len(prompt) > 500:
        raise HTTPException(status_code=400, detail="Prompt troppo lungo (max 500 caratteri).")

    await require_ai_feature(db, str(user.id), "generate")
    reservation = await reserve_credits(db, redis, user.id, "template_generate")
    api_key, _ = await resolve_api_key(db, user.id)

    try:
        generated, tin, tout = await generate_template(prompt, api_key, language)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"AI error: {e}") from e

    row = await db.fetchrow(
        """INSERT INTO templates (user_id, name, language, category, components, status)
           VALUES ($1, $2, $3, $4, $5, 'draft') RETURNING *""",
        user.id,
        generated.name,
        generated.language,
        generated.category,
        json.dumps([{"type": "BODY", "text": generated.body}]),
    )
    await commit_credits(db, redis, reservation, tin, tout)

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

    await require_ai_feature(db, str(user.id), "improve")
    reservation = await reserve_credits(db, redis, user.id, "template_improve")
    api_key, _ = await resolve_api_key(db, user.id)

    try:
        result, tin, tout = await improve_template(text, api_key)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"AI error: {e}") from e

    payload = {"variants": [v.model_dump() for v in result.variants]}
    await redis.set(cache_key, json.dumps(payload), ex=IMPROVE_CACHE_TTL)
    await commit_credits(db, redis, reservation, tin, tout)
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
    components = body.get("components", [])
    language = body.get("language", "it")

    # Register on Twilio first. If it fails the local INSERT never happens —
    # otherwise we'd end up with a Wamply-only template that can't be used
    # for sends, recreating the exact problem this whole feature exists to fix.
    twilio_sid = await create_content(
        db, friendly_name=name, language=language, components=components,
    )

    row = await db.fetchrow(
        """INSERT INTO templates (user_id, name, language, category, components, status, twilio_content_sid)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *""",
        user.id, name, language, body.get("category", "marketing"),
        json.dumps(components), body.get("status", "approved"), twilio_sid,
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

    # Fetch current state. If body/language change, Twilio needs a new
    # Content (its templates are immutable post-creation) — so we delete the
    # old SID and create a fresh one. Pure metadata changes (name shown in
    # Wamply UI, category, status) don't touch Twilio.
    current = await db.fetchrow(
        "SELECT name, language, components, twilio_content_sid FROM templates "
        "WHERE id = $1 AND user_id = $2 AND status != 'archived'",
        template_id, user.id,
    )
    if not current:
        raise HTTPException(status_code=404, detail="Template non trovato.")

    new_name = body.get("name", current["name"])
    new_language = body.get("language", current["language"])
    new_components = body.get("components")
    body_changes = (
        ("components" in body and json.dumps(new_components) != json.dumps(current["components"]))
        or ("language" in body and new_language != current["language"])
    )

    new_twilio_sid: str | None = None
    if body_changes:
        # Twilio Content is immutable: replace the SID with a freshly-registered
        # one. Best-effort delete on the old SID — Twilio refuses if approved,
        # in which case we just leave it dangling rather than blocking the user.
        if current["twilio_content_sid"]:
            await delete_content(db, current["twilio_content_sid"])
        new_twilio_sid = await create_content(
            db,
            friendly_name=new_name,
            language=new_language,
            components=new_components if new_components is not None else current["components"],
        )

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
    if new_twilio_sid is not None:
        fields.append(f"twilio_content_sid = ${idx}")
        params.append(new_twilio_sid)
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

    await require_ai_feature(db, str(user.id), "compliance_check")
    reservation = await reserve_credits(db, redis, user.id, "template_compliance")
    api_key, _ = await resolve_api_key(db, user.id)

    try:
        report, tin, tout = await check_compliance(
            body_text, api_key, category=row["category"], language=row["language"]
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
    await commit_credits(db, redis, reservation, tin, tout)
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

    await require_ai_feature(db, str(user.id), "translate")

    # Resolve key once for the whole batch.
    api_key, _ = await resolve_api_key(db, user.id)

    results: list[dict] = []
    for target in targets:
        try:
            # Per-language reservation — stops mid-batch if credits run out.
            reservation = await reserve_credits(
                db, redis, user.id, "template_translate"
            )
            translated, tin, tout = await translate_template(
                name=row["name"],
                body=source_body,
                source_language=row["language"],
                target_language=target,
                api_key=api_key,
            )
            new_components = [{"type": "BODY", "text": translated.body}]
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
            await commit_credits(db, redis, reservation, tin, tout)
            results.append(
                {
                    "language": target,
                    "ok": True,
                    "template_id": str(new_row["id"]),
                    "name": translated.name,
                }
            )
        except HTTPException as e:
            # Credits exhausted mid-batch → stop, record remaining as failed.
            results.append({"language": target, "ok": False, "error": e.detail})
            break
        except Exception:  # noqa: BLE001 — record failure per language
            logger.exception("Translation to %s failed", target)
            results.append({"language": target, "ok": False, "error": "Traduzione non riuscita"})

    return {"results": results}


@router.post("/{template_id}/sync-to-twilio")
async def sync_template_to_twilio(
    request: Request, template_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Force-sync a Wamply template to Twilio Content API.

    Always recreates the Twilio Content SID: any existing one is deleted and
    a fresh one created from the current Wamply body. Used both for backfill
    (templates that never had a SID) and for repair (templates synced with a
    wrong/outdated body — e.g. before the {{1}} body fix).
    """
    db = get_db(request)
    row = await db.fetchrow(
        "SELECT name, language, components, twilio_content_sid FROM templates "
        "WHERE id = $1 AND user_id = $2 AND status != 'archived'",
        template_id, user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template non trovato.")

    # Best-effort delete the old SID so Twilio doesn't accumulate orphans.
    # Refusal (e.g. approved-by-Meta SID) is logged inside delete_content;
    # we proceed regardless and let the new SID supersede the old one.
    if row["twilio_content_sid"]:
        await delete_content(db, row["twilio_content_sid"])

    components = row["components"]
    if isinstance(components, str):
        components = json.loads(components)
    sid = await create_content(
        db, friendly_name=row["name"], language=row["language"], components=components,
    )
    await db.execute(
        "UPDATE templates SET twilio_content_sid = $1, updated_at = now() WHERE id = $2",
        sid, template_id,
    )
    return {"twilio_content_sid": sid, "resynced": bool(row["twilio_content_sid"])}


@router.post("/{template_id}/submit-approval")
async def submit_template_approval(
    request: Request, template_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Submit the template to Meta for WhatsApp approval (production path).

    In sandbox the Content SID alone is enough to send. In production Meta
    must approve; this endpoint kicks off that async flow.
    """
    db = get_db(request)
    row = await db.fetchrow(
        "SELECT name, category, twilio_content_sid FROM templates "
        "WHERE id = $1 AND user_id = $2 AND status != 'archived'",
        template_id, user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template non trovato.")
    if not row["twilio_content_sid"]:
        raise HTTPException(
            status_code=400,
            detail="Template non ancora registrato su Twilio. Sincronizza prima di sottomettere.",
        )
    result = await submit_for_whatsapp_approval(
        db,
        content_sid=row["twilio_content_sid"],
        name=row["name"],
        category=row["category"] or "marketing",
    )
    return result


@router.post("/{template_id}/media")
async def upload_template_media(
    request: Request, template_id: str,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    """Upload an image/video/document for a template's HEADER component.

    Saves to local storage and updates the template's `components` JSON to
    include the media reference. The next save (or this same call's
    auto-resync) re-creates the Twilio Content with twilio/media type.
    """
    db = get_db(request)
    row = await db.fetchrow(
        "SELECT components, twilio_content_sid FROM templates "
        "WHERE id = $1 AND user_id = $2 AND status != 'archived'",
        template_id, user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template non trovato.")

    content = await file.read()
    try:
        media_url, fmt = save_template_media(
            user_id=str(user.id),
            template_id=template_id,
            content=content,
            content_type=file.content_type or "application/octet-stream",
        )
    except StorageError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Replace the HEADER in components (or insert one) with the media reference.
    components = row["components"] or []
    if isinstance(components, str):
        components = json.loads(components)
    new_components = [c for c in components if (c.get("type") or "").upper() != "HEADER"]
    new_components.insert(0, {"type": "HEADER", "format": fmt, "media_url": media_url})

    # Persist new components and re-sync Twilio so the media is registered.
    if row["twilio_content_sid"]:
        await delete_content(db, row["twilio_content_sid"])
    template_row = await db.fetchrow(
        "SELECT name, language FROM templates WHERE id = $1", template_id,
    )
    new_sid = await create_content(
        db,
        friendly_name=template_row["name"],
        language=template_row["language"],
        components=new_components,
    )
    await db.execute(
        "UPDATE templates SET components = $1, twilio_content_sid = $2, updated_at = now() WHERE id = $3",
        json.dumps(new_components), new_sid, template_id,
    )
    return {"media_url": media_url, "format": fmt, "twilio_content_sid": new_sid}


@router.delete("/{template_id}/media", status_code=204)
async def delete_template_media(
    request: Request, template_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Remove the media header from a template and re-sync Twilio as text-only."""
    db = get_db(request)
    row = await db.fetchrow(
        "SELECT name, language, components, twilio_content_sid FROM templates "
        "WHERE id = $1 AND user_id = $2 AND status != 'archived'",
        template_id, user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template non trovato.")
    components = row["components"] or []
    if isinstance(components, str):
        components = json.loads(components)
    new_components = [
        c for c in components
        if not ((c.get("type") or "").upper() == "HEADER" and (c.get("format") or "").upper() in {"IMAGE", "VIDEO", "DOCUMENT"})
    ]
    if row["twilio_content_sid"]:
        await delete_content(db, row["twilio_content_sid"])
    new_sid = await create_content(
        db, friendly_name=row["name"], language=row["language"], components=new_components,
    )
    await db.execute(
        "UPDATE templates SET components = $1, twilio_content_sid = $2, updated_at = now() WHERE id = $3",
        json.dumps(new_components), new_sid, template_id,
    )
    return None


@router.get("/storage/template-media/{user_id}/{filename}")
async def serve_template_media(user_id: str, filename: str):
    """Serve a template media file by path. Public — Twilio fetches these
    URLs from outside our network to register/send the WhatsApp template."""
    path = resolve_template_media_path(user_id, filename)
    if not path:
        raise HTTPException(status_code=404, detail="File non trovato.")
    return FileResponse(path)


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    request: Request, template_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    existing = await db.fetchrow(
        "SELECT twilio_content_sid FROM templates "
        "WHERE id = $1 AND user_id = $2 AND status != 'archived'",
        template_id, user.id,
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Template non trovato.")

    # Best-effort delete on Twilio. If the template is approved/in use Twilio
    # refuses — we still archive locally (soft-delete) so the user can move on.
    if existing["twilio_content_sid"]:
        await delete_content(db, existing["twilio_content_sid"])

    await db.execute(
        "UPDATE templates SET status = 'archived', updated_at = now() "
        "WHERE id = $1 AND user_id = $2",
        template_id, user.id,
    )
    return None
