"""Integration tests for GET /admin/me/permissions.

Runs against the dev backend. Requires ADMIN_JWT in the env; COLLAB_JWT
and USER_JWT are optional (their tests are skipped if missing).
"""

import os

import httpx
import pytest


BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")

pytestmark = pytest.mark.skipif(not ADMIN_JWT, reason="ADMIN_JWT env var required")


def test_admin_me_permissions_returns_wildcard():
    r = httpx.get(
        f"{BASE}/admin/me/permissions",
        headers={"Authorization": f"Bearer {ADMIN_JWT}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "admin"
    assert "*" in body["permissions"]


def test_collaborator_me_permissions_returns_subset():
    collab_jwt = os.getenv("COLLAB_JWT")
    if not collab_jwt:
        pytest.skip("COLLAB_JWT env var required")
    r = httpx.get(
        f"{BASE}/admin/me/permissions",
        headers={"Authorization": f"Bearer {collab_jwt}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "collaborator"
    assert "admin.whatsapp.manage" in body["permissions"]
    assert "admin.ai_key.configure" not in body["permissions"]


def test_me_permissions_requires_staff():
    user_jwt = os.getenv("USER_JWT")
    if not user_jwt:
        pytest.skip("USER_JWT env var required")
    r = httpx.get(
        f"{BASE}/admin/me/permissions",
        headers={"Authorization": f"Bearer {user_jwt}"},
    )
    assert r.status_code == 403
