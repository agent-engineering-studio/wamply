# Admin Roles, Permissions and Role-Change Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `sales` role, granular RBAC matrix, email notifications on role change (promotion/demotion), remove dashboard back-link from admin area, and hide admin features users do not have permission to use.

**Architecture:** Backend-centric. All admin routes live in `backend/src/api/admin.py` and are called via `apiFetch()` → Kong → backend. We extend the existing `PATCH /admin/users/:id/role` handler rather than creating a new route. Email is sent synchronously from the same handler via a new `role_change_emails.py` service that mirrors the existing `meta_status_emails.py`. A new `role_permissions` DB table stores the capability matrix; the frontend reads it via a new `GET /admin/me/permissions` endpoint to gate UI.

**Tech Stack:** Python 3.11 + FastAPI + asyncpg (backend), Next.js 15 App Router + TypeScript + Vitest (frontend), Postgres 15 via Supabase, Playwright for E2E, MailHog for SMTP dev.

**Spec:** [docs/superpowers/specs/2026-04-23-admin-roles-permissions-design.md](../specs/2026-04-23-admin-roles-permissions-design.md)

---

## Task 1: Add `sales` role to user_role enum

**Files:**
- Create: `supabase/migrations/018_add_sales_role.sql`

Rationale: Postgres requires `ALTER TYPE … ADD VALUE` to be committed before the new label can appear in an `INSERT`. We therefore put the enum change alone in migration 018, and the table+seed in 019.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/018_add_sales_role.sql`:

```sql
-- Add 'sales' to user_role enum. Must be in its own migration so Postgres
-- commits the new label before later migrations reference it in INSERTs.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales';
```

- [ ] **Step 2: Apply the migration**

Run:

```bash
docker compose exec supabase-db psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/migrations/018_add_sales_role.sql
```

Or if using the Supabase CLI:

```bash
supabase db push
```

Expected: no error. Re-run should also succeed thanks to `IF NOT EXISTS`.

- [ ] **Step 3: Verify the enum contains `sales`**

Run:

```bash
docker compose exec supabase-db psql -U postgres -d postgres -c "SELECT unnest(enum_range(NULL::user_role));"
```

Expected output includes `user`, `admin`, `collaborator`, `sales`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/018_add_sales_role.sql
git commit -m "feat(db): add 'sales' to user_role enum"
```

---

## Task 2: Create role_permissions and audit_log tables, seed the matrix

**Files:**
- Create: `supabase/migrations/019_role_permissions_and_audit_log.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/019_role_permissions_and_audit_log.sql`:

```sql
-- Permissions matrix: one row per (role, permission). Admin gets the wildcard.
CREATE TABLE role_permissions (
  role user_role NOT NULL,
  permission text NOT NULL,
  PRIMARY KEY (role, permission)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_permissions_read ON role_permissions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY role_permissions_admin_write ON role_permissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Audit log for admin-sensitive actions. Server-only writes (no public policy).
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_admin_read ON audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE INDEX audit_log_actor_created_idx ON audit_log (actor_id, created_at DESC);
CREATE INDEX audit_log_target_created_idx ON audit_log (target_id, created_at DESC);

-- Seed the permission matrix.
INSERT INTO role_permissions (role, permission) VALUES
  ('admin', '*'),
  ('collaborator', 'admin.overview.view'),
  ('collaborator', 'admin.users.view'),
  ('collaborator', 'admin.campaigns.view'),
  ('collaborator', 'admin.whatsapp.manage'),
  ('sales', 'admin.overview.view'),
  ('sales', 'admin.users.view'),
  ('sales', 'admin.campaigns.view'),
  ('sales', 'admin.whatsapp.manage'),
  ('sales', 'admin.ai_costs.view'),
  ('sales', 'admin.ai_revenue.view');
```

- [ ] **Step 2: Apply the migration**

```bash
docker compose exec supabase-db psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/migrations/019_role_permissions_and_audit_log.sql
```

Expected: no error.

- [ ] **Step 3: Verify seed data**

```bash
docker compose exec supabase-db psql -U postgres -d postgres -c "SELECT role, permission FROM role_permissions ORDER BY role, permission;"
```

Expected: 11 rows. `admin` has `*`. `collaborator` has 4 rows. `sales` has 6 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/019_role_permissions_and_audit_log.sql
git commit -m "feat(db): add role_permissions matrix and audit_log table"
```

---

## Task 3: Backend permission helpers

**Files:**
- Modify: `backend/src/auth/permissions.py`
- Test: `backend/tests/test_permissions.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_permissions.py`:

```python
import pytest
from unittest.mock import AsyncMock

from src.auth.permissions import get_role_permissions, has_permission


@pytest.mark.asyncio
async def test_has_permission_admin_wildcard():
    db = AsyncMock()
    db.fetch = AsyncMock(return_value=[{"permission": "*"}])
    assert await has_permission(db, "admin", "admin.anything.anywhere") is True


@pytest.mark.asyncio
async def test_has_permission_collaborator_exact_match():
    db = AsyncMock()
    db.fetch = AsyncMock(return_value=[
        {"permission": "admin.users.view"},
        {"permission": "admin.whatsapp.manage"},
    ])
    assert await has_permission(db, "collaborator", "admin.whatsapp.manage") is True


@pytest.mark.asyncio
async def test_has_permission_collaborator_missing():
    db = AsyncMock()
    db.fetch = AsyncMock(return_value=[{"permission": "admin.users.view"}])
    assert await has_permission(db, "collaborator", "admin.ai_key.configure") is False


@pytest.mark.asyncio
async def test_get_role_permissions_returns_set():
    db = AsyncMock()
    db.fetch = AsyncMock(return_value=[
        {"permission": "admin.ai_costs.view"},
        {"permission": "admin.ai_revenue.view"},
    ])
    result = await get_role_permissions(db, "sales")
    assert result == {"admin.ai_costs.view", "admin.ai_revenue.view"}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_permissions.py -v
```

Expected: FAIL with `ImportError: cannot import name 'get_role_permissions'`.

- [ ] **Step 3: Add the helpers**

Append to `backend/src/auth/permissions.py`:

```python
async def get_role_permissions(db, role: str) -> set[str]:
    """Return the set of permission strings for a given role."""
    rows = await db.fetch(
        "SELECT permission FROM role_permissions WHERE role = $1::user_role",
        role,
    )
    return {r["permission"] for r in rows}


