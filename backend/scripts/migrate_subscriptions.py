"""One-shot migration: notify every active paying user about the new plan
naming + included features. Idempotent via audit_log.

Run with: python -m scripts.migrate_subscriptions
"""
import asyncio
import asyncpg
import os
import structlog

from src.services.plan_migration_emails import send_migration_notice

logger = structlog.get_logger()


async def main():
    dsn = os.environ["DATABASE_URL"]
    pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=5)
    try:
        async with pool.acquire() as conn:
            users = await conn.fetch("""
                SELECT u.id FROM users u
                JOIN subscriptions s ON s.user_id = u.id
                WHERE s.status = 'active'
                  AND u.id NOT IN (
                    SELECT target_id::uuid FROM audit_log
                    WHERE action = 'plan_migration_notice'
                  )
            """)
        logger.info("plan_migration_start", count=len(users))
        for u in users:
            uid = str(u["id"])
            ok = await send_migration_notice(pool, uid)
            if ok:
                async with pool.acquire() as conn:
                    await conn.execute(
                        "INSERT INTO audit_log (action, target_id) VALUES ('plan_migration_notice', $1)",
                        uid,
                    )
            logger.info("plan_migration_user", user_id=uid, sent=ok)
        logger.info("plan_migration_done")
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
