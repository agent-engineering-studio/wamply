"""AI-powered campaign helpers: per-contact message personalization (Haiku)
and strategic campaign planning (Opus).

Both functions return `(result, tokens_in, tokens_out)` for the ledger.
Callers (the endpoint layer) handle credit reservation + commit.
"""

import json
import re
from typing import Any

import anthropic
from pydantic import BaseModel, Field, ValidationError

from src.config import settings
from src.services import ai_models


# ── Personalization ────────────────────────────────────────────

class PersonalizedMessage(BaseModel):
    contact_id: str
    text: str = Field(..., min_length=1, max_length=1600)


PERSONALIZE_SYSTEM_PROMPT = """Sei un copywriter che adatta un template WhatsApp
al singolo destinatario senza alterarne il significato. Ricevi:
- il testo di un template con variabili {{nome}}, {{data}}, ecc.
- i dati anagrafici del contatto (nome, lingua, tag, variabili personalizzate)

PRODUCI un messaggio finale:
- sostituisci le variabili con i dati del contatto quando disponibili
- adatta leggermente il tono se il contatto ha lingua diversa
- se mancano dati, usa un fallback naturale (NON lasciare {{nome}} visibile)
- non inventare informazioni non fornite
- massimo 1024 caratteri
- nessun markdown, solo testo piano
- rispondi con JSON: {"text": "..."}"""


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


def _mock_personalize(body: str, contact: dict) -> str:
    """Trivial substitution for dev mode without Anthropic."""
    out = body
    name = contact.get("name") or "cliente"
    out = out.replace("{{nome}}", name).replace("{{name}}", name)
    variables = contact.get("variables") or {}
    for key, val in variables.items():
        out = out.replace("{{" + key + "}}", str(val))
    # Strip any remaining {{…}} placeholders
    out = re.sub(r"\{\{[^}]+\}\}", "", out)
    return out.strip()


