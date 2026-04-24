import pytest
from unittest.mock import AsyncMock

from src.services.ai_feature_gating import require_ai_feature, AIFeatureForbidden


@pytest.mark.asyncio
async def test_allows_when_plan_has_feature():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={
        "ai_features": {"compliance_check": True, "generate": True}
    })
    # Must not raise
    await require_ai_feature(db, "u1", "generate")


@pytest.mark.asyncio
async def test_forbids_when_plan_lacks_feature():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={"ai_features": {"compliance_check": True}})
    with pytest.raises(AIFeatureForbidden) as exc:
        await require_ai_feature(db, "u1", "generate")
    assert exc.value.status_code == 403
    assert "generate" in exc.value.detail


@pytest.mark.asyncio
async def test_forbids_when_no_subscription():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value=None)
    with pytest.raises(AIFeatureForbidden):
        await require_ai_feature(db, "u1", "generate")


@pytest.mark.asyncio
async def test_allows_wildcard_in_ai_features():
    """If a plan has the '*' wildcard it grants every feature.
    This is a forward-compat hook for Enterprise; today the matrix is explicit."""
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={"ai_features": {"*": True}})
    await require_ai_feature(db, "u1", "translate")
