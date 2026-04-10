from src.memory.supabase_memory import SupabaseMemory


async def fetch_campaign_history(
    db: SupabaseMemory, user_id: str, limit: int = 10
) -> list[dict]:
    """Get recent campaign results for learning."""
    return await db.get_campaign_history(user_id, limit=limit)
