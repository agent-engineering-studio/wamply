import pytest
from unittest.mock import AsyncMock, patch

from src.services.plan_migration_emails import (
    _compute_new_features,
    send_migration_notice,
)


def test_compute_new_features_starter_to_essenziale():
    old = {"compliance_check": True}
    new = {"compliance_check": True, "generate": True, "improve": True}
    added = _compute_new_features(old, new)
    assert "generate" in added
    assert "improve" in added
    assert "compliance_check" not in added


def test_compute_new_features_empty_when_no_change():
    assert _compute_new_features({"generate": True}, {"generate": True}) == set()


@pytest.mark.asyncio
async def test_send_migration_notice_returns_false_on_smtp_error():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={
        "email": "u@test.com", "full_name": "Test",
        "old_name": "Starter", "new_name": "Essenziale",
        "old_features": {"compliance_check": True},
        "new_features": {"compliance_check": True, "generate": True, "improve": True},
        "price_cents": 4900, "msg_included": 300,
    })
    with patch("src.services.plan_migration_emails._send_email", side_effect=OSError("smtp")):
        ok = await send_migration_notice(db, "uid")
    assert ok is False
