"""Redis-backed multi-turn chat history.

Stores the last N turns of a conversation per user, so subsequent
chat calls can pass context to Claude. Sliding window: when the list
exceeds MAX_TURNS, the oldest turn is evicted.

A "turn" is (user_message, assistant_response). We store each as a
pair of Anthropic-compatible message dicts. Tool-use blocks from
previous turns are intentionally NOT persisted — replaying them would
confuse Claude (tool results no longer match tool_use_ids from a
future request). Only final `text` content is kept.
"""

import json

import redis.asyncio as aioredis

MAX_TURNS = 10
TTL_SECONDS = 24 * 60 * 60  # 24 hours


def _key(user_id: str) -> str:
    return f"chat:history:{user_id}"


async def load_history(
    redis: aioredis.Redis,
    user_id: str,
) -> list[dict]:
    """Return messages from the last MAX_TURNS turns as Anthropic-format dicts.
    Empty list if no history or deserialization fails.
    """
    raw = await redis.get(_key(user_id))
    if not raw:
        return []
    try:
        turns = json.loads(raw)
    except (ValueError, TypeError):
        return []
    if not isinstance(turns, list):
        return []

    messages: list[dict] = []
    for turn in turns[-MAX_TURNS:]:
        user_text = turn.get("user")
        assistant_text = turn.get("assistant")
        if user_text:
            messages.append({"role": "user", "content": user_text})
        if assistant_text:
            messages.append({"role": "assistant", "content": assistant_text})
    return messages


async def append_turn(
    redis: aioredis.Redis,
    user_id: str,
    user_prompt: str,
    assistant_response: str,
) -> None:
    """Append a new (user, assistant) turn to the sliding window."""
    if not user_prompt and not assistant_response:
        return

    raw = await redis.get(_key(user_id))
    turns: list[dict] = []
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                turns = parsed
        except (ValueError, TypeError):
            pass

    turns.append({"user": user_prompt, "assistant": assistant_response})
    turns = turns[-MAX_TURNS:]

    await redis.set(_key(user_id), json.dumps(turns), ex=TTL_SECONDS)


async def clear_history(redis: aioredis.Redis, user_id: str) -> None:
    """Wipe history — useful for 'start over' or admin reset."""
    await redis.delete(_key(user_id))