async def has_permission(db, user_role: str, permission: str) -> bool:
    """True if the role has the wildcard or the exact permission."""
    perms = await get_role_permissions(db, user_role)
    return "*" in perms or permission in perms
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_permissions.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/permissions.py backend/tests/test_permissions.py
git commit -m "feat(backend): add role permission helpers"
```

---

## Task 4: Email templates for role change

**Files:**
- Create: `backend/templates/emails/role-promoted.html`
- Create: `backend/templates/emails/role-demoted.html`

Templates follow the existing dark-theme style from `backend/templates/emails/meta-approved.html`. Use the same color palette, gradient header, inline Wamply wordmark (no image asset), CTA button style, and footer.

- [ ] **Step 1: Create the promoted template**

Create `backend/templates/emails/role-promoted.html`:

```html
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<title>Ruolo aggiornato su Wamply</title>
</head>
<body style="margin:0;padding:0;background-color:#0B1628;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#E2E8F0;-webkit-font-smoothing:antialiased;">

<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#0B1628;opacity:0;">
Il tuo ruolo su Wamply è stato aggiornato a {{NEW_ROLE_LABEL}}.
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0B1628;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#132240;border:1px solid #1E2F52;border-radius:16px;overflow:hidden;">

      <tr><td style="background:linear-gradient(135deg,#1B2A4A 0%,#0F1B33 100%);padding:28px 40px;border-bottom:1px solid #1E2F52;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="vertical-align:middle;">
              <div style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;line-height:1;">
                Wam<span style="color:#0D9488;">ply</span>
              </div>
              <div style="font-size:11.5px;color:#64748B;margin-top:6px;letter-spacing:0.3px;">WhatsApp Campaign Manager</div>
            </td>
            <td align="right" style="vertical-align:middle;">
              <span style="display:inline-block;background-color:rgba(52,211,153,0.15);color:#34D399;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:4px 10px;border-radius:999px;">Ruolo aggiornato</span>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:36px 40px 8px 40px;">
        <h1 style="margin:0 0 12px 0;font-size:24px;font-weight:600;color:#F1F5F9;line-height:1.3;">
          Ciao {{USER_NAME}}, il tuo ruolo è stato aggiornato
        </h1>
        <p style="margin:0 0 16px 0;font-size:14.5px;line-height:1.6;color:#94A3B8;">
          Buone notizie: il tuo ruolo su Wamply è ora <strong style="color:#F1F5F9;">{{NEW_ROLE_LABEL}}</strong>. Da adesso hai accesso all'area amministrativa con le funzionalità indicate qui sotto.
        </p>
      </td></tr>

      <tr><td style="padding:0 40px 24px 40px;">
        <div style="background-color:#0B1628;border:1px solid #0D9488;border-radius:14px;padding:20px;text-align:center;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#0D9488;font-weight:600;margin-bottom:8px;">Nuovo ruolo</div>
          <div style="font-size:18px;color:#94A3B8;">{{OLD_ROLE_LABEL}} &rarr; <strong style="color:#F1F5F9;">{{NEW_ROLE_LABEL}}</strong></div>
        </div>
      </td></tr>

      <tr><td style="padding:0 40px 24px 40px;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#0D9488;font-weight:600;margin-bottom:10px;">Ora puoi</div>
        {{PERMISSIONS_LIST_HTML}}
      </td></tr>

      <tr><td style="padding:0 40px 32px 40px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="border-radius:999px;background-color:#0D9488;">
            <a href="{{CTA_URL}}" style="display:inline-block;padding:12px 28px;font-size:13.5px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">Accedi al pannello admin</a>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:20px 40px 32px 40px;border-top:1px solid #1E2F52;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#64748B;">Modificato da {{CHANGED_BY}}. Domande? Scrivi a <a href="mailto:supporto@wamply.com" style="color:#0D9488;text-decoration:none;">supporto@wamply.com</a>.</p>
      </td></tr>

    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">
      <tr><td style="padding:20px 8px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#475569;line-height:1.6;">&copy; Wamply — WhatsApp Campaign Manager</p>
      </td></tr>
    </table>

  </td></tr>
</table>

</body>
</html>
```

- [ ] **Step 2: Create the demoted template**

Create `backend/templates/emails/role-demoted.html`:

```html
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<title>Ruolo modificato su Wamply</title>
</head>
<body style="margin:0;padding:0;background-color:#0B1628;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#E2E8F0;-webkit-font-smoothing:antialiased;">

<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#0B1628;opacity:0;">
Il tuo ruolo su Wamply è stato modificato a {{NEW_ROLE_LABEL}}.
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0B1628;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#132240;border:1px solid #1E2F52;border-radius:16px;overflow:hidden;">

      <tr><td style="background:linear-gradient(135deg,#1B2A4A 0%,#0F1B33 100%);padding:28px 40px;border-bottom:1px solid #1E2F52;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="vertical-align:middle;">
              <div style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;line-height:1;">
                Wam<span style="color:#0D9488;">ply</span>
              </div>
              <div style="font-size:11.5px;color:#64748B;margin-top:6px;letter-spacing:0.3px;">WhatsApp Campaign Manager</div>
            </td>
            <td align="right" style="vertical-align:middle;">
              <span style="display:inline-block;background-color:rgba(148,163,184,0.15);color:#94A3B8;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;padding:4px 10px;border-radius:999px;">Ruolo modificato</span>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:36px 40px 8px 40px;">
        <h1 style="margin:0 0 12px 0;font-size:24px;font-weight:600;color:#F1F5F9;line-height:1.3;">
          Ciao {{USER_NAME}},
        </h1>
        <p style="margin:0 0 16px 0;font-size:14.5px;line-height:1.6;color:#94A3B8;">
          Ti informiamo che il tuo ruolo su Wamply è stato modificato da <strong style="color:#F1F5F9;">{{OLD_ROLE_LABEL}}</strong> a <strong style="color:#F1F5F9;">{{NEW_ROLE_LABEL}}</strong>. Se pensi sia un errore o vuoi chiarimenti, contatta l'amministratore.
        </p>
      </td></tr>

      <tr><td style="padding:0 40px 24px 40px;">
        <div style="background-color:#0B1628;border:1px solid #475569;border-radius:14px;padding:20px;text-align:center;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;font-weight:600;margin-bottom:8px;">Ruolo attuale</div>
          <div style="font-size:18px;color:#94A3B8;">{{OLD_ROLE_LABEL}} &rarr; <strong style="color:#F1F5F9;">{{NEW_ROLE_LABEL}}</strong></div>
        </div>
      </td></tr>

      <tr><td style="padding:0 40px 32px 40px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="border-radius:999px;background-color:#0D9488;">
            <a href="{{CTA_URL}}" style="display:inline-block;padding:12px 28px;font-size:13.5px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">Accedi a Wamply</a>
          </td>
        </tr></table>
      </td></tr>

      <tr><td style="padding:20px 40px 32px 40px;border-top:1px solid #1E2F52;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#64748B;">Modificato da {{CHANGED_BY}}. Domande? Scrivi a <a href="mailto:supporto@wamply.com" style="color:#0D9488;text-decoration:none;">supporto@wamply.com</a>.</p>
      </td></tr>

    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">
      <tr><td style="padding:20px 8px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#475569;line-height:1.6;">&copy; Wamply — WhatsApp Campaign Manager</p>
      </td></tr>
    </table>

  </td></tr>
