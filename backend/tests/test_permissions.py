import pytest
from unittest.mock import AsyncMock

from src.auth.permissions import get_role_permissions, has_permission


@pytest.mark.asyncio
async def test_has_permission_admin_wildcard():
    db = AsyncMock()
    db.fetch = AsyncMock(return_value=[{"permission": "*"}])
    assert await has_permission(db, "admin", "admin.anything.anywhere") is True


@pytest.mark.asyncio
async def test_has_permission_collaborator_exact_match():
    db = AsyncMock()
    db.fetch = AsyncMock(return_value=[
        {"permission": "admin.users.view"},
        {"permission": "admin.whatsapp.manage"},
    ])
    assert await has_permission(db, "collaborator", "admin.whatsapp.manage") is True


@pytest.mark.asyncio
async def test_has_permission_collaborator_missing():
    db = AsyncMock()
    db.fetch = AsyncMock(return_value=[{"permission": "admin.users.view"}])
    assert await has_permission(db, "collaborator", "admin.ai_key.configure") is False


@pytest.mark.asyncio
async def test_get_role_permissions_returns_set():
    db = AsyncMock()
    db.fetch = AsyncMock(return_value=[
        {"permission": "admin.ai_costs.view"},
        {"permission": "admin.ai_revenue.view"},
    ])
    result = await get_role_permissions(db, "sales")
    assert result == {"admin.ai_costs.view", "admin.ai_revenue.view"}
