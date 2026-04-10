"""Redis BRPOP queue consumer for campaign jobs."""

import asyncio

from src.memory.redis_memory import RedisMemory
from src.memory.supabase_memory import SupabaseMemory
from src.agents.workflow import run_campaign_workflow
from src.utils.telemetry import log


class QueueConsumer:
    def __init__(self, db: SupabaseMemory, redis: RedisMemory) -> None:
        self.db = db
        self.redis = redis
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._consume_loop())
        await log.ainfo("queue_consumer_started")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await log.ainfo("queue_consumer_stopped")

    async def _consume_loop(self) -> None:
        while self._running:
            try:
                campaign_id = await self.redis.dequeue_campaign(timeout=5)
                if campaign_id:
                    await log.ainfo("campaign_dequeued", campaign_id=campaign_id)
                    try:
                        await run_campaign_workflow(self.db, self.redis, campaign_id)
                    except Exception as e:
                        await log.aerror(
                            "campaign_workflow_error",
                            campaign_id=campaign_id,
                            error=str(e),
                        )
            except asyncio.CancelledError:
                break
            except Exception as e:
                await log.aerror("queue_consumer_error", error=str(e))
                await asyncio.sleep(1)
