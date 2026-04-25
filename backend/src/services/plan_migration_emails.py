"""Send one-shot email to existing paying users announcing the β+ v2 listino
rename and new included features. Idempotent — safe to re-run; tracks which
user_ids have been notified via audit_log rows with action='plan_migration_notice'."""
import html
import os
import structlog
import asyncpg

from src.services.meta_status_emails import _load_template, _render, _send_email

logger = structlog.get_logger()

FEATURE_LABELS = {
    "compliance_check": "Controllo conformità WhatsApp (Meta/Twilio)",
    "generate": "Generazione template con AI in italiano colloquiale",
    "improve": "Riscrittura messaggi con AI per tono e lunghezza",
    "translate": "Traduzione multi-lingua (IT/EN/DE/FR/ES)",
    "analytics_standard": "Analytics campagne (open, click, reply)",
    "analytics_advanced": "Analytics avanzati (cohort, predizione no-show)",
}


def _compute_new_features(old: dict, new: dict) -> set:
    """Return keys present-and-true in `new` but not in `old`."""
    old_enabled = {k for k, v in (old or {}).items() if v}
    new_enabled = {k for k, v in (new or {}).items() if v}
    return new_enabled - old_enabled


def _features_html(added: set) -> str:
    lis = "".join(
        f'<li style="margin:4px 0;color:#94A3B8;font-size:13.5px;line-height:1.5;">{html.escape(FEATURE_LABELS[k])}</li>'
        for k in sorted(added)
        if k in FEATURE_LABELS
    )
    return f'<ul style="margin:0;padding-left:20px;">{lis}</ul>' if lis else ""


async def send_migration_notice(db: asyncpg.Pool, user_id: str) -> bool:
    row = await db.fetchrow(
        """SELECT u.email, u.full_name,
                  p.name as new_name, p.ai_features as new_features,
                  p.price_cents, p.msg_included,
                  (
                    SELECT name FROM plans WHERE slug IN ('starter','professional','enterprise')
                      AND id = s.plan_id
                  ) as old_name,
                  '{}'::jsonb as old_features
           FROM users u
           JOIN subscriptions s ON s.user_id = u.id
           JOIN plans p ON p.id = s.plan_id
           WHERE u.id = $1 AND s.status = 'active'""",
        user_id,
    )
    if not row or not row["email"]:
        return False

    added = _compute_new_features(
        dict(row["old_features"] or {}),
        dict(row["new_features"] or {}),
    )
    if not added:
        logger.info("plan_migration_no_new_features", user_id=user_id)
        return False

    app_url = os.getenv("APP_URL", "http://localhost:3000")
    full_name = row["full_name"] or row["email"].split("@")[0]

    variables = {
        "USER_NAME": html.escape(full_name),
        "OLD_PLAN_NAME": html.escape(row["old_name"] or "il tuo piano"),
        "NEW_PLAN_NAME": html.escape(row["new_name"]),
        "NEW_FEATURES_LIST_HTML": _features_html(added),
        "PRICE_EUR": f"{row['price_cents'] / 100:.0f}",
        "MSG_INCLUDED": str(row["msg_included"]),
        "CTA_URL": f"{app_url}/admin",
    }

    tpl = _load_template("plan-migrated.html")
    if not tpl:
        logger.warning("plan_migration_template_missing")
        return False

    body = _render(tpl, variables)
    try:
        _send_email(row["email"], f"Il tuo piano Wamply ora si chiama {row['new_name']}", body)
        logger.info("plan_migration_email_sent", user_id=user_id)
        return True
    except Exception as exc:
        logger.warning("plan_migration_email_failed", error=str(exc))
        return False
