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

    # Get Twilio credentials — prefer the per-customer subaccount (new model)
    # over the legacy whatsapp_config (kept for backward compat during rollout).
    ma_row = await db.pool.fetchrow(
        """SELECT ma.twilio_subaccount_sid,
                  ma.twilio_subaccount_auth_token_encrypted,
                  ma.twilio_phone_number,
                  ma.twilio_messaging_service_sid,
                  ma.status::text AS ma_status
           FROM meta_applications ma
           JOIN businesses b ON b.id = ma.business_id
           WHERE b.user_id = $1""",
        user_id,
    )

    if ma_row and ma_row["twilio_subaccount_sid"] and ma_row["twilio_subaccount_auth_token_encrypted"]:
        # Block the dispatch if the WABA isn't approved yet.
        if ma_row["ma_status"] not in ("approved", "active"):
            _err = (
                f"WhatsApp non ancora attivato (stato: {ma_row['ma_status']}). "
                "Attendi l'approvazione Meta prima di inviare campagne."
            )
            await log.aerror("dispatcher_config_error", campaign_id=campaign_id, error=_err)
            for msg in messages:
                await update_message_failed(db, redis, campaign_id, msg["message_id"], _err)
            return {"sent": 0, "failed": len(messages), "paused": False}
        account_sid = ma_row["twilio_subaccount_sid"]
        auth_token_raw = ma_row["twilio_subaccount_auth_token_encrypted"]
        if isinstance(auth_token_raw, (bytes, bytearray)):
            auth_token_raw = auth_token_raw.decode()
        auth_token = decrypt(auth_token_raw)
        from_ = (
            f"whatsapp:{ma_row['twilio_phone_number']}"
            if ma_row["twilio_phone_number"]
            else None
        )
        messaging_service_sid = ma_row["twilio_messaging_service_sid"]
        await log.ainfo(
            "dispatcher_using_subaccount",
            user_id=user_id,
            subaccount_sid=account_sid,
        )
    else:
        # Master credentials path: admin-configured in system_config / ENV.
        # Replaces the old per-user whatsapp_config (removed from user settings).
        _KEY_SID = "twilio_master_account_sid"
        _KEY_TOKEN = "twilio_master_auth_token_encrypted"
        _KEY_FROM = "twilio_master_from"
        _KEY_MSS = "twilio_master_messaging_service_sid"
        cfg_rows = await db.pool.fetch(
            "SELECT key, value FROM system_config WHERE key = ANY($1)",
            [_KEY_SID, _KEY_TOKEN, _KEY_FROM, _KEY_MSS],
        )
        cfg = {r["key"]: r["value"] for r in cfg_rows}
        import os as _os
        account_sid = cfg.get(_KEY_SID) or _os.getenv("TWILIO_ACCOUNT_SID", "")
        _enc = cfg.get(_KEY_TOKEN) or ""
        auth_token = decrypt(_enc) if _enc else _os.getenv("TWILIO_AUTH_TOKEN", "")
        from_ = cfg.get(_KEY_FROM) or _os.getenv("TWILIO_FROM")
        messaging_service_sid = cfg.get(_KEY_MSS) or _os.getenv("TWILIO_MESSAGING_SERVICE_SID")
        if not account_sid or not auth_token:
            _err = (
                "Twilio non configurato. "
                "L'amministratore deve impostare le credenziali master dal pannello Admin → Twilio."
            )
            await log.aerror("dispatcher_config_error", campaign_id=campaign_id, error=_err)
            for msg in messages:
                await update_message_failed(db, redis, campaign_id, msg["message_id"], _err)
            return {"sent": 0, "failed": len(messages), "paused": False}
        await log.ainfo("dispatcher_using_master", user_id=user_id)

    # Validate config before touching individual messages.
    # Any config error marks ALL messages failed so the campaign still completes.
    config_error: str | None = None
    if not from_ and not messaging_service_sid:
        config_error = "Configurazione Twilio incompleta: serve un numero attivo o messaging_service_sid."
    content_sid = template.get("twilio_content_sid")
    if not content_sid:
        config_error = (
            f"Template '{template.get('name')}' non registrato su Twilio: "
            "salvare il Content SID dalla pagina Templates."
        )

    if config_error:
        await log.aerror("dispatcher_config_error", campaign_id=campaign_id, error=config_error)
        for msg in messages:
            await update_message_failed(db, redis, campaign_id, msg["message_id"], config_error)
        return {"sent": 0, "failed": len(messages), "paused": False}

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
