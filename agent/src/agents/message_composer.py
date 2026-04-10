"""Stage 2 — MessageComposer: Generates personalized messages for each contact."""

import asyncio

from src.config import settings
from src.memory.supabase_memory import SupabaseMemory
from src.tools.personalize_tool import personalize_message
from src.utils.telemetry import log


async def compose_messages(
    db: SupabaseMemory,
    campaign_id: str,
    contacts: list[dict],
    template: dict,
    context: str,
    model: str | None = None,
) -> list[dict]:
    """
    Stage 2: Generate personalized messages for all contacts.

    Uses a semaphore to limit concurrent LLM calls.
    Returns list of {contact, message_id, personalized_text}.
    """
    await log.ainfo(
        "composer_start",
        campaign_id=campaign_id,
        contacts=len(contacts),
    )

    # Create message records in DB
    message_ids = await db.create_message_records(campaign_id, contacts)

    semaphore = asyncio.Semaphore(settings.composer_concurrency)
    results: list[dict] = []

    async def compose_one(contact: dict, message_id: str) -> dict:
        async with semaphore:
            try:
                text = await personalize_message(
                    contact=contact,
                    template=template,
                    campaign_context=context,
                    model=model,
                )
                return {
                    "contact": contact,
                    "message_id": message_id,
                    "personalized_text": text,
                }
            except Exception as e:
                await log.awarn(
                    "compose_failed",
                    contact_id=contact["id"],
                    error=str(e),
                )
                return {
                    "contact": contact,
                    "message_id": message_id,
                    "personalized_text": None,
                    "error": str(e),
                }

    tasks = [
        compose_one(contact, mid)
        for contact, mid in zip(contacts, message_ids)
    ]
    results = await asyncio.gather(*tasks)

    composed = [r for r in results if r.get("personalized_text")]
    failed = [r for r in results if not r.get("personalized_text")]

    await log.ainfo(
        "composer_done",
        campaign_id=campaign_id,
        composed=len(composed),
        failed=len(failed),
    )

    return results
