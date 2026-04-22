"""Claude model constants, credit pricing, and operation→model routing.

All model choices are invisible to the end user — the UI only speaks in
credits. See docs/ai-credits-plan.md §6 for rationale.
"""

import re
from typing import Literal

# ── Model identifiers ────────────────────────────────────────

Model = Literal["haiku", "sonnet", "opus"]

MODELS: dict[Model, str] = {
    # Alias ("claude-haiku-4-5") always point at the latest dated release of
    # that family, so we don't have to bump the registry every time Anthropic
    # ships a new version. Dated ids would break on rollovers.
    "haiku":  "claude-haiku-4-5",
    "sonnet": "claude-sonnet-4-5",
    "opus":   "claude-opus-4-5",
}

# Approximate $/1M tokens (input, output). Used only to populate
# estimated_cost_usd in the ledger — not for billing the user.
MODEL_PRICING: dict[Model, tuple[float, float]] = {
    "haiku":  (1.0,  5.0),
    "sonnet": (3.0, 15.0),
    "opus":   (15.0, 75.0),
}


# ── Operation identifiers ────────────────────────────────────

Operation = Literal[
    "chat_turn",
    "chat_turn_tool_use",
    "chat_turn_planner",
    "template_generate",
    "template_improve",
    "template_compliance",
    "template_translate",
    "personalize_message",
    "campaign_planner",
    "campaign_insight",
    "group_suggest",
    "contact_tag_suggest",
    "dashboard_insight",
]


# ── Credit price per operation ───────────────────────────────
# These are what the user "pays" in credits. They intentionally do
# NOT map 1:1 to actual $ cost — each credit is priced to leave
# healthy margin on top of the underlying Claude call.

OPERATION_CREDITS: dict[Operation, float] = {
    "chat_turn":            1.0,
    "chat_turn_tool_use":   2.0,
    "chat_turn_planner":    3.0,  # Opus
    "template_generate":    2.0,
    "template_improve":     3.0,
    "template_compliance":  3.0,  # Opus
    "template_translate":   1.0,  # Haiku
    "personalize_message":  0.5,  # Haiku
    "campaign_planner":     5.0,  # Opus
    "campaign_insight":     2.0,  # Sonnet
    "group_suggest":        2.0,  # Sonnet
    "contact_tag_suggest":  1.0,  # Haiku
    "dashboard_insight":    2.0,  # Sonnet
}


# ── Operation → model routing ────────────────────────────────

OPERATION_MODEL: dict[Operation, Model] = {
    "chat_turn":            "sonnet",
    "chat_turn_tool_use":   "sonnet",
    "chat_turn_planner":    "opus",
    "template_generate":    "sonnet",
    "template_improve":     "sonnet",
    "template_compliance":  "opus",
    "template_translate":   "haiku",
    "personalize_message":  "haiku",
    "campaign_planner":     "opus",
    "campaign_insight":     "sonnet",
    "group_suggest":        "sonnet",
    "contact_tag_suggest":  "haiku",
    "dashboard_insight":    "sonnet",
}


# ── Intent detection for chat ────────────────────────────────
# Regex that bumps a standard chat turn to the Opus "planner" variant.
# Deliberately broad: false positives cost 1 extra credit, false
# negatives silently fall back to Sonnet which handles most cases.

_PLANNING_INTENT = re.compile(
    r"\b(campagn[ae]|planner|strateg|segment|pianific|progett)",
    re.IGNORECASE,
)


def classify_chat_operation(prompt: str, has_tool_use: bool) -> Operation:
    """Pick the right Operation for a chat turn based on the user prompt.

    Priority:
      1. Planner intent → chat_turn_planner (Opus)
      2. Contains tool_use → chat_turn_tool_use (Sonnet, 2 credits)
      3. Plain turn → chat_turn (Sonnet, 1 credit)
    """
    if _PLANNING_INTENT.search(prompt or ""):
        return "chat_turn_planner"
    if has_tool_use:
        return "chat_turn_tool_use"
    return "chat_turn"


def credits_for(operation: Operation) -> float:
    return OPERATION_CREDITS[operation]


def model_for(operation: Operation) -> Model:
    return OPERATION_MODEL[operation]


def model_id(operation: Operation) -> str:
    """Return the actual Anthropic model id (e.g. 'claude-sonnet-4-6-...')."""
    return MODELS[OPERATION_MODEL[operation]]


def estimated_cost_usd(operation: Operation, tokens_in: int, tokens_out: int) -> float:
    """Compute the approximate Anthropic cost for an operation."""
    model = OPERATION_MODEL[operation]
    in_price, out_price = MODEL_PRICING[model]
    return round(
        (tokens_in / 1_000_000) * in_price + (tokens_out / 1_000_000) * out_price,
        4,
    )
