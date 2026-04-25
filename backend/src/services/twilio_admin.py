"""Admin-side Twilio management: read/write master config, aggregate
subaccount stats, rotate credentials, suspend subaccounts.

Le master credentials restano in ENV fino alla prima rotate. Dopo la rotate,
system_config diventa la source of truth (encrypted). `resolve_master_credentials`
prova DB-first, poi ENV-fallback.
"""
from __future__ import annotations

import json
import os
from typing import Any

import asyncpg
import httpx
import structlog
from fastapi import HTTPException

from src.services.encryption import encrypt, decrypt
from src.services.twilio_provisioning import _auth_header, TWILIO_API_BASE, HTTP_TIMEOUT

logger = structlog.get_logger()

# Keys in system_config
KEY_MASTER_SID = "twilio_master_account_sid"
KEY_MASTER_TOKEN = "twilio_master_auth_token_encrypted"
KEY_MASTER_MSS = "twilio_master_messaging_service_sid"
KEY_POLICY = "twilio_provisioning_policy"


def mask_token(token: str) -> str:
    """Returns a safe representation of the token (first 4 + last 4). Never exposes the full token."""
    if not token:
        return ""
    if len(token) <= 8:
        return "•" * len(token)
    return f"{token[:4]}{'•' * 8}{token[-4:]}"


async def _get_config(db: asyncpg.Pool, key: str) -> str | None:
    row = await db.fetchrow("SELECT value FROM system_config WHERE key = $1", key)
    return row["value"] if row else None


async def _set_config(db: asyncpg.Pool, key: str, value: str) -> None:
    await db.execute(
        """INSERT INTO system_config (key, value, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()""",
        key, value,
    )


async def resolve_master_credentials(db: asyncpg.Pool) -> tuple[str, str]:
    """DB-first, ENV-fallback. Return (sid, auth_token) in chiaro per chiamate
    server-to-Twilio. Raise 503 se nessuna fonte disponibile."""
    sid = await _get_config(db, KEY_MASTER_SID) or os.getenv("TWILIO_ACCOUNT_SID") or ""
    enc = await _get_config(db, KEY_MASTER_TOKEN)
    if enc:
        token = decrypt(enc)
    else:
        token = os.getenv("TWILIO_AUTH_TOKEN") or ""
    if not sid or not token:
        raise HTTPException(
            status_code=503,
            detail="Twilio master credentials non configurate (DB vuoto e ENV assente).",
        )
    return sid, token


async def read_policy(db: asyncpg.Pool) -> dict:
    raw = await _get_config(db, KEY_POLICY)
    if not raw:
        return {"auto_create_subaccount_on_signup": True, "default_region": "IT", "number_pool": []}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("twilio_policy_invalid_json", raw=raw[:120])
        return {"auto_create_subaccount_on_signup": True, "default_region": "IT", "number_pool": []}


async def update_policy(db: asyncpg.Pool, patch: dict[str, Any]) -> dict:
    """Merge-patch sulla policy. Campi accettati:
       auto_create_subaccount_on_signup (bool), default_region (str), number_pool (list[str])."""
    current = await read_policy(db)
    allowed = {"auto_create_subaccount_on_signup", "default_region", "number_pool"}
    for k, v in patch.items():
        if k not in allowed:
            raise HTTPException(status_code=400, detail=f"Campo policy non ammesso: {k}")
        current[k] = v
    await _set_config(db, KEY_POLICY, json.dumps(current))
    return current


async def rotate_master_token(db: asyncpg.Pool, new_token: str, new_sid: str | None = None) -> None:
    """Salva il nuovo token criptato + eventualmente il nuovo SID. NO echo in output."""
    if not new_token or len(new_token) < 20:
        raise HTTPException(status_code=400, detail="Auth token non valido (minimo 20 caratteri).")
    await _set_config(db, KEY_MASTER_TOKEN, encrypt(new_token))
    if new_sid:
        await _set_config(db, KEY_MASTER_SID, new_sid)


async def aggregate_subaccount_stats(db: asyncpg.Pool) -> list[dict]:
    """Lista subaccount + msg mese in corso + costo stimato (usa overage_rates dal piano)."""
    rows = await db.fetch(
        """SELECT
               ma.twilio_subaccount_sid AS sid,
               b.user_id,
               u.email,
               u.full_name,
               COALESCE(uc.messages_used, 0) AS messages_used,
               p.overage_rates,
               ma.status::text AS status
           FROM meta_applications ma
           JOIN businesses b ON b.id = ma.business_id
           JOIN users u ON u.id = b.user_id
           LEFT JOIN usage_counters uc
             ON uc.user_id = b.user_id
             AND uc.period_start = date_trunc('month', now())::date
           LEFT JOIN subscriptions s
             ON s.user_id = b.user_id AND s.status = 'active'
           LEFT JOIN plans p ON p.id = s.plan_id
           WHERE ma.twilio_subaccount_sid IS NOT NULL
           ORDER BY messages_used DESC"""
    )
    result = []
    for r in rows:
        rates = dict(r["overage_rates"] or {})
        # Mix 40/40/20 marketing/utility/free_form per costo stimato
        avg_rate = (
            0.40 * float(rates.get("marketing", 0.09))
            + 0.40 * float(rates.get("utility", 0.05))
            + 0.20 * float(rates.get("free_form", 0.01))
        )
        est_cost = round(int(r["messages_used"]) * avg_rate, 2)
        result.append({
            "subaccount_sid": r["sid"],
            "user_id": str(r["user_id"]),
            "email": r["email"],
            "full_name": r["full_name"],
            "messages_month": int(r["messages_used"]),
            "est_cost_eur": est_cost,
            "status": r["status"],
        })
    return result


async def suspend_subaccount(db: asyncpg.Pool, subaccount_sid: str) -> dict:
    """Kill-switch: POST /Accounts/{sid}.json Status=suspended con master creds."""
    master_sid, master_token = await resolve_master_credentials(db)
    url = f"{TWILIO_API_BASE}/Accounts/{subaccount_sid}.json"
    headers = {"Authorization": _auth_header(master_sid, master_token)}
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        response = await client.post(url, headers=headers, data={"Status": "suspended"})
    if response.status_code >= 400:
        logger.warning("twilio_suspend_failed", sid=subaccount_sid, status=response.status_code, body=response.text[:200])
        raise HTTPException(
            status_code=502,
            detail=f"Errore Twilio durante sospensione ({response.status_code}).",
        )
    return response.json()


async def audit(db: asyncpg.Pool, actor_id: str, action: str, target_id: str | None, metadata: dict | None = None) -> None:
    """Scrive una riga in audit_log. action DEVE iniziare con 'twilio_'."""
    assert action.startswith("twilio_"), "action deve iniziare con 'twilio_' per coerenza filtro UI"
    await db.execute(
        """INSERT INTO audit_log (actor_id, action, target_id, metadata)
           VALUES ($1, $2, $3, $4)""",
        actor_id, action, target_id, json.dumps(metadata or {}),
    )
