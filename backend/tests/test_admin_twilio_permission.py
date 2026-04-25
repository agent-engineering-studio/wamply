"""Verifica che admin.twilio.manage sia gated a role=admin.
Richiede tre JWT distinti: ADMIN_JWT, COLLAB_JWT, SALES_JWT."""
import os
import httpx
import pytest

BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")
COLLAB_JWT = os.getenv("COLLAB_JWT", "")
SALES_JWT = os.getenv("SALES_JWT", "")

pytestmark = pytest.mark.skipif(
    not (ADMIN_JWT and COLLAB_JWT and SALES_JWT),
    reason="ADMIN_JWT, COLLAB_JWT, SALES_JWT required",
)

ENDPOINTS = [
    ("GET", "/admin/twilio/overview", None),
    ("PATCH", "/admin/twilio/policy", {"default_region": "IT"}),
    ("POST", "/admin/twilio/rotate-master", {"auth_token": "x" * 30}),
    ("POST", "/admin/twilio/subaccount/ACfake00000000000000000000000000/suspend", None),
]


def _req(method: str, path: str, token: str, body):
    with httpx.Client(base_url=BASE) as c:
        return c.request(method, path, headers={"Authorization": f"Bearer {token}"}, json=body)


@pytest.mark.parametrize("method,path,body", ENDPOINTS)
def test_admin_allowed(method, path, body):
    r = _req(method, path, ADMIN_JWT, body)
    assert r.status_code != 403


@pytest.mark.parametrize("method,path,body", ENDPOINTS)
def test_collaborator_forbidden(method, path, body):
    r = _req(method, path, COLLAB_JWT, body)
    assert r.status_code == 403


@pytest.mark.parametrize("method,path,body", ENDPOINTS)
def test_sales_forbidden(method, path, body):
    r = _req(method, path, SALES_JWT, body)
    assert r.status_code == 403