async def personalize_for_contact(
    body: str,
    contact: dict,
    api_key: str,
) -> tuple[str, int, int]:
    """Personalize a template body for a single contact. Returns (text, tin, tout).

    `contact` fields expected: name, language, tags, variables (dict).
    """
    if settings.mock_llm or not api_key:
        return (_mock_personalize(body, contact), 0, 0)

    client = _build_client(api_key)
    user_msg = (
        f"Template:\n{body}\n\n"
        f"Contatto: {json.dumps(contact, ensure_ascii=False, default=str)}"
    )
    response = client.messages.create(
        model=ai_models.model_id("personalize_message"),
        max_tokens=600,
        temperature=0.5,
        system=PERSONALIZE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = "".join(b.text for b in response.content if hasattr(b, "text"))
    tin, tout = _token_counts(response)
    try:
        parsed = json.loads(_extract_json(raw))
        text = parsed.get("text") or ""
    except (ValueError, TypeError):
        text = raw.strip()
    return (text[:1600], tin, tout)


# ── Campaign planner ──────────────────────────────────────────

class PlannerSuggestion(BaseModel):
    segment_description: str = Field(..., min_length=1, max_length=400)
    estimated_audience: int = Field(..., ge=0)
    recommended_template_ids: list[str] = Field(default_factory=list)
    best_send_hour_local: int = Field(..., ge=0, le=23)
    reasoning: str = Field(..., min_length=1, max_length=1000)
    cautions: list[str] = Field(default_factory=list)


PLANNER_SYSTEM_PROMPT = """Sei uno stratega di marketing WhatsApp. Analizzi
gli input dell'utente e i dati forniti (contatti aggregati, template disponibili,
storico campagne) per proporre una campagna ottimale.

OUTPUT: JSON con:
- segment_description: chi deve ricevere e perché (max 400 caratteri, in italiano)
- estimated_audience: stima numerica dei destinatari tra i contatti disponibili
- recommended_template_ids: lista di id template coerenti con l'obiettivo
- best_send_hour_local: ora (0-23) ottimale per l'invio nel fuso del cliente
- reasoning: spiegazione ragionata delle scelte (max 1000 caratteri)
- cautions: liste di rischi/note (compliance, volume, fatica, max 3 voci)

Ragiona esplicitamente su: opt-in, segmentazione per tag/lingua, orario
(evita notti, prima mattina, weekend per B2B), template giusto per la categoria.
Se i dati sono insufficienti, esprimi dubbi nelle cautions.

Rispondi SOLO con JSON valido."""


def _mock_plan(objective: str, contacts_count: int) -> PlannerSuggestion:
    return PlannerSuggestion(
        segment_description=f"Tutti i contatti opt-in — simulazione per: {objective[:200]}",
        estimated_audience=contacts_count,
        recommended_template_ids=[],
        best_send_hour_local=11,
        reasoning="[mock] Analisi strategica non disponibile — MOCK_LLM attivo.",
        cautions=["Verifica opt-in prima dell'invio", "Rispetta rate limit Twilio"],
    )


async def plan_campaign(
    objective: str,
    context_data: dict,
    api_key: str,
) -> tuple[PlannerSuggestion, int, int]:
    """Use Opus to suggest segment + template + timing for a campaign.

    `context_data` should include: total_contacts, contacts_by_tag,
    contacts_by_language, available_templates, recent_campaigns.
    """
    if settings.mock_llm or not api_key:
        return (
            _mock_plan(objective, int(context_data.get("total_contacts", 0))),
            0, 0,
        )

    client = _build_client(api_key)
    user_msg = (
        f"Obiettivo dell'utente:\n{objective}\n\n"
        f"Dati del cliente:\n{json.dumps(context_data, ensure_ascii=False, default=str)}"
    )
    response = client.messages.create(
        model=ai_models.model_id("campaign_planner"),
        max_tokens=1500,
        temperature=0.4,
        system=PLANNER_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = "".join(b.text for b in response.content if hasattr(b, "text"))
    tin, tout = _token_counts(response)
    try:
        parsed = json.loads(_extract_json(raw))
        return (PlannerSuggestion(**parsed), tin, tout)
    except (ValueError, ValidationError) as e:
        raise ValueError(f"Planner AI malformato: {e}") from e


# ── Campaign performance insight ──────────────────────────────

class PerformanceInsight(BaseModel):
    summary: str = Field(..., min_length=1, max_length=400)
    highlights: list[str] = Field(default_factory=list, max_length=4)
    improvements: list[str] = Field(default_factory=list, max_length=4)
    failure_diagnosis: str | None = Field(default=None, max_length=300)


INSIGHT_SYSTEM_PROMPT = """Sei un analista di marketing WhatsApp. Ricevi le
statistiche di UNA singola campagna già partita (dati aggregati, no PII) e
produci un'analisi pragmatica e breve per una PMI con bassa alfabetizzazione
tecnica.

OUTPUT: JSON con:
- summary: 1-2 frasi sul risultato complessivo (max 400 caratteri)
- highlights: max 4 punti positivi concreti (es. "Tasso di lettura 42%: buono per questa categoria")
- improvements: max 4 suggerimenti azionabili (es. "Prova a inviare alle 19 invece che alle 10")
- failure_diagnosis: se ci sono fallimenti >5%, prova a ipotizzare la causa più probabile (numeri
  non validi, opt-out, rate limit, template rifiutato). Altrimenti lascia null.

Parla in italiano, tono concreto, no marketing-speak. Zero emoji.
Rispondi SOLO con JSON valido."""


def _mock_insight(stats: dict, name: str) -> PerformanceInsight:
    total = int(stats.get("total") or 0)
    read = int(stats.get("read") or 0)
    failed = int(stats.get("failed") or 0)
    read_rate = (read / total * 100) if total else 0
    fail_rate = (failed / total * 100) if total else 0
    return PerformanceInsight(
        summary=f"[mock] Campagna '{name}': {read_rate:.0f}% letti, {fail_rate:.0f}% falliti.",
        highlights=[f"Letti: {read}/{total}"],
        improvements=["Configura una chiave Claude per un'analisi vera."],
        failure_diagnosis=(
            f"{fail_rate:.0f}% fallimenti — probabile mix di numeri non validi "
            "e contatti senza opt-in."
        ) if fail_rate > 5 else None,
    )


async def analyze_campaign_performance(
    campaign_info: dict,
    api_key: str,
) -> tuple[PerformanceInsight, int, int]:
    """Ask Claude Sonnet for a short, actionable reading of a single campaign.

    `campaign_info` is expected to include: name, status, template_category,
    scheduled/started timestamps, and a `stats` block with total/sent/delivered/read/failed.
    """
    if settings.mock_llm or not api_key:
        stats = campaign_info.get("stats") or {}
        return (_mock_insight(stats, campaign_info.get("name", "")), 0, 0)

    client = _build_client(api_key)
    user_msg = (
        "Analizza questa campagna:\n"
        f"{json.dumps(campaign_info, ensure_ascii=False, default=str)}"
    )
    response = client.messages.create(
        model=ai_models.model_id("campaign_insight"),
        max_tokens=800,
        temperature=0.3,
        system=INSIGHT_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = "".join(b.text for b in response.content if hasattr(b, "text"))
    tin, tout = _token_counts(response)
    try:
        parsed = json.loads(_extract_json(raw))
        return (PerformanceInsight(**parsed), tin, tout)
    except (ValueError, ValidationError) as e:
        raise ValueError(f"Insight AI malformato: {e}") from e


# ── Helpers for the preview endpoint ──────────────────────────

def extract_body_text(components: Any) -> str:
    """Extract the BODY component text from a template's components JSONB."""
    if isinstance(components, str):
        try:
            components = json.loads(components)
        except (ValueError, TypeError):
            return ""
    if not isinstance(components, list):
        return ""
    for c in components:
        if isinstance(c, dict) and (c.get("type") or "").lower() == "body":
            return c.get("text") or ""
    return ""
