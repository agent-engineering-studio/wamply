"""Unit tests for PUT /contacts/:id and DELETE /contacts/:id.

No real DB required. Uses a minimal FastAPI app with mocked asyncpg pool
and overridden auth dependency — consistent with the project's mock-based
test style (see test_ai_feature_gating.py, test_quota_enforcement.py).
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.contacts import router
from src.auth.jwt import CurrentUser, get_current_user

USER_ID = "a0000000-0000-0000-0000-000000000001"
CONTACT_ID = "c0000000-0000-0000-0000-000000000001"
MISSING_ID = "00000000-0000-0000-0000-000000000000"


def _make_app(db_mock):
    """Build a minimal FastAPI app with mocked db pool and fixed auth."""
    app = FastAPI()
    app.include_router(router)  # router already declares prefix="/contacts"

    # Inject mock db pool into app state
    app.state.db_pool = db_mock

    # Override auth: always return our test user
    def fake_user():
        return CurrentUser(id=USER_ID, email="test@example.com", role="authenticated", full_name=None)

    app.dependency_overrides[get_current_user] = fake_user
    return app


# ── PUT /contacts/:id ────────────────────────────────────────────────────────

def test_update_contact_success():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={
        "id": CONTACT_ID,
        "user_id": USER_ID,
        "name": "Updated",
        "phone": "+39333000001",
        "email": None,
        "language": "it",
        "tags": ["vip"],
        "variables": {},
        "opt_in": True,
        "opt_in_date": None,
        "created_at": None,
        "updated_at": None,
    })
    client = TestClient(_make_app(db))
    r = client.put(f"/contacts/{CONTACT_ID}", json={"name": "Updated", "tags": ["vip"]})
    assert r.status_code == 200
    assert r.json()["name"] == "Updated"
    assert "vip" in r.json()["tags"]


def test_update_contact_not_found():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value=None)  # no row → 404
    client = TestClient(_make_app(db))
    r = client.put(f"/contacts/{MISSING_ID}", json={"name": "X"})
    assert r.status_code == 404


def test_update_contact_no_fields():
    db = AsyncMock()
    client = TestClient(_make_app(db))
    r = client.put(f"/contacts/{CONTACT_ID}", json={})
    assert r.status_code == 400


# ── DELETE /contacts/:id ─────────────────────────────────────────────────────

def test_delete_contact_success():
    db = AsyncMock()
    db.execute = AsyncMock(return_value="DELETE 1")
    client = TestClient(_make_app(db))
    r = client.delete(f"/contacts/{CONTACT_ID}")
    assert r.status_code == 204


def test_delete_contact_not_found():
    db = AsyncMock()
    db.execute = AsyncMock(return_value="DELETE 0")
    client = TestClient(_make_app(db))
    r = client.delete(f"/contacts/{MISSING_ID}")
    assert r.status_code == 404


# ── Invalid UUID ─────────────────────────────────────────────────────────────

def test_update_contact_invalid_uuid():
    db = AsyncMock()
    db.fetchrow = AsyncMock(side_effect=Exception("invalid input syntax for type uuid"))
    client = TestClient(_make_app(db))
    r = client.put("/contacts/not-a-uuid", json={"name": "X"})
    assert r.status_code == 422


def test_delete_contact_invalid_uuid():
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=Exception("invalid input syntax for type uuid"))
    client = TestClient(_make_app(db))
    r = client.delete("/contacts/not-a-uuid")
    assert r.status_code == 422


# ── POST /contacts/import ────────────────────────────────────────────────────

def test_import_csv_success():
    import io as _io
    db = AsyncMock()
    db.execute = AsyncMock(return_value="INSERT 0 1")
    client = TestClient(_make_app(db))

    csv_content = b"phone,name,email,language,tags\n+39333000001,Mario Rossi,mario@example.com,it,vip\n"
    r = client.post(
        "/contacts/import",
        files={"file": ("contacts.csv", _io.BytesIO(csv_content), "text/csv")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["imported"] == 1
    assert body["skipped"] == 0
    assert body["errors"] == []


def test_import_csv_missing_phone():
    import io as _io
    db = AsyncMock()
    db.execute = AsyncMock(return_value="INSERT 0 1")
    client = TestClient(_make_app(db))

    csv_content = b"phone,name\n,Mario Rossi\n"
    r = client.post(
        "/contacts/import",
        files={"file": ("contacts.csv", _io.BytesIO(csv_content), "text/csv")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["imported"] == 0
    assert body["skipped"] == 1
    assert len(body["errors"]) == 1
    assert "telefono mancante" in body["errors"][0]
