"""Stage 1 — CampaignPlanner: Analyzes campaign, segments contacts, selects template."""

import anthropic

from src.config import settings
from src.memory.supabase_memory import SupabaseMemory
from src.tools.contacts_tool import fetch_contacts
from src.tools.templates_tool import fetch_template
from src.tools.history_tool import fetch_campaign_history
from src.utils.telemetry import log


async def plan_campaign(
    db: SupabaseMemory,
    campaign: dict,
    user_id: str,
) -> dict:
    """
    Stage 1: Analyze campaign request, fetch contacts and template.

    Returns a plan dict with:
    - contacts: list of contacts to message
    - template: the selected template
    - context: campaign context string for the composer
    """
    await log.ainfo("planner_start", campaign_id=campaign["id"])

    # Fetch contacts
    contacts = await fetch_contacts(
        db, user_id,
        group_id=campaign.get("group_id"),
        tags=campaign.get("segment_query", {}).get("tags"),
    )

    if not contacts:
        raise ValueError("Nessun contatto trovato per questa campagna")

    # Fetch template
    template = None
    if campaign.get("template_id"):
        template = await fetch_template(db, campaign["template_id"])

    if not template:
        raise ValueError("Template non trovato")

    # Fetch history for learning
    history = await fetch_campaign_history(db, user_id, limit=5)

    # Build campaign context (used by Claude if not mock)
    if not settings.mock_llm:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        history_summary = "\n".join(
            f"- {h['name']}: {h['stats'].get('sent', 0)} inviati, "
            f"{h['stats'].get('read', 0)} letti ({h['status']})"
            for h in history
        ) or "Nessuna campagna precedente."

        response = await client.messages.create(
            model=settings.claude_model,
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": f"""Sei un esperto di WhatsApp marketing.
Analizza questa campagna e crea un breve contesto per personalizzare i messaggi.

CAMPAGNA: {campaign['name']}
TEMPLATE: {template['name']} ({template['category']})
DESTINATARI: {len(contacts)} contatti
STORICO CAMPAGNE:
{history_summary}

Rispondi con un paragrafo breve (max 200 parole) che descriva:
1. L'obiettivo della campagna
2. Il tono consigliato
3. Elementi di personalizzazione suggeriti

Rispondi SOLO con il contesto, nient'altro.""",
            }],
        )
        context = response.content[0].text.strip()
    else:
        context = f"Campagna '{campaign['name']}' con template '{template['name']}' per {len(contacts)} contatti."

    await log.ainfo(
        "planner_done",
        campaign_id=campaign["id"],
        contacts_count=len(contacts),
        template=template["name"],
    )

    return {
        "contacts": contacts,
        "template": template,
        "context": context,
    }
