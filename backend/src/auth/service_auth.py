from fastapi import HTTPException, Request

from src.config import settings
from src.dependencies import get_db
from src.auth.jwt import CurrentUser


async def get_service_user(request: Request) -> CurrentUser:
    agent_secret = request.headers.get("X-Agent-Secret")
    if agent_secret != settings.agent_secret:
        raise HTTPException(status_code=401, detail="Invalid agent secret.")

    user_id = request.headers.get("X-On-Behalf-Of")
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing X-On-Behalf-Of header.")

    db = get_db(request)
    row = await db.fetchrow(
        "SELECT id, email, role::text, full_name FROM users WHERE id = $1",
        user_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found.")

    return CurrentUser(id=str(row["id"]), email=row["email"], role=row["role"], full_name=row["full_name"])
