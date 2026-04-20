import asyncio
import json

from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

from src.config import settings
from src.utils.rate_limiter import TokenBucketRateLimiter
from src.utils.telemetry import log

_rate_limiter = TokenBucketRateLimiter(rate=settings.whatsapp_rate_limit)


def _with_whatsapp_prefix(addr: str) -> str:
    return addr if addr.startswith("whatsapp:") else f"whatsapp:{addr}"


async def send_whatsapp_message(
    account_sid: str,
    auth_token: str,
    to: str,
    content_sid: str,
    content_variables: dict | None = None,
    from_: str | None = None,
    messaging_service_sid: str | None = None,
) -> dict:
    """Send a WhatsApp template message via Twilio.

    Uses Twilio Content Templates. Provide either
    `messaging_service_sid` (preferred) or `from_`.
    """
    if not messaging_service_sid and not from_:
        return {
            "success": False,
            "error": "missing sender (from_ or messaging_service_sid)",
        }

    await _rate_limiter.acquire()

    kwargs: dict = {
        "to": _with_whatsapp_prefix(to),
        "content_sid": content_sid,
    }
    if content_variables:
        kwargs["content_variables"] = json.dumps(content_variables)
    if messaging_service_sid:
        kwargs["messaging_service_sid"] = messaging_service_sid
    else:
        kwargs["from_"] = _with_whatsapp_prefix(from_)

    def _send_sync() -> dict:
        client = Client(account_sid, auth_token)
        message = client.messages.create(**kwargs)
        return {
            "success": True,
            "sid": message.sid,
            "status": message.status,
        }

    try:
        result = await asyncio.to_thread(_send_sync)
        await log.ainfo(
            "twilio_sent",
            to=to,
            sid=result["sid"],
            status=result["status"],
        )
        return result
    except TwilioRestException as exc:
        await log.awarn(
            "twilio_failed",
            to=to,
            status=exc.status,
            code=exc.code,
            msg=exc.msg,
        )
        return {
            "success": False,
            "error": f"{exc.code}: {exc.msg}",
            "status_code": exc.status,
        }
