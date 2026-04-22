"""Twilio subaccount provisioning for multi-tenant WhatsApp.

Creates and manages Twilio subaccounts (one per customer) under a master
account. Each customer gets isolated credentials + a dedicated phone number,
so sanctions on one customer don't propagate to others.

Uses httpx (already a backend dependency) with HTTP Basic Auth, avoiding
the heavyweight `twilio-python` SDK which would add ~15MB of deps.
"""

import base64
import os
from typing import Any

import httpx
import structlog
from fastapi import HTTPException

from src.services.encryption import encrypt, decrypt

logger = structlog.get_logger()

TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"

# HTTP timeout for any Twilio call. 30s leaves room for slow number searches
# while still failing cleanly if the API is unreachable.
HTTP_TIMEOUT = 30.0


def _master_credentials() -> tuple[str, str]:
    """Return (master_sid, master_auth_token) from env or raise 503."""
    sid = os.getenv("TWILIO_ACCOUNT_SID") or ""
    token = os.getenv("TWILIO_AUTH_TOKEN") or ""
    if not sid or not token:
        raise HTTPException(
            status_code=503,
            detail="Twilio master credentials non configurate (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).",
        )
    return sid, token


def _auth_header(sid: str, token: str) -> str:
    raw = f"{sid}:{token}".encode()
    return "Basic " + base64.b64encode(raw).decode()


async def _twilio_request(
    method: str,
    path: str,
    *,
    sid: str,
    token: str,
    form: dict[str, Any] | None = None,
) -> dict:
    """Make an authenticated HTTP request to Twilio REST API.

    Returns parsed JSON body on 2xx. Raises HTTPException on any failure
    with Twilio's error message bubbled up.
    """
    url = f"{TWILIO_API_BASE}{path}"
    headers = {"Authorization": _auth_header(sid, token)}

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        if method == "GET":
            response = await client.get(url, headers=headers)
        elif method == "POST":
            response = await client.post(url, headers=headers, data=form or {})
        elif method == "DELETE":
            response = await client.delete(url, headers=headers)
        else:
            raise ValueError(f"Metodo HTTP non supportato: {method}")

    if response.status_code >= 400:
        try:
            err = response.json()
            message = err.get("message") or response.text
        except Exception:
            message = response.text
        logger.warning(
            "twilio_api_error",
            method=method,
            path=path,
            status=response.status_code,
            message=message,
        )
        raise HTTPException(
            status_code=502,
            detail=f"Errore Twilio ({response.status_code}): {message}",
        )

    return response.json()


# ── Subaccount creation ──────────────────────────────────────

async def create_subaccount(friendly_name: str) -> dict:
    """Create a new Twilio subaccount under the master.

    Returns the raw Twilio response dict with at least `sid` and `auth_token`.
    Caller is responsible for encrypting + persisting the auth_token.
    """
    master_sid, master_token = _master_credentials()

    body = await _twilio_request(
        "POST",
        "/Accounts.json",
        sid=master_sid,
        token=master_token,
        form={"FriendlyName": friendly_name[:64]},  # Twilio limit
    )
    logger.info("twilio_subaccount_created", friendly_name=friendly_name, sid=body.get("sid"))
    return body


# ── Phone number search + purchase ──────────────────────────

async def list_available_italian_numbers(
    subaccount_sid: str,
    subaccount_token: str,
    limit: int = 10,
) -> list[dict]:
    """List available IT local phone numbers that support SMS (and therefore
    WhatsApp Business — WhatsApp requires an SMS-capable number).
    """
    body = await _twilio_request(
        "GET",
        f"/Accounts/{subaccount_sid}/AvailablePhoneNumbers/IT/Local.json?SmsEnabled=true&PageSize={limit}",
        sid=subaccount_sid,
        token=subaccount_token,
    )
    return body.get("available_phone_numbers", [])


async def purchase_phone_number(
    subaccount_sid: str,
    subaccount_token: str,
    phone_number: str,
    friendly_name: str | None = None,
) -> dict:
    """Purchase a specific phone number on the subaccount.

    Returns the Twilio IncomingPhoneNumber response with `sid` + `phone_number`.
    """
    form: dict[str, Any] = {"PhoneNumber": phone_number}
    if friendly_name:
        form["FriendlyName"] = friendly_name[:64]

    body = await _twilio_request(
        "POST",
        f"/Accounts/{subaccount_sid}/IncomingPhoneNumbers.json",
        sid=subaccount_sid,
        token=subaccount_token,
        form=form,
    )
    logger.info(
        "twilio_number_purchased",
        subaccount_sid=subaccount_sid,
        phone_number=phone_number,
        sid=body.get("sid"),
    )
    return body


async def purchase_first_available_italian_number(
    subaccount_sid: str,
    subaccount_token: str,
    friendly_name: str | None = None,
) -> dict:
    """Convenience: search for an IT number and buy the first one found.

    Used by the admin 'Acquista numero italiano' button.
    """
    available = await list_available_italian_numbers(subaccount_sid, subaccount_token, limit=5)
    if not available:
        raise HTTPException(
            status_code=502,
            detail="Nessun numero italiano disponibile al momento su Twilio. Riprova tra qualche minuto.",
        )
    first = available[0]
    return await purchase_phone_number(
        subaccount_sid,
        subaccount_token,
        first["phone_number"],
        friendly_name=friendly_name,
    )


# ── Credential helpers (encryption wrap) ────────────────────

def encrypt_auth_token(auth_token: str) -> bytes:
    """Encrypt a subaccount auth_token for DB storage.

    Returns bytes (compatible with bytea column).
    """
    return encrypt(auth_token).encode()


def decrypt_auth_token(stored: bytes | str) -> str:
    """Decrypt a stored subaccount auth_token.

    Accepts either bytes (from bytea) or str.
    """
    if isinstance(stored, bytes):
        stored = stored.decode()
    return decrypt(stored)
