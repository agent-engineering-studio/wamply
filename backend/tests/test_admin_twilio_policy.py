import os
import httpx
import pytest

BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")

pytestmark = pytest.mark.skipif(not ADMIN_JWT, reason="ADMIN_JWT required")


def _hdr() -> dict:
    return {"Authorization": f"Bearer {ADMIN_JWT}"}


def test_patch_policy_updates_autocreate():
    r = httpx.patch(
        f"{BASE}/admin/twilio/policy",
        headers=_hdr(),
        json={"auto_create_subaccount_on_signup": False},
    )
    assert r.status_code == 200
    assert r.json()["policy"]["auto_create_subaccount_on_signup"] is False
    # ripristina
    httpx.patch(f"{BASE}/admin/twilio/policy", headers=_hdr(),
                json={"auto_create_subaccount_on_signup": True})


def test_patch_policy_rejects_unknown_field():
    r = httpx.patch(
        f"{BASE}/admin/twilio/policy",
        headers=_hdr(),
        json={"evil_field": "payload"},
    )
    assert r.status_code == 400


def test_patch_policy_number_pool():
    r = httpx.patch(
        f"{BASE}/admin/twilio/policy",
        headers=_hdr(),
        json={"number_pool": ["+3902XXX", "+3906YYY"]},
    )
    assert r.status_code == 200
    assert r.json()["policy"]["number_pool"] == ["+3902XXX", "+3906YYY"]
    httpx.patch(f"{BASE}/admin/twilio/policy", headers=_hdr(), json={"number_pool": []})
