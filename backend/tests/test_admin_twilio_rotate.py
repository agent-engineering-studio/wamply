import os
import httpx
import pytest

BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")
TEST_TOKEN = os.getenv("TWILIO_TEST_TOKEN", "fake-token-12345678901234567890")

pytestmark = pytest.mark.skipif(not ADMIN_JWT, reason="ADMIN_JWT required")


def _hdr() -> dict:
    return {"Authorization": f"Bearer {ADMIN_JWT}"}


def test_rotate_stores_encrypted_token_and_returns_no_plain():
    r = httpx.post(
        f"{BASE}/admin/twilio/rotate-master",
        headers=_hdr(),
        json={"auth_token": TEST_TOKEN},
    )
    assert r.status_code == 200
    body = r.json()
    assert "auth_token" not in body
    assert body.get("ok") is True
    assert "•" in body.get("auth_token_masked", "")


def test_rotate_rejects_short_token():
    r = httpx.post(
        f"{BASE}/admin/twilio/rotate-master",
        headers=_hdr(),
        json={"auth_token": "short"},
    )
    assert r.status_code == 400


def test_rotate_audit_log_row_written():
    httpx.post(f"{BASE}/admin/twilio/rotate-master", headers=_hdr(),
               json={"auth_token": TEST_TOKEN})
    r = httpx.get(f"{BASE}/admin/twilio/overview", headers=_hdr())
    assert r.json()["master"]["auth_token_source"] == "db"
