"""Integration tests for PATCH /admin/users/:user_id/role.

Runs against the dev backend. Requires the following env vars:
  ADMIN_JWT   - JWT of a user with role='admin'
  TARGET_UID  - id of a user we can mutate (role='user' initially)
  BASE_URL    - e.g. http://localhost:8200 (backend direct) or via Kong

The tests re-seed TARGET_UID back to role='user' after each run.
"""

import os

import httpx
import pytest


BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")
TARGET_UID = os.getenv("TARGET_UID", "")


pytestmark = pytest.mark.skipif(
    not ADMIN_JWT or not TARGET_UID,
    reason="ADMIN_JWT and TARGET_UID env vars required",
)


def _hdr() -> dict:
    return {"Authorization": f"Bearer {ADMIN_JWT}"}


@pytest.fixture(autouse=True)
def _reset_role():
    yield
    httpx.patch(
        f"{BASE}/admin/users/{TARGET_UID}/role",
        headers=_hdr(),
        json={"role": "user"},
    )


def test_admin_promotes_user_to_collaborator():
    r = httpx.patch(
        f"{BASE}/admin/users/{TARGET_UID}/role",
        headers=_hdr(),
        json={"role": "collaborator"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "collaborator"
    assert r.json()["previous_role"] == "user"


def test_admin_promotes_user_to_sales():
    r = httpx.patch(
        f"{BASE}/admin/users/{TARGET_UID}/role",
        headers=_hdr(),
        json={"role": "sales"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "sales"


def test_admin_lateral_collaborator_to_sales():
    httpx.patch(f"{BASE}/admin/users/{TARGET_UID}/role", headers=_hdr(), json={"role": "collaborator"})
    r = httpx.patch(f"{BASE}/admin/users/{TARGET_UID}/role", headers=_hdr(), json={"role": "sales"})
    assert r.status_code == 200
    assert r.json()["role"] == "sales"
    assert r.json()["previous_role"] == "collaborator"


def test_same_role_is_noop():
    httpx.patch(f"{BASE}/admin/users/{TARGET_UID}/role", headers=_hdr(), json={"role": "collaborator"})
    r = httpx.patch(f"{BASE}/admin/users/{TARGET_UID}/role", headers=_hdr(), json={"role": "collaborator"})
    assert r.status_code == 200
    assert r.json()["previous_role"] == "collaborator"


def test_invalid_role_returns_400():
    r = httpx.patch(
        f"{BASE}/admin/users/{TARGET_UID}/role",
        headers=_hdr(),
        json={"role": "superking"},
    )
    assert r.status_code == 400


def test_missing_role_body_returns_400():
    r = httpx.patch(
        f"{BASE}/admin/users/{TARGET_UID}/role",
        headers=_hdr(),
        json={},
    )
    assert r.status_code == 400


def test_target_not_found_returns_404():
    r = httpx.patch(
        f"{BASE}/admin/users/00000000-0000-0000-0000-000000000000/role",
        headers=_hdr(),
        json={"role": "collaborator"},
    )
    assert r.status_code == 404


def test_non_admin_gets_403():
    collab_jwt = os.getenv("COLLAB_JWT")
    if not collab_jwt:
        pytest.skip("COLLAB_JWT env var required")
    r = httpx.patch(
        f"{BASE}/admin/users/{TARGET_UID}/role",
        headers={"Authorization": f"Bearer {collab_jwt}"},
        json={"role": "sales"},
    )
    assert r.status_code == 403
