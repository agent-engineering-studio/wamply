import anthropic

from src.config import settings
from src.utils.telemetry import log


async def personalize_message(
    contact: dict,
    template: dict,
    campaign_context: str,
    api_key: str,
    model: str | None = None,
) -> str:
    """Generate a personalized message for a contact using Claude.

    The API key is resolved once per workflow (BYOK or system_key) and passed
    in — we never read it from env. A fresh `AsyncAnthropic` is cheap enough
    for per-call creation given the composer semaphore already bounds concurrency.
    """
    if settings.mock_llm:
        name = contact.get("name") or "Cliente"
        return f"Ciao {name}! Questo è un messaggio personalizzato per te."

    llm_model = model or settings.claude_haiku_model

    prompt = f"""Sei un copywriter esperto di WhatsApp marketing.
Genera un messaggio personalizzato basandoti su:

CONTATTO:
- Nome: {contact.get('name', 'N/A')}
- Lingua: {contact.get('language', 'it')}
- Tag: {', '.join(contact.get('tags', []))}
- Variabili: {contact.get('variables', {})}

TEMPLATE BASE: {template.get('name', '')}
Componenti: {template.get('components', [])}

CONTESTO CAMPAGNA: {campaign_context}

REGOLE:
- Massimo 500 caratteri
- Tono professionale ma personale
- Usa il nome del contatto se disponibile
- Scrivi nella lingua del contatto
- NON usare markdown, solo testo piano
- Il messaggio deve essere pronto per WhatsApp

Rispondi SOLO con il testo del messaggio, nient'altro."""

    client = anthropic.AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=llm_model,
        max_tokens=settings.claude_haiku_model and 300 or 500,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    await log.ainfo(
        "message_personalized",
        contact_id=contact.get("id"),
        model=llm_model,
        chars=len(text),
    )
    return text
