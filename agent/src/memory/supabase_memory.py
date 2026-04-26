import json

import asyncpg

from src.config import settings


class SupabaseMemory:
    """Long-term agent memory backed by PostgreSQL (agent_memory table)."""

    def __init__(self) -> None:
        self._pool: asyncpg.Pool | None = None

    @staticmethod
    async def _init_conn(conn: asyncpg.Connection) -> None:
        await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        await conn.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(
            settings.database_url, min_size=2, max_size=10, init=self._init_conn
        )

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()

    @property
    def pool(self) -> asyncpg.Pool:
        if not self._pool:
            raise RuntimeError("SupabaseMemory not connected")
        return self._pool

    async def get(self, user_id: str, key: str) -> dict | None:
        row = await self.pool.fetchrow(
            "SELECT value FROM agent_memory WHERE user_id = $1 AND key = $2",
            user_id,
            key,
        )
        return json.loads(row["value"]) if row else None

    async def set(self, user_id: str, key: str, value: dict) -> None:
        await self.pool.execute(
            """
            INSERT INTO agent_memory (user_id, key, value)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (user_id, key) DO UPDATE SET value = $3::jsonb, updated_at = now()
            """,
            user_id,
            key,
            json.dumps(value),
        )

    async def get_campaign_history(self, user_id: str, limit: int = 10) -> list[dict]:
        rows = await self.pool.fetch(
            """
            SELECT id, name, status, stats, completed_at
            FROM campaigns
            WHERE user_id = $1 AND status IN ('completed', 'failed')
            ORDER BY completed_at DESC NULLS LAST
            LIMIT $2
            """,
            user_id,
            limit,
        )
        return [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "status": r["status"],
                "stats": json.loads(r["stats"]) if isinstance(r["stats"], str) else r["stats"],
                "completed_at": r["completed_at"].isoformat() if r["completed_at"] else None,
            }
            for r in rows
        ]

    async def get_contacts_for_campaign(
        self,
        user_id: str,
        group_id: str | None = None,
        tags: list[str] | None = None,
        contact_ids: list[str] | None = None,
    ) -> list[dict]:
        if contact_ids:
            rows = await self.pool.fetch(
                """
                SELECT id, phone, name, language, tags, variables
                FROM contacts
                WHERE user_id = $1 AND opt_in = true AND id = ANY($2::uuid[])
                """,
                user_id,
                contact_ids,
            )
        elif group_id:
            rows = await self.pool.fetch(
                """
                SELECT c.id, c.phone, c.name, c.language, c.tags, c.variables
                FROM contacts c
                JOIN contact_group_members cgm ON cgm.contact_id = c.id
                WHERE c.user_id = $1 AND cgm.group_id = $2 AND c.opt_in = true
                """,
                user_id,
                group_id,
            )
        elif tags:
            rows = await self.pool.fetch(
                """
                SELECT id, phone, name, language, tags, variables
                FROM contacts
                WHERE user_id = $1 AND opt_in = true AND tags && $2::text[]
                """,
                user_id,
                tags,
            )
        else:
            rows = await self.pool.fetch(
                """
                SELECT id, phone, name, language, tags, variables
                FROM contacts
                WHERE user_id = $1 AND opt_in = true
                """,
                user_id,
            )
        return [
            {
                "id": str(r["id"]),
                "phone": r["phone"],
                "name": r["name"],
                "language": r["language"] or "it",
                "tags": r["tags"] or [],
                "variables": json.loads(r["variables"]) if isinstance(r["variables"], str) else (r["variables"] or {}),
            }
            for r in rows
        ]

    async def get_template(self, template_id: str) -> dict | None:
        row = await self.pool.fetchrow(
            "SELECT id, name, language, category, components, twilio_content_sid "
            "FROM templates WHERE id = $1",
            template_id,
        )
        if not row:
            return None
        return {
            "id": str(row["id"]),
            "name": row["name"],
            "language": row["language"],
            "category": row["category"],
            "components": json.loads(row["components"]) if isinstance(row["components"], str) else row["components"],
            "twilio_content_sid": row["twilio_content_sid"],
        }

    async def update_campaign_status(
        self, campaign_id: str, status: str, stats: dict | None = None
    ) -> None:
        if stats:
            await self.pool.execute(
                """
                UPDATE campaigns SET status = $2::campaign_status, stats = $3::jsonb,
                    started_at = CASE WHEN $2 = 'running' AND started_at IS NULL THEN now() ELSE started_at END,
                    completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN now() ELSE completed_at END,
                    updated_at = now()
                WHERE id = $1
                """,
                campaign_id,
                status,
                json.dumps(stats),
            )
        else:
            await self.pool.execute(
                """
                UPDATE campaigns SET status = $2::campaign_status,
                    started_at = CASE WHEN $2 = 'running' AND started_at IS NULL THEN now() ELSE started_at END,
                    completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN now() ELSE completed_at END,
                    updated_at = now()
                WHERE id = $1
                """,
                campaign_id,
                status,
            )

    async def create_message_records(
        self, campaign_id: str, contacts: list[dict]
    ) -> list[str]:
        message_ids = []
        for contact in contacts:
            row = await self.pool.fetchrow(
                """
                INSERT INTO messages (campaign_id, contact_id, status)
                VALUES ($1, $2, 'pending')
                RETURNING id
                """,
                campaign_id,
                contact["id"],
            )
            message_ids.append(str(row["id"]))
        return message_ids

    async def update_message_status(
        self,
        message_id: str,
        status: str,
        provider_message_id: str | None = None,
        error: str | None = None,
    ) -> None:
        await self.pool.execute(
            """
            UPDATE messages SET status = $2::message_status, provider_message_id = $3, error = $4,
                sent_at = CASE WHEN $2::message_status = 'sent' THEN now() ELSE sent_at END,
                delivered_at = CASE WHEN $2::message_status = 'delivered' THEN now() ELSE delivered_at END,
                read_at = CASE WHEN $2::message_status = 'read' THEN now() ELSE read_at END
            WHERE id = $1
            """,
            message_id,
            status,
            provider_message_id,
            error,
        )
