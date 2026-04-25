"""Admin Twilio management endpoints.

Tutti gli endpoint sono dietro require_permission("admin.twilio.manage").
Ogni mutazione scrive una riga audit_log con action prefissata 'twilio_'."""
import os
from typing import Any

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.jwt import CurrentUser
from src.auth.permissions import require_permission
from src.dependencies import get_db
from src.services import twilio_admin
from src.services.twilio_provisioning import TWILIO_API_BASE, HTTP_TIMEOUT, _auth_header

logger = structlog.get_logger()

router = APIRouter(prefix="/admin/twilio")


async def _connection_ok(sid: str, token: str) -> bool:
    """Ping Twilio GET /Accounts/{sid}.json to verify creds."""
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            r = await client.get(
                f"{TWILIO_API_BASE}/Accounts/{sid}.json",
                headers={"Authorization": _auth_header(sid, token)},
            )
        return r.status_code == 200
    except Exception as exc:
        logger.warning("twilio_ping_failed", error=str(exc))
        return False


@router.get("/overview")
async def admin_twilio_overview(
    request: Request,
    user: CurrentUser = Depends(require_permission("admin.twilio.manage")),
):
    db = get_db(request)
    sid = await twilio_admin._get_config(db, twilio_admin.KEY_MASTER_SID) or os.getenv("TWILIO_ACCOUNT_SID") or ""
    enc = await twilio_admin._get_config(db, twilio_admin.KEY_MASTER_TOKEN)
    try:
        ping_sid, ping_token = await twilio_admin.resolve_master_credentials(db)
        connection_ok = await _connection_ok(ping_sid, ping_token)
        token_masked = twilio_admin.mask_token(ping_token)
    except HTTPException:
        connection_ok = False
        token_masked = ""
    mss = await twilio_admin._get_config(db, twilio_admin.KEY_MASTER_MSS) or os.getenv("TWILIO_MESSAGING_SERVICE_SID") or ""
    policy = await twilio_admin.read_policy(db)
    subaccounts = await twilio_admin.aggregate_subaccount_stats(db)
    return {
        "master": {
            "account_sid": sid,
            "auth_token_masked": token_masked,
            "auth_token_source": "db" if enc else ("env" if os.getenv("TWILIO_AUTH_TOKEN") else "none"),
            "messaging_service_sid": mss,
        },
        "policy": policy,
        "subaccounts": subaccounts,
        "connection_ok": connection_ok,
    }


@router.patch("/policy")
async def admin_twilio_patch_policy(
    request: Request,
    user: CurrentUser = Depends(require_permission("admin.twilio.manage")),
):
    db = get_db(request)
    body: dict[str, Any] = await request.json()
    if not isinstance(body, dict) or not body:
        raise HTTPException(status_code=400, detail="Body JSON non valido.")
    updated = await twilio_admin.update_policy(db, body)
    await twilio_admin.audit(
        db, actor_id=str(user.id), action="twilio_policy_updated",
        target_id=None, metadata={"patch": body},
    )
    return {"policy": updated}


@router.post("/rotate-master")
async def admin_twilio_rotate_master(
    request: Request,
    user: CurrentUser = Depends(require_permission("admin.twilio.manage")),
):
    db = get_db(request)
    body = await request.json()
    new_token = (body or {}).get("auth_token", "").strip()
    new_sid = (body or {}).get("account_sid")
    if new_sid is not None:
        new_sid = str(new_sid).strip() or None
    await twilio_admin.rotate_master_token(db, new_token, new_sid)
    await twilio_admin.audit(
        db, actor_id=str(user.id), action="twilio_master_rotated",
        target_id=None,
        metadata={"sid_changed": bool(new_sid), "token_masked": twilio_admin.mask_token(new_token)},
    )
    return {"ok": True, "auth_token_masked": twilio_admin.mask_token(new_token)}


@router.post("/subaccount/{subaccount_sid}/suspend")
async def admin_twilio_suspend_subaccount(
    subaccount_sid: str,
    request: Request,
    user: CurrentUser = Depends(require_permission("admin.twilio.manage")),
):
    db = get_db(request)
    if not subaccount_sid.startswith("AC") or len(subaccount_sid) != 34:
        raise HTTPException(status_code=400, detail="SID subaccount non valido.")
    result = await twilio_admin.suspend_subaccount(db, subaccount_sid)
    await twilio_admin.audit(
        db, actor_id=str(user.id), action="twilio_subaccount_suspended",
        target_id=None, metadata={"subaccount_sid": subaccount_sid},
    )
    return {"ok": True, "status": result.get("status")}
