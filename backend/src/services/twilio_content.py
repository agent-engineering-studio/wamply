"""Twilio Content API wrapper for WhatsApp templates.

The Content API lives on a different host (`content.twilio.com`) from the main
REST API (`api.twilio.com`). Wamply uses the master credentials configured in
admin (db / env) for every call — templates are global to the platform, not
per-subaccount.

Lifecycle covered here:
- create_content      → POST /v1/Content                  (returns HX… SID)
- delete_content      → DELETE /v1/Content/{sid}          (only if not approved)
- submit_for_whatsapp → POST /v1/Content/{sid}/ApprovalRequests/whatsapp
- get_approval_status → GET  /v1/Content/{sid}/ApprovalRequests

Approval is async (Meta side, hours/days). In sandbox/dev approval is not
needed: the Content SID alone is enough to send.
"""

from __future__ import annotations

import os

import asyncpg
import httpx
import structlog
from fastapi import HTTPException

from src.services.twilio_admin import resolve_master_credentials
from src.services.twilio_provisioning import HTTP_TIMEOUT, _auth_header

logger = structlog.get_logger()

CONTENT_API_BASE = "https://content.twilio.com/v1"

# Public base URL Twilio uses to fetch template media (e.g. https://app.wamply.it).
# In dev: set to your ngrok/cloudflared tunnel URL. If unset, we try to derive
# it from the request — but Twilio still won't reach localhost, so set this.
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")


def _components_to_body_text(components: list | None) -> str:
    """Extract the body text from Wamply's `components` JSONB array.

    components is shaped like [{"type": "BODY", "text": "Ciao {{1}}..."}, ...].
    Twilio's twilio/text type only needs the body string with {{n}} placeholders.
    """
    if not components:
        return ""
    for c in components:
        if isinstance(c, dict) and (c.get("type") or "").lower() == "body":
            return c.get("text") or ""
    return ""


def _placeholder_count(body: str) -> int:
    """Count {{1}}, {{2}}… placeholders in the body to build the variables map."""
    import re
    return len(set(re.findall(r"\{\{\s*(\d+)\s*\}\}", body or "")))


def _extract_media_url(components: list | None) -> str | None:
    """If the template's HEADER component is media (IMAGE/VIDEO/DOCUMENT),
    return its absolute URL ready for Twilio to fetch. Returns None for
    text-only templates.

    Wamply stores the URL relative (e.g. '/storage/template-media/...').
    Twilio needs an absolute https URL, so we prepend PUBLIC_BASE_URL.
    """
    if not components:
        return None
    for c in components:
        if not isinstance(c, dict):
            continue
        if (c.get("type") or "").upper() != "HEADER":
            continue
        fmt = (c.get("format") or "").upper()
        if fmt not in {"IMAGE", "VIDEO", "DOCUMENT"}:
            return None
        url = c.get("media_url") or ""
        if not url:
            return None
        if url.startswith("http://") or url.startswith("https://"):
            return url
        if not PUBLIC_BASE_URL:
            raise HTTPException(
                status_code=500,
                detail=(
                    "PUBLIC_BASE_URL non configurato: Twilio non può raggiungere il media. "
                    "Imposta la variabile d'ambiente per il backend."
                ),
            )
        return f"{PUBLIC_BASE_URL}{url if url.startswith('/') else '/' + url}"
    return None


