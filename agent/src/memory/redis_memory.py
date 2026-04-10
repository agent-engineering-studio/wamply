import json

import redis.asyncio as redis

from src.config import settings
from src.utils.telemetry import log

CAMPAIGN_TTL = 86400  # 24 hours


class RedisMemory:
    """Campaign session memory with TTL 24h."""

    def __init__(self) -> None:
        self._redis: redis.Redis | None = None

    async def connect(self) -> None:
        self._redis = redis.from_url(
            settings.redis_url, decode_responses=True
        )

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()

    @property
    def client(self) -> redis.Redis:
        if not self._redis:
            raise RuntimeError("RedisMemory not connected")
        return self._redis

    async def get_state(self, campaign_id: str) -> dict | None:
        raw = await self.client.get(f"campaign:{campaign_id}:state")
        return json.loads(raw) if raw else None

    async def set_state(self, campaign_id: str, state: dict) -> None:
        await self.client.set(
            f"campaign:{campaign_id}:state",
            json.dumps(state),
            ex=CAMPAIGN_TTL,
        )

    async def get_progress(self, campaign_id: str) -> dict:
        raw = await self.client.get(f"campaign:{campaign_id}:progress")
        return json.loads(raw) if raw else {"sent": 0, "failed": 0, "total": 0}

    async def update_progress(
        self, campaign_id: str, sent: int = 0, failed: int = 0, total: int | None = None
    ) -> dict:
        progress = await self.get_progress(campaign_id)
        progress["sent"] += sent
        progress["failed"] += failed
        if total is not None:
            progress["total"] = total
        await self.client.set(
            f"campaign:{campaign_id}:progress",
            json.dumps(progress),
            ex=CAMPAIGN_TTL,
        )
        return progress

    async def enqueue_campaign(self, campaign_id: str) -> None:
        await self.client.lpush("queue:campaigns", campaign_id)
        await log.ainfo("campaign_enqueued", campaign_id=campaign_id)

    async def dequeue_campaign(self, timeout: int = 0) -> str | None:
        result = await self.client.brpop("queue:campaigns", timeout=timeout)
        return result[1] if result else None

    async def is_paused(self, campaign_id: str) -> bool:
        return await self.client.exists(f"campaign:{campaign_id}:paused") > 0

    async def pause(self, campaign_id: str) -> None:
        await self.client.set(f"campaign:{campaign_id}:paused", "1", ex=CAMPAIGN_TTL)

    async def resume(self, campaign_id: str) -> None:
        await self.client.delete(f"campaign:{campaign_id}:paused")
