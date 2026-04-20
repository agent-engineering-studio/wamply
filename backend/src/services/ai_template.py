"""AI-assisted template generation and improvement via Claude."""

import json
import re
from typing import Literal

import anthropic
from pydantic import BaseModel, Field, ValidationError

from src.config import settings

TemplateCategory = Literal["marketing", "utility", "authentication"]
Language = Literal["it", "en", "es", "de", "fr"]
ImproveStyle = Literal["short", "warm", "professional"]


class GeneratedTemplate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    category: TemplateCategory
    language: Language
    body: str = Field(..., min_length=1, max_length=1024)
    variables: list[str] = Field(default_factory=list)


class ImproveVariant(BaseModel):
    style: ImproveStyle
    text: str = Field(..., min_length=1, max_length=1024)


class ImproveResult(BaseModel):
    variants: list[ImproveVariant]


SYSTEM_PROMPT = """Sei un copywriter esperto di WhatsApp Business marketing.
Il tuo compito è generare un template di messaggio WhatsApp strutturato basandoti
sulla richiesta dell'utente.

REGOLE OBBLIGATORIE:
- Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo.
- Massimo 1024 caratteri nel body.
- Usa variabili con sintassi {{nome}}, {{data}}, {{ora}}, {{importo}} ecc.
  (nomi descrittivi, snake_case, no spazi).
- Tono professionale ma personale, adatto a WhatsApp.
- Nessun markdown, solo testo piano.
- Category: "marketing" (promo/newsletter), "utility" (conferme, reminder),
  "authentication" (OTP).
- Rispetta la lingua richiesta (default: it).

FORMATO JSON (tutti i campi obbligatori):
{
  "name": "nome breve e descrittivo (max 80 char)",
  "category": "marketing" | "utility" | "authentication",
  "language": "it" | "en" | "es" | "de" | "fr",
  "body": "testo del messaggio con {{variabili}}",
  "variables": ["nome_variabile_1", "nome_variabile_2"]
}

ESEMPIO:
Input: "Reminder appuntamento 24h prima con nome cliente e data"
Output:
{
  "name": "Reminder Appuntamento",
  "category": "utility",
  "language": "it",
  "body": "Ciao {{nome}}, ti ricordiamo il tuo appuntamento di domani {{data}} alle {{ora}}. A presto!",
  "variables": ["nome", "data", "ora"]
}"""


_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


def _mock_response(prompt: str, language: str) -> GeneratedTemplate:
    return GeneratedTemplate(
        name="Template generato",
        category="marketing",
        language=language,  # type: ignore[arg-type]
        body=f"Ciao {{{{nome}}}}, ecco il template per: {prompt[:80]}.",
        variables=["nome"],
    )


def _extract_json(text: str) -> str:
    """Return the first JSON object found in text (models sometimes wrap it)."""
    match = re.search(r"\{[\s\S]*\}", text)
    return match.group(0) if match else text


IMPROVE_SYSTEM_PROMPT = """Sei un copywriter esperto di WhatsApp Business.
Ricevi un template esistente e produci TRE varianti che ne migliorino
rispettivamente: concisione, calore relazionale e tono professionale.

REGOLE:
- PRESERVA TUTTE le variabili nella forma {{nome}}, {{data}}, ecc. —
  stesse identiche, stesso numero, stessi nomi.
- Mantieni la lingua originale.
- Massimo 1024 caratteri per variante.
- Nessun markdown, solo testo piano.
- Rispondi SOLO con JSON valido, senza testo aggiuntivo.

FORMATO JSON (obbligatorio):
{
  "variants": [
    {"style": "short", "text": "versione piu breve"},
    {"style": "warm", "text": "versione piu calorosa e personale"},
    {"style": "professional", "text": "versione piu formale/istituzionale"}
  ]
}"""


def _mock_improve(body: str) -> ImproveResult:
    return ImproveResult(
        variants=[
            ImproveVariant(style="short", text=f"[breve] {body[:200]}"),
            ImproveVariant(style="warm", text=f"Ciao! {body}"),
            ImproveVariant(style="professional", text=f"Gentile cliente, {body}"),
        ]
    )


async def improve_template(body: str) -> ImproveResult:
    """Return 3 stylistic variants of the given template body via Claude Haiku."""
    if settings.mock_llm or not settings.anthropic_api_key:
        return _mock_improve(body)

    client = _get_client()
    response = client.messages.create(
        model=settings.claude_haiku_model,
        max_tokens=1200,
        temperature=0.6,
        system=IMPROVE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"Template originale:\n{body}"}],
    )
    raw = "".join(
        block.text for block in response.content if hasattr(block, "text")
    )
    parsed = json.loads(_extract_json(raw))
    try:
        return ImproveResult(**parsed)
    except ValidationError as e:
        raise ValueError(f"Improve AI malformato: {e}") from e


async def generate_template(
    prompt: str, language: Language = "it"
) -> GeneratedTemplate:
    """Generate a WhatsApp template from a natural-language prompt."""
    if settings.mock_llm or not settings.anthropic_api_key:
        return _mock_response(prompt, language)

    client = _get_client()
    user_msg = f"Lingua: {language}\nRichiesta: {prompt}"

    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=800,
        temperature=0.7,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    raw = "".join(
        block.text for block in response.content if hasattr(block, "text")
    )
    parsed = json.loads(_extract_json(raw))
    try:
        return GeneratedTemplate(**parsed)
    except ValidationError as e:
        raise ValueError(f"Template AI malformato: {e}") from e
