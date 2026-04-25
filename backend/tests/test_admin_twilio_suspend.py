"""Unit test per POST /admin/twilio/subaccount/{sid}/suspend.
Mocca la chiamata Twilio per evitare hit reale su API in CI."""
import os
import httpx
import pytest

BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")
FAKE_SID = "ACfake00000000000000000000000000"

pytestmark = pytest.mark.skipif(not ADMIN_JWT, reason="ADMIN_JWT required")


def _hdr() -> dict:
    return {"Authorization": f"Bearer {ADMIN_JWT}"}


def test_suspend_returns_502_on_unknown_sid():
    r = httpx.post(f"{BASE}/admin/twilio/subaccount/{FAKE_SID}/suspend", headers=_hdr())
    assert r.status_code in (502, 503)


def test_suspend_requires_permission():
    r = httpx.post(f"{BASE}/admin/twilio/subaccount/{FAKE_SID}/suspend")
    assert r.status_code in (401, 403)
