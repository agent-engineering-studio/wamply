from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.api.dependencies import verify_agent_secret
from src.memory.redis_memory import RedisMemory
from src.memory.supabase_memory import SupabaseMemory
from src.utils.telemetry import log

router = APIRouter(prefix="/campaigns", dependencies=[Depends(verify_agent_secret)])


class LaunchRequest(BaseModel):
    campaign_id: str


class PauseRequest(BaseModel):
    campaign_id: str


# These will be set by main.py on startup
_db: SupabaseMemory | None = None
_redis: RedisMemory | None = None


def set_resources(db: SupabaseMemory, redis: RedisMemory) -> None:
    global _db, _redis
    _db = db
    _redis = redis


@router.post("/launch")
async def launch_campaign(req: LaunchRequest) -> dict:
    if not _db or not _redis:
        raise HTTPException(status_code=503, detail="Service not ready")

    # Verify campaign exists and is in draft/scheduled status
    row = await _db.pool.fetchrow(
        "SELECT id, status FROM campaigns WHERE id = $1",
        req.campaign_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Campagna non trovata")
    if row["status"] not in ("draft", "scheduled"):
        raise HTTPException(
            status_code=400,
            detail=f"La campagna è in stato '{row['status']}', non può essere avviata",
        )

    # Enqueue
    await _redis.enqueue_campaign(req.campaign_id)
    await log.ainfo("campaign_launched", campaign_id=req.campaign_id)

    return {"success": True, "campaign_id": req.campaign_id, "queued": True}


@router.post("/pause")
async def pause_campaign(req: PauseRequest) -> dict:
    if not _redis:
        raise HTTPException(status_code=503, detail="Service not ready")

    await _redis.pause(req.campaign_id)
    return {"success": True, "campaign_id": req.campaign_id, "paused": True}


@router.post("/resume")
async def resume_campaign(req: PauseRequest) -> dict:
    if not _redis:
        raise HTTPException(status_code=503, detail="Service not ready")

    await _redis.resume(req.campaign_id)
    # Re-enqueue to restart the workflow
    await _redis.enqueue_campaign(req.campaign_id)
    return {"success": True, "campaign_id": req.campaign_id, "resumed": True}


@router.get("/{campaign_id}/status")
async def campaign_status(campaign_id: str) -> dict:
    if not _redis or not _db:
        raise HTTPException(status_code=503, detail="Service not ready")

    state = await _redis.get_state(campaign_id)
    progress = await _redis.get_progress(campaign_id)

    return {
        "campaign_id": campaign_id,
        "state": state,
        "progress": progress,
    }