</table>

</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add backend/templates/emails/role-promoted.html backend/templates/emails/role-demoted.html
git commit -m "feat(emails): add role-promoted and role-demoted templates"
```

---

## Task 5: Role change email service

**Files:**
- Create: `backend/src/services/role_change_emails.py`
- Test: `backend/tests/test_role_change_emails.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_role_change_emails.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_role_change_emails.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'src.services.role_change_emails'`.

- [ ] **Step 3: Implement the service**

Create `backend/src/services/role_change_emails.py`:

```python
"""Transactional emails fired on admin role-change transitions.

Called synchronously from `admin_update_user_role` after the UPDATE commits.
Failures are logged but never raise — the role change stands regardless of
SMTP availability, same pattern as `meta_status_emails.send_meta_status_email`.
"""

import os

import asyncpg
import structlog

from src.services.meta_status_emails import _load_template, _render, _send_email

logger = structlog.get_logger()


ROLE_LABELS = {
    "user": "Utente",
    "collaborator": "Collaboratore",
    "sales": "Sales",
    "admin": "Amministratore",
}

PERMISSION_LABELS = {
    "admin.overview.view": "Visualizzare la dashboard amministrativa",
    "admin.users.view": "Visualizzare la lista utenti",
    "admin.users.edit": "Modificare, sospendere ed eliminare utenti",
    "admin.staff.manage": "Promuovere e retrocedere membri dello staff",
    "admin.campaigns.view": "Visualizzare le campagne di tutti gli utenti",
    "admin.campaigns.suspend": "Sospendere ed eliminare campagne",
    "admin.whatsapp.manage": "Gestire le applicazioni WhatsApp Business",
    "admin.ai_costs.view": "Visualizzare i costi AI",
    "admin.ai_revenue.view": "Visualizzare i ricavi AI",
    "admin.ai_key.configure": "Configurare la system key Claude API",
}

ROLE_RANK = {"user": 0, "collaborator": 1, "sales": 1, "admin": 2}


def _compute_type(old_role: str, new_role: str) -> str:
    """Return 'promotion' or 'demotion' based on rank comparison.
    Lateral changes (same rank, different role) are treated as 'promotion'
    so the user sees the new capability list."""
    old = ROLE_RANK.get(old_role, 0)
    new = ROLE_RANK.get(new_role, 0)
    return "demotion" if new < old else "promotion"


def _role_label(role: str) -> str:
    return ROLE_LABELS.get(role, role)


def _permissions_list_html(perms: set[str]) -> str:
    """Render a UL with known permission labels. Unknown keys are skipped."""
    items = [PERMISSION_LABELS[p] for p in sorted(perms) if p in PERMISSION_LABELS]
    if not items:
        return ""
    lis = "".join(
        f'<li style="margin:4px 0;color:#94A3B8;font-size:13.5px;line-height:1.5;">{label}</li>'
        for label in items
    )
    return f'<ul style="margin:0;padding-left:20px;">{lis}</ul>'


async def send_role_change_email(
    db: asyncpg.Pool,
    user_id: str,
    old_role: str,
    new_role: str,
    actor_email: str,
) -> bool:
    """Send the appropriate template for this role change.

    Returns True on success, False on any failure (logged as warning, never
    raises). Fire-and-forget from the caller's perspective.
    """
    try:
        row = await db.fetchrow(
            "SELECT email, full_name FROM users WHERE id = $1", user_id
        )
    except Exception as exc:
        logger.warning("role_change_email_db_error", error=str(exc))
        return False

    if not row or not row["email"]:
        logger.warning("role_change_email_no_recipient", user_id=user_id)
        return False

    change_type = _compute_type(old_role, new_role)
    tpl_file = "role-promoted.html" if change_type == "promotion" else "role-demoted.html"
    subject_map = {
        "promotion": f"Il tuo ruolo su Wamply è stato aggiornato a {_role_label(new_role)}",
        "demotion": f"Il tuo ruolo su Wamply è stato modificato",
    }
    subject = subject_map[change_type]

    app_url = os.getenv("APP_URL", "http://localhost:3000")
    full_name = row["full_name"] or (row["email"].split("@")[0] if row["email"] else "collega")

    perms_html = ""
    if change_type == "promotion":
        perm_rows = await db.fetch(
            "SELECT permission FROM role_permissions WHERE role = $1::user_role",
            new_role,
        )
        perms = {r["permission"] for r in perm_rows}
        # Admin has wildcard — render the full known label list instead
        if "*" in perms:
            perms = set(PERMISSION_LABELS.keys())
        perms_html = _permissions_list_html(perms)

    variables = {
        "USER_NAME": full_name,
        "OLD_ROLE_LABEL": _role_label(old_role),
        "NEW_ROLE_LABEL": _role_label(new_role),
        "CHANGED_BY": actor_email,
        "PERMISSIONS_LIST_HTML": perms_html,
        "CTA_URL": f"{app_url}/admin",
    }

    tpl = _load_template(tpl_file)
    if not tpl:
        logger.warning("role_change_email_template_missing", template=tpl_file)
        return False
    html = _render(tpl, variables)

    try:
        _send_email(row["email"], subject, html)
        logger.info("role_change_email_sent", type=change_type, email=row["email"])
        return True
    except Exception as exc:
        logger.warning("role_change_email_send_failed", type=change_type, error=str(exc))
        return False
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_role_change_emails.py -v
```

Expected: 12 tests PASS.

- [ ] **Step 5: MailHog smoke test**

Make sure the dev stack is up (Docker compose with MailHog at port 8025). Run a one-off Python script from the backend container:

```bash
docker compose exec backend python -c "
import asyncio, asyncpg, os
from src.services.role_change_emails import send_role_change_email
async def main():
    pool = await asyncpg.create_pool(os.getenv('DATABASE_URL'))
    # Pick any existing user id from your dev DB
    row = await pool.fetchrow('SELECT id FROM users LIMIT 1')
    ok = await send_role_change_email(pool, str(row['id']), 'user', 'collaborator', 'admin@wamply.com')
    print('sent:', ok)
    await pool.close()
