from fastapi import Depends, HTTPException

from src.auth.jwt import CurrentUser, get_current_user


async def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Accesso riservato agli amministratori.")
    return user
