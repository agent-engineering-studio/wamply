"""Business profile + Meta application tracking.

Handles CRUD on `businesses` and lifecycle of `meta_applications`.
Shared by user-facing `/settings/business` and admin `/admin/businesses/*`.
Every mutation writes a row to `business_audit_log`.
"""

import json
from typing import Any

import asyncpg
import structlog

logger = structlog.get_logger()

# Fields that belong to businesses table and are user-editable.
BUSINESS_FIELDS = {
    "legal_name",
    "brand_name",
    "vat_number",
    "tax_code",
    "address_line1",
    "address_line2",
    "city",
    "postal_code",
    "region",
    "country",
    "business_phone",
    "business_email",
    "website_url",
    "logo_url",
    "meta_category",
}

# Fields required before submitting to Meta.
META_SUBMIT_REQUIRED = {
    "legal_name",
    "brand_name",
    "vat_number",
    "address_line1",
    "city",
    "postal_code",
    "country",
    "business_phone",
    "business_email",
    "meta_category",
    "logo_url",
}


async def _log_audit(
    db: asyncpg.Pool,
    business_id: str,
    action: str,
    actor_id: str | None,
    changes: dict | None = None,
) -> None:
    await db.execute(
        """INSERT INTO business_audit_log (business_id, action, actor_id, changes)
           VALUES ($1, $2, $3, $4::jsonb)""",
        business_id,
        action,
        actor_id,
        json.dumps(changes) if changes else None,
    )


async def get_business_by_user(
    db: asyncpg.Pool, user_id: str
) -> dict | None:
    """Return business profile for user or None if not yet created."""
    row = await db.fetchrow(
        "SELECT * FROM businesses WHERE user_id = $1",
        user_id,
    )
    return _serialize_business(row) if row else None


async def get_business_by_id(
    db: asyncpg.Pool, business_id: str
) -> dict | None:
    row = await db.fetchrow(
        "SELECT * FROM businesses WHERE id = $1",
        business_id,
    )
    return _serialize_business(row) if row else None


async def upsert_business(
    db: asyncpg.Pool,
    user_id: str,
    actor_id: str,
    fields: dict[str, Any],
) -> dict:
    """Create or update business profile. Lazy-creates meta_application too."""
    existing = await db.fetchrow(
        "SELECT id FROM businesses WHERE user_id = $1",
        user_id,
    )

    # Filter to only allowed fields
    allowed = {k: v for k, v in fields.items() if k in BUSINESS_FIELDS}

    if existing:
        # UPDATE
        if not allowed:
            raise ValueError("Nessun campo valido da aggiornare.")

        set_parts = []
        params: list = []
        idx = 1
        for col, val in allowed.items():
            set_parts.append(f"{col} = ${idx}")
            params.append(val)
            idx += 1
        params.extend([actor_id, existing["id"]])

        set_clause = ", ".join(set_parts)
        row = await db.fetchrow(
            f"UPDATE businesses SET {set_clause}, updated_at = now(), updated_by = ${idx} "
            f"WHERE id = ${idx + 1} RETURNING *",
            *params,
        )
        await _log_audit(db, str(row["id"]), "update_business", actor_id, allowed)
        return _serialize_business(row)

    # INSERT: legal_name + brand_name are required (NOT NULL in schema)
    if not allowed.get("legal_name") or not allowed.get("brand_name"):
        raise ValueError("Ragione sociale e nome commerciale sono obbligatori.")

    cols = list(allowed.keys()) + ["user_id", "updated_by"]
    vals = [f"${i + 1}" for i in range(len(cols))]
    params = list(allowed.values()) + [user_id, actor_id]

    row = await db.fetchrow(
        f"INSERT INTO businesses ({', '.join(cols)}) VALUES ({', '.join(vals)}) RETURNING *",
        *params,
    )

    # Eagerly create meta_application in status='draft' so admin has a row to work on
    await db.execute(
        """INSERT INTO meta_applications (business_id, status, updated_by)
           VALUES ($1, 'draft', $2)
           ON CONFLICT DO NOTHING""",
        row["id"],
        actor_id,
    )

    await _log_audit(db, str(row["id"]), "create_business", actor_id, allowed)
    logger.info("business_created", user_id=user_id, business_id=str(row["id"]))
    return _serialize_business(row)


async def get_meta_application(
    db: asyncpg.Pool, business_id: str
) -> dict | None:
    row = await db.fetchrow(
        "SELECT * FROM meta_applications WHERE business_id = $1",
        business_id,
    )
    return _serialize_meta(row) if row else None