asyncio.run(main())
"
```

Open `http://localhost:8025` in a browser. Expected: one new message with subject "Il tuo ruolo su Wamply è stato aggiornato a Collaboratore", dark-themed layout, permissions list visible.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/role_change_emails.py backend/tests/test_role_change_emails.py
git commit -m "feat(backend): add role_change_emails service"
```

---

## Task 6: Extend admin_update_user_role to support sales, audit log, email

**Files:**
- Modify: `backend/src/api/admin.py` (lines 332-372, `VALID_ROLES` and `admin_update_user_role`)
- Test: `backend/tests/test_admin_role_change.py`

- [ ] **Step 1: Write failing API tests**

Create `backend/tests/test_admin_role_change.py`. This uses FastAPI's `TestClient` with a real Postgres connection (dev DB) — the project currently has no pytest fixtures for DB/auth, so we keep the test pragmatic and seed-based.

Preconditions: dev stack running; test admin user and test target user exist in DB. We use env vars to parametrize, so CI can override:

```python
"""Integration tests for PATCH /admin/users/:user_id/role.

Runs against the dev backend. Requires the following env vars:
  ADMIN_JWT   — JWT of a user with role='admin'
  TARGET_UID  — id of a user we can mutate (role='user' initially)
  BASE_URL    — e.g. http://localhost:8200 (backend direct) or via Kong

The tests re-seed TARGET_UID back to role='user' after each run.
"""

import os

import httpx
import pytest


BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")
TARGET_UID = os.getenv("TARGET_UID", "")


def _hdr() -> dict:
    return {"Authorization": f"Bearer {ADMIN_JWT}"}


@pytest.fixture(autouse=True)
def _skip_if_missing_env():
    if not ADMIN_JWT or not TARGET_UID:
        pytest.skip("ADMIN_JWT and TARGET_UID env vars required")


@pytest.fixture(autouse=True)
def _reset_role():
    yield
    httpx.patch(
        f"{BASE}/api/v1/admin/users/{TARGET_UID}/role",
        headers=_hdr(),
        json={"role": "user"},
    )


