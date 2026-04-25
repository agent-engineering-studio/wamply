"""Business profile endpoints: user-facing + admin.

User endpoints: `/settings/business` (get/post) and `/settings/meta-application`.
Admin endpoints: `/admin/businesses/*` for the marketing partner to manage
Meta applications on behalf of low-tech customers.
"""

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from src.auth.jwt import CurrentUser, get_current_user
from src.auth.permissions import require_staff, require_admin
from src.dependencies import get_db
from src.services.storage import (
    save_business_logo,
    resolve_logo_path,
    StorageError,
)
from src.services.business_profile import (
    get_business_by_user,
    get_business_by_id,
    upsert_business,
    get_meta_application,
    get_meta_application_by_user,
    list_businesses_admin,
    update_meta_application_status,
    get_audit_log,
    missing_fields_for_meta_submit,
)
from src.services.twilio_provisioning import (
    create_subaccount,
    purchase_first_available_italian_number,
    encrypt_auth_token,
    decrypt_auth_token,
)

router = APIRouter()


# ── User-facing ─────────────────────────────────────────────

@router.get("/settings/business")
async def get_my_business(
    request: Request, user: CurrentUser = Depends(get_current_user)
):
    """Return the current user's business profile + Meta application status.
    Returns `{business: null, meta_application: null}` if not yet created."""
    db = get_db(request)
    business = await get_business_by_user(db, str(user.id))
    if not business:
        return {"business": None, "meta_application": None, "missing_fields": []}

    meta = await get_meta_application_by_user(db, str(user.id))
    missing = missing_fields_for_meta_submit(business)
    return {
        "business": business,
        "meta_application": meta,
        "missing_fields": missing,
    }


