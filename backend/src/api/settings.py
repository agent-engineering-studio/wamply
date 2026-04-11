from fastapi import APIRouter, Depends, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.dependencies import get_db
from src.services.encryption import encrypt, decrypt

router = APIRouter(prefix="/settings")


@router.get("/whatsapp")
async def get_whatsapp(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    row = await db.fetchrow("SELECT * FROM whatsapp_config WHERE user_id = $1", user.id)
    if not row:
        return {"config": None}
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
    d.pop("encrypted_token", None)
    return {"config": d}


@router.post("/whatsapp")
async def update_whatsapp(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    body = await request.json()
    token = body.get("token")
    encrypted = encrypt(token) if token else None
    await db.execute(
        """INSERT INTO whatsapp_config (user_id, phone_number_id, waba_id, encrypted_token, business_name)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id) DO UPDATE SET
             phone_number_id = EXCLUDED.phone_number_id, waba_id = EXCLUDED.waba_id,
             encrypted_token = COALESCE(EXCLUDED.encrypted_token, whatsapp_config.encrypted_token),
             business_name = EXCLUDED.business_name, updated_at = now()""",
        user.id, body.get("phone_number_id"), body.get("waba_id"),
        encrypted.encode() if encrypted else None, body.get("business_name"),
    )
    return {"success": True}


@router.get("/ai")
async def get_ai(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    row = await db.fetchrow("SELECT * FROM ai_config WHERE user_id = $1", user.id)
    if not row:
        return {"config": {"mode": "shared", "model": "claude-haiku-4-5-20251001", "temperature": 0.7, "max_tokens": 500}}
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
    d.pop("encrypted_api_key", None)
    return {"config": d}


@router.post("/ai")
async def update_ai(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    body = await request.json()
    api_key = body.get("api_key")
    encrypted = encrypt(api_key) if api_key else None
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
