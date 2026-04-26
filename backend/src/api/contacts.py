from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db, get_redis
from src.services.plan_limits import check_plan_limit
from src.services.ai_assists import suggest_contact_tags
from src.services.ai_credits import (
    commit_credits,
    reserve_credits,
    resolve_api_key,
)

router = APIRouter(prefix="/contacts")


@router.get("")
async def list_contacts(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    search: str = "",
    tag: str | None = None,
    page: int = Query(1, ge=1),
):
    db = get_db(request)
    limit = 50
    offset = (page - 1) * limit

    base_query = "FROM contacts WHERE user_id = $1"
    params: list = [user.id]
    idx = 2

    if search:
        base_query += f" AND (name ILIKE ${idx} OR phone ILIKE ${idx} OR email ILIKE ${idx})"
        params.append(f"%{search}%")
        idx += 1

    if tag:
        base_query += f" AND ${idx} = ANY(tags)"
        params.append(tag)
        idx += 1

    count_row = await db.fetchrow(f"SELECT count(*) {base_query}", *params)
    total = count_row["count"] if count_row else 0

    rows = await db.fetch(
        f"SELECT * {base_query} ORDER BY created_at DESC LIMIT ${idx} OFFSET ${idx + 1}",
        *params,
        limit,
        offset,
    )

    contacts = []
    for r in rows:
        d = dict(r)
        for k, v in d.items():
            if hasattr(v, "hex"):
                d[k] = str(v)
            elif hasattr(v, "isoformat"):
                d[k] = v.isoformat()
        contacts.append(d)

    return {"contacts": contacts, "total": total, "page": page, "limit": limit}


@router.post("", status_code=201)
async def create_contact(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    redis = get_redis(request)
    await check_plan_limit(db, redis, user.id, "contacts")

    body = await request.json()
    phone = body.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Il numero di telefono è obbligatorio.")

    try:
        row = await db.fetchrow(
            """INSERT INTO contacts (user_id, phone, name, email, language, tags, variables, opt_in, opt_in_date)
               VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
               RETURNING *""",
            user.id, phone, body.get("name"), body.get("email"),
            body.get("language", "it"), body.get("tags", []),
            body.get("variables", "{}"), datetime.utcnow(),
        )
    except Exception as e:
        if "23505" in str(e):
            raise HTTPException(status_code=409, detail="Questo contatto esiste già.")
        raise HTTPException(status_code=500, detail="Errore nella creazione del contatto.")

    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
        elif hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


# ── AI: tag suggestions ──────────────────────────────────────

MAX_SUGGEST_CONTACTS = 20


@router.post("/suggest-tags")
async def suggest_tags(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Propose tags for a small batch of contacts (1 credit, Haiku).

    Body: {contact_ids: ["..."]}  (max 20). If omitted or empty, we pick
    the N most-recently-created UNTAGGED contacts as candidates.
    """
    body = await request.json()
    contact_ids = body.get("contact_ids") or []
    if not isinstance(contact_ids, list):
        raise HTTPException(status_code=400, detail="contact_ids deve essere una lista.")

    db = get_db(request)
    redis = get_redis(request)

    if contact_ids:
        contact_ids = [c for c in contact_ids if isinstance(c, str)][:MAX_SUGGEST_CONTACTS]
        rows = await db.fetch(
            "SELECT id, name, phone, language, tags, variables FROM contacts "
            "WHERE id = ANY($1::uuid[]) AND user_id = $2",
            contact_ids, user.id,
        )
    else:
        rows = await db.fetch(
            "SELECT id, name, phone, language, tags, variables FROM contacts "
            "WHERE user_id = $1 AND (tags IS NULL OR cardinality(tags) = 0) "
            "ORDER BY created_at DESC LIMIT $2",
            user.id, MAX_SUGGEST_CONTACTS,
        )

    if not rows:
        raise HTTPException(
            status_code=400,
            detail="Nessun contatto idoneo. Seleziona contatti o aggiungine di nuovi senza tag.",
        )

    contacts_ctx = []
    for r in rows:
        contacts_ctx.append({
            "id": str(r["id"]),
            "name": r["name"],
            "phone": r["phone"],
            "language": r["language"],
            "current_tags": list(r["tags"] or []),
            "variables": r["variables"] or {},
        })

    tag_rows = await db.fetch(
        "SELECT unnest(tags) AS tag, count(*)::int AS c FROM contacts "
        "WHERE user_id = $1 GROUP BY tag ORDER BY c DESC LIMIT 30",
        user.id,
    )
    vocabulary = [{"tag": r["tag"], "count": r["c"]} for r in tag_rows if r["tag"]]

    reservation = await reserve_credits(db, redis, str(user.id), "contact_tag_suggest")
    api_key, _ = await resolve_api_key(db, str(user.id))

    try:
        batch, tin, tout = await suggest_contact_tags(contacts_ctx, vocabulary, api_key)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"TagSuggest error: {e}") from e

    await commit_credits(db, redis, reservation, tin, tout)
    return batch.model_dump()


@router.post("/apply-tags")
async def apply_tags(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Merge suggested tags into existing contacts.

    Body: {items: [{contact_id, tags: [...]}]}  — tags are merged (union)
    with existing ones, no duplicates.
    """
    body = await request.json()
    items = body.get("items") or []
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=400, detail="items obbligatorio.")

    db = get_db(request)
    updated = 0
    async with db.acquire() as conn, conn.transaction():
        for item in items:
            cid = item.get("contact_id")
            tags = item.get("tags") or []
            if not cid or not isinstance(tags, list) or not tags:
                continue
            clean = [t for t in tags if isinstance(t, str) and t.strip()][:4]
            if not clean:
                continue
            result = await conn.execute(
                """UPDATE contacts
                   SET tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tags, ARRAY[]::text[]) || $1::text[]))
                   WHERE id = $2 AND user_id = $3""",
                clean, cid, user.id,
            )
            if result.endswith("1"):
                updated += 1
    return {"updated": updated}


@router.put("/{contact_id}")
async def update_contact(
    request: Request,
    contact_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ["phone", "name", "email", "language", "tags", "variables"]:
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare.")
    params.extend([contact_id, user.id])
    try:
        row = await db.fetchrow(
            f"UPDATE contacts SET {', '.join(fields)}, updated_at = now() "
            f"WHERE id = ${idx} AND user_id = ${idx + 1} RETURNING *",
            *params,
        )
    except Exception as e:
        if "invalid input syntax" in str(e) or "DataError" in type(e).__name__:
            raise HTTPException(status_code=422, detail="ID contatto non valido.")
        raise
    if not row:
        raise HTTPException(status_code=404, detail="Contatto non trovato.")
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
        elif hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


@router.delete("/{contact_id}", status_code=204)
async def delete_contact(
    request: Request,
    contact_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    try:
        result = await db.execute(
            "DELETE FROM contacts WHERE id = $1 AND user_id = $2",
            contact_id, user.id,
        )
    except Exception as e:
        if "invalid input syntax" in str(e) or "DataError" in type(e).__name__:
            raise HTTPException(status_code=422, detail="ID contatto non valido.")
        raise
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Contatto non trovato.")
    return None
