import httpx

from src.config import settings
from src.utils.rate_limiter import TokenBucketRateLimiter
from src.utils.telemetry import log

_rate_limiter = TokenBucketRateLimiter(rate=settings.whatsapp_rate_limit)


async def send_whatsapp_message(
    phone_number_id: str,
    token: str,
    to: str,
    template_name: str,
    template_language: str,
    components: list[dict],
) -> dict:
    """Send a WhatsApp template message via Meta Cloud API v21.0."""
    await _rate_limiter.acquire()

    url = f"{settings.whatsapp_api_url}/v21.0/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": template_language},
            "components": components,
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code == 200:
        data = resp.json()
        wamid = data.get("messages", [{}])[0].get("id")
        await log.ainfo("whatsapp_sent", to=to, wamid=wamid)
        return {"success": True, "wamid": wamid}
    else:
        error = resp.text
        await log.awarn("whatsapp_failed", to=to, status=resp.status_code, error=error)
        return {"success": False, "error": error}
