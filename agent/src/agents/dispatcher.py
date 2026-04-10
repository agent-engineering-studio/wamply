"""Stage 3 — Dispatcher: Sends messages via WhatsApp API with rate limiting and retry."""

import asyncio

from src.config import settings
from src.memory.redis_memory import RedisMemory
from src.memory.supabase_memory import SupabaseMemory
from src.tools.whatsapp_tool import send_whatsapp_message
from src.tools.status_tool import update_message_sent, update_message_failed
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
    Stage 3: Send all messages via WhatsApp API.

    Handles rate limiting, retry with exponential backoff, and pause/resume.
    Returns summary stats.
    """
    await log.ainfo(
        "dispatcher_start",
        campaign_id=campaign_id,
        messages=len(messages),
    )

    # Get WhatsApp credentials
    row = await db.pool.fetchrow(
        "SELECT phone_number_id, encrypted_token FROM whatsapp_config WHERE user_id = $1",
        user_id,
    )
    if not row or not row["encrypted_token"]:
        raise ValueError("Configurazione WhatsApp mancante")

    phone_number_id = row["phone_number_id"]
    token = decrypt(row["encrypted_token"])

    sent = 0
    failed = 0

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

        # Send with retry
        success = False
        for attempt in range(MAX_RETRIES):
            result = await send_whatsapp_message(
                phone_number_id=phone_number_id,
                token=token,
                to=msg["contact"]["phone"],
                template_name=template["name"],
                template_language=template.get("language", "it"),
                components=template.get("components", []),
            )

            if result["success"]:
                await update_message_sent(
                    db, redis, campaign_id, msg["message_id"], result["wamid"]
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
