import pytest
from unittest.mock import AsyncMock
from src.services.quota_enforcement import (
    check_message_quota,
    compute_cost_breakdown,
)


@pytest.mark.asyncio
async def test_under_quota_no_overage():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={
        "msg_included": 1000,
        "overage_rates": {"marketing": 0.08, "utility": 0.045, "free_form": 0.01},
    })
    db.fetchval = AsyncMock(return_value=500)  # already used this month
    result = await check_message_quota(
        db, user_id="u1", msg_count=200, category="marketing"
    )
    assert result["overage_count"] == 0
    assert result["overage_cost_eur"] == 0.0
    assert result["within_quota"] == 200
    assert result["quota_remaining_before_send"] == 500


@pytest.mark.asyncio
async def test_partial_overage_marketing():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={
        "msg_included": 1000,
        "overage_rates": {"marketing": 0.08, "utility": 0.045, "free_form": 0.01},
    })
    db.fetchval = AsyncMock(return_value=900)
    result = await check_message_quota(
        db, user_id="u1", msg_count=200, category="marketing"
    )
    assert result["within_quota"] == 100
    assert result["overage_count"] == 100
    assert result["overage_cost_eur"] == pytest.approx(8.0, rel=0.001)


@pytest.mark.asyncio
async def test_full_overage_no_quota_left():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={
        "msg_included": 1000,
        "overage_rates": {"marketing": 0.07, "utility": 0.04, "free_form": 0.01},
    })
    db.fetchval = AsyncMock(return_value=1500)  # already over quota
    result = await check_message_quota(
        db, user_id="u1", msg_count=100, category="utility"
    )
    assert result["within_quota"] == 0
    assert result["overage_count"] == 100
    assert result["overage_cost_eur"] == pytest.approx(4.0, rel=0.001)


@pytest.mark.asyncio
async def test_no_subscription_falls_back_to_zero_quota_default_rates():
    """User without active subscription is treated as zero-quota.
    Default overage rates use the Avvio piano rates."""
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value=None)
    db.fetchval = AsyncMock(return_value=0)
    result = await check_message_quota(
        db, user_id="u1", msg_count=10, category="marketing"
    )
    assert result["within_quota"] == 0
    assert result["overage_count"] == 10
    assert result["overage_cost_eur"] == pytest.approx(0.9, rel=0.001)


def test_compute_breakdown_mixed_categories():
    rates = {"marketing": 0.08, "utility": 0.045, "free_form": 0.01}
    breakdown = compute_cost_breakdown(
        counts={"marketing": 100, "utility": 50, "free_form": 30},
        rates=rates,
    )
    expected = 100 * 0.08 + 50 * 0.045 + 30 * 0.01
    assert breakdown["total_eur"] == pytest.approx(expected, rel=0.001)
    assert breakdown["by_category"]["marketing"] == pytest.approx(8.0, rel=0.001)
    assert breakdown["by_category"]["utility"] == pytest.approx(2.25, rel=0.001)
    assert breakdown["by_category"]["free_form"] == pytest.approx(0.3, rel=0.001)


def test_compute_breakdown_unknown_category_uses_zero():
    rates = {"marketing": 0.08}
    breakdown = compute_cost_breakdown(
        counts={"marketing": 10, "mystery": 20},
        rates=rates,
    )
    assert breakdown["by_category"]["marketing"] == pytest.approx(0.8, rel=0.001)
    assert breakdown["by_category"]["mystery"] == 0.0
    assert breakdown["total_eur"] == pytest.approx(0.8, rel=0.001)
