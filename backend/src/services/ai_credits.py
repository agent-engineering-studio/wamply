"""AI credits service: key resolution, credit accounting, ledger writes.

Central gate for every AI call in Wamply. Backend endpoints that hit
Claude must call `reserve_credits()` before the Anthropic call and
`commit_credits()` right after — never one without the other.

Pricing and model routing live in `ai_models.py`. This module is
deliberately model-agnostic: it only knows operations and credit costs.
"""

from datetime import date, datetime, timezone

import asyncpg
import redis.asyncio as aioredis
import structlog
from fastapi import HTTPException

from src.services import ai_models
from src.services.ai_models import Operation
from src.services.encryption import decrypt

logger = structlog.get_logger()

# Features on `plans.features` that gate AI operations.
OPERATION_FEATURE: dict[Operation, str | None] = {
    "chat_turn":            "agent_ai",
    "chat_turn_tool_use":   "agent_ai",
    "chat_turn_planner":    "agent_ai",
    "template_generate":    "ai_templates",
    "template_improve":     "ai_templates",
    "template_compliance":  "ai_templates",
    "template_translate":   "ai_templates",
    "personalize_message":  "ai_personalize",
    "campaign_planner":     "ai_templates",
}

# Rate-limit for BYOK users: no credit cap, but cap requests to protect infra.
BYOK_RATE_LIMIT_PER_MINUTE = 60


class CreditReservation:
    """Result of a successful pre-flight credit check.

    Carries everything the caller needs to pass to commit_credits()
    after the Anthropic call completes, without re-querying the DB.
    """

    __slots__ = ("user_id", "operation", "source", "model_id", "credits", "sub_id", "plan_slug")

    def __init__(
        self,
        user_id: str,
        operation: Operation,
        source: str,           # 'system_key' | 'byok'
        model_id: str,
        credits: float,
        sub_id: str | None,
        plan_slug: str | None,
    ):
        self.user_id = user_id
        self.operation = operation
        self.source = source
        self.model_id = model_id
        self.credits = credits
        self.sub_id = sub_id
        self.plan_slug = plan_slug


