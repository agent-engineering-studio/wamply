import asyncio
from contextlib import asynccontextmanager

import asyncpg
import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.router import api_router
from src.config import settings
from src.services.trial_reminders import send_trial_reminders
from src.services.ai_credit_reminders import run_credit_reminders

logger = structlog.get_logger()

db_pool: asyncpg.Pool | None = None
redis_client: aioredis.Redis | None = None

TRIAL_REMINDER_INTERVAL_SECONDS = 3600   # 1 hour
CREDIT_REMINDER_INTERVAL_SECONDS = 3600  # 1 hour


async def _trial_reminder_loop(pool: asyncpg.Pool) -> None:
    """Background loop: every hour, send due trial reminders."""
    await asyncio.sleep(30)
    while True:
        try:
            result = await send_trial_reminders(pool)
            if result["3d"] or result["1d"] or result["errors"]:
                logger.info("trial_reminders_run", **result)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("trial_reminders_loop_error", error=str(exc))
        await asyncio.sleep(TRIAL_REMINDER_INTERVAL_SECONDS)


async def _credit_reminder_loop(pool: asyncpg.Pool) -> None:
    """Background loop: every hour, send 80%/100% credit threshold emails."""
    # Offset by 45s so the two loops don't hit the DB simultaneously.
    await asyncio.sleep(45)
    while True:
        try:
            result = await run_credit_reminders(pool)
            if result["80"] or result["100"] or result["errors"]:
                logger.info("ai_credit_reminders_run", **result)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("ai_credit_reminders_loop_error", error=str(exc))
        await asyncio.sleep(CREDIT_REMINDER_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool, redis_client
    logger.info("Starting backend", database=settings.database_url[:30])
    db_pool = await asyncpg.create_pool(settings.database_url, min_size=2, max_size=10)
    redis_client = aioredis.from_url(settings.redis_url, decode_responses=True)
    app.state.db_pool = db_pool
    app.state.redis_client = redis_client

    trial_task = asyncio.create_task(_trial_reminder_loop(db_pool))
    credit_task = asyncio.create_task(_credit_reminder_loop(db_pool))

    yield

    for task in (trial_task, credit_task):
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

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


app.include_router(api_router)


@app.exception_handler(RequestValidationError)
async def _validation_error_handler(request: Request, exc: RequestValidationError):
    """Log the body-validation diagnostics so we can debug 422s end-to-end.
    The body still mirrors FastAPI's default shape so clients keep working."""
    logger.warning(
        "request_validation_error",
        path=str(request.url.path),
        method=request.method,
        content_type=request.headers.get("content-type"),
        errors=exc.errors(),
    )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.get("/health")
async def health():
    return {"status": "ok", "service": "wcm-backend"}
