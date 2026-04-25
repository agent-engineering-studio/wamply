import os, pytest, httpx

BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")
pytestmark = pytest.mark.skipif(not ADMIN_JWT, reason="ADMIN_JWT required")

def test_patch_unknown_business_returns_404():
    r = httpx.patch(
        f"{BASE}/admin/businesses/00000000-0000-0000-0000-000000000000/status",
        headers={"Authorization": f"Bearer {ADMIN_JWT}"},
        json={"status": "approved"},
    )
    assert r.status_code == 404

def test_patch_invalid_status_returns_422():
    r = httpx.patch(
        f"{BASE}/admin/businesses/00000000-0000-0000-0000-000000000000/status",
        headers={"Authorization": f"Bearer {ADMIN_JWT}"},
        json={"status": "banana"},
    )
    assert r.status_code in (400, 422)
