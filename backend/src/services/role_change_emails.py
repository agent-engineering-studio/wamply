"""Transactional emails fired on admin role-change transitions.

Called synchronously from `admin_update_user_role` after the UPDATE commits.
Failures are logged but never raise — the role change stands regardless of
SMTP availability, same pattern as `meta_status_emails.send_meta_status_email`.
"""

import html
import os

import asyncpg
import structlog

from src.services.meta_status_emails import _load_template, _render, _send_email

logger = structlog.get_logger()


ROLE_LABELS = {
    "user": "Utente",
    "collaborator": "Collaboratore",
    "sales": "Sales",
    "admin": "Amministratore",
}

PERMISSION_LABELS = {
    "admin.overview.view": "Visualizzare la dashboard amministrativa",
    "admin.users.view": "Visualizzare la lista utenti",
    "admin.users.edit": "Modificare, sospendere ed eliminare utenti",
    "admin.staff.manage": "Promuovere e retrocedere membri dello staff",
    "admin.campaigns.view": "Visualizzare le campagne di tutti gli utenti",
    "admin.campaigns.suspend": "Sospendere ed eliminare campagne",
    "admin.whatsapp.manage": "Gestire le applicazioni WhatsApp Business",
    "admin.ai_costs.view": "Visualizzare i costi AI",
    "admin.ai_revenue.view": "Visualizzare i ricavi AI",
    "admin.ai_key.configure": "Configurare la system key Claude API",
}

ROLE_RANK = {"user": 0, "collaborator": 1, "sales": 1, "admin": 2}


def _compute_type(old_role: str, new_role: str) -> str:
    """Return 'promotion' or 'demotion' based on rank comparison.
    Lateral changes (same rank, different role) are treated as 'promotion'
    so the user sees the new capability list."""
    old = ROLE_RANK.get(old_role, 0)
    new = ROLE_RANK.get(new_role, 0)
    return "demotion" if new < old else "promotion"


def _role_label(role: str) -> str:
    return ROLE_LABELS.get(role, role)


def _permissions_list_html(perms: set[str]) -> str:
    """Render a UL with known permission labels. Unknown keys are skipped."""
    items = [PERMISSION_LABELS[p] for p in sorted(perms) if p in PERMISSION_LABELS]
    if not items:
        return ""
    lis = "".join(
        f'<li style="margin:4px 0;color:#94A3B8;font-size:13.5px;line-height:1.5;">{label}</li>'
        for label in items
    )
    return f'<ul style="margin:0;padding-left:20px;">{lis}</ul>'


async def send_role_change_email(
    db: asyncpg.Pool,
    user_id: str,
    old_role: str,
    new_role: str,
    actor_email: str,
) -> bool:
    """Send the appropriate template for this role change.

    Returns True on success, False on any failure (logged as warning, never
    raises). Fire-and-forget from the caller's perspective.
    """
    try:
        row = await db.fetchrow(
            "SELECT email, full_name FROM users WHERE id = $1", user_id
        )
    except Exception as exc:
        logger.warning("role_change_email_db_error", error=str(exc))
        return False

    if not row or not row["email"]:
        logger.warning("role_change_email_no_recipient", user_id=user_id)
        return False

    change_type = _compute_type(old_role, new_role)
    tpl_file = "role-promoted.html" if change_type == "promotion" else "role-demoted.html"
    subject_map = {
        "promotion": f"Il tuo ruolo su Wamply è stato aggiornato a {_role_label(new_role)}",
        "demotion": "Il tuo ruolo su Wamply è stato modificato",
    }
    subject = subject_map[change_type]

    app_url = os.getenv("APP_URL", "http://localhost:3000")
    full_name = row["full_name"] or (row["email"].split("@")[0] if row["email"] else "collega")

    perms_html = ""
    if change_type == "promotion":
        perm_rows = await db.fetch(
            "SELECT permission FROM role_permissions WHERE role = $1::user_role",
            new_role,
        )
        perms = {r["permission"] for r in perm_rows}
        # Admin has wildcard — render the full known label list instead
        if "*" in perms:
            perms = set(PERMISSION_LABELS.keys())
        perms_html = _permissions_list_html(perms)

    variables = {
        "USER_NAME": html.escape(full_name),
        "OLD_ROLE_LABEL": _role_label(old_role),
        "NEW_ROLE_LABEL": _role_label(new_role),
        "CHANGED_BY": html.escape(actor_email),
        "PERMISSIONS_LIST_HTML": perms_html,
        "CTA_URL": f"{app_url}/admin",
    }

    tpl = _load_template(tpl_file)
    if not tpl:
        logger.warning("role_change_email_template_missing", template=tpl_file)
        return False
    body = _render(tpl, variables)

    try:
        _send_email(row["email"], subject, body)
        logger.info("role_change_email_sent", type=change_type, email=row["email"])
        return True
    except Exception as exc:
        logger.warning("role_change_email_send_failed", type=change_type, error=str(exc))
        return False
