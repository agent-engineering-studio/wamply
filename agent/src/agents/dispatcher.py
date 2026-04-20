"""Stage 3 — Dispatcher: Sends messages via Twilio WhatsApp API with rate limiting and retry."""

import asyncio

from src.memory.redis_memory import RedisMemory
from src.memory.supabase_memory import SupabaseMemory
from src.tools.status_tool import update_message_failed, update_message_sent
from src.tools.whatsapp_tool import send_whatsapp_message
from src.utils.encryption import decrypt
from src.utils.telemetry import log

MAX_RETRIES = 3
BACKOFF_BASE = 2  # seconds


async def dispatch_messages(
    db: SupabaseMemory,
    redis: RedisMemory,
    campaign_id: str,
    user_id: str,
    messages: list[dict],
    template: dict,
) -> dict:
    """
    Stage 3: Send all messages via Twilio WhatsApp API.

    Handles rate limiting, retry with exponential backoff, and pause/resume.
    Returns summary stats.
    """
    await log.ainfo(
        "dispatcher_start",
        campaign_id=campaign_id,
        messages=len(messages),
    )

    # Get Twilio credentials
    row = await db.pool.fetchrow(
        "SELECT twilio_account_sid, twilio_auth_token_encrypted, "
        "twilio_from, twilio_messaging_service_sid "
        "FROM whatsapp_config WHERE user_id = $1",
        user_id,
    )
    if not row or not row["twilio_auth_token_encrypted"] or not row["twilio_account_sid"]:
        raise ValueError("Configurazione Twilio mancante")
    if not row["twilio_from"] and not row["twilio_messaging_service_sid"]:
        raise ValueError(
            "Configurazione Twilio: serve twilio_from o twilio_messaging_service_sid"
        )

    account_sid = row["twilio_account_sid"]
    auth_token = decrypt(row["twilio_auth_token_encrypted"])
    from_ = row["twilio_from"]
    messaging_service_sid = row["twilio_messaging_service_sid"]

    content_sid = template.get("twilio_content_sid")
    if not content_sid:
        raise ValueError(
            f"Template {template.get('name')} senza twilio_content_sid: "
            "creare il Content Template su Twilio Console e salvare il SID."
        )

    sent = 0
    failed = 0
    result: dict = {}

    for msg in messages:
        # Check pause
        if await redis.is_paused(campaign_id):
            await log.ainfo("dispatcher_paused", campaign_id=campaign_id)
            await redis.set_state(campaign_id, {
                "status": "paused",
                "sent": sent,
                "failed": failed,
                "remaining": len(messages) - sent - failed,
            })
            return {"sent": sent, "failed": failed, "paused": True}

        if not msg.get("personalized_text"):
            await update_message_failed(
                db, redis, campaign_id, msg["message_id"], "Personalizzazione fallita"
            )
            failed += 1
            continue

        # Single variable {{1}} filled with personalized_text.
        # Customize here if Twilio template has multiple variables.
        content_variables = {"1": msg["personalized_text"]}

        # Send with retry
        success = False
        for attempt in range(MAX_RETRIES):
            result = await send_whatsapp_message(
                account_sid=account_sid,
                auth_token=auth_token,
                to=msg["contact"]["phone"],
                content_sid=content_sid,
                content_variables=content_variables,
                from_=from_,
                messaging_service_sid=messaging_service_sid,
            )

            if result["success"]:
                await update_message_sent(
                    db, redis, campaign_id, msg["message_id"], result["sid"]
                )
                sent += 1
                success = True
                break
            else:
                if attempt < MAX_RETRIES - 1:
                    wait = BACKOFF_BASE ** (attempt + 1)
                    await log.awarn(
                        "dispatch_retry",
                        attempt=attempt + 1,
                        wait=wait,
                        contact=msg["contact"]["phone"],
                    )
                    await asyncio.sleep(wait)

        if not success:
            await update_message_failed(
                db, redis, campaign_id, msg["message_id"],
                result.get("error", "Max retries exceeded"),
            )
            failed += 1

    await log.ainfo(
        "dispatcher_done",
        campaign_id=campaign_id,
        sent=sent,
        failed=failed,
    )

    return {"sent": sent, "failed": failed, "paused": False}
