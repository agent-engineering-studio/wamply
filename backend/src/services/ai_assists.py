"""Cross-cutting AI helpers: contact tag suggestion, smart group
segmentation, dashboard KPI insight.

Each function returns `(result, tokens_in, tokens_out)` for the credits ledger.
Endpoint layers handle credit reservation + commit as usual.
"""

import json
import re

import anthropic
from pydantic import BaseModel, Field, ValidationError

from src.config import settings
from src.services import ai_models


def _build_client(api_key: str) -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=api_key)


def _token_counts(response) -> tuple[int, int]:
    usage = getattr(response, "usage", None)
    if not usage:
        return (0, 0)
    return (
        getattr(usage, "input_tokens", 0) or 0,
        getattr(usage, "output_tokens", 0) or 0,
    )


def _extract_json(text: str) -> str:
    match = re.search(r"\{[\s\S]*\}", text)
    return match.group(0) if match else text


# ── Smart group segmentation ──────────────────────────────────
# Given a free-text description ("clienti VIP con spesa > 500€ ultimo trimestre")
# plus the user's tag vocabulary and language split, Claude proposes a
# deterministic filter (tag AND/OR set + language) + a suggested name/desc.

class GroupSuggestion(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: str = Field(..., min_length=1, max_length=300)
    filter_tags_any: list[str] = Field(default_factory=list, max_length=5)
    filter_tags_all: list[str] = Field(default_factory=list, max_length=5)
    filter_languages: list[str] = Field(default_factory=list, max_length=5)
    estimated_audience: int = Field(..., ge=0)
    reasoning: str = Field(..., min_length=1, max_length=600)


GROUP_SUGGEST_SYSTEM_PROMPT = """Sei un esperto di segmentazione per WhatsApp
marketing. Ricevi:
- una descrizione in linguaggio naturale del gruppo desiderato
- il vocabolario di tag già presenti tra i contatti (con conteggi)
- la distribuzione di lingue
- il conteggio totale di contatti opt-in

PRODUCI un JSON con un filtro *deterministico e realizzabile* che si possa
applicare alla tabella contatti usando SOLO tag esistenti + lingua:
- name: breve titolo del gruppo (max 80 caratteri)
- description: spiegazione 1-2 frasi (max 300 caratteri)
- filter_tags_any: tag che se uno QUALSIASI matcha, include il contatto
- filter_tags_all: tag che DEVONO tutti matchare
- filter_languages: lingue da includere (lasciare vuoto = tutte)
- estimated_audience: stima numerica realistica basata sui conteggi forniti
- reasoning: spiega perché hai scelto questi tag (max 600 caratteri)

REGOLE:
- Usa ESCLUSIVAMENTE tag presenti nel vocabolario fornito.
- Se la richiesta non è realizzabile (es. chiede "clienti con spesa > 500€"
  ma non ci sono tag correlati), rispondi comunque con il miglior tentativo
  e spiegalo in reasoning.
- estimated_audience deve essere una stima onesta, non gonfiata.

Rispondi SOLO con JSON valido."""


def _mock_group_suggest(description: str, total: int) -> GroupSuggestion:
    return GroupSuggestion(
        name="Gruppo (mock)",
        description=f"Mock per: {description[:200]}",
        filter_tags_any=[],
        filter_tags_all=[],
        filter_languages=[],
        estimated_audience=total,
        reasoning="[mock] MOCK_LLM attivo. Configura una chiave Claude per suggerimenti reali.",
    )


async def suggest_group(
    description: str,
    context: dict,
    api_key: str,
) -> tuple[GroupSuggestion, int, int]:
    """Sonnet call that proposes a deterministic filter for a contact group.

    `context` should include: total_contacts, tags_vocabulary (list of
    {tag, count}), languages (list of {language, count}).
    """
    if settings.mock_llm or not api_key:
        return (
            _mock_group_suggest(description, int(context.get("total_contacts", 0))),
            0, 0,
        )

    client = _build_client(api_key)
    user_msg = (
        f"Descrizione del gruppo desiderato:\n{description}\n\n"
        f"Dati:\n{json.dumps(context, ensure_ascii=False, default=str)}"
    )
    response = client.messages.create(
        model=ai_models.model_id("group_suggest"),
        max_tokens=1000,
        temperature=0.3,
        system=GROUP_SUGGEST_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = "".join(b.text for b in response.content if hasattr(b, "text"))
    tin, tout = _token_counts(response)
    try:
        parsed = json.loads(_extract_json(raw))
        return (GroupSuggestion(**parsed), tin, tout)
    except (ValueError, ValidationError) as e:
        raise ValueError(f"GroupSuggest AI malformato: {e}") from e


# ── Contact tag suggestion ────────────────────────────────────
# Given a short list of contacts (name/phone/existing tags/language/vars)
# and the user's tag vocabulary, propose tags per-contact.

class TagSuggestionItem(BaseModel):
    contact_id: str
    suggested_tags: list[str] = Field(default_factory=list, max_length=4)


class TagSuggestionBatch(BaseModel):
    items: list[TagSuggestionItem] = Field(default_factory=list)
    note: str | None = Field(default=None, max_length=300)


TAG_SUGGEST_SYSTEM_PROMPT = """Sei un assistente che organizza una rubrica
WhatsApp suggerendo tag coerenti.

Ricevi:
- il vocabolario di tag già usati (con conteggi) come riferimento
- una lista di contatti con: id, nome, telefono, lingua, tags attuali,
  variables extra (es. città, ultimo acquisto)

PRODUCI un JSON:
{
  "items": [{"contact_id": "...", "suggested_tags": ["tag1", "tag2"]}, ...],
  "note": "breve commento opzionale (es. 'Vocabolario povero, suggerisco solo tag esistenti')"
}

REGOLE:
- Preferisci tag GIA' PRESENTI nel vocabolario dell'utente.
- Max 4 tag per contatto, lowercase, senza spazi (usa '-' o '_').
- Non ripetere tag già presenti nei tags attuali del contatto.
- Se non hai informazioni sufficienti per un contatto, restituisci una lista vuota.
- Zero PII nel ragionamento (non citare nomi reali nella note).

Rispondi SOLO con JSON valido."""


def _mock_tag_suggest(contacts: list[dict]) -> TagSuggestionBatch:
    return TagSuggestionBatch(
        items=[TagSuggestionItem(contact_id=c["id"], suggested_tags=[]) for c in contacts],
        note="[mock] MOCK_LLM attivo, nessuna analisi AI.",
    )


async def suggest_contact_tags(
    contacts: list[dict],
    tag_vocabulary: list[dict],
    api_key: str,
) -> tuple[TagSuggestionBatch, int, int]:
    """Haiku call. One round-trip for the whole batch (cheap)."""
    if settings.mock_llm or not api_key or not contacts:
        return (_mock_tag_suggest(contacts), 0, 0)

    client = _build_client(api_key)
    user_msg = (
        f"Vocabolario tag dell'utente:\n{json.dumps(tag_vocabulary, ensure_ascii=False)}\n\n"
        f"Contatti da taggare:\n{json.dumps(contacts, ensure_ascii=False, default=str)}"
    )
    response = client.messages.create(
        model=ai_models.model_id("contact_tag_suggest"),
        max_tokens=1500,
        temperature=0.4,
        system=TAG_SUGGEST_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = "".join(b.text for b in response.content if hasattr(b, "text"))
    tin, tout = _token_counts(response)
    try:
        parsed = json.loads(_extract_json(raw))
        return (TagSuggestionBatch(**parsed), tin, tout)
    except (ValueError, ValidationError) as e:
        raise ValueError(f"TagSuggest AI malformato: {e}") from e


# ── Dashboard KPI insight ─────────────────────────────────────

class DashboardInsight(BaseModel):
    headline: str = Field(..., min_length=1, max_length=200)
    observations: list[str] = Field(default_factory=list, max_length=4)
    next_action: str = Field(..., min_length=1, max_length=200)


DASHBOARD_INSIGHT_SYSTEM_PROMPT = """Sei un analista di marketing WhatsApp che
guarda i KPI aggregati di una PMI e dà una lettura breve in italiano semplice.

Input: JSON con contatti, messaggi inviati/consegnati/letti, falliti,
lista ultime campagne (nome, status, stats).

OUTPUT JSON:
- headline: 1 frase che cattura il trend più interessante (max 200 caratteri)
- observations: max 4 osservazioni concrete (es. "La campagna X ha il 35%
  di lettura, sopra media tua di 12 punti")
- next_action: 1 azione concreta da fare oggi (max 200 caratteri)

Tono: concreto, no marketing-speak, no emoji. Se i dati sono troppo pochi
per un'analisi onesta, dillo esplicitamente in headline e suggerisci di
aspettare più campagne in next_action.

Rispondi SOLO con JSON valido."""


def _mock_dashboard_insight(data: dict) -> DashboardInsight:
    campaigns = data.get("recent_campaigns") or []
    return DashboardInsight(
        headline=f"[mock] {len(campaigns)} campagne recenti. Configura Claude per l'analisi vera.",
        observations=[],
        next_action="Configura una chiave Claude in Impostazioni AI per ricevere suggerimenti.",
    )


async def dashboard_insight(
    data: dict,
    api_key: str,
) -> tuple[DashboardInsight, int, int]:
    if settings.mock_llm or not api_key:
        return (_mock_dashboard_insight(data), 0, 0)

    client = _build_client(api_key)
    user_msg = f"Dati aggregati del cliente:\n{json.dumps(data, ensure_ascii=False, default=str)}"
    response = client.messages.create(
        model=ai_models.model_id("dashboard_insight"),
        max_tokens=700,
        temperature=0.3,
        system=DASHBOARD_INSIGHT_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = "".join(b.text for b in response.content if hasattr(b, "text"))
    tin, tout = _token_counts(response)
    try:
        parsed = json.loads(_extract_json(raw))
        return (DashboardInsight(**parsed), tin, tout)
    except (ValueError, ValidationError) as e:
        raise ValueError(f"DashboardInsight AI malformato: {e}") from e
