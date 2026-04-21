from fastapi import Depends, HTTPException

from src.auth.jwt import CurrentUser, get_current_user


async def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Accesso riservato agli amministratori.")
    return user


async def require_staff(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role not in ("admin", "collaborator"):
        raise HTTPException(status_code=403, detail="Accesso riservato allo staff.")
    return user
