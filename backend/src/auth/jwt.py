from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from src.config import settings
from src.dependencies import get_db

security = HTTPBearer()


class CurrentUser:
    def __init__(self, id: str, email: str, role: str, full_name: str | None):
        self.id = id
        self.email = email
        self.role = role
        self.full_name = full_name


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> CurrentUser:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], audience="authenticated")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token non valido.")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token non valido.")

    db = get_db(request)
    row = await db.fetchrow(
        "SELECT id, email, role::text, full_name FROM users WHERE id = $1",
        user_id,
    )
    if not row:
        raise HTTPException(status_code=401, detail="Utente non trovato.")

    return CurrentUser(id=str(row["id"]), email=row["email"], role=row["role"], full_name=row["full_name"])
