"""Transactional emails fired on Meta application status transitions.

Called synchronously from `update_meta_application_status` when the status
changes. Failures are logged but do not block the DB update — the admin
sees the state change regardless of SMTP availability.
"""

import os
import ssl
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from pathlib import Path

import asyncpg
import structlog

logger = structlog.get_logger()

TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "emails"


def _load_template(name: str) -> str:
    path = TEMPLATES_DIR / name
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.warning("meta_status_email_template_missing", path=str(path))
        return ""


def _render(tpl: str, variables: dict[str, str]) -> str:
    out = tpl
    # Strip optional conditional blocks {{#VAR}}...{{/VAR}} depending on value
    for key, value in variables.items():
        block_open = "{{#" + key + "}}"
        block_close = "{{/" + key + "}}"
        if value:
            out = out.replace(block_open, "").replace(block_close, "")
        else:
            # Remove the whole conditional block + content
            start = out.find(block_open)
            while start != -1:
                end = out.find(block_close, start)
                if end == -1:
                    break
                out = out[:start] + out[end + len(block_close):]
                start = out.find(block_open)
    for key, value in variables.items():
        out = out.replace("{{" + key + "}}", value or "")
    return out


def _send_email(to_email: str, subject: str, html: str) -> None:
    host = os.getenv("SMTP_HOST", "mailhog")
    port = int(os.getenv("SMTP_PORT", "1025"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASS", "")
    sender_email = os.getenv("SMTP_FROM", "admin@wcm.local")
    sender_name = os.getenv("SMTP_SENDER_NAME", "Wamply")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((sender_name, sender_email))
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html", "utf-8"))

    if port == 465:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as s:
            if user:
                s.login(user, password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=15) as s:
            if port == 587:
                s.starttls(context=ssl.create_default_context())
            if user:
                s.login(user, password)
            s.send_message(msg)


async def send_meta_status_email(
    db: asyncpg.Pool,
    business_id: str,
    new_status: str,
) -> bool:
    """Send the appropriate email for this status transition.

    Supported status → email map:
      - 'submitted_to_meta' → meta-submitted.html
      - 'approved'          → meta-approved.html
      - 'rejected'          → meta-rejected.html

    Other statuses are intentionally silent (draft, awaiting_docs,
    in_review, active, suspended). Returns True if an email was sent.
    """
    TEMPLATE_MAP = {
        "submitted_to_meta": ("meta-submitted.html", "Richiesta WhatsApp inviata a Meta"),
        "approved": ("meta-approved.html", "🎉 Il tuo WhatsApp è attivo su Wamply"),
        "rejected": ("meta-rejected.html", "Meta ha richiesto modifiche alla tua richiesta"),
    }
    if new_status not in TEMPLATE_MAP:
        return False

    tpl_file, subject = TEMPLATE_MAP[new_status]

    # Pull recipient + context
    row = await db.fetchrow(
        """SELECT u.email, u.full_name,
                  b.brand_name,
                  ma.twilio_phone_number,
                  ma.meta_display_name_approved,
                  ma.meta_rejection_reason
           FROM meta_applications ma
           JOIN businesses b ON b.id = ma.business_id
           JOIN users u ON u.id = b.user_id
           WHERE b.id = $1""",
        business_id,
    )
    if not row or not row["email"]:
        logger.warning("meta_status_email_no_recipient", business_id=business_id)
        return False

    app_url = os.getenv("APP_URL", "http://localhost:3000")
    full_name = row["full_name"] or (row["email"].split("@")[0] if row["email"] else "cliente")

    variables = {
        "FULL_NAME": full_name,
        "EMAIL": row["email"],
        "BRAND_NAME": row["brand_name"] or "la tua azienda",
        "PHONE_NUMBER": row["twilio_phone_number"] or "",
        "DISPLAY_NAME": row["meta_display_name_approved"] or "",
        "REJECTION_REASON": row["meta_rejection_reason"] or "Nessun motivo specifico fornito.",
        "DASHBOARD_URL": f"{app_url}/dashboard",
        "BUSINESS_URL": f"{app_url}/settings/business",
        "NEW_CAMPAIGN_URL": f"{app_url}/campaigns/new",
    }

    tpl = _load_template(tpl_file)
    if not tpl:
        return False
    html = _render(tpl, variables)

    try:
        _send_email(row["email"], subject, html)
        logger.info("meta_status_email_sent", status=new_status, email=row["email"])
        return True
    except Exception as exc:
        logger.warning("meta_status_email_send_failed", status=new_status, error=str(exc))
        return False