async def resolve_api_key(
    db: asyncpg.Pool,
    user_id: str,
) -> tuple[str, str]:
    """Return `(api_key, source)` for this user.

    Priority:
      1. BYOK — `ai_config.encrypted_api_key` decrypted
      2. system_config `default_anthropic_api_key` decrypted
      3. Raise 402 — user must activate AI

    `source` is 'byok' or 'system_key', used later for ledger + credit gating.
    """
    byok_row = await db.fetchrow(
        "SELECT encrypted_api_key FROM ai_config WHERE user_id = $1",
        user_id,
    )
    if byok_row and byok_row["encrypted_api_key"]:
        try:
            return decrypt(byok_row["encrypted_api_key"]), "byok"
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"BYOK key non decifrabile: {exc}",
            )

    sys_row = await db.fetchrow(
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


async def _check_plan_feature(
    db: asyncpg.Pool,
    user_id: str,
    operation: Operation,
    source: str,
) -> tuple[dict, dict]:
    """Return `(subscription_row, plan_row)` after verifying feature access.

    BYOK users skip the feature check (they brought their own key, they pay
    Anthropic directly). This function is only called when we need plan/sub
    data anyway — BYOK callers may pass source='byok' to skip the gate.
    """
    sub = await db.fetchrow(
        "SELECT id, plan_id, status::text, current_period_end "
        "FROM subscriptions WHERE user_id = $1 "
        "  AND status IN ('active', 'trialing')",
        user_id,
    )
    if not sub:
        raise HTTPException(
            status_code=402,
            detail="Nessun abbonamento attivo.",
        )

    plan = await db.fetchrow("SELECT * FROM plans WHERE id = $1", sub["plan_id"])
    if not plan:
        raise HTTPException(status_code=500, detail="Piano non trovato.")

    if source == "system_key":
        # Feature gate: required flag on plan.features for system_key users
        feature_flag = OPERATION_FEATURE.get(operation)
        if feature_flag:
            features = plan["features"]
            if isinstance(features, str):
                import json
                features = json.loads(features)
            if not (features or {}).get(feature_flag, False):
                raise HTTPException(
                    status_code=403,
                    detail=f"Questa funzionalità AI non è inclusa nel tuo piano ({plan['name']}).",
                )

    return dict(sub), dict(plan)


async def _check_byok_rate_limit(
    redis: aioredis.Redis,
    user_id: str,
) -> None:
    """Sliding-window rate limit for BYOK: 60 req/min.

    Uses a Redis counter keyed by minute bucket. Cheap, approximate,
    protects infra from BYOK users spamming Anthropic through us.
    """
    bucket = int(datetime.now(timezone.utc).timestamp() // 60)
    key = f"ratelimit:ai:{user_id}:{bucket}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 90)  # clean up ~1.5 minutes later
    if count > BYOK_RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail="Troppe richieste AI in poco tempo. Riprova tra qualche secondo.",
            headers={"Retry-After": "60"},
        )


async def _get_current_usage(
    db: asyncpg.Pool,
    user_id: str,
) -> float:
    """Return credits already used this month (today's period row)."""
    row = await db.fetchrow(
        "SELECT ai_credits_used FROM usage_counters "
        "WHERE user_id = $1 AND period_start = $2",
        user_id,
        date.today(),
    )
    return float(row["ai_credits_used"]) if row else 0.0


async def reserve_credits(
    db: asyncpg.Pool,
    redis: aioredis.Redis,
    user_id: str,
    operation: Operation,
) -> CreditReservation:
    """Pre-flight: resolve key, check feature, check credit budget.

    Call this BEFORE invoking Claude. Returns a `CreditReservation` that
    must be passed to `commit_credits()` after the call completes.

    Raises HTTPException(402/403/429) on any failure — the endpoint
    simply re-raises or lets FastAPI bubble it up.
    """
    api_key, source = await resolve_api_key(db, user_id)

    if source == "byok":
        await _check_byok_rate_limit(redis, user_id)
        # BYOK: no feature gate, no credit check. Still log to ledger later.
        return CreditReservation(
            user_id=user_id,
            operation=operation,
            source="byok",
            model_id=ai_models.model_id(operation),
            credits=ai_models.credits_for(operation),
            sub_id=None,
            plan_slug=None,
        )

    # source == "system_key"
    sub, plan = await _check_plan_feature(db, user_id, operation, source)

    cost = ai_models.credits_for(operation)
    budget = int(plan["ai_credits_month"])
    used = await _get_current_usage(db, user_id)

    # Plan-first, topup-fallback: check combined availability.
    # topup_remaining is 0 if balance has expired (get_topup_balance reports 0).
    from src.services.credit_topup import get_topup_balance
    topup_info = await get_topup_balance(db, user_id)
    topup_remaining = float(topup_info["topup_credits"])

    plan_remaining = -1.0 if budget == -1 else max(0.0, budget - used)
    combined_available = -1.0 if plan_remaining == -1 else (plan_remaining + topup_remaining)

    if combined_available != -1 and combined_available < cost:
        suggested = await db.fetchrow(
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
                "X-Topup-Remaining": str(topup_remaining),
            },
        )

    _ = api_key  # discarded intentionally; callers re-resolve as needed
    return CreditReservation(
        user_id=user_id,
        operation=operation,
        source="system_key",
        model_id=ai_models.model_id(operation),
        credits=cost,
        sub_id=str(sub["id"]),
        plan_slug=plan["slug"],
    )


