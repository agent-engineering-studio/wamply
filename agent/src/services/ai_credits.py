"""AI credits service for the chat agent.

Mirrors `backend/src/services/ai_credits.py` for the chat operations
only (chat_turn, chat_turn_tool_use, chat_turn_planner). Shares the
same DB schema (migration 020) and the same ENCRYPTION_KEY.

Design decision: we duplicate rather than import because the agent
is a separate container. When the schema or pricing changes, both
services must be updated together.
"""

from datetime import date, datetime, timezone

import asyncpg
import redis.asyncio as aioredis
from fastapi import HTTPException

from src.services import ai_models
from src.services.ai_models import Operation
from src.utils.encryption import decrypt

BYOK_RATE_LIMIT_PER_MINUTE = 60

# agent_ai is the feature flag on plans.features that gates chat access
# for system_key users. BYOK users bypass (they brought their own key).
CHAT_FEATURE_FLAG = "agent_ai"


class CreditReservation:
    __slots__ = ("user_id", "operation", "source", "model_id", "credits", "sub_id")

    def __init__(
        self,
        user_id: str,
        operation: Operation,
        source: str,
        model_id: str,
        credits: float,
        sub_id: str | None,
    ):
        self.user_id = user_id
        self.operation = operation
        self.source = source
        self.model_id = model_id
        self.credits = credits
        self.sub_id = sub_id


async def resolve_api_key(
    pool: asyncpg.Pool,
    user_id: str,
) -> tuple[str, str]:
    """Return `(api_key, source)`. Source is 'byok' or 'system_key'."""
    byok = await pool.fetchrow(
        "SELECT encrypted_api_key FROM ai_config WHERE user_id = $1",
        user_id,
    )
    if byok and byok["encrypted_api_key"]:
        try:
            return decrypt(byok["encrypted_api_key"]), "byok"
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"BYOK key non decifrabile: {exc}",
            )

    sys_row = await pool.fetchrow(
        "SELECT value FROM system_config WHERE key = 'default_anthropic_api_key'"
    )
    if sys_row and sys_row["value"]:
        try:
            return decrypt(sys_row["value"]), "system_key"
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"System key non decifrabile: {exc}",
            )

    raise HTTPException(
        status_code=402,
        detail="AI non attiva. Configura una chiave API Claude o passa a un piano con agent AI.",
    )


async def _check_byok_rate_limit(
    redis: aioredis.Redis,
    user_id: str,
) -> None:
    bucket = int(datetime.now(timezone.utc).timestamp() // 60)
    key = f"ratelimit:ai:{user_id}:{bucket}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 90)
    if count > BYOK_RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail="Troppe richieste AI in poco tempo. Riprova tra qualche secondo.",
            headers={"Retry-After": "60"},
        )


async def _get_current_usage(pool: asyncpg.Pool, user_id: str) -> float:
    row = await pool.fetchrow(
        "SELECT ai_credits_used FROM usage_counters "
        "WHERE user_id = $1 AND period_start = $2",
        user_id,
        date.today(),
    )
    return float(row["ai_credits_used"]) if row else 0.0


