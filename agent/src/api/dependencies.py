"""FastAPI dependencies for auth and shared resources."""

from fastapi import Header, HTTPException

from src.config import settings


async def verify_agent_secret(
    x_agent_secret: str = Header(..., alias="X-Agent-Secret"),
) -> None:
    if x_agent_secret != settings.agent_secret:
        raise HTTPException(status_code=401, detail="Invalid agent secret")
