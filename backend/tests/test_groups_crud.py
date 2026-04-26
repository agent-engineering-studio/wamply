"""Unit tests for PUT /groups/:id and member management endpoints.

No real DB required. Uses a minimal FastAPI app with mocked asyncpg pool
and overridden auth dependency — consistent with the project's mock-based
test style (see test_contacts_crud.py).
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.groups import router
from src.auth.jwt import CurrentUser, get_current_user

USER_ID = "a0000000-0000-0000-0000-000000000001"
GROUP_ID = "b0000000-0000-0000-0000-000000000001"
CONTACT_ID = "c0000000-0000-0000-0000-000000000001"
MISSING_ID = "00000000-0000-0000-0000-000000000000"


def _make_app(db_mock):
    """Build a minimal FastAPI app with mocked db pool and fixed auth."""
    app = FastAPI()
    app.include_router(router)  # router already declares prefix="/groups"

    # Inject mock db pool into app state
    app.state.db_pool = db_mock

    # Override auth: always return our test user
    def fake_user():
        return CurrentUser(id=USER_ID, email="test@example.com", role="authenticated", full_name=None)

    app.dependency_overrides[get_current_user] = fake_user
    return app


# ── PUT /groups/:id ──────────────────────────────────────────────────────────

def test_update_group_success():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={
        "id": GROUP_ID,
        "user_id": USER_ID,
        "name": "Renamed",
        "description": "New desc",
        "created_at": None,
        "updated_at": None,
    })
    client = TestClient(_make_app(db))
    r = client.put(f"/groups/{GROUP_ID}", json={"name": "Renamed", "description": "New desc"})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Renamed"
    assert body["description"] == "New desc"


def test_update_group_not_found():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value=None)
    client = TestClient(_make_app(db))
    r = client.put(f"/groups/{MISSING_ID}", json={"name": "Whatever"})
    assert r.status_code == 404


def test_update_group_empty_name():
    db = AsyncMock()
    client = TestClient(_make_app(db))
    r = client.put(f"/groups/{GROUP_ID}", json={"name": ""})
    assert r.status_code == 400


# ── POST /groups/:id/members ─────────────────────────────────────────────────

def test_add_member_success():
    db = AsyncMock()
    # fetchrow called twice: group check, contact check; then fetchrow for count
    group_row = {"id": GROUP_ID}
    contact_row = {"id": CONTACT_ID}
    count_row = {"n": 1}
    db.fetchrow = AsyncMock(side_effect=[group_row, contact_row, count_row])
    db.execute = AsyncMock(return_value=None)
    client = TestClient(_make_app(db))
    r = client.post(f"/groups/{GROUP_ID}/members", json={"contact_id": CONTACT_ID})
    assert r.status_code == 201
    body = r.json()
    assert body["group_id"] == GROUP_ID
    assert body["member_count"] == 1


def test_add_member_no_contact_id():
    db = AsyncMock()
    client = TestClient(_make_app(db))
    r = client.post(f"/groups/{GROUP_ID}/members", json={})
    assert r.status_code == 400


# ── DELETE /groups/:id/members/:cid ─────────────────────────────────────────

def test_remove_member_success():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={"id": GROUP_ID})
    db.execute = AsyncMock(return_value=None)
    client = TestClient(_make_app(db))
    r = client.delete(f"/groups/{GROUP_ID}/members/{CONTACT_ID}")
    assert r.status_code == 204


# ── GET /groups/:id/members ──────────────────────────────────────────────────

def test_list_members_success():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={"id": GROUP_ID})
    db.fetch = AsyncMock(return_value=[
        {"id": CONTACT_ID, "phone": "+39333000001", "name": "Mario Rossi"},
    ])
    client = TestClient(_make_app(db))
    r = client.get(f"/groups/{GROUP_ID}/members")
    assert r.status_code == 200
    body = r.json()
    assert "members" in body
    assert len(body["members"]) == 1
    assert body["members"][0]["name"] == "Mario Rossi"
