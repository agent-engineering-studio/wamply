import pytest
from unittest.mock import AsyncMock, patch

from src.services.role_change_emails import (
    _compute_type,
    _role_label,
    _permissions_list_html,
    send_role_change_email,
)


def test_compute_type_promotion_user_to_collaborator():
    assert _compute_type("user", "collaborator") == "promotion"


def test_compute_type_promotion_collaborator_to_admin():
    assert _compute_type("collaborator", "admin") == "promotion"


def test_compute_type_demotion_admin_to_collaborator():
    assert _compute_type("admin", "collaborator") == "demotion"


def test_compute_type_demotion_sales_to_user():
    assert _compute_type("sales", "user") == "demotion"


def test_compute_type_lateral_is_promotion():
    assert _compute_type("collaborator", "sales") == "promotion"
    assert _compute_type("sales", "collaborator") == "promotion"


def test_role_label_italian():
    assert _role_label("user") == "Utente"
    assert _role_label("collaborator") == "Collaboratore"
    assert _role_label("sales") == "Sales"
    assert _role_label("admin") == "Amministratore"


def test_role_label_unknown_falls_back_to_raw():
    assert _role_label("weird") == "weird"


def test_permissions_list_html_renders_ul():
    perms = {"admin.users.view", "admin.ai_costs.view"}
    html = _permissions_list_html(perms)
    assert html.startswith("<ul")
    assert "Visualizzare la lista utenti" in html
    assert "Visualizzare i costi AI" in html
    assert html.count("<li") == 2


def test_permissions_list_html_skips_unknown_keys():
    html = _permissions_list_html({"admin.users.view", "admin.bogus.key"})
    assert "Visualizzare la lista utenti" in html
    assert "bogus" not in html.lower()


def test_permissions_list_html_empty_returns_empty_string():
    assert _permissions_list_html(set()) == ""


@pytest.mark.asyncio
async def test_send_role_change_email_logs_and_returns_false_on_smtp_error():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value={"email": "x@test.com", "full_name": "Test"})
    db.fetch = AsyncMock(return_value=[{"permission": "admin.users.view"}])
    with patch("src.services.role_change_emails._send_email", side_effect=OSError("smtp down")):
        ok = await send_role_change_email(db, "uid", "user", "collaborator", "admin@wamply.com")
    assert ok is False


@pytest.mark.asyncio
async def test_send_role_change_email_returns_false_when_user_not_found():
    db = AsyncMock()
    db.fetchrow = AsyncMock(return_value=None)
    ok = await send_role_change_email(db, "uid", "user", "collaborator", "admin@wamply.com")
    assert ok is False


@pytest.mark.asyncio
async def test_send_role_change_email_escapes_html_in_user_and_actor_fields():
    """User-controlled full_name and actor_email must be HTML-escaped before
    interpolation so an attacker cannot inject markup into the email body."""
    db = AsyncMock()
    db.fetchrow = AsyncMock(
        return_value={"email": "x@test.com", "full_name": "<script>alert(1)</script>"}
    )
    db.fetch = AsyncMock(return_value=[{"permission": "admin.users.view"}])
    captured = {}

    def fake_send(to, subject, body):
        captured["body"] = body

    with patch("src.services.role_change_emails._send_email", side_effect=fake_send):
        ok = await send_role_change_email(
            db, "uid", "user", "collaborator", "actor<x>@wamply.com"
        )
    assert ok is True
    body = captured["body"]
    assert "<script>" not in body
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in body
    assert "actor<x>@wamply.com" not in body
    assert "actor&lt;x&gt;@wamply.com" in body
