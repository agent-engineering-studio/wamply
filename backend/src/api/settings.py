from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.auth.permissions import require_admin
from src.dependencies import get_db
from src.services.encryption import encrypt

router = APIRouter(prefix="/settings")


# ── AI Config (per user) ─────────────────────────────────

_ALLOWED_TONES = {"professionale", "amichevole", "informale", "formale"}
_MAX_INSTRUCTIONS_LEN = 1000


@router.get("/ai")
async def get_ai(request: Request, user: CurrentUser = Depends(get_current_user)):
    """Return the user's AI preferences.

    Model / temperature / max_tokens are NOT surfaced — the backend uses
    silent per-operation routing (see ai_models.py), so these are internal.
    Only the things the user actually controls are returned.
    """
    db = get_db(request)
    row = await db.fetchrow("SELECT * FROM ai_config WHERE user_id = $1", user.id)
    has_byok = row is not None and row["encrypted_api_key"] is not None
    return {
        "config": {
            "has_api_key": has_byok,
            "agent_tone": (row["agent_tone"] if row else None) or "professionale",
            "agent_instructions": (row["agent_instructions"] if row else None) or "",
        },
    }


@router.post("/ai")
async def update_ai(request: Request, user: CurrentUser = Depends(get_current_user)):
    """Upsert user AI prefs: BYOK key (optional), tone, custom instructions.

    Empty string `api_key` clears the stored BYOK key. Missing field leaves
    the existing key untouched (COALESCE on the upsert).
    """
    db = get_db(request)
    body = await request.json()

    raw_key = body.get("api_key")
    clear_key = raw_key == ""
    encrypted = encrypt(raw_key).encode() if raw_key else None

    tone = body.get("agent_tone") or None
    if tone is not None and tone not in _ALLOWED_TONES:
        raise HTTPException(status_code=400, detail=f"Tono non valido: {tone}.")

    instructions = body.get("agent_instructions")
    if instructions is not None:
        if not isinstance(instructions, str):
            raise HTTPException(status_code=400, detail="agent_instructions deve essere stringa.")
        instructions = instructions.strip() or None
        if instructions and len(instructions) > _MAX_INSTRUCTIONS_LEN:
            raise HTTPException(
                status_code=400,
                detail=f"Istruzioni troppo lunghe (max {_MAX_INSTRUCTIONS_LEN} caratteri).",
            )

    if clear_key:
        await db.execute(
            """INSERT INTO ai_config (user_id, mode, encrypted_api_key, agent_tone, agent_instructions)
               VALUES ($1, 'shared', NULL, $2, $3)
               ON CONFLICT (user_id) DO UPDATE SET
                 mode = 'shared',
                 encrypted_api_key = NULL,
                 agent_tone = EXCLUDED.agent_tone,
                 agent_instructions = EXCLUDED.agent_instructions,
                 updated_at = now()""",
            user.id, tone, instructions,
        )
    else:
        mode = "byok" if encrypted else "shared"
        await db.execute(
            """INSERT INTO ai_config (user_id, mode, encrypted_api_key, agent_tone, agent_instructions)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (user_id) DO UPDATE SET
                 mode = EXCLUDED.mode,
                 encrypted_api_key = COALESCE(EXCLUDED.encrypted_api_key, ai_config.encrypted_api_key),
                 agent_tone = EXCLUDED.agent_tone,
                 agent_instructions = EXCLUDED.agent_instructions,
                 updated_at = now()""",
            user.id, mode, encrypted, tone, instructions,
        )
    return {"success": True}


# ── Agent Status (for sidebar icon) ──────────────────────

@router.get("/agent-status")
async def get_agent_status(request: Request, user: CurrentUser = Depends(get_current_user)):
    """Returns whether the AI agent is available for this user and why,
    plus the current AI credits usage for system-key users."""
    db = get_db(request)

    # Check if user has BYOK key
    ai_row = await db.fetchrow("SELECT encrypted_api_key FROM ai_config WHERE user_id = $1", user.id)
    has_byok = ai_row is not None and ai_row["encrypted_api_key"] is not None

    # Check if plan includes agent_ai feature (accept 'trialing' too)
    plan_row = await db.fetchrow(
        """SELECT p.features FROM subscriptions s
           JOIN plans p ON p.id = s.plan_id
           WHERE s.user_id = $1 AND s.status IN ('active', 'trialing')""",
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

    # Credits status (empty for inactive users, non-counted for BYOK)
    from src.services.ai_credits import get_credits_status
    credits = await get_credits_status(db, str(user.id))

    return {
        "active": active,
        "reason": "byok" if has_byok else ("plan" if (plan_has_agent and system_key_set) else "inactive"),
        "has_byok": has_byok,
        "plan_has_agent": plan_has_agent,
        "system_key_set": system_key_set,
        "ai_credits_limit": credits["ai_credits_limit"],
        "ai_credits_used": credits["ai_credits_used"],
        "ai_credits_remaining": credits["ai_credits_remaining"],
        "topup_credits": credits.get("topup_credits", 0),
        "plan_slug": credits.get("plan_slug"),
        "source": credits["source"],
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
                  s.cancel_at_period_end,
                  s.stripe_subscription_id,
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
            "cancel_at_period_end": bool(row["cancel_at_period_end"]),
            "stripe_subscription_id": row["stripe_subscription_id"],
            "trial_days_remaining": days_remaining,
        }
    }
