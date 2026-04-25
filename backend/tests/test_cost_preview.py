"""Cost preview endpoint tests — integration-style, skipped without env.
Set ADMIN_JWT and TEST_CAMPAIGN_ID to enable the positive-path test locally.
"""
import os
import pytest
import httpx

BASE = os.getenv("API_BASE", "http://localhost:8000")
ADMIN_JWT = os.getenv("ADMIN_JWT")
CAMPAIGN_ID = os.getenv("TEST_CAMPAIGN_ID")


@pytest.mark.skipif(not (ADMIN_JWT and CAMPAIGN_ID), reason="Requires ADMIN_JWT + TEST_CAMPAIGN_ID")
def test_cost_preview_returns_breakdown():
    r = httpx.get(
        f"{BASE}/campaigns/{CAMPAIGN_ID}/cost-preview",
        headers={"Authorization": f"Bearer {ADMIN_JWT}"},
    )
    assert r.status_code == 200
    body = r.json()
    for key in (
        "msg_count", "within_quota", "overage_count",
        "overage_category", "overage_cost_eur",
        "quota_remaining_before_send", "template_category",
    ):
        assert key in body
    assert body["overage_category"] in ("marketing", "utility", "free_form")
    assert body["overage_count"] >= 0
    assert body["overage_cost_eur"] >= 0


@pytest.mark.skipif(not ADMIN_JWT, reason="Requires ADMIN_JWT")
def test_cost_preview_404_on_unknown_campaign():
    r = httpx.get(
        f"{BASE}/campaigns/00000000-0000-0000-0000-000000000000/cost-preview",
        headers={"Authorization": f"Bearer {ADMIN_JWT}"},
    )
    assert r.status_code == 404
