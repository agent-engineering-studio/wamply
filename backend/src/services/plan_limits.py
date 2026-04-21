import json
from datetime import date, datetime, timezone

import asyncpg
import redis.asyncio as aioredis
from fastapi import HTTPException

CACHE_TTL = 300


async def check_plan_limit(
    db: asyncpg.Pool,
    redis: aioredis.Redis,
    user_id: str,
    resource: str,
) -> dict:
    cache_key = f"plan:{user_id}"
    cached = await redis.get(cache_key)

    if cached:
        ctx = json.loads(cached)
    else:
        sub = await db.fetchrow(
            "SELECT plan_id, status::text, current_period_end "
            "FROM subscriptions WHERE user_id = $1 "
            "  AND status IN ('active', 'trialing')",
            user_id,
        )

        # Lazy trial expiration: downgrade to 'free' (zero limits → all API blocked).
        if sub and sub["status"] == "trialing" and sub["current_period_end"] <= datetime.now(timezone.utc):
            free_plan = await db.fetchrow(
                "SELECT id FROM plans WHERE slug = 'free' LIMIT 1"
            )
            if free_plan:
                await db.execute(
                    "UPDATE subscriptions SET plan_id = $1, status = 'active', "
                    "current_period_start = now(), current_period_end = NULL, "
                    "updated_at = now() WHERE user_id = $2",
                    free_plan["id"],
                    user_id,
                )
                sub = await db.fetchrow(
                    "SELECT plan_id, status::text, current_period_end "
                    "FROM subscriptions WHERE user_id = $1",
                    user_id,
                )

        if not sub:
            raise HTTPException(status_code=402, detail="Nessun abbonamento attivo. Scegli un piano.")

        plan = await db.fetchrow("SELECT * FROM plans WHERE id = $1", sub["plan_id"])
        if not plan:
            raise HTTPException(status_code=500, detail="Piano non trovato.")

        usage = await db.fetchrow(
            "SELECT campaigns_used, messages_used, contacts_count, ai_template_ops_used "
            "FROM usage_counters WHERE user_id = $1 AND period_start = $2",
            user_id,
            date.today(),
        )

        ctx = {
            "plan": dict(plan),
            "usage": dict(usage) if usage else {
                "campaigns_used": 0, "messages_used": 0,
                "contacts_count": 0, "ai_template_ops_used": 0,
            },
        }
        # Convert non-serializable types for JSON
        for k, v in ctx["plan"].items():
            if isinstance(v, date):
                ctx["plan"][k] = v.isoformat()
            elif hasattr(v, "hex"):  # UUID
                ctx["plan"][k] = str(v)
            elif not isinstance(v, (str, int, float, bool, type(None), list, dict)):
                ctx["plan"][k] = str(v)

        await redis.set(cache_key, json.dumps(ctx), ex=CACHE_TTL)

    limit_map = {
        "campaigns": (ctx["plan"]["max_campaigns_month"], ctx["usage"]["campaigns_used"]),
        "messages": (ctx["plan"]["max_messages_month"], ctx["usage"]["messages_used"]),
        "contacts": (ctx["plan"]["max_contacts"], ctx["usage"]["contacts_count"]),
        "templates": (ctx["plan"]["max_templates"], 0),
        "team_members": (ctx["plan"]["max_team_members"], 0),
        "ai_template_ops": (
            ctx["plan"]["max_ai_template_ops_month"],
            ctx["usage"]["ai_template_ops_used"],
        ),
    }

    limit, used = limit_map.get(resource, (0, 0))
    if limit != -1 and used >= limit:
        suggested = await db.fetchrow(
            "SELECT slug FROM plans WHERE price_cents > $1 ORDER BY price_cents LIMIT 1",
            ctx["plan"]["price_cents"],
        )
        raise HTTPException(
            status_code=402,
            detail=f"Hai raggiunto il limite del piano {ctx['plan']['name']} per {resource}.",
            headers={"X-Suggested-Plan": suggested["slug"] if suggested else ""},
        )

    return ctx


async def increment_ai_template_ops(
    db: asyncpg.Pool,
    redis: aioredis.Redis,
    user_id: str,
) -> None:
    """Increment AI template ops counter and invalidate plan cache."""
    await db.execute(
        """INSERT INTO usage_counters (user_id, period_start, ai_template_ops_used)
           VALUES ($1, CURRENT_DATE, 1)
           ON CONFLICT (user_id, period_start)
           DO UPDATE SET ai_template_ops_used = usage_counters.ai_template_ops_used + 1""",
        user_id,
    )
    await redis.delete(f"plan:{user_id}")
