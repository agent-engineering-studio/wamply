"""Sends trial-expiration reminder emails at 3 days and 1 day before expiry.

Runs as a background task from the FastAPI lifespan. Idempotent via
reminder_Nd_sent_at columns on the subscriptions table.
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
        logger.warning("trial_reminder_template_missing", path=str(path))
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


async def send_trial_reminders(db: asyncpg.Pool) -> dict[str, int]:
    """Find trials expiring in ~3d and ~1d, send reminder emails, mark flags.
    Returns a count dict for observability.
    """
    app_url = os.getenv("APP_URL", "http://localhost:3000")
    tpl_3d = _load_template("trial-reminder-3d.html")
    tpl_1d = _load_template("trial-reminder-1d.html")
    sent = {"3d": 0, "1d": 0, "errors": 0}

    # Window query: catches trials whose end is between (X-0.5d) and (X+0.5d)
    # so a once-per-hour tick can't miss a reminder.
    rows_3d = await db.fetch(
        """SELECT s.id, s.user_id, s.current_period_end, u.email, u.full_name
           FROM subscriptions s
           JOIN users u ON u.id = s.user_id
           WHERE s.status = 'trialing'
             AND s.trial_reminder_3d_sent_at IS NULL
             AND s.current_period_end BETWEEN now() + interval '2.5 days'
                                          AND now() + interval '3.5 days'"""
    )
    for r in rows_3d:
        try:
            html = _render(tpl_3d, {
                "FULL_NAME": r["full_name"] or r["email"].split("@")[0],
                "EMAIL": r["email"],
                "BILLING_URL": f"{app_url}/settings/billing",
                "DAYS_LEFT": "3",
            })
            _send_email(r["email"], "Il tuo trial Wamply scade tra 3 giorni", html)
            await db.execute(
                "UPDATE subscriptions SET trial_reminder_3d_sent_at = now() WHERE id = $1",
                r["id"],
            )
            sent["3d"] += 1
        except Exception as exc:
            sent["errors"] += 1
            logger.warning("trial_reminder_3d_failed", user_id=str(r["user_id"]), error=str(exc))

    rows_1d = await db.fetch(
        """SELECT s.id, s.user_id, s.current_period_end, u.email, u.full_name
           FROM subscriptions s
           JOIN users u ON u.id = s.user_id
           WHERE s.status = 'trialing'
             AND s.trial_reminder_1d_sent_at IS NULL
             AND s.current_period_end BETWEEN now() + interval '12 hours'
                                          AND now() + interval '36 hours'"""
    )
    for r in rows_1d:
        try:
            html = _render(tpl_1d, {
                "FULL_NAME": r["full_name"] or r["email"].split("@")[0],
                "EMAIL": r["email"],
                "BILLING_URL": f"{app_url}/settings/billing",
                "DAYS_LEFT": "1",
            })
            _send_email(r["email"], "Il tuo trial Wamply scade domani", html)
            await db.execute(
                "UPDATE subscriptions SET trial_reminder_1d_sent_at = now() WHERE id = $1",
                r["id"],
            )
            sent["1d"] += 1
        except Exception as exc:
            sent["errors"] += 1
            logger.warning("trial_reminder_1d_failed", user_id=str(r["user_id"]), error=str(exc))

    _ = datetime.now(timezone.utc)
    return sent
