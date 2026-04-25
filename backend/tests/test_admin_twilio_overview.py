"""Integration test per GET /admin/twilio/overview.
Richiede: ADMIN_JWT + backend running. Pattern identico a test_admin_role_change.py."""
import os
import httpx
import pytest

BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")

pytestmark = pytest.mark.skipif(not ADMIN_JWT, reason="ADMIN_JWT required")


def _hdr() -> dict:
    return {"Authorization": f"Bearer {ADMIN_JWT}"}


def test_overview_returns_config_and_policy():
    r = httpx.get(f"{BASE}/admin/twilio/overview", headers=_hdr())
    assert r.status_code == 200
    body = r.json()
    assert "master" in body
    assert "policy" in body
    assert "subaccounts" in body
    assert "connection_ok" in body
    master = body["master"]
    if "auth_token_masked" in master:
        assert "•" in master["auth_token_masked"] or master["auth_token_masked"] == ""
    assert "auth_token" not in master


def test_overview_policy_shape():
    r = httpx.get(f"{BASE}/admin/twilio/overview", headers=_hdr())
    policy = r.json()["policy"]
    assert "auto_create_subaccount_on_signup" in policy
    assert "default_region" in policy
    assert "number_pool" in policy


def test_overview_subaccounts_is_list():
    r = httpx.get(f"{BASE}/admin/twilio/overview", headers=_hdr())
    subs = r.json()["subaccounts"]
    assert isinstance(subs, list)
    for s in subs:
        assert "subaccount_sid" in s
        assert "messages_month" in s
        assert "est_cost_eur" in s