def test_admin_promotes_user_to_collaborator():
    r = httpx.patch(
        f"{BASE}/api/v1/admin/users/{TARGET_UID}/role",
        headers=_hdr(),
        json={"role": "collaborator"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "collaborator"
    assert r.json()["previous_role"] == "user"


def test_admin_promotes_user_to_sales():
    r = httpx.patch(
        f"{BASE}/api/v1/admin/users/{TARGET_UID}/role",
        headers=_hdr(),
        json={"role": "sales"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "sales"


def test_admin_lateral_collaborator_to_sales():
    httpx.patch(f"{BASE}/api/v1/admin/users/{TARGET_UID}/role", headers=_hdr(), json={"role": "collaborator"})
    r = httpx.patch(f"{BASE}/api/v1/admin/users/{TARGET_UID}/role", headers=_hdr(), json={"role": "sales"})
    assert r.status_code == 200
    assert r.json()["role"] == "sales"
    assert r.json()["previous_role"] == "collaborator"


def test_same_role_is_noop():
    httpx.patch(f"{BASE}/api/v1/admin/users/{TARGET_UID}/role", headers=_hdr(), json={"role": "collaborator"})
    r = httpx.patch(f"{BASE}/api/v1/admin/users/{TARGET_UID}/role", headers=_hdr(), json={"role": "collaborator"})
    assert r.status_code == 200
    assert r.json()["previous_role"] == "collaborator"


def test_invalid_role_returns_400():
    r = httpx.patch(
        f"{BASE}/api/v1/admin/users/{TARGET_UID}/role",
        headers=_hdr(),
        json={"role": "superking"},
    )
    assert r.status_code == 400


def test_missing_role_body_returns_400():
    r = httpx.patch(
        f"{BASE}/api/v1/admin/users/{TARGET_UID}/role",
        headers=_hdr(),
        json={},
    )
    assert r.status_code == 400


def test_target_not_found_returns_404():
    r = httpx.patch(
        f"{BASE}/api/v1/admin/users/00000000-0000-0000-0000-000000000000/role",
        headers=_hdr(),
        json={"role": "collaborator"},
    )
    assert r.status_code == 404


def test_non_admin_gets_403():
    collab_jwt = os.getenv("COLLAB_JWT")
    if not collab_jwt:
        pytest.skip("COLLAB_JWT env var required")
    r = httpx.patch(
        f"{BASE}/api/v1/admin/users/{TARGET_UID}/role",
        headers={"Authorization": f"Bearer {collab_jwt}"},
        json={"role": "sales"},
    )
    assert r.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_admin_role_change.py -v
```

Expected: test_admin_promotes_user_to_sales FAILS with 400 (sales not in VALID_ROLES). test_admin_promotes_user_to_collaborator passes but response body lacks `previous_role`, so that assertion FAILS too. Other tests may pass or be skipped.

- [ ] **Step 3: Extend the VALID_ROLES set**

Edit `backend/src/api/admin.py` line 332:

```python
VALID_ROLES = {"user", "collaborator", "sales", "admin"}
```

- [ ] **Step 4: Rewrite admin_update_user_role**

Replace the handler `admin_update_user_role` (currently lines 335-372). Keep the existing guards; add no-op return, audit insert, and email call:

```python
@router.patch("/users/{user_id}/role")
async def admin_update_user_role(
    request: Request,
    user_id: str,
    user: CurrentUser = Depends(require_admin),
):
    """Change the target user's role. Admin-only. Prevents demoting the last
    active admin. Writes an audit_log row and sends a branded notification
    email. Email failures are logged but do not abort the request."""
    if user_id == str(user.id):
        raise HTTPException(status_code=400, detail="Non puoi modificare il tuo ruolo.")

    body = await request.json()
    new_role = body.get("role")
    if new_role not in VALID_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"role obbligatorio, valori ammessi: {sorted(VALID_ROLES)}",
        )

    db = get_db(request)
    target = await db.fetchrow("SELECT role::text FROM users WHERE id = $1", user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Utente non trovato.")

    old_role = target["role"]

    # No-op: no update, no audit, no email.
    if old_role == new_role:
        return {"role": new_role, "previous_role": old_role}

    if old_role == "admin" and new_role != "admin":
        active = await _count_active_admins(db)
        if active <= 1:
            raise HTTPException(
                status_code=400,
                detail="Deve esistere almeno un amministratore attivo.",
            )

    await db.execute(
        "UPDATE users SET role = $1::user_role, updated_at = now() WHERE id = $2",
        new_role,
        user_id,
    )

    await db.execute(
        "INSERT INTO audit_log (actor_id, action, target_id, metadata) "
        "VALUES ($1, 'role_change', $2, $3::jsonb)",
        user.id,
        user_id,
        json.dumps({"old": old_role, "new": new_role}),
    )

    # Fire-and-forget: role change stands even if email fails.
    try:
        await send_role_change_email(db, user_id, old_role, new_role, user.email)
    except Exception as exc:
        logger.warning("role_change_email_unexpected_error", error=str(exc))

    return {"role": new_role, "previous_role": old_role}
```

- [ ] **Step 5: Add required imports**

At the top of `backend/src/api/admin.py`, add:

```python
import json
import structlog

from src.services.role_change_emails import send_role_change_email

logger = structlog.get_logger()
```

(Place `import json` and `import structlog` alphabetically among existing imports; place the `from src.services...` line near other `from src.` imports.)

- [ ] **Step 6: Restart backend and re-run tests**

```bash
docker compose restart backend
cd backend && pytest tests/test_admin_role_change.py -v
```

Expected: all tests PASS (those with env vars set). Check MailHog at `http://localhost:8025` — emails should appear for each role-change test.

- [ ] **Step 7: Verify audit_log rows were written**

```bash
docker compose exec supabase-db psql -U postgres -d postgres -c "SELECT action, metadata, created_at FROM audit_log ORDER BY created_at DESC LIMIT 5;"
```

Expected: rows with `action='role_change'` and JSON metadata like `{"old": "user", "new": "collaborator"}`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/api/admin.py backend/tests/test_admin_role_change.py
git commit -m "feat(backend): extend role change endpoint with sales, audit log, email"
```

---

## Task 7: Backend endpoint GET /admin/me/permissions

**Files:**
- Modify: `backend/src/api/admin.py`
- Test: `backend/tests/test_admin_me_permissions.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_admin_me_permissions.py`:

```python
import os

import httpx
import pytest


BASE = os.getenv("BASE_URL", "http://localhost:8200")


@pytest.fixture(autouse=True)
def _skip_if_missing():
    if not os.getenv("ADMIN_JWT"):
        pytest.skip("ADMIN_JWT env var required")


def test_admin_me_permissions_returns_wildcard():
    r = httpx.get(
        f"{BASE}/api/v1/admin/me/permissions",
        headers={"Authorization": f"Bearer {os.getenv('ADMIN_JWT')}"},
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
        f"{BASE}/api/v1/admin/me/permissions",
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
        f"{BASE}/api/v1/admin/me/permissions",
        headers={"Authorization": f"Bearer {user_jwt}"},
    )
    assert r.status_code == 403
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd backend && pytest tests/test_admin_me_permissions.py -v
```

Expected: 404 on every non-skipped test (route does not exist).

- [ ] **Step 3: Add the endpoint**

In `backend/src/api/admin.py`, add this handler (before the AI costs section around line 375):

```python
@router.get("/me/permissions")
async def admin_me_permissions(
    request: Request,
    user: CurrentUser = Depends(require_staff),
):
    """Return the calling user's role and flattened permission set.
    Used by the frontend to gate admin tabs and destructive buttons."""
    db = get_db(request)
    rows = await db.fetch(
        "SELECT permission FROM role_permissions WHERE role = $1::user_role",
        user.role,
    )
    return {"role": user.role, "permissions": [r["permission"] for r in rows]}
```

- [ ] **Step 4: Restart backend and re-run tests**

```bash
docker compose restart backend
cd backend && pytest tests/test_admin_me_permissions.py -v
```

Expected: PASS for tests with env set.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/admin.py backend/tests/test_admin_me_permissions.py
git commit -m "feat(backend): add GET /admin/me/permissions endpoint"
```

---

## Task 8: Frontend permission helper

**Files:**
- Create: `frontend/src/lib/permissions.ts`
- Test: `frontend/tests/lib/permissions.test.ts`

- [ ] **Step 1: Write failing test**

Create `frontend/tests/lib/permissions.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

const apiFetchMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import { fetchMyPermissions, can } from "@/lib/permissions";

describe("can()", () => {
  it("returns true when wildcard is present", () => {
    expect(can(new Set(["*"]), "admin.users.edit")).toBe(true);
  });
  it("returns true on exact match", () => {
    expect(can(new Set(["admin.users.view"]), "admin.users.view")).toBe(true);
  });
  it("returns false when missing", () => {
    expect(can(new Set(["admin.users.view"]), "admin.users.edit")).toBe(false);
  });
  it("returns false on empty set", () => {
    expect(can(new Set(), "admin.overview.view")).toBe(false);
  });
});

describe("fetchMyPermissions()", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("returns a Set from the API payload", async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ role: "sales", permissions: ["admin.users.view", "admin.ai_costs.view"] }),
    });
    const perms = await fetchMyPermissions();
    expect(perms).toEqual(new Set(["admin.users.view", "admin.ai_costs.view"]));
    expect(apiFetchMock).toHaveBeenCalledWith("/admin/me/permissions");
  });

  it("returns empty set on non-ok response", async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const perms = await fetchMyPermissions();
    expect(perms).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run tests/lib/permissions.test.ts
```

Expected: FAIL with `Cannot find module '@/lib/permissions'`.

- [ ] **Step 3: Implement the helper**

Create `frontend/src/lib/permissions.ts`:

```typescript
import { apiFetch } from "@/lib/api-client";

export async function fetchMyPermissions(): Promise<Set<string>> {
  const res = await apiFetch("/admin/me/permissions");
  if (!res.ok) return new Set();
  const body = await res.json();
  return new Set<string>(body.permissions ?? []);
}

export function can(perms: Set<string>, permission: string): boolean {
  return perms.has("*") || perms.has(permission);
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd frontend && npx vitest run tests/lib/permissions.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/permissions.ts frontend/tests/lib/permissions.test.ts
git commit -m "feat(frontend): add permissions helper"
```

---

## Task 9: RoleModal — add sales option

**Files:**
- Modify: `frontend/src/app/(admin)/admin/_components/RoleModal.tsx`

- [ ] **Step 1: Update the Role type**

Change `frontend/src/app/(admin)/admin/_components/RoleModal.tsx:7`:

```typescript
type Role = "user" | "collaborator" | "sales" | "admin";
```

- [ ] **Step 2: Add a sales RoleOption**

In the JSX, add a new `<RoleOption>` between the `collaborator` and `admin` options (around line 83-90 in the existing file). Insert after the `collaborator` option:

```tsx
<RoleOption
  value="sales"
  selected={role === "sales"}
  onSelect={() => setRole("sales")}
  label="Sales"
  desc="Come collaboratore, più visibilità su costi e ricavi AI. Non può gestire lo staff o configurare la Claude API."
/>
```

- [ ] **Step 3: Verify by opening the app**

```bash
cd frontend && npm run dev
```

Navigate to `/admin?tab=users`, click a user's "Promuovi" action — the modal should now show three options: Collaboratore, Sales, Amministratore.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/(admin)/admin/_components/RoleModal.tsx
git commit -m "feat(admin): add sales option to role modal"
```

---

## Task 10: Remove "Torna alla dashboard" from admin layout

**Files:**
- Modify: `frontend/src/app/(admin)/layout.tsx`

- [ ] **Step 1: Remove the anchor**

Delete lines 22-24 in `frontend/src/app/(admin)/layout.tsx`:

```tsx
        <a href="/dashboard" className="ml-auto text-[12px] text-white/60 transition-colors hover:text-white">
          &larr; Torna alla dashboard
        </a>
```

The `<LogoutButton />` on line 25 already has the hover styling context. Add `className="ml-auto"` to `<LogoutButton />` so it sticks to the right after removing the anchor — or wrap it in a `<div className="ml-auto">`. Simplest fix: change line 25 to:

```tsx
        <div className="ml-auto"><LogoutButton /></div>
```

- [ ] **Step 2: Verify visually**

Run the dev server, open `/admin`. Expected: top bar shows logo + "Wamply Admin" + "Admin" pill on the left, LogoutButton on the right. No "Torna alla dashboard" link anywhere.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/(admin)/layout.tsx
git commit -m "feat(admin): remove dashboard back-link from top bar"
```

---

## Task 11: Replace dashboard link with logout button in sidebar

**Files:**
- Modify: `frontend/src/app/(admin)/admin/_components/AdminSidebar.tsx`

- [ ] **Step 1: Replace the footer link**

Replace lines 182-187 in `AdminSidebar.tsx`:

```tsx
      {/* Footer hint */}
      <div className="border-t border-slate-800 px-4 py-3 text-[11px] text-slate-500">
        <Link href="/dashboard" className="hover:text-slate-300">
          &larr; Torna alla dashboard
        </Link>
      </div>
```

With a logout button that uses the existing `LogoutButton`:

```tsx
      {/* Footer: logout */}
      <div className="border-t border-slate-800 px-4 py-3">
        <LogoutButton />
      </div>
```

Add the import at the top:

```tsx
import { LogoutButton } from "../../_components/LogoutButton";
```

- [ ] **Step 2: Verify**

Open `/admin`, check the sidebar footer shows the logout button. Click it — should sign out and redirect to `/login`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/(admin)/admin/_components/AdminSidebar.tsx
git commit -m "feat(admin): replace dashboard link with logout button in sidebar"
```

---

## Task 12: Filter admin tabs and sidebar entries by permission

**Files:**
- Modify: `frontend/src/app/(admin)/admin/page.tsx`
- Modify: `frontend/src/app/(admin)/admin/_components/AdminSidebar.tsx`

The admin page is a client component reading `?tab=` from the URL. The sidebar is also client-side. Both need the user's permission set. The simplest approach: a shared `usePermissions` hook in `lib/permissions.ts` that caches the result in a module-level Promise so multiple callers don't trigger duplicate fetches.

- [ ] **Step 1: Extend permissions helper with a hook**

Add to `frontend/src/lib/permissions.ts`:

```typescript
import { useEffect, useState } from "react";

let _cache: Promise<Set<string>> | null = null;

export function usePermissions(): { perms: Set<string>; loading: boolean } {
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!_cache) _cache = fetchMyPermissions();
    _cache.then((p) => {
      setPerms(p);
      setLoading(false);
    });
  }, []);
  return { perms, loading };
}
```

- [ ] **Step 2: Filter nav items in AdminSidebar**

In `AdminSidebar.tsx`, add a `permission` field to each `NavItem` (extending the interface on line 17-21):

```typescript
interface NavItem {
  tab: AdminTab;
  label: string;
  icon: React.ReactNode;
  permission: string;
}
```

Then update each item in `NAV_SECTIONS` (lines 25-126). Add the corresponding permission for each:

- overview → `"admin.overview.view"`
- users → `"admin.users.view"`
- staff → `"admin.staff.manage"`
- campaigns → `"admin.campaigns.view"`
- whatsapp → `"admin.whatsapp.manage"`
- ai_key → `"admin.ai_key.configure"`
- ai_costs → `"admin.ai_costs.view"`
- ai_revenue → `"admin.ai_revenue.view"`

Then in `AdminSidebarContent` (line 136), use the hook and filter:

```tsx
function AdminSidebarContent() {
  const searchParams = useSearchParams();
  const currentTab = (searchParams.get("tab") as AdminTab | null) ?? "overview";
  const { perms, loading } = usePermissions();

  if (loading) {
    return <aside className="w-55 shrink-0 border-r border-slate-800 bg-brand-navy-light" />;
  }

  const sections = NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => can(perms, i.permission)) }))
    .filter((s) => s.items.length > 0);

  return (
    <aside /* ...existing class... */ >
      {/* ...existing header... */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          /* ...same rendering as before... */
        ))}
      </nav>
      {/* ...existing footer... */}
    </aside>
  );
}
```

Add imports:

```typescript
import { can, usePermissions } from "@/lib/permissions";
```

- [ ] **Step 3: Gate the default tab in admin/page.tsx**

In `frontend/src/app/(admin)/admin/page.tsx`, read the tab from URL and if the user cannot see it, redirect to the first tab they can:

```tsx
const TAB_PERMISSIONS: Record<AdminTab, string> = {
  overview: "admin.overview.view",
  users: "admin.users.view",
  staff: "admin.staff.manage",
  campaigns: "admin.campaigns.view",
  whatsapp: "admin.whatsapp.manage",
  ai_costs: "admin.ai_costs.view",
  ai_revenue: "admin.ai_revenue.view",
  ai_key: "admin.ai_key.configure",
};
```

Near the top of the client component (wherever `currentTab` is computed), add:

```tsx
const { perms, loading } = usePermissions();

