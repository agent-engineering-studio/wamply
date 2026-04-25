"""Message quota enforcement + overage cost computation.

Used by campaign dispatch and by the cost-preview endpoint to tell the user
how much a campaign will cost BEFORE they confirm send.

Rates are stored per-plan in plans.overage_rates (EUR/message) and read at
runtime — a migration or admin edit automatically propagates without code
changes.
"""

from typing import Literal

import asyncpg

MessageCategory = Literal["marketing", "utility", "free_form"]


# Fallback used when the caller has no active subscription. Mirrors the
# Avvio piano rates defined in supabase/migrations/026_plan_restructure.sql.
_DEFAULT_RATES = {"marketing": 0.09, "utility": 0.05, "free_form": 0.01}


async def _get_user_plan(db: asyncpg.Pool, user_id: str) -> dict:
    """Fetch quota fields of the user's active plan. Falls back to zero-quota
    + Avvio rates when no active subscription (new signup / cancelled)."""
    row = await db.fetchrow(
        """SELECT p.msg_included, p.overage_rates
           FROM subscriptions s
           JOIN plans p ON p.id = s.plan_id
           WHERE s.user_id = $1 AND s.status = 'active'
           LIMIT 1""",
        user_id,
    )
    if not row:
        return {"msg_included": 0, "overage_rates": dict(_DEFAULT_RATES)}
    return {
        "msg_included": row["msg_included"],
        "overage_rates": dict(row["overage_rates"]),
    }


async def _get_month_usage(db: asyncpg.Pool, user_id: str) -> int:
    val = await db.fetchval(
        """SELECT COALESCE(messages_used, 0)
           FROM usage_counters
           WHERE user_id = $1
             AND period_start = date_trunc('month', now())::date""",
        user_id,
    )
    return int(val or 0)


def compute_cost_breakdown(counts: dict[str, int], rates: dict[str, float]) -> dict:
    """Pure: compute total + per-category costs from msg counts.
    Unknown categories default to 0.0 rate (no charge)."""
    by_category: dict[str, float] = {}
    total = 0.0
    for cat, n in counts.items():
        r = float(rates.get(cat, 0.0))
        cost = n * r
        by_category[cat] = round(cost, 4)
        total += cost
    return {"by_category": by_category, "total_eur": round(total, 4)}


async def check_message_quota(
    db: asyncpg.Pool,
    user_id: str,
    msg_count: int,
    category: MessageCategory,
) -> dict:
    """For a prospective send of N messages, return quota split + overage cost."""
    plan = await _get_user_plan(db, user_id)
    used = await _get_month_usage(db, user_id)
    remaining = max(0, plan["msg_included"] - used)

    within_quota = min(msg_count, remaining)
    overage_count = msg_count - within_quota

    overage_cost = 0.0
    if overage_count > 0:
        rate = float(plan["overage_rates"].get(category, 0.0))
        overage_cost = round(overage_count * rate, 4)

    return {
        "msg_count": msg_count,
        "within_quota": within_quota,
        "overage_count": overage_count,
        "overage_category": category,
        "overage_cost_eur": overage_cost,
        "quota_remaining_before_send": remaining,
    }
