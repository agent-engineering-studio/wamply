from src.memory.supabase_memory import SupabaseMemory


async def fetch_template(db: SupabaseMemory, template_id: str) -> dict | None:
    """Fetch an approved WhatsApp template by ID."""
    return await db.get_template(template_id)
