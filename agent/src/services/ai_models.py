"""Claude model routing for the chat agent.

Mirrors `backend/src/services/ai_models.py` for the subset of operations
the agent actually performs (chat turns only — template ops stay in the
backend). Kept as a duplicate rather than a shared package because the
agent is a separate container with its own deploy lifecycle.
"""

import re
from typing import Literal

Model = Literal["haiku", "sonnet", "opus"]

MODELS: dict[Model, str] = {
    "haiku":  "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-4-6-20251108",
    "opus":   "claude-opus-4-5",
}

# $/1M tokens (input, output) — used for ledger cost estimation only.
MODEL_PRICING: dict[Model, tuple[float, float]] = {
    "haiku":  (1.0,  5.0),
    "sonnet": (3.0, 15.0),
    "opus":   (15.0, 75.0),
}

# Chat operations handled by the agent.
Operation = Literal["chat_turn", "chat_turn_tool_use", "chat_turn_planner"]

OPERATION_CREDITS: dict[Operation, float] = {
    "chat_turn":          1.0,
    "chat_turn_tool_use": 2.0,
    "chat_turn_planner":  3.0,
}

OPERATION_MODEL: dict[Operation, Model] = {
    "chat_turn":          "sonnet",
    "chat_turn_tool_use": "sonnet",
    "chat_turn_planner":  "opus",
}

# Regex that promotes a standard chat turn to the Opus planner variant.
# Deliberately broad — false positives cost +2 credits, never silently
# wrong. Match on ITALIAN keywords since the UI is Italian-first.
_PLANNING_INTENT = re.compile(
    r"\b(campagn[ae]|planner|strateg|segment|pianific|progett)",
    re.IGNORECASE,
)


def classify_chat_operation(prompt: str, has_tool_use: bool) -> Operation:
    """Pick the Operation for a chat turn.

    Priority:
      1. Planner intent in prompt → Opus (chat_turn_planner, 3c)
      2. Response contained tool_use blocks → chat_turn_tool_use (2c)
      3. Plain turn → chat_turn (1c)

    The classification happens AFTER the first Claude call completes,
    because we need to know whether the model chose tool_use. The
    planner intent check runs upfront on the user prompt.
    """
    if _PLANNING_INTENT.search(prompt or ""):
        return "chat_turn_planner"
    if has_tool_use:
        return "chat_turn_tool_use"
    return "chat_turn"


def planner_intent_detected(prompt: str) -> bool:
    """Pre-flight check used to pick the model before calling Claude."""
    return bool(_PLANNING_INTENT.search(prompt or ""))


def credits_for(operation: Operation) -> float:
    return OPERATION_CREDITS[operation]


def model_for(operation: Operation) -> Model:
    return OPERATION_MODEL[operation]


def model_id(operation: Operation) -> str:
    return MODELS[OPERATION_MODEL[operation]]


def estimated_cost_usd(operation: Operation, tokens_in: int, tokens_out: int) -> float:
    model = OPERATION_MODEL[operation]
    in_price, out_price = MODEL_PRICING[model]
    return round(
        (tokens_in / 1_000_000) * in_price + (tokens_out / 1_000_000) * out_price,
        4,
    )
