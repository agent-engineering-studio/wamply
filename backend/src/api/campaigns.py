import json

from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db, get_redis
from src.services.plan_limits import check_plan_limit
from src.services.ai_credits import reserve_credits, commit_credits, resolve_api_key
from src.services.ai_campaigns import (
    personalize_for_contact,
    plan_campaign,
    extract_body_text,
)

router = APIRouter(prefix="/campaigns")

PREVIEW_CONTACT_LIMIT = 5  # upper bound to protect credits/latency


_JSONB_COLUMNS = {"stats", "segment_query"}


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
    data = _serialize_row(row)
    template_name = data.pop("template_name", None)
    template_category = data.pop("template_category", None)
    data["template"] = (
        {"name": template_name, "category": template_category} if template_name else None
    )

    counts = await db.fetch(
        "SELECT status, count(*)::int AS n FROM messages WHERE campaign_id = $1 GROUP BY status",
        campaign_id,
    )
    live = {"total": 0, "sent": 0, "delivered": 0, "read": 0, "failed": 0}
    for r in counts:
        live["total"] += r["n"]
        if r["status"] in live:
            live[r["status"]] += r["n"]
    data["stats"] = live
    return data


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


# ── AI: preview personalizzazione ────────────────────────────

@router.post("/preview-personalization")
async def preview_personalization(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Generate N (≤5) personalized messages for sample contacts to preview
    what the campaign will look like before launch.

    Each personalization call is charged as 1 'personalize_message' credit
    (0.5c). Cached upstream: no — preview is always fresh, user may iterate."""
    body_payload = await request.json()
    template_id = body_payload.get("template_id")
    contact_ids = body_payload.get("contact_ids") or []

    if not template_id:
        raise HTTPException(status_code=400, detail="template_id obbligatorio.")
    if not isinstance(contact_ids, list) or not contact_ids:
        raise HTTPException(status_code=400, detail="contact_ids (array) obbligatorio.")

    contact_ids = contact_ids[:PREVIEW_CONTACT_LIMIT]

    db = get_db(request)
    redis = get_redis(request)

    tpl = await db.fetchrow(
        "SELECT components FROM templates WHERE id = $1 AND user_id = $2 "
        "AND status != 'archived'",
        template_id,
        user.id,
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template non trovato.")
    body_text = extract_body_text(tpl["components"])
    if not body_text:
        raise HTTPException(status_code=400, detail="Template senza body.")

    contacts = await db.fetch(
        "SELECT id, name, phone, language, tags, variables "
        "FROM contacts WHERE id = ANY($1) AND user_id = $2",
        contact_ids,
        user.id,
    )
    if not contacts:
        raise HTTPException(status_code=404, detail="Nessun contatto trovato.")

    # Resolve the key once, reserve+commit credits per contact.
    api_key, _ = await resolve_api_key(db, str(user.id))

    results: list[dict] = []
    for contact in contacts:
        contact_dict = {
            "id": str(contact["id"]),
            "name": contact["name"],
            "phone": contact["phone"],
            "language": contact["language"],
            "tags": contact["tags"] or [],
            "variables": contact["variables"] or {},
        }
        try:
            reservation = await reserve_credits(
                db, redis, str(user.id), "personalize_message"
            )
            text, tin, tout = await personalize_for_contact(
                body_text, contact_dict, api_key
            )
            await commit_credits(db, redis, reservation, tin, tout)
            results.append({
                "contact_id": contact_dict["id"],
                "contact_name": contact_dict["name"] or contact_dict["phone"],
                "ok": True,
                "text": text,
            })
        except HTTPException as e:
            # Credits exhausted mid-batch → stop, mark remaining as skipped.
            results.append({
                "contact_id": contact_dict["id"],
                "contact_name": contact_dict["name"] or contact_dict["phone"],
                "ok": False,
                "error": e.detail,
            })
            break
        except Exception as e:  # noqa: BLE001 — per-contact error recovery
            results.append({
                "contact_id": contact_dict["id"],
                "contact_name": contact_dict["name"] or contact_dict["phone"],
                "ok": False,
                "error": str(e),
            })

    return {"results": results}


# ── AI: strategic campaign planner ──────────────────────────

@router.post("/planner")
async def planner(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Strategic campaign planner. Costs 5 credits (Opus, silent routing).

    Input: {objective: str}. Wamply gathers the user's contact aggregates
    and template list as context and asks Claude for segmentation +
    template + timing suggestions."""
    body_payload = await request.json()
    objective = (body_payload.get("objective") or "").strip()
    if not objective:
        raise HTTPException(status_code=400, detail="objective obbligatorio.")
    if len(objective) > 1000:
        raise HTTPException(status_code=400, detail="objective troppo lungo (max 1000 caratteri).")

    db = get_db(request)
    redis = get_redis(request)

    # Gather context (cheap aggregates, no PII to Claude)
    total_contacts = await db.fetchval(
        "SELECT count(*) FROM contacts WHERE user_id = $1 AND opt_in = true",
        user.id,
    )
    tag_rows = await db.fetch(
        "SELECT unnest(tags) AS tag, count(*) AS c FROM contacts "
        "WHERE user_id = $1 AND opt_in = true GROUP BY tag ORDER BY c DESC LIMIT 20",
        user.id,
    )
    lang_rows = await db.fetch(
        "SELECT language, count(*) AS c FROM contacts "
        "WHERE user_id = $1 AND opt_in = true GROUP BY language ORDER BY c DESC",
        user.id,
    )
    tpl_rows = await db.fetch(
        "SELECT id, name, category, language FROM templates "
        "WHERE user_id = $1 AND status != 'archived' ORDER BY created_at DESC LIMIT 20",
        user.id,
    )
    recent_rows = await db.fetch(
        "SELECT name, status::text, stats FROM campaigns "
        "WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5",
        user.id,
    )

    context_data = {
        "total_contacts": int(total_contacts or 0),
        "contacts_by_tag": [
            {"tag": r["tag"], "count": int(r["c"])} for r in tag_rows if r["tag"]
        ],
        "contacts_by_language": [
            {"language": r["language"], "count": int(r["c"])} for r in lang_rows
        ],
        "available_templates": [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "category": r["category"],
                "language": r["language"],
            }
            for r in tpl_rows
        ],
        "recent_campaigns": [
            {
                "name": r["name"],
                "status": r["status"],
                "stats": json.loads(r["stats"]) if isinstance(r["stats"], str) else (r["stats"] or {}),
            }
            for r in recent_rows
        ],
    }

    reservation = await reserve_credits(db, redis, str(user.id), "campaign_planner")
    api_key, _ = await resolve_api_key(db, str(user.id))

    try:
        suggestion, tin, tout = await plan_campaign(objective, context_data, api_key)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"Planner error: {e}") from e

    await commit_credits(db, redis, reservation, tin, tout)
    return suggestion.model_dump()