if (loading) return <div className="p-8 text-slate-400">Caricamento…</div>;

const visibleTabs = (Object.keys(TAB_PERMISSIONS) as AdminTab[]).filter((t) => can(perms, TAB_PERMISSIONS[t]));

const effectiveTab = visibleTabs.includes(currentTab as AdminTab) ? currentTab : visibleTabs[0];
```

Use `effectiveTab` wherever `currentTab` was used to select the tab body. This way a collaborator forcing `?tab=ai_key` will be silently redirected to a tab they can see.

- [ ] **Step 4: Manual verification by role**

Temporarily change your own role in the DB to each of the three staff roles and reload `/admin`:

```bash
docker compose exec supabase-db psql -U postgres -d postgres -c "UPDATE users SET role = 'collaborator' WHERE email = 'me@...';"
```

Check the visible tabs match the matrix. Reset to admin when done.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/permissions.ts frontend/src/app/(admin)/admin/page.tsx frontend/src/app/(admin)/admin/_components/AdminSidebar.tsx
git commit -m "feat(admin): filter tabs and sidebar by permission"
```

---

## Task 13: Hide destructive actions in admin components

**Files:**
- Modify: `frontend/src/app/(admin)/admin/_components/UserEditModal.tsx` (or `frontend/src/components/admin/UserEditModal.tsx` — check actual location)
- Modify: `frontend/src/app/(admin)/admin/_components/StaffTable.tsx`
- Modify: campaigns admin view (check actual path — likely in `admin/_components/` or adjacent)