@router.post("/settings/business")
async def save_my_business(
    request: Request, user: CurrentUser = Depends(get_current_user)
):
    """Create or update the user's business profile. Lazy-creates the
    meta_application in status=draft on first save."""
    body = await request.json()
    db = get_db(request)
    try:
        business = await upsert_business(db, str(user.id), str(user.id), body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    meta = await get_meta_application_by_user(db, str(user.id))
    missing = missing_fields_for_meta_submit(business)
    return {
        "business": business,
        "meta_application": meta,
        "missing_fields": missing,
    }


@router.get("/settings/meta-application")
async def get_my_meta_application(
    request: Request, user: CurrentUser = Depends(get_current_user)
):
    """Status-only endpoint for the dashboard banner (lighter payload)."""
    db = get_db(request)
    meta = await get_meta_application_by_user(db, str(user.id))
    if not meta:
        return {"meta_application": None}
    return {"meta_application": meta}


@router.post("/settings/business/logo")
async def upload_my_logo(
    request: Request,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    """User uploads own business logo. Requires existing business profile."""
    db = get_db(request)
    business = await get_business_by_user(db, str(user.id))
    if not business:
        raise HTTPException(
            status_code=400,
            detail="Crea prima il profilo aziendale (Dati azienda).",
        )
    content = await file.read()
    try:
        url = save_business_logo(
            user_id=str(user.id),
            content=content,
            content_type=file.content_type or "application/octet-stream",
        )
    except StorageError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.execute(
        "UPDATE businesses SET logo_url = $1, updated_at = now(), updated_by = $2 WHERE user_id = $3",
        url,
        str(user.id),
        str(user.id),
    )
    await db.execute(
        """INSERT INTO business_audit_log (business_id, action, actor_id, changes)
           VALUES ($1, 'logo_upload', $2, $3::jsonb)""",
        business["id"],
        str(user.id),
        '{"logo_url":"' + url + '"}',
    )
    return {"logo_url": url}


# ── Storage serving (public, no auth — logos aren't secret) ──

@router.get("/storage/logos/{user_id}/{filename}")
async def serve_logo(user_id: str, filename: str):
    """Serve a business logo by path. No auth: brand logos are public by nature
    and URLs are guessable only by knowing the user uuid."""
    path = resolve_logo_path(user_id, filename)
    if not path:
        raise HTTPException(status_code=404, detail="Logo non trovato.")
    return FileResponse(path)


# ── Admin ───────────────────────────────────────────────────

@router.get("/admin/businesses")
async def admin_list_businesses(
    request: Request,
    user: CurrentUser = Depends(require_staff),
    status: str | None = None,
):
    """List all businesses with their Meta application + plan + user info.
    Optional filter by Meta application status."""
    db = get_db(request)
    rows = await list_businesses_admin(db, status_filter=status)
    return {"businesses": rows}


@router.get("/admin/businesses/{business_id}")
async def admin_get_business(
    request: Request,
    business_id: str,
    user: CurrentUser = Depends(require_staff),
):
    """Full detail of a single business: profile + Meta application + audit log."""
    db = get_db(request)
    business = await get_business_by_id(db, business_id)
    if not business:
        raise HTTPException(status_code=404, detail="Business non trovato.")

    meta = await get_meta_application(db, business_id)
    audit = await get_audit_log(db, business_id)
    missing = missing_fields_for_meta_submit(business)

    return {
        "business": business,
        "meta_application": meta,
        "audit_log": audit,
        "missing_fields": missing,
    }


@router.put("/admin/businesses/{business_id}")
async def admin_update_business(
    request: Request,
    business_id: str,
    user: CurrentUser = Depends(require_staff),
):
    """Staff updates business profile fields (compiling on behalf of customer)."""
    db = get_db(request)
    business = await get_business_by_id(db, business_id)
    if not business:
        raise HTTPException(status_code=404, detail="Business non trovato.")

    body = await request.json()
    try:
        updated = await upsert_business(
            db, business["user_id"], str(user.id), body
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    meta = await get_meta_application(db, business_id)
    missing = missing_fields_for_meta_submit(updated)
    return {
        "business": updated,
        "meta_application": meta,
        "missing_fields": missing,
    }


_VALID_STATUSES = {
    "draft", "awaiting_docs", "submitted_to_meta",
    "in_review", "approved", "rejected", "active", "suspended",
}


@router.patch("/admin/businesses/{business_id}/status")
async def admin_patch_business_status(
    request: Request,
    business_id: str,
    user: CurrentUser = Depends(require_staff),
):
    """Quick status change without touching other fields."""
    db = get_db(request)
    body = await request.json()
    status = (body or {}).get("status", "").strip()
    if status not in _VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Status non valido: {status}. Valori ammessi: {sorted(_VALID_STATUSES)}",
        )

    ma = await db.fetchrow(
        "SELECT id FROM meta_applications WHERE business_id = $1",
        business_id,
    )
    if not ma:
        raise HTTPException(status_code=404, detail="Pratica non trovata.")

    await db.execute(
        "UPDATE meta_applications SET status = $1::application_status, updated_at = now() WHERE id = $2",
        status,
        ma["id"],
    )
    await db.execute(
        """INSERT INTO business_audit_log (business_id, action, actor_id, changes)
           VALUES ($1, $2, $3, '{}'::jsonb)""",
        business_id,
        f"status_changed_to_{status}",
        str(user.id),
    )
    return {"ok": True, "status": status}


@router.post("/admin/businesses/{business_id}/logo")
async def admin_upload_logo(
    request: Request,
    business_id: str,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_staff),
):
    """Staff uploads a logo on behalf of a customer (low-tech onboarding)."""
    db = get_db(request)
    business = await get_business_by_id(db, business_id)
    if not business:
        raise HTTPException(status_code=404, detail="Business non trovato.")

    content = await file.read()
    try:
        url = save_business_logo(
            user_id=business["user_id"],
            content=content,
            content_type=file.content_type or "application/octet-stream",
        )
    except StorageError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.execute(
        "UPDATE businesses SET logo_url = $1, updated_at = now(), updated_by = $2 WHERE id = $3",
        url,
        str(user.id),
        business_id,
    )
    await db.execute(
        """INSERT INTO business_audit_log (business_id, action, actor_id, changes)
           VALUES ($1, 'logo_upload_admin', $2, $3::jsonb)""",
        business_id,
        str(user.id),
        '{"logo_url":"' + url + '"}',
    )
    return {"logo_url": url}


@router.patch("/admin/meta-applications/{application_id}/status")
async def admin_change_meta_status(
    request: Request,
    application_id: str,
    user: CurrentUser = Depends(require_staff),
):
    """Staff changes the Meta application status via dropdown."""
    body = await request.json()
    new_status = body.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="status obbligatorio.")

    db = get_db(request)
    try:
        updated = await update_meta_application_status(
            db,
            application_id=application_id,
            actor_id=str(user.id),
            new_status=new_status,
            admin_notes=body.get("admin_notes"),
            rejection_reason=body.get("rejection_reason"),
            waba_id=body.get("waba_id"),
            display_name=body.get("display_name"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"meta_application": updated}


@router.patch("/admin/meta-applications/{application_id}/notes")
async def admin_update_meta_notes(
    request: Request,
    application_id: str,
    user: CurrentUser = Depends(require_staff),
):
    """Update only the admin_notes field without changing status."""
    body = await request.json()
    notes = body.get("admin_notes", "")
    db = get_db(request)
    row = await db.fetchrow(
        """UPDATE meta_applications SET admin_notes = $1, updated_by = $2, updated_at = now()
           WHERE id = $3 RETURNING id, business_id""",
        notes,
        str(user.id),
        application_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Applicazione non trovata.")

    await db.execute(
        """INSERT INTO business_audit_log (business_id, action, actor_id, changes)
           VALUES ($1, 'update_admin_notes', $2, $3::jsonb)""",
        row["business_id"],
        str(user.id),
        '{}',
    )
    return {"ok": True}


@router.get("/admin/businesses/{business_id}/audit")
async def admin_business_audit(
    request: Request,
    business_id: str,
    user: CurrentUser = Depends(require_staff),
    limit: int = 100,
):
    db = get_db(request)
    rows = await get_audit_log(db, business_id, limit=limit)
    return {"audit_log": rows}


# ── Twilio provisioning (admin-only, real cost) ──────────────

@router.post("/admin/meta-applications/{application_id}/create-subaccount")
async def admin_create_twilio_subaccount(
    request: Request,
    application_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Create a Twilio subaccount for this customer. Saves the SID and
    encrypted auth_token to meta_applications. Idempotent: if the
    application already has a subaccount SID, returns it without re-creating.
    """
    db = get_db(request)
    row = await db.fetchrow(
        """SELECT ma.id, ma.business_id, ma.twilio_subaccount_sid,
                  b.brand_name, b.legal_name
           FROM meta_applications ma
           JOIN businesses b ON b.id = ma.business_id
           WHERE ma.id = $1""",
        application_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Applicazione non trovata.")

    # Idempotency: don't re-create if one already exists
    if row["twilio_subaccount_sid"]:
        return {
            "already_exists": True,
            "twilio_subaccount_sid": row["twilio_subaccount_sid"],
        }

    friendly_name = row["brand_name"] or row["legal_name"] or "Wamply Customer"
    try:
        sub = await create_subaccount(friendly_name)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Twilio error: {e}") from e

    new_sid = sub.get("sid")
    new_token = sub.get("auth_token")
    if not new_sid or not new_token:
        raise HTTPException(status_code=502, detail="Risposta Twilio malformata.")

    encrypted = encrypt_auth_token(new_token)
    await db.execute(
        """UPDATE meta_applications
           SET twilio_subaccount_sid = $1,
               twilio_subaccount_auth_token_encrypted = $2,
               updated_by = $3,
               updated_at = now()
           WHERE id = $4""",
        new_sid,
        encrypted,
        str(user.id),
        application_id,
    )

    # Audit trail (no secret in changes payload)
    await db.execute(
        """INSERT INTO business_audit_log (business_id, action, actor_id, changes)
           VALUES ($1, 'twilio_subaccount_created', $2, $3::jsonb)""",
        row["business_id"],
        str(user.id),
        '{"twilio_subaccount_sid": "' + new_sid + '"}',
    )

    return {
        "already_exists": False,
        "twilio_subaccount_sid": new_sid,
    }


@router.post("/admin/meta-applications/{application_id}/purchase-number")
async def admin_purchase_twilio_number(
    request: Request,
    application_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Purchase the first available Italian local number on the subaccount.
    Requires the subaccount to already exist. Saves the number SID + E.164 format.
    """
    db = get_db(request)
    row = await db.fetchrow(
        """SELECT ma.id, ma.business_id, ma.twilio_subaccount_sid,
                  ma.twilio_subaccount_auth_token_encrypted,
                  ma.twilio_phone_number, ma.twilio_phone_number_sid,
                  b.brand_name
           FROM meta_applications ma
           JOIN businesses b ON b.id = ma.business_id
           WHERE ma.id = $1""",
        application_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Applicazione non trovata.")

    if not row["twilio_subaccount_sid"] or not row["twilio_subaccount_auth_token_encrypted"]:
        raise HTTPException(
            status_code=400,
            detail="Subaccount Twilio non creato. Crealo prima di acquistare un numero.",
        )

    # Idempotency
    if row["twilio_phone_number"]:
        return {
            "already_exists": True,
            "twilio_phone_number": row["twilio_phone_number"],
            "twilio_phone_number_sid": row["twilio_phone_number_sid"],
        }

    try:
        auth_token = decrypt_auth_token(row["twilio_subaccount_auth_token_encrypted"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Impossibile decifrare token: {e}")

    try:
        purchase = await purchase_first_available_italian_number(
            subaccount_sid=row["twilio_subaccount_sid"],
            subaccount_token=auth_token,
            friendly_name=f"Wamply — {row['brand_name']}" if row["brand_name"] else None,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Twilio error: {e}") from e

    phone = purchase.get("phone_number")
    sid = purchase.get("sid")

    await db.execute(
        """UPDATE meta_applications
           SET twilio_phone_number = $1,
               twilio_phone_number_sid = $2,
               updated_by = $3,
               updated_at = now()
           WHERE id = $4""",
        phone,
        sid,
        str(user.id),
        application_id,
    )

    await db.execute(
        """INSERT INTO business_audit_log (business_id, action, actor_id, changes)
           VALUES ($1, 'twilio_number_purchased', $2, $3::jsonb)""",
        row["business_id"],
        str(user.id),
        '{"twilio_phone_number": "' + (phone or "") + '"}',
    )

    return {
        "already_exists": False,
        "twilio_phone_number": phone,
        "twilio_phone_number_sid": sid,
    }