async def get_meta_application_by_user(
    db: asyncpg.Pool, user_id: str
) -> dict | None:
    """Return the meta_application for the user's business.

    Sensitive Twilio credentials are stripped — this is the user-facing view.
    """
    row = await db.fetchrow(
        """SELECT ma.* FROM meta_applications ma
           JOIN businesses b ON b.id = ma.business_id
           WHERE b.user_id = $1""",
        user_id,
    )
    if not row:
        return None
    data = _serialize_meta(row)
    # Strip secrets from user-facing response
    data.pop("twilio_subaccount_auth_token_encrypted", None)
    data.pop("admin_notes", None)
    return data


async def list_businesses_admin(
    db: asyncpg.Pool,
    status_filter: str | None = None,
) -> list[dict]:
    """Return all businesses joined with their meta_application + user email.
    Admin-only endpoint consumer."""
    where = []
    params: list = []
    idx = 1
    if status_filter:
        where.append(f"ma.status = ${idx}::meta_application_status")
        params.append(status_filter)
        idx += 1

    where_clause = f"WHERE {' AND '.join(where)}" if where else ""

    rows = await db.fetch(
        f"""SELECT
              b.id               AS business_id,
              b.legal_name,
              b.brand_name,
              b.vat_number,
              b.logo_url,
              b.created_at       AS business_created_at,
              b.updated_at       AS business_updated_at,
              ma.id              AS application_id,
              ma.status,
              ma.twilio_phone_number,
              ma.submitted_at,
              ma.approved_at,
              ma.rejected_at,
              ma.updated_at      AS application_updated_at,
              u.id               AS user_id,
              u.email            AS user_email,
              u.full_name        AS user_full_name,
              p.name             AS plan_name,
              p.slug             AS plan_slug,
              s.status::text     AS subscription_status
           FROM businesses b
           LEFT JOIN meta_applications ma ON ma.business_id = b.id
           JOIN users u ON u.id = b.user_id
           LEFT JOIN subscriptions s ON s.user_id = b.user_id
           LEFT JOIN plans p ON p.id = s.plan_id
           {where_clause}
           ORDER BY b.created_at DESC""",
        *params,
    )
    return [
        {
            "business_id": str(r["business_id"]),
            "user_id": str(r["user_id"]),
            "user_email": r["user_email"],
            "user_full_name": r["user_full_name"],
            "legal_name": r["legal_name"],
            "brand_name": r["brand_name"],
            "vat_number": r["vat_number"],
            "logo_url": r["logo_url"],
            "plan_name": r["plan_name"],
            "plan_slug": r["plan_slug"],
            "subscription_status": r["subscription_status"],
            "application_id": str(r["application_id"]) if r["application_id"] else None,
            "status": r["status"],
            "twilio_phone_number": r["twilio_phone_number"],
            "submitted_at": r["submitted_at"].isoformat() if r["submitted_at"] else None,
            "approved_at": r["approved_at"].isoformat() if r["approved_at"] else None,
            "rejected_at": r["rejected_at"].isoformat() if r["rejected_at"] else None,
            "business_created_at": r["business_created_at"].isoformat() if r["business_created_at"] else None,
            "application_updated_at": r["application_updated_at"].isoformat() if r["application_updated_at"] else None,
        }
        for r in rows
    ]