Exact component locations to be confirmed during implementation; the pattern is identical for all three. This task does not ship its own tests — the UI gating is checked by the Playwright E2E in Task 14.

- [ ] **Step 1: Locate each component**

```bash
cd frontend && grep -rn "Elimina\|Sospendi\|Promuovi" src/app/\(admin\) src/components 2>/dev/null
```

Record the exact file paths for UserEditModal, StaffTable, and the campaigns admin table/card.

- [ ] **Step 2: Gate UserEditModal actions**

At the top of `UserEditModal.tsx`, import the hook:

```tsx
import { can, usePermissions } from "@/lib/permissions";
```

Inside the component:

```tsx
const { perms } = usePermissions();
const canEdit = can(perms, "admin.users.edit");
```

Wrap the "Sospendi" and "Elimina" buttons (and any ban/reset actions) with `{canEdit && (...)}`.

- [ ] **Step 3: Gate StaffTable promote action**

Same pattern, but the guard is `admin.staff.manage`:

```tsx
const canManageStaff = can(perms, "admin.staff.manage");
```

Wrap the "Cambia ruolo" / "Promuovi" button with `{canManageStaff && (...)}`.

- [ ] **Step 4: Gate campaigns suspend/delete**

Guard is `admin.campaigns.suspend`. Wrap any suspend or delete action on campaigns.

- [ ] **Step 5: Manual verification**

As in Task 12 step 4, temporarily switch your DB role to `collaborator` and confirm the "Elimina" / "Sospendi" / "Promuovi" buttons disappear. Switch back to `admin` — buttons reappear.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(admin\)/admin/_components/UserEditModal.tsx frontend/src/app/\(admin\)/admin/_components/StaffTable.tsx frontend/src/app/\(admin\)/admin/_components/CampaignsAdmin*.tsx
git commit -m "feat(admin): hide destructive actions without permission"
```

---

## Task 14: Playwright E2E

**Files:**
- Create: `frontend/e2e/admin-permissions.spec.ts` (if Playwright dir is elsewhere, place accordingly)

Prerequisite: Playwright is already configured in the project. Confirm with `ls frontend/playwright.config.*`.

- [ ] **Step 1: Check Playwright config**

```bash
cd frontend && ls playwright.config.* 2>/dev/null
cat playwright.config.ts 2>/dev/null | head -40
```

If no config exists, install it first:

```bash
cd frontend && npm init playwright@latest
```

- [ ] **Step 2: Write the E2E spec**

Create `frontend/e2e/admin-permissions.spec.ts`. This requires three pre-seeded test users with fixed credentials. Adjust env vars as needed for your test setup:

```typescript
import { test, expect } from "@playwright/test";

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL!, password: process.env.E2E_ADMIN_PW! };
const COLLAB = { email: process.env.E2E_COLLAB_EMAIL!, password: process.env.E2E_COLLAB_PW! };
const SALES = { email: process.env.E2E_SALES_EMAIL!, password: process.env.E2E_SALES_PW! };

