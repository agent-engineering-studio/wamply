from src.memory.redis_memory import RedisMemory
from src.memory.supabase_memory import SupabaseMemory


async def update_message_sent(
    db: SupabaseMemory,
    redis: RedisMemory,
    campaign_id: str,
    message_id: str,
    provider_message_id: str,
) -> None:
    """Mark a message as sent and update campaign progress."""
    await db.update_message_status(
        message_id, "sent", provider_message_id=provider_message_id
    )
    await redis.update_progress(campaign_id, sent=1)


async def update_message_failed(
    db: SupabaseMemory,
    redis: RedisMemory,
    campaign_id: str,
    message_id: str,
    error: str,
) -> None:
    """Mark a message as failed and update campaign progress."""
    await db.update_message_status(message_id, "failed", error=error)
    await redis.update_progress(campaign_id, failed=1)


async def finalize_campaign(
    db: SupabaseMemory,
    redis: RedisMemory,
    campaign_id: str,
) -> dict:
    """Complete a campaign and return final stats."""
    progress = await redis.get_progress(campaign_id)
    stats = {
        "total": progress["total"],
        "sent": progress["sent"],
        "delivered": 0,
        "read": 0,
        "failed": progress["failed"],
    }

    status = "completed" if progress["failed"] < progress["total"] else "failed"
    await db.update_campaign_status(campaign_id, status, stats)
    return {"status": status, "stats": stats}