async def commit_credits(
    db: asyncpg.Pool,
    redis: aioredis.Redis,
    reservation: CreditReservation,
    tokens_in: int,
    tokens_out: int,
) -> None:
    """Post-flight: write ledger, increment counter, fire 80% warning if needed.

    Call after the Claude invocation completes (on success — on failure
    do NOT call this, the user didn't consume anything).
    """
    cost_usd = ai_models.estimated_cost_usd(reservation.operation, tokens_in, tokens_out)
    model_key = next(
        (k for k, v in ai_models.MODELS.items() if v == reservation.model_id),
        reservation.model_id,
    )

    await db.execute(
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

    # BYOK doesn't decrement any counter — user pays Anthropic directly.
    if reservation.source != "system_key":
        return

    # Plan-first, topup-fallback accounting. Figure out how much of the
    # reservation is covered by plan budget vs topup balance.
    from src.services.credit_topup import consume_topup, get_topup_balance

    cost = float(reservation.credits)
    plan_row = await db.fetchrow(
        "SELECT p.ai_credits_month FROM subscriptions s "
        "JOIN plans p ON p.id = s.plan_id "
        "WHERE s.id = $1",
        reservation.sub_id,
    )
    budget = int(plan_row["ai_credits_month"]) if plan_row else 0
    used = await _get_current_usage(db, reservation.user_id)
    plan_remaining = float("inf") if budget == -1 else max(0.0, budget - used)

    from_plan = min(cost, plan_remaining)
    from_topup = cost - from_plan

    if from_plan > 0:
        await db.execute(
            """INSERT INTO usage_counters (user_id, period_start, ai_credits_used)
               VALUES ($1, CURRENT_DATE, $2)
               ON CONFLICT (user_id, period_start)
               DO UPDATE SET ai_credits_used = usage_counters.ai_credits_used + $2""",
            reservation.user_id,
            from_plan,
        )

    if from_topup > 0:
        # Guard against concurrent drainage: reservation already checked
        # combined availability, but topup balance could have changed.
        topup_info = await get_topup_balance(db, reservation.user_id)
        available = float(topup_info["topup_credits"])
        if available < from_topup:
            # Race: balance shrunk between reserve and commit. Deduct
            # whatever is left; log and move on (caller got service).
            logger.warning(
                "topup_race_partial_debit",
                user_id=reservation.user_id,
                expected=from_topup,
                available=available,
            )
            from_topup = available
        if from_topup > 0:
            await consume_topup(db, reservation.user_id, from_topup)

    # Invalidate plan cache so subsequent requests see fresh usage.
    await redis.delete(f"plan:{reservation.user_id}")

    # Threshold events are detected + emailed by the background loop
    # in `ai_credit_reminders.run_credit_reminders()` — the flags on
    # subscriptions (ai_credits_80_warning_sent_at, ai_credits_100_reached_at)
    # serve as idempotency markers updated AFTER the email is sent.


# ── Status query ─────────────────────────────────────────────

async def get_credits_status(
    db: asyncpg.Pool,
    user_id: str,
) -> dict:
    """Return the credit summary for the current period.

    Used by `/settings/agent-status` and the Credits dashboard page.
    Includes plan credits (this month) and top-up balance (long-lived).
    """
    from src.services.credit_topup import get_topup_balance

    sub = await db.fetchrow(
        "SELECT p.ai_credits_month, p.slug AS plan_slug "
        "FROM subscriptions s JOIN plans p ON p.id = s.plan_id "
        "WHERE s.user_id = $1 AND s.status IN ('active', 'trialing')",
        user_id,
    )
    byok = await db.fetchrow(
        "SELECT 1 FROM ai_config WHERE user_id = $1 AND encrypted_api_key IS NOT NULL",
        user_id,
    )
    has_byok = byok is not None
    topup = await get_topup_balance(db, user_id)

    if not sub:
        return {
            "has_byok": has_byok,
            "source": "byok" if has_byok else "none",
            "ai_credits_limit": 0,
            "ai_credits_used": 0.0,
            "ai_credits_remaining": 0.0,
            "topup_credits": topup["topup_credits"],
            "topup_expires_at": topup["topup_expires_at"],
        }

    limit = int(sub["ai_credits_month"])
    used = await _get_current_usage(db, user_id)
    remaining = max(0.0, limit - used) if limit != -1 else -1.0

    return {
        "has_byok": has_byok,
        "source": "byok" if has_byok else "system_key",
        "plan_slug": sub["plan_slug"],
        "ai_credits_limit": limit,
        "ai_credits_used": used,
        "ai_credits_remaining": remaining,
        "topup_credits": topup["topup_credits"],
        "topup_expires_at": topup["topup_expires_at"],
    }
