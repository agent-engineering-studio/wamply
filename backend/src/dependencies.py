from fastapi import Request
import asyncpg
import redis.asyncio as aioredis


def get_db(request: Request) -> asyncpg.Pool:
    return request.app.state.db_pool


def get_redis(request: Request) -> aioredis.Redis:
    return request.app.state.redis_client
