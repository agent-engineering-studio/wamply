from src.memory.supabase_memory import SupabaseMemory


async def fetch_contacts(
    db: SupabaseMemory,
    user_id: str,
    group_id: str | None = None,
    tags: list[str] | None = None,
) -> list[dict]:
    """Fetch opt-in contacts for a campaign, filtered by group or tags."""
    return await db.get_contacts_for_campaign(user_id, group_id=group_id, tags=tags)
