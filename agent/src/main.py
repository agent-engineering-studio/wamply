"""WCM Agent — FastAPI application with queue consumer."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.config import settings
from src.memory.redis_memory import RedisMemory
from src.memory.supabase_memory import SupabaseMemory
from src.worker.queue_consumer import QueueConsumer
from src.api.router import api_router
from src.api.endpoints.campaigns import set_resources as set_campaign_resources
from src.api.endpoints.chat import set_resources as set_chat_resources
from src.utils.telemetry import setup_logging, log

_db = SupabaseMemory()
_redis = RedisMemory()
_consumer = QueueConsumer(_db, _redis)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_logging()
    await log.ainfo("agent_starting", mock_llm=settings.mock_llm)

    await _db.connect()
    await _redis.connect()
    set_campaign_resources(_db, _redis)
    set_chat_resources(_db, _redis)
    await _consumer.start()

    await log.ainfo("agent_ready")
    yield

    # Shutdown
    await log.ainfo("agent_shutting_down")
    await _consumer.stop()
    await _redis.close()
    await _db.close()


app = FastAPI(
    title="WCM Agent",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(api_router)
