from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db, get_redis
from src.services.plan_limits import check_plan_limit

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