async def update_meta_application_status(
    db: asyncpg.Pool,
    application_id: str,
    actor_id: str,
    new_status: str,
    admin_notes: str | None = None,
    rejection_reason: str | None = None,
    waba_id: str | None = None,
    display_name: str | None = None,
) -> dict:
    """Admin-only: change the Meta application status + optional fields.

    Automatically stamps the appropriate timestamp column (submitted_at,
    approved_at, rejected_at, activated_at, suspended_at).
    """
    VALID = {"draft", "awaiting_docs", "submitted_to_meta", "in_review",
             "approved", "rejected", "active", "suspended"}
    if new_status not in VALID:
        raise ValueError(f"Status '{new_status}' non valido.")

    # Timestamp column per status
    ts_col = {
        "submitted_to_meta": "submitted_at",
        "approved": "approved_at",
        "rejected": "rejected_at",
        "active": "activated_at",
        "suspended": "suspended_at",
    }.get(new_status)

    set_parts = ["status = $1::meta_application_status", "updated_by = $2"]
    params: list = [new_status, actor_id]
    idx = 3

    if ts_col:
        set_parts.append(f"{ts_col} = now()")

    if admin_notes is not None:
        set_parts.append(f"admin_notes = ${idx}")
        params.append(admin_notes)
        idx += 1
    if rejection_reason is not None:
        set_parts.append(f"meta_rejection_reason = ${idx}")
        params.append(rejection_reason)
        idx += 1
    if waba_id is not None:
        set_parts.append(f"meta_waba_id = ${idx}")
        params.append(waba_id)
        idx += 1
    if display_name is not None:
        set_parts.append(f"meta_display_name_approved = ${idx}")
        params.append(display_name)
        idx += 1

    params.append(application_id)
    set_clause = ", ".join(set_parts)

    row = await db.fetchrow(
        f"UPDATE meta_applications SET {set_clause}, updated_at = now() "
        f"WHERE id = ${idx} RETURNING *, business_id",
        *params,
    )
    if not row:
        raise ValueError("Applicazione non trovata.")

    await _log_audit(
        db,
        str(row["business_id"]),
        "meta_status_change",
        actor_id,
        {"new_status": new_status, "notes": admin_notes, "rejection_reason": rejection_reason},
    )
    logger.info(
        "meta_status_changed",
        application_id=application_id,
        status=new_status,
        actor_id=actor_id,
    )

    # Fire transactional email for visible status transitions.
    # Failures are logged but don't block the DB update.
    try:
        from src.services.meta_status_emails import send_meta_status_email
        await send_meta_status_email(db, str(row["business_id"]), new_status)
    except Exception as exc:  # noqa: BLE001 — email is best-effort
        logger.warning("meta_status_email_dispatch_failed", error=str(exc))

    return _serialize_meta(row)


async def get_audit_log(
    db: asyncpg.Pool, business_id: str, limit: int = 100
) -> list[dict]:
    rows = await db.fetch(
        """SELECT bal.id, bal.action, bal.actor_id, bal.changes, bal.created_at,
                  u.email AS actor_email, u.full_name AS actor_name
           FROM business_audit_log bal
           LEFT JOIN users u ON u.id = bal.actor_id
           WHERE bal.business_id = $1
           ORDER BY bal.created_at DESC
           LIMIT $2""",
        business_id,
        limit,
    )
    return [
        {
            "id": str(r["id"]),
            "action": r["action"],
            "actor_id": str(r["actor_id"]) if r["actor_id"] else None,
            "actor_email": r["actor_email"],
            "actor_name": r["actor_name"],
            "changes": r["changes"] if not isinstance(r["changes"], str) else json.loads(r["changes"]),
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


def _serialize_business(row: Any) -> dict:
    if not row:
        return {}
    return {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "legal_name": row["legal_name"],
        "brand_name": row["brand_name"],
        "vat_number": row["vat_number"],
        "tax_code": row["tax_code"],
        "address_line1": row["address_line1"],
        "address_line2": row["address_line2"],
        "city": row["city"],
        "postal_code": row["postal_code"],
        "region": row["region"],
        "country": row["country"],
        "business_phone": row["business_phone"],
        "business_email": row["business_email"],
        "website_url": row["website_url"],
        "logo_url": row["logo_url"],
        "meta_category": row["meta_category"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


def _serialize_meta(row: Any) -> dict:
    if not row:
        return {}
    return {
        "id": str(row["id"]),
        "business_id": str(row["business_id"]),
        "status": row["status"],
        "twilio_subaccount_sid": row["twilio_subaccount_sid"],
        "twilio_phone_number": row["twilio_phone_number"],
        "twilio_phone_number_sid": row["twilio_phone_number_sid"],
        "twilio_whatsapp_sender_sid": row["twilio_whatsapp_sender_sid"],
        "twilio_messaging_service_sid": row["twilio_messaging_service_sid"],
        "meta_waba_id": row["meta_waba_id"],
        "meta_display_name_approved": row["meta_display_name_approved"],
        "meta_rejection_reason": row["meta_rejection_reason"],
        "submitted_at": row["submitted_at"].isoformat() if row["submitted_at"] else None,
        "approved_at": row["approved_at"].isoformat() if row["approved_at"] else None,
        "rejected_at": row["rejected_at"].isoformat() if row["rejected_at"] else None,
        "activated_at": row["activated_at"].isoformat() if row["activated_at"] else None,
        "suspended_at": row["suspended_at"].isoformat() if row["suspended_at"] else None,
        "admin_notes": row["admin_notes"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


def missing_fields_for_meta_submit(business: dict) -> list[str]:
    """Return list of missing required fields blocking Meta submission.
    Empty list = ready to submit."""
    missing = []
    for field in META_SUBMIT_REQUIRED:
        if not business.get(field):
            missing.append(field)
    return missing
