from contextlib import asynccontextmanager

import asyncpg
import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings

logger = structlog.get_logger()

db_pool: asyncpg.Pool | None = None
redis_client: aioredis.Redis | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool, redis_client
    logger.info("Starting backend", database=settings.database_url[:30])
    db_pool = await asyncpg.create_pool(settings.database_url, min_size=2, max_size=10)
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    app.state.db_pool = db_pool
    app.state.redis_client = redis_client
    yield
    if db_pool:
        await db_pool.close()
    if redis_client:
        await redis_client.aclose()
    logger.info("Backend shutdown")


app = FastAPI(title="Wamply Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "wcm-backend"}
