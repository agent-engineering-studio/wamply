"""AI credit threshold reminders: 80% warning + 100% exhaustion emails.

Runs as a background asyncio task from the FastAPI lifespan, tick 1h.
Idempotent via the ai_credits_80_warning_sent_at / ai_credits_100_reached_at
flags on the subscriptions table.

Month rollover: when `usage_counters.period_start` transitions to a new
month, the flags are cleared so reminders can fire again for the new cycle.
This cleanup runs on every loop iteration — cheap, bounded by sub count.
"""

import os
import ssl
import smtplib
from datetime import datetime, timezone
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
        logger.warning("ai_credits_template_missing", path=str(path))
        return ""


def _render(tpl: str, variables: dict[str, str]) -> str:
    out = tpl
    for key, value in variables.items():
        out = out.replace("{{" + key + "}}", value)
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


def _format_renewal_date(iso: datetime | None) -> str:
    if not iso:
        return "prossimo mese"
    return iso.strftime("%d/%m/%Y")


async def _clear_rolled_over_flags(db: asyncpg.Pool) -> None:
    """On month rollover, clear last-period flags so reminders re-fire.

    Logic: a flag is stale if it was set BEFORE the first day of the
    current calendar month. Clearing on a monthly boundary is simple
    and correct for our monthly budgets.
    """
    await db.execute(
        """UPDATE subscriptions
           SET ai_credits_80_warning_sent_at = NULL
           WHERE ai_credits_80_warning_sent_at IS NOT NULL
             AND ai_credits_80_warning_sent_at < date_trunc('month', now())"""
    )
    await db.execute(
        """UPDATE subscriptions
           SET ai_credits_100_reached_at = NULL
           WHERE ai_credits_100_reached_at IS NOT NULL
             AND ai_credits_100_reached_at < date_trunc('month', now())"""
    )


async def run_credit_reminders(db: asyncpg.Pool) -> dict[str, int]:
    """Send 80% warning and 100% exhaustion emails. Returns counts for logging."""
    await _clear_rolled_over_flags(db)

    app_url = os.getenv("APP_URL", "http://localhost:3000")
    tpl_80 = _load_template("ai-credits-warning-80.html")
    tpl_100 = _load_template("ai-credits-exhausted.html")
    sent = {"80": 0, "100": 0, "errors": 0}

    # Shared query: find subs on paying plans (ai_credits_month > 0) where
    # this-month ai_credits_used crossed a threshold AND the flag is NULL.
    # usage_counters may not have a row for the current period (user hasn't
    # used any AI yet this month) — those are naturally excluded.
    candidates = await db.fetch(
        """SELECT
             s.id                       AS sub_id,
             s.user_id                  AS user_id,
             s.ai_credits_80_warning_sent_at,
             s.ai_credits_100_reached_at,
             s.current_period_end,
             u.email                    AS email,
             u.full_name                AS full_name,
             p.name                     AS plan_name,
             p.ai_credits_month         AS credits_limit,
             COALESCE(uc.ai_credits_used, 0) AS credits_used
           FROM subscriptions s
           JOIN users u ON u.id = s.user_id
           JOIN plans p ON p.id = s.plan_id
           LEFT JOIN usage_counters uc
             ON uc.user_id = s.user_id
            AND uc.period_start = date_trunc('month', now())::date
           WHERE s.status IN ('active', 'trialing')
             AND p.ai_credits_month > 0
             AND COALESCE(uc.ai_credits_used, 0) >= 0.8 * p.ai_credits_month"""
    )

    for r in candidates:
        limit = int(r["credits_limit"])
        used = float(r["credits_used"])
        pct = used / limit if limit > 0 else 0.0
        remaining = max(0.0, limit - used)

        # 100% — send exhaustion email if not yet sent this period
        if pct >= 1.0 and r["ai_credits_100_reached_at"] is None:
            try:
                html = _render(tpl_100, {
                    "FULL_NAME": r["full_name"] or (r["email"].split("@")[0] if r["email"] else "utente"),
                    "EMAIL": r["email"],
                    "PLAN_NAME": r["plan_name"],
                    "CREDITS_LIMIT": str(limit),
                    "CREDITS_URL": f"{app_url}/settings/credits",
                    "BILLING_URL": f"{app_url}/settings/billing",
                    "RENEWAL_DATE": _format_renewal_date(r["current_period_end"]),
                })
                _send_email(r["email"], "Crediti AI Wamply esauriti", html)
                await db.execute(
                    "UPDATE subscriptions SET ai_credits_100_reached_at = now() WHERE id = $1",
                    r["sub_id"],
                )
                sent["100"] += 1
            except Exception as exc:
                sent["errors"] += 1
                logger.warning("ai_credits_100_email_failed", user_id=str(r["user_id"]), error=str(exc))
            continue

        # 80–99% — send warning if not yet sent this period
        if pct >= 0.8 and r["ai_credits_80_warning_sent_at"] is None:
            try:
                html = _render(tpl_80, {
                    "FULL_NAME": r["full_name"] or (r["email"].split("@")[0] if r["email"] else "utente"),
                    "EMAIL": r["email"],
                    "PLAN_NAME": r["plan_name"],
                    "CREDITS_USED": str(int(used)),
                    "CREDITS_LIMIT": str(limit),
                    "CREDITS_REMAINING": str(int(remaining)),
                    "CREDITS_URL": f"{app_url}/settings/credits",
                    "BILLING_URL": f"{app_url}/settings/billing",
                    "RENEWAL_DATE": _format_renewal_date(r["current_period_end"]),
                })
                _send_email(r["email"], "Hai usato l'80% dei crediti AI", html)
                await db.execute(
                    "UPDATE subscriptions SET ai_credits_80_warning_sent_at = now() WHERE id = $1",
                    r["sub_id"],
                )
                sent["80"] += 1
            except Exception as exc:
                sent["errors"] += 1
                logger.warning("ai_credits_80_email_failed", user_id=str(r["user_id"]), error=str(exc))

    _ = datetime.now(timezone.utc)  # ensure timezone import used
    return sent
