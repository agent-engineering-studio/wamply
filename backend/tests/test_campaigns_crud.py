"""Unit tests for DELETE /campaigns/:id and POST /campaigns/:id/test-send.

No real DB required. Uses a minimal FastAPI app with mocked asyncpg pool
and overridden auth dependency — consistent with the project's mock-based
test style (see test_groups_crud.py).
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.campaigns import router
from src.auth.jwt import CurrentUser, get_current_user

USER_ID = "a0000000-0000-0000-0000-000000000001"
CAMPAIGN_ID = "b0000000-0000-0000-0000-000000000001"
MISSING_ID = "00000000-0000-0000-0000-000000000000"


def _make_app(db_mock):
    """Build a minimal FastAPI app with mocked db pool and fixed auth."""
    app = FastAPI()
    app.include_router(router)  # router already declares prefix="/campaigns"

    app.state.db_pool = db_mock

    def fake_user():
        return CurrentUser(id=USER_ID, email="test@example.com", role="authenticated", full_name=None)

    app.dependency_overrides[get_current_user] = fake_user
    return app


# ── DELETE /campaigns/:id ─────────────────────────────────────────────────────

def test_delete_draft_campaign():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={"id": CAMPAIGN_ID, "status": "draft"})
    db.execute = AsyncMock(return_value=None)
    client = TestClient(_make_app(db))
    r = client.delete(f"/campaigns/{CAMPAIGN_ID}")
    assert r.status_code == 204


def test_delete_running_campaign_blocked():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={"id": CAMPAIGN_ID, "status": "running"})
    client = TestClient(_make_app(db))
    r = client.delete(f"/campaigns/{CAMPAIGN_ID}")
    assert r.status_code == 409


def test_delete_campaign_not_found():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value=None)
    client = TestClient(_make_app(db))
    r = client.delete(f"/campaigns/{MISSING_ID}")
    assert r.status_code == 404


# ── POST /campaigns/:id/test-send ────────────────────────────────────────────

def test_test_send_success():
    db = AsyncMock()
    # fetchrow for the campaign ownership check
    db.fetchrow = AsyncMock(return_value={"id": CAMPAIGN_ID})
    client = TestClient(_make_app(db))

    with patch(
        "src.api.campaigns._do_test_send",
        new=AsyncMock(return_value={"sid": "SM123", "status": "queued"}),
    ):
        r = client.post(f"/campaigns/{CAMPAIGN_ID}/test-send", json={"to": "whatsapp:+39333000001"})

    assert r.status_code == 200
    body = r.json()
    assert body["sid"] == "SM123"
    assert body["status"] == "queued"


def test_test_send_missing_to():
    db = AsyncMock()
    client = TestClient(_make_app(db))
    r = client.post(f"/campaigns/{CAMPAIGN_ID}/test-send", json={})
    assert r.status_code == 400
