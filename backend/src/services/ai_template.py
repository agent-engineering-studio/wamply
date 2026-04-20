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


RiskLevel = Literal["low", "medium", "high"]


class ComplianceIssue(BaseModel):
    text: str
    reason: str
    suggestion: str


class ComplianceReport(BaseModel):
    risk_level: RiskLevel
    score: float = Field(..., ge=0.0, le=1.0)
    issues: list[ComplianceIssue] = Field(default_factory=list)


class TranslatedTemplate(BaseModel):
    language: Language
    name: str = Field(..., min_length=1, max_length=80)
    body: str = Field(..., min_length=1, max_length=1024)


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


COMPLIANCE_SYSTEM_PROMPT = """Sei un revisore esperto di policy WhatsApp Business
e Twilio Content Templates. Analizza il template fornito e valuta la probabilità
che superi la review automatica/umana.

POLICY PRINCIPALI DA CONTROLLARE:
- No spam: niente promozioni aggressive, urgency artificiale, CTA multiple forzate.
- Trasparenza: il mittente deve essere chiaramente identificabile.
- Opt-out: i messaggi marketing devono permettere disiscrizione o rimando a gestione preferenze.
- No claim fuorvianti: niente promesse irrealistiche, garanzie non supportate, scarcity falsa.
- No dati sensibili: non richiedere password, OTP di terzi, dati carta di credito nel body.
- Lingua civile: niente linguaggio offensivo, discriminatorio o allarmistico.
- Contenuto proibito (gambling non autorizzato, farmaci, tabacco, armi): flaggare high.

CATEGORY RULES:
- "marketing" → deve includere o riferirsi a opt-out.
- "utility" → conferme/reminder; no promozioni embedded.
- "authentication" → solo OTP/codici; mai promo.

OUTPUT (solo JSON):
{
  "risk_level": "low" | "medium" | "high",
  "score": 0.0-1.0  (prob. di approvazione: 1.0 = sicuro, 0.0 = sicura rejection),
  "issues": [
    {
      "text": "frase problematica (massimo 120 char)",
      "reason": "perché viola la policy",
      "suggestion": "come riformulare"
    }
  ]
}

Risk_level coerente con score:
  score >= 0.8 → "low"
  0.5 <= score < 0.8 → "medium"
  score < 0.5 → "high"
Se nessun issue: issues = []."""


def _mock_compliance(body: str, category: str) -> ComplianceReport:
    body_lower = body.lower()
    issues: list[ComplianceIssue] = []
    score = 0.9
    if any(w in body_lower for w in ["gratis", "urgente", "ora o mai piu"]):
        issues.append(
            ComplianceIssue(
                text="termini promozionali aggressivi",
                reason="possibile percezione di spam",
                suggestion="usa un tono piu informativo",
            )
        )
        score = 0.65
    if category == "marketing" and "disiscriv" not in body_lower and "stop" not in body_lower:
        issues.append(
            ComplianceIssue(
                text="template marketing senza opt-out",
                reason="policy Meta richiede meccanismo di opt-out",
                suggestion="aggiungi 'Rispondi STOP per non ricevere piu messaggi'",
            )
        )
        score = min(score, 0.55)
    level: RiskLevel = "low" if score >= 0.8 else "medium" if score >= 0.5 else "high"
    return ComplianceReport(risk_level=level, score=score, issues=issues)


async def check_compliance(
    body: str, category: str = "marketing", language: str = "it"
) -> ComplianceReport:
    """Evaluate a template body against WhatsApp/Twilio content policies."""
    if settings.mock_llm or not settings.anthropic_api_key:
        return _mock_compliance(body, category)

    client = _get_client()
    user_msg = (
        f"Categoria: {category}\nLingua: {language}\n\nTemplate:\n{body}"
    )
    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=900,
        temperature=0.2,
        system=COMPLIANCE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = "".join(
        block.text for block in response.content if hasattr(block, "text")
    )
    parsed = json.loads(_extract_json(raw))
    try:
        return ComplianceReport(**parsed)
    except ValidationError as e:
        raise ValueError(f"Compliance AI malformato: {e}") from e


TRANSLATE_SYSTEM_PROMPT = """Sei un traduttore professionista esperto di
localizzazione di template WhatsApp Business. Traduci il template mantenendo
intatte TUTTE le variabili (es. {{nome}}, {{data}}) — stesso numero, stessi
nomi, stessa grafia. Adatta il tono alla cultura della lingua target.

OUTPUT (solo JSON):
{
  "language": "<codice ISO: it|en|es|de|fr>",
  "name": "nome template tradotto (max 80 char)",
  "body": "corpo tradotto, variabili preservate"
}"""


LANGUAGE_NAMES: dict[str, str] = {
    "it": "italiano",
    "en": "inglese",
    "es": "spagnolo",
    "de": "tedesco",
    "fr": "francese",
}


def _mock_translate(
    name: str, body: str, target: Language
) -> TranslatedTemplate:
    prefix = {"it": "IT", "en": "EN", "es": "ES", "de": "DE", "fr": "FR"}[target]
    return TranslatedTemplate(
        language=target,
        name=f"[{prefix}] {name}"[:80],
        body=f"[mock-{target}] {body}",
    )


async def translate_template(
    name: str,
    body: str,
    source_language: str,
    target_language: Language,
) -> TranslatedTemplate:
    """Translate a template body+name into the target language, preserving variables."""
    if settings.mock_llm or not settings.anthropic_api_key:
        return _mock_translate(name, body, target_language)

    client = _get_client()
    target_name = LANGUAGE_NAMES.get(target_language, target_language)
    user_msg = (
        f"Lingua sorgente: {source_language}\n"
        f"Lingua target: {target_language} ({target_name})\n\n"
        f"Nome template: {name}\n\n"
        f"Body:\n{body}"
    )

    response = client.messages.create(
        model=settings.claude_haiku_model,
        max_tokens=900,
        temperature=0.3,
        system=TRANSLATE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )
    raw = "".join(
        block.text for block in response.content if hasattr(block, "text")
    )
    parsed = json.loads(_extract_json(raw))
    # Force target language even if the model ignored it.
    parsed["language"] = target_language
    try:
        return TranslatedTemplate(**parsed)
    except ValidationError as e:
        raise ValueError(f"Translate AI malformato: {e}") from e


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