async def reserve_credits(
    pool: asyncpg.Pool,
    redis: aioredis.Redis,
    user_id: str,
    operation: Operation,
) -> CreditReservation:
    """Pre-flight: resolve key, check feature (system_key only), check credits."""
    api_key, source = await resolve_api_key(pool, user_id)
    _ = api_key  # caller re-resolves; reservation only carries metadata

    if source == "byok":
        await _check_byok_rate_limit(redis, user_id)
        return CreditReservation(
            user_id=user_id,
            operation=operation,
            source="byok",
            model_id=ai_models.model_id(operation),
            credits=ai_models.credits_for(operation),
            sub_id=None,
        )

    # source == 'system_key': gate on plan feature + credit budget
    sub = await pool.fetchrow(
        "SELECT id, plan_id FROM subscriptions WHERE user_id = $1 "
        "  AND status IN ('active', 'trialing')",
        user_id,
    )
    if not sub:
        raise HTTPException(status_code=402, detail="Nessun abbonamento attivo.")

    plan = await pool.fetchrow(
        "SELECT name, price_cents, features, ai_credits_month "
        "FROM plans WHERE id = $1",
        sub["plan_id"],
    )
    if not plan:
        raise HTTPException(status_code=500, detail="Piano non trovato.")

    features = plan["features"]
    if isinstance(features, str):
        import json
        features = json.loads(features)
    if not (features or {}).get(CHAT_FEATURE_FLAG, False):
        raise HTTPException(
            status_code=403,
            detail=f"La chat AI non è inclusa nel tuo piano ({plan['name']}).",
        )

    cost = ai_models.credits_for(operation)
    budget = int(plan["ai_credits_month"])
    used = await _get_current_usage(pool, user_id)

    if budget != -1 and used + cost > budget:
        suggested = await pool.fetchrow(
            "SELECT slug FROM plans WHERE price_cents > $1 AND slug != 'free' "
            "ORDER BY price_cents LIMIT 1",
            plan["price_cents"],
        )
        raise HTTPException(
            status_code=402,
            detail=(
                f"Crediti AI esauriti ({int(used)}/{budget}). "
                f"Ricarica con un pacchetto oppure passa a un piano superiore."
            ),
            headers={
                "X-Suggested-Plan": (suggested["slug"] if suggested else ""),
                "X-Credits-Used": str(used),
                "X-Credits-Limit": str(budget),
            },
        )

    return CreditReservation(
        user_id=user_id,
        operation=operation,
        source="system_key",
        model_id=ai_models.model_id(operation),
        credits=cost,
        sub_id=str(sub["id"]),
    )


async def commit_credits(
    pool: asyncpg.Pool,
    redis: aioredis.Redis,
    reservation: CreditReservation,
    tokens_in: int,
    tokens_out: int,
) -> None:
    """Post-flight: write ledger, increment counter (system_key only)."""
    cost_usd = ai_models.estimated_cost_usd(
        reservation.operation, tokens_in, tokens_out
    )
    model_key = next(
        (k for k, v in ai_models.MODELS.items() if v == reservation.model_id),
        reservation.model_id,
    )

    await pool.execute(
        """INSERT INTO ai_usage_ledger
           (user_id, operation, model, source, credits, estimated_cost_usd,
            tokens_in, tokens_out)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
        reservation.user_id,
        reservation.operation,
        model_key,
        reservation.source,
        reservation.credits,
        cost_usd,
        tokens_in,
        tokens_out,
    )

    if reservation.source != "system_key":
        return

    await pool.execute(
        """INSERT INTO usage_counters (user_id, period_start, ai_credits_used)
           VALUES ($1, CURRENT_DATE, $2)
           ON CONFLICT (user_id, period_start)
           DO UPDATE SET ai_credits_used = usage_counters.ai_credits_used + $2""",
        reservation.user_id,
        reservation.credits,
    )

    await redis.delete(f"plan:{reservation.user_id}")

    if reservation.sub_id:
        await _maybe_fire_80_warning(pool, reservation)


async def _maybe_fire_80_warning(
    pool: asyncpg.Pool,
    reservation: CreditReservation,
) -> None:
    sub = await pool.fetchrow(
        "SELECT s.ai_credits_80_warning_sent_at, p.ai_credits_month "
        "FROM subscriptions s JOIN plans p ON p.id = s.plan_id "
        "WHERE s.id = $1",
        reservation.sub_id,
    )
    if not sub or not sub["ai_credits_month"] or sub["ai_credits_month"] == -1:
        return
    if sub["ai_credits_80_warning_sent_at"]:
        return

    used_now = await _get_current_usage(pool, reservation.user_id)
    threshold = 0.8 * int(sub["ai_credits_month"])
    if used_now >= threshold:
        await pool.execute(
            "UPDATE subscriptions SET ai_credits_80_warning_sent_at = now() "
            "WHERE id = $1",
            reservation.sub_id,
        )