async def create_content(
    db: asyncpg.Pool,
    *,
    friendly_name: str,
    language: str,
    components: list | None,
) -> str:
    """Register a Content template on Twilio. Returns the new HX… SID.

    Raises HTTPException(502) on Twilio errors so the caller (REST endpoint)
    can roll back the local INSERT and surface a clean message.
    """
    # Wamply's pipeline has the LLM generate the FULL personalized message
    # per contact (e.g. "Ciao Mario, scopri i saldi!") and the dispatcher
    # passes it as content_variables = {"1": personalized_text}. So the
    # Twilio template body has to be just `{{1}}` — a single placeholder
    # that the dispatcher fills with the entire LLM-generated text. The
    # original Wamply body stays in our DB as context for the LLM.
    #
    # The original body is still validated here to catch empty templates.
    if not _components_to_body_text(components):
        raise HTTPException(
            status_code=400,
            detail="Il template non ha un body utilizzabile per Twilio.",
        )

    sid, token = await resolve_master_credentials(db)

    media_url = _extract_media_url(components)

    payload: dict = {
        "friendly_name": friendly_name,
        "language": language or "it",
        "variables": {"1": "sample"},
    }
    if media_url:
        # Header is an image/video/doc → twilio/media. Body still uses {{1}}
        # which the dispatcher fills with the LLM-personalized caption text.
        payload["types"] = {
            "twilio/media": {"body": "{{1}}", "media": [media_url]},
        }
    else:
        payload["types"] = {"twilio/text": {"body": "{{1}}"}}

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        response = await client.post(
            f"{CONTENT_API_BASE}/Content",
            headers={
                "Authorization": _auth_header(sid, token),
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code >= 400:
        logger.warning(
            "twilio_content_create_failed",
            status=response.status_code,
            body=response.text[:500],
            friendly_name=friendly_name,
        )
        raise HTTPException(
            status_code=502,
            detail=f"Twilio Content API: {response.status_code} {response.text[:200]}",
        )

    data = response.json()
    content_sid = data.get("sid")
    if not content_sid:
        raise HTTPException(status_code=502, detail="Twilio non ha restituito un Content SID.")
    logger.info("twilio_content_created", sid=content_sid, friendly_name=friendly_name)
    return content_sid


async def delete_content(db: asyncpg.Pool, content_sid: str) -> bool:
    """Delete a Content template on Twilio. Returns True on success.

    Twilio refuses deletion if the template is approved/in use. We swallow
    the 4xx in that case (caller should fall back to soft-archive locally)
    and log it.
    """
    sid, token = await resolve_master_credentials(db)
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        response = await client.delete(
            f"{CONTENT_API_BASE}/Content/{content_sid}",
            headers={"Authorization": _auth_header(sid, token)},
        )
    if response.status_code in (200, 204):
        logger.info("twilio_content_deleted", sid=content_sid)
        return True
    logger.warning(
        "twilio_content_delete_failed",
        sid=content_sid,
        status=response.status_code,
        body=response.text[:300],
    )
    return False


async def submit_for_whatsapp_approval(
    db: asyncpg.Pool,
    *,
    content_sid: str,
    name: str,
    category: str,
) -> dict:
    """Submit a Content template to Meta for WhatsApp approval.

    `name` must be lowercase + underscores per Meta rules (we sanitize here).
    `category` must be one of: AUTHENTICATION, MARKETING, UTILITY.
    Returns Twilio's response (status: pending/approved/rejected).
    """
    name_sanitized = "".join(c if c.isalnum() else "_" for c in name.lower()).strip("_")[:512]
    category_upper = (category or "marketing").upper()
    if category_upper not in {"AUTHENTICATION", "MARKETING", "UTILITY"}:
        category_upper = "MARKETING"

    sid, token = await resolve_master_credentials(db)
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        response = await client.post(
            f"{CONTENT_API_BASE}/Content/{content_sid}/ApprovalRequests/whatsapp",
            headers={
                "Authorization": _auth_header(sid, token),
                "Content-Type": "application/json",
            },
            json={"name": name_sanitized, "category": category_upper},
        )
    if response.status_code >= 400:
        logger.warning(
            "twilio_content_approval_failed",
            sid=content_sid,
            status=response.status_code,
            body=response.text[:500],
        )
        raise HTTPException(
            status_code=502,
            detail=f"Twilio approval: {response.status_code} {response.text[:200]}",
        )
    return response.json()


async def get_approval_status(db: asyncpg.Pool, content_sid: str) -> dict:
    """Fetch the latest approval status from Twilio for a Content template."""
    sid, token = await resolve_master_credentials(db)
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        response = await client.get(
            f"{CONTENT_API_BASE}/Content/{content_sid}/ApprovalRequests",
            headers={"Authorization": _auth_header(sid, token)},
        )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Twilio approval status: {response.status_code} {response.text[:200]}",
        )
    return response.json()