async function login(page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname.startsWith("/admin") || url.pathname.startsWith("/dashboard"));
}

test.describe("Admin area — role-based visibility", () => {
  test("admin sees all 8 tabs", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/admin");
    for (const tab of ["Overview", "Utenti", "Staff", "Campagne", "Pratiche WhatsApp", "Claude API", "AI Costs", "AI Revenue"]) {
      await expect(page.getByRole("link", { name: tab })).toBeVisible();
    }
  });

  test("collaborator sees 4 tabs, no Staff / AI Costs / AI Revenue / Claude API", async ({ page }) => {
    await login(page, COLLAB);
    await page.goto("/admin");
    for (const tab of ["Overview", "Utenti", "Campagne", "Pratiche WhatsApp"]) {
      await expect(page.getByRole("link", { name: tab })).toBeVisible();
    }
    for (const tab of ["Staff", "Claude API", "AI Costs", "AI Revenue"]) {
      await expect(page.getByRole("link", { name: tab })).toHaveCount(0);
    }
  });

  test("sales sees 6 tabs including AI Costs / AI Revenue, no Staff / Claude API", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/admin");
    for (const tab of ["Overview", "Utenti", "Campagne", "Pratiche WhatsApp", "AI Costs", "AI Revenue"]) {
      await expect(page.getByRole("link", { name: tab })).toBeVisible();
    }
    for (const tab of ["Staff", "Claude API"]) {
      await expect(page.getByRole("link", { name: tab })).toHaveCount(0);
    }
  });

  test("no staff role shows 'Torna alla dashboard' link", async ({ page }) => {
    for (const user of [ADMIN, COLLAB, SALES]) {
      await login(page, user);
      await page.goto("/admin");
      await expect(page.getByText("Torna alla dashboard")).toHaveCount(0);
      await page.context().clearCookies();
    }
  });

  test("logout button signs out and redirects to /login", async ({ page }) => {
    await login(page, COLLAB);
    await page.goto("/admin");
    await page.getByRole("button", { name: /esci|logout/i }).first().click();
    await page.waitForURL("**/login");
    expect(page.url()).toMatch(/\/login$/);
  });
});
```

- [ ] **Step 3: Run the E2E**

```bash
cd frontend && npx playwright test e2e/admin-permissions.spec.ts
```

Expected: 5 tests PASS, assuming the three seed users exist and the dev server is running.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/admin-permissions.spec.ts
git commit -m "test(e2e): admin role-based UI visibility"
```

---

## Task 15: Final verification and cleanup

- [ ] **Step 1: Run the full backend test suite**

```bash
cd backend && pytest -v
```

Expected: all tests pass, no regressions in `test_auth.py`.

- [ ] **Step 2: Run the full frontend test suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass, no regressions in `tests/webhooks/twilio.test.ts` or component tests.

- [ ] **Step 3: Smoke-check the full role-change flow in the UI**

1. Log in as admin.
2. Go to Users tab, promote a test user to Collaborator.
3. Check MailHog — email received, promoted template with permissions list.
4. Change target to Sales. Check email — promoted template, sales permissions list.
5. Demote target back to user. Check email — demoted template, no permissions list.
6. Check DB: `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 5;` — three rows.

- [ ] **Step 4: Push branch and open PR**

```bash
git push -u origin <current-branch>
gh pr create --title "feat(admin): roles, granular permissions, role-change notifications" --body "$(cat <<'EOF'
## Summary
- Adds `sales` role and a DB-backed permissions matrix (`role_permissions` table) with an `audit_log` for admin actions.
- Extends the existing `PATCH /admin/users/:id/role` handler: adds `sales`, no-op guard, audit log insert, branded notification email on promotion/demotion/lateral change.
- Adds `GET /admin/me/permissions` so the frontend can gate tabs and destructive actions.
- Removes "Torna alla dashboard" from the admin top bar and sidebar; admin-area users see only `/admin` + a logout button.
- Filters admin tabs and hides destructive buttons in the UI based on the caller's permissions.

## Test plan
- [ ] Backend: `pytest` passes (new tests: permissions, role_change_emails, admin_role_change, me_permissions)
- [ ] Frontend: `vitest` passes (new: permissions helper)
- [ ] E2E: `playwright test` passes for admin/collaborator/sales views
- [ ] Manual: promote a user via UI → email lands in MailHog, `audit_log` row written
- [ ] Manual: log in as each role and verify tab visibility matches the spec's matrix

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Summary of Changes

**New files (8):**
- `supabase/migrations/018_add_sales_role.sql`
- `supabase/migrations/019_role_permissions_and_audit_log.sql`
- `backend/src/services/role_change_emails.py`
- `backend/templates/emails/role-promoted.html`
- `backend/templates/emails/role-demoted.html`
- `backend/tests/test_permissions.py`
- `backend/tests/test_role_change_emails.py`
- `backend/tests/test_admin_role_change.py`
- `backend/tests/test_admin_me_permissions.py`
- `frontend/src/lib/permissions.ts`
- `frontend/tests/lib/permissions.test.ts`
- `frontend/e2e/admin-permissions.spec.ts`

**Modified files (6):**
- `backend/src/auth/permissions.py` — `get_role_permissions`, `has_permission`.
- `backend/src/api/admin.py` — extend `admin_update_user_role`, add `GET /admin/me/permissions`.
- `frontend/src/app/(admin)/layout.tsx` — remove dashboard link.
- `frontend/src/app/(admin)/admin/_components/AdminSidebar.tsx` — logout button, permission-filtered nav.
- `frontend/src/app/(admin)/admin/_components/RoleModal.tsx` — add `sales` option.
- `frontend/src/app/(admin)/admin/page.tsx` — default-tab fallback based on permissions.
- `frontend/src/app/(admin)/admin/_components/UserEditModal.tsx` — hide destructive actions.
- `frontend/src/app/(admin)/admin/_components/StaffTable.tsx` — hide "Cambia ruolo".
- Campaigns admin component (path TBD at implementation time) — hide suspend/delete.
