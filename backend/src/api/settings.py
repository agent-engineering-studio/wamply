from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.auth.permissions import require_admin
from src.dependencies import get_db
from src.services.encryption import encrypt, decrypt

router = APIRouter(prefix="/settings")


# ── Twilio WhatsApp Config (per user) ────────────────────

@router.get("/twilio")
async def get_twilio(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    row = await db.fetchrow("SELECT * FROM whatsapp_config WHERE user_id = $1", user.id)
    if not row:
        return {"config": None}
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
    d["auth_token_set"] = d.get("twilio_auth_token_encrypted") is not None
    d.pop("twilio_auth_token_encrypted", None)
    return {"config": d}


@router.post("/twilio")
async def update_twilio(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    body = await request.json()
    auth_token = body.get("auth_token")
    encrypted = encrypt(auth_token) if auth_token else None
    await db.execute(
        """INSERT INTO whatsapp_config (user_id, twilio_account_sid,
            twilio_auth_token_encrypted, twilio_from, twilio_messaging_service_sid,
            business_name, default_language)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id) DO UPDATE SET
             twilio_account_sid = EXCLUDED.twilio_account_sid,
             twilio_auth_token_encrypted = COALESCE(
               EXCLUDED.twilio_auth_token_encrypted,
               whatsapp_config.twilio_auth_token_encrypted),
             twilio_from = EXCLUDED.twilio_from,
             twilio_messaging_service_sid = EXCLUDED.twilio_messaging_service_sid,
             business_name = EXCLUDED.business_name,
             default_language = COALESCE(EXCLUDED.default_language, whatsapp_config.default_language),
             updated_at = now()""",
        user.id,
        body.get("account_sid"),
        encrypted.encode() if encrypted else None,
        body.get("from"),
        body.get("messaging_service_sid"),
        body.get("business_name"),
        body.get("default_language"),
    )
    return {"success": True}


# ── AI Config (per user) ─────────────────────────────────

@router.get("/ai")
async def get_ai(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    row = await db.fetchrow("SELECT * FROM ai_config WHERE user_id = $1", user.id)
    has_byok = row["encrypted_api_key"] is not None if row else False

    config = {
        "mode": row["mode"] if row else "shared",
        "model": row["model"] if row else "claude-haiku-4-5-20251001",
        "temperature": float(row["temperature"]) if row else 0.7,
        "max_tokens": row["max_tokens"] if row else 500,
        "has_api_key": has_byok,
    }
    return {"config": config}


@router.post("/ai")
async def update_ai(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    body = await request.json()
    api_key = body.get("api_key")
    encrypted = encrypt(api_key) if api_key else None

    # If user sends api_key="" explicitly, clear it
    clear_key = body.get("api_key") == ""

    if clear_key:
        await db.execute(
            """INSERT INTO ai_config (user_id, mode, encrypted_api_key, model, temperature, max_tokens)
               VALUES ($1, $2, NULL, $3, $4, $5)
               ON CONFLICT (user_id) DO UPDATE SET
                 mode = EXCLUDED.mode, encrypted_api_key = NULL,
                 model = EXCLUDED.model, temperature = EXCLUDED.temperature,
                 max_tokens = EXCLUDED.max_tokens, updated_at = now()""",
            user.id, body.get("mode", "shared"),
            body.get("model", "claude-haiku-4-5-20251001"),
            body.get("temperature", 0.7), body.get("max_tokens", 500),
        )
    else:
        await db.execute(
            """INSERT INTO ai_config (user_id, mode, encrypted_api_key, model, temperature, max_tokens)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (user_id) DO UPDATE SET
                 mode = EXCLUDED.mode,
                 encrypted_api_key = COALESCE(EXCLUDED.encrypted_api_key, ai_config.encrypted_api_key),
                 model = EXCLUDED.model, temperature = EXCLUDED.temperature,
                 max_tokens = EXCLUDED.max_tokens, updated_at = now()""",
            user.id, body.get("mode", "shared"),
            encrypted.encode() if encrypted else None,
            body.get("model", "claude-haiku-4-5-20251001"),
            body.get("temperature", 0.7), body.get("max_tokens", 500),
        )
    return {"success": True}


# ── Agent Status (for sidebar icon) ──────────────────────

@router.get("/agent-status")
async def get_agent_status(request: Request, user: CurrentUser = Depends(get_current_user)):
    """Returns whether the AI agent is available for this user and why."""
    db = get_db(request)

    # Check if user has BYOK key
    ai_row = await db.fetchrow("SELECT encrypted_api_key FROM ai_config WHERE user_id = $1", user.id)
    has_byok = ai_row is not None and ai_row["encrypted_api_key"] is not None

    # Check if plan includes agent_ai feature
    plan_row = await db.fetchrow(
        """SELECT p.features FROM subscriptions s
           JOIN plans p ON p.id = s.plan_id
           WHERE s.user_id = $1 AND s.status = 'active'""",
        user.id,
    )
    plan_has_agent = False
    if plan_row and plan_row["features"]:
        features = plan_row["features"]
        if isinstance(features, str):
            import json
            features = json.loads(features)
        plan_has_agent = features.get("agent_ai", False)

    # Check if system API key is configured
    sys_row = await db.fetchrow("SELECT value FROM system_config WHERE key = 'default_anthropic_api_key'")
    system_key_set = sys_row is not None and sys_row["value"] != ""

    # Agent is active if: BYOK set OR (plan allows + system key exists)
    active = has_byok or (plan_has_agent and system_key_set)

    return {
        "active": active,
        "reason": "byok" if has_byok else ("plan" if (plan_has_agent and system_key_set) else "inactive"),
        "has_byok": has_byok,
        "plan_has_agent": plan_has_agent,
        "system_key_set": system_key_set,
    }


# ── System Config (admin only) ───────────────────────────

@router.get("/system")
async def get_system_config(request: Request, user: CurrentUser = Depends(require_admin)):
    db = get_db(request)
    rows = await db.fetch("SELECT key, updated_at FROM system_config")
    config = {}
    for r in rows:
        config[r["key"]] = {
            "is_set": True,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        }
    return {"config": config}


@router.post("/system")
async def update_system_config(request: Request, user: CurrentUser = Depends(require_admin)):
    db = get_db(request)
    body = await request.json()

    api_key = body.get("default_anthropic_api_key")
    if api_key is not None:
        encrypted = encrypt(api_key) if api_key else ""
        await db.execute(
            """INSERT INTO system_config (key, value, updated_at)
               VALUES ('default_anthropic_api_key', $1, now())
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()""",
            encrypted,
        )

    return {"success": True}


# ── Subscription info (trial banner, billing page) ─────

@router.get("/subscription")
async def get_subscription(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    row = await db.fetchrow(
        """SELECT s.status::text AS status,
                  s.current_period_start,
                  s.current_period_end,
                  p.name  AS plan_name,
                  p.slug  AS plan_slug
           FROM subscriptions s
           JOIN plans p ON p.id = s.plan_id
           WHERE s.user_id = $1""",
        user.id,
    )
    if not row:
        return {"subscription": None}

    now = datetime.now(timezone.utc)
    days_remaining = None
    if row["status"] == "trialing" and row["current_period_end"]:
        delta = row["current_period_end"] - now
        days_remaining = max(0, delta.days + (1 if delta.seconds > 0 else 0))

    return {
        "subscription": {
            "status": row["status"],
            "plan": {"name": row["plan_name"], "slug": row["plan_slug"]},
            "current_period_start": row["current_period_start"].isoformat() if row["current_period_start"] else None,
            "current_period_end": row["current_period_end"].isoformat() if row["current_period_end"] else None,
            "trial_days_remaining": days_remaining,
        }
    }
