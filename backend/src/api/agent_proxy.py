"""Proxy per la chat agent.

Il browser non deve conoscere l'agent_secret; l'utente autentica come
sempre via JWT Supabase, il backend (che ha il secret) inoltra la
richiesta all'agent iniettando `user_id` dal JWT e l'header di servizio.
"""

import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.jwt import CurrentUser, get_current_user
from src.config import settings

router = APIRouter(prefix="/agent")


def _agent_base_url() -> str:
    # In docker-compose l'agent è raggiungibile come http://agent:8000.
    # Override via env per test locali fuori docker.
    return os.getenv("AGENT_INTERNAL_URL", "http://agent:8000")


@router.post("/chat")
async def proxy_chat(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
):
    """Forward POST /agent/chat to the agent service.

    Body: {prompt: str}. We augment with user_id from the verified JWT
    and add the X-Agent-Secret header that the agent requires.
    """
    body = await request.json()
    prompt = (body or {}).get("prompt") or ""
    if not isinstance(prompt, str) or not prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt obbligatorio.")
    if len(prompt) > 4000:
        raise HTTPException(status_code=400, detail="Prompt troppo lungo (max 4000 caratteri).")

    url = f"{_agent_base_url().rstrip('/')}/chat"
    payload = {"prompt": prompt, "user_id": str(user.id)}
    headers = {
        "X-Agent-Secret": settings.agent_secret,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Agent non raggiungibile: {exc}",
        ) from exc

    # Propaga lo status e il corpo dell'agent
    try:
        data = resp.json()
    except ValueError:
        data = {"response": resp.text}

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=data)
    return data
