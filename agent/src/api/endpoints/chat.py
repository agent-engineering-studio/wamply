from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.api.dependencies import verify_agent_secret
from src.memory.redis_memory import RedisMemory
from src.memory.supabase_memory import SupabaseMemory
from src.agents.chat_handler import handle_chat
from src.utils.telemetry import log

router = APIRouter(prefix="/chat", dependencies=[Depends(verify_agent_secret)])

_db: SupabaseMemory | None = None
_redis: RedisMemory | None = None


def set_resources(db: SupabaseMemory, redis: RedisMemory) -> None:
    global _db, _redis
    _db = db
    _redis = redis


class ChatRequest(BaseModel):
    prompt: str
    user_id: str


@router.post("")
async def chat(req: ChatRequest) -> dict:
    if not _db or not _redis:
        raise HTTPException(status_code=503, detail="Service not ready")

    await log.ainfo("chat_request", user_id=req.user_id, prompt_len=len(req.prompt))

    result = await handle_chat(req.prompt, req.user_id, _db, _redis)

    return result
