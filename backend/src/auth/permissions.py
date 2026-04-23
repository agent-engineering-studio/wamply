from fastapi import Depends, HTTPException

from src.auth.jwt import CurrentUser, get_current_user


async def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Accesso riservato agli amministratori.")
    return user


async def require_staff(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role not in ("admin", "collaborator", "sales"):
        raise HTTPException(status_code=403, detail="Accesso riservato allo staff.")
    return user


async def get_role_permissions(db, role: str) -> set[str]:
    """Return the set of permission strings for a given role."""
    rows = await db.fetch(
        "SELECT permission FROM role_permissions WHERE role = $1::user_role",
        role,
    )
    return {r["permission"] for r in rows}


async def has_permission(db, user_role: str, permission: str) -> bool:
    """True if the role has the wildcard or the exact permission."""
    perms = await get_role_permissions(db, user_role)
    return "*" in perms or permission in perms
