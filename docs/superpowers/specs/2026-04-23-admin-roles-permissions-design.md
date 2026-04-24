# Admin Roles, Permissions and Role-Change Notifications

**Status:** Design approved, ready for implementation planning
**Date:** 2026-04-23
**Author:** Giuseppe Zileni (with Claude)

## Problem

Four functional issues surfaced during admin-area testing:

1. **No email on role change.** Promoting a user to staff (or demoting) does not send any notification. The user learns of the change only by opening the app.
2. **Admin area leaks back to `/dashboard`.** Two "Torna alla dashboard" links (top bar + sidebar) suggest admins have a separate "user" home. They should not — staff live only in `/admin`.
3. **No granular permissions.** The only distinction today is `admin` vs `non-admin`. We need role-specific capability fences: a collaborator can follow WhatsApp applications but must not configure the Claude API, suspend campaigns, or delete users.
4. **Dead API route.** `RoleModal.tsx` calls `PATCH /admin/users/:id/role` but the endpoint does not exist in the Next.js app.

A new role is also required: **sales** — identical to collaborator except they also see AI costs and AI revenue.

## Goals

- Send a branded email (Wamply colors, logo inline) on every effective role change, covering promotions, demotions, and lateral changes.
- Remove `/dashboard` navigation from every staff role. Staff home is `/admin`.
- Introduce a runtime-modifiable RBAC matrix (DB-backed) covering every admin feature, with `collaborator`, `sales`, `admin` roles seeded.
- Implement the missing `PATCH /api/admin/users/:id/role` route with RBAC guards, audit log, and email trigger.
- Hide admin tabs and destructive actions in the UI based on the caller's permissions (with API-side enforcement as the real fence).

## Non-Goals

- No UI to edit the RBAC matrix at runtime in this spec. The matrix is DB-backed so it *can* be edited via SQL/Supabase Studio immediately; a dedicated admin UI is future work.
- No migration of existing users. Admins and collaborators keep their role. The new `sales` role is assigned manually as needed.
- No refactor of existing Meta-status email code. We follow its pattern but do not touch it.

## Current State (findings)

- Roles defined in DB enum `user_role`: `user`, `admin` (migration 001), `collaborator` added by migration 017.
- Middleware `withAdminRole` and `withStaffRole` exist (`frontend/src/middleware/`).
- Admin tabs hardcoded in `frontend/src/app/(admin)/admin/page.tsx`: overview, users, staff, campaigns, whatsapp, ai_costs, ai_revenue, ai_key.
- "Torna alla dashboard" link in:
  - `frontend/src/app/(admin)/layout.tsx:22-24`
  - `frontend/src/app/(admin)/admin/_components/AdminSidebar.tsx:184-186`
- `PATCH /admin/users/:id/role` — **exists** in `backend/src/api/admin.py:335-372` (discovered during planning). Routed via Kong: `apiFetch()` in frontend hits `{KONG_URL}/api/v1/admin/...` → backend. The route updates the role but (a) does not include `sales` in `VALID_ROLES`, (b) does not send email, (c) does not write audit log.
- Backend Python SMTP already wired (`backend/src/services/meta_status_emails.py`) with template engine supporting `{{key}}` and `{{#BLOCK}}...{{/BLOCK}}`. Templates live in `backend/templates/emails/`.
- No granular permission system. RLS policies distinguish admin from others; the new system is **additive**, not replacing RLS.

## Architecture Overview

**Architecture note (revised during planning):** All admin API routes live in the Python backend (`backend/src/api/admin.py`) and are called by the frontend via `apiFetch()` → Kong → backend. There are **no Next.js API routes** for admin operations. The `PATCH /admin/users/:id/role` handler already exists — we extend it.

Four sub-features, implemented in this order:

1. **RBAC matrix (foundation).** DB table `role_permissions`, backend helper `get_user_permissions()` / `has_permission()` and frontend parallel helper, seeded with the agreed matrix.
2. **Extend backend `PATCH /admin/users/:id/role`.** Add `sales` to `VALID_ROLES`, write audit log, call email service. Reuse existing `require_admin` guard and last-active-admin logic.
3. **Backend email service.** New `send_role_change_email()` function in new module `role_change_emails.py`, mirroring `meta_status_emails.py`. Renders one of two templates, sends via existing SMTP helper.
4. **UI cleanup.** Remove dashboard links, add logout button, filter admin tabs by permission, hide destructive buttons. Update `RoleModal` to include `sales` option.

### End-to-end flow — role change

```
Admin clicks "Promote" in RoleModal
  → apiFetch PATCH /api/v1/admin/users/:id/role { role: 'collaborator' }
    → Kong → backend FastAPI
    → require_admin guard (existing)
    → validate role ∈ {user, collaborator, sales, admin}
    → self-modify guard (existing: "Non puoi modificare il tuo ruolo")
    → load target: old_role
    → last-active-admin guard (existing)
    → no-op if old_role == new_role (return 200)
    → UPDATE users SET role = $1, updated_at = now()
    → INSERT audit_log (actor, 'role_change', target, {old, new})
    → send_role_change_email(pool, target_id, old_role, new_role, actor_email)
        → query role_permissions for new_role (for PERMISSIONS_LIST)
        → render role-promoted.html or role-demoted.html
        → SMTP send via existing _send_email helper
        → exceptions logged but do not propagate
    → return { role: new_role }
```

Email is UX-level fire-and-forget: role change is always committed regardless of SMTP success/failure. SMTP failure is logged as a warning, same pattern as `send_meta_status_email`.

## Design — RBAC

### Roles

Enum `user_role` gains `sales`:
- `user` — standard end-user
- `collaborator` — staff, limited
- `sales` — collaborator + economics visibility
- `admin` — full access

Rank for promotion/demotion direction: `user=0, collaborator=1, sales=1, admin=2`.
- rank(new) > rank(old) → **promotion** email
- rank(new) < rank(old) → **demotion** email
- rank(new) == rank(old), roles differ → lateral change → use **promotion** template with neutral copy

### Permissions matrix (seed)

| Permission | admin | collaborator | sales |
|---|---|---|---|
| `admin.overview.view` | ✅ | ✅ | ✅ |
| `admin.users.view` | ✅ | ✅ | ✅ |
| `admin.users.edit` | ✅ | ❌ | ❌ |
| `admin.staff.manage` | ✅ | ❌ | ❌ |
| `admin.campaigns.view` | ✅ | ✅ | ✅ |
| `admin.campaigns.suspend` | ✅ | ❌ | ❌ |
| `admin.whatsapp.manage` | ✅ | ✅ | ✅ |
| `admin.ai_costs.view` | ✅ | ❌ | ✅ |
| `admin.ai_revenue.view` | ✅ | ❌ | ✅ |
| `admin.ai_key.configure` | ✅ | ❌ | ❌ |

Admin is seeded with single row `('admin', '*')` — wildcard. `hasPermission()` treats `*` as "any permission".

### Schema — migration `018_role_permissions.sql`

```sql
-- 1. Add 'sales' to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales';

-- 2. role_permissions table
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

-- 3. Audit log
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

-- inserts only by server (service role), no public write policy

-- 4. Seed role_permissions
INSERT INTO role_permissions (role, permission) VALUES
  ('admin', '*'),
  -- collaborator
  ('collaborator', 'admin.overview.view'),
  ('collaborator', 'admin.users.view'),
  ('collaborator', 'admin.campaigns.view'),
  ('collaborator', 'admin.whatsapp.manage'),
  -- sales
  ('sales', 'admin.overview.view'),
  ('sales', 'admin.users.view'),
  ('sales', 'admin.campaigns.view'),
  ('sales', 'admin.whatsapp.manage'),
  ('sales', 'admin.ai_costs.view'),
  ('sales', 'admin.ai_revenue.view');
```

### Backend helper — `backend/src/auth/permissions.py`

Extend the existing file with:

```python
async def get_role_permissions(db, role: str) -> set[str]:
    rows = await db.fetch("SELECT permission FROM role_permissions WHERE role = $1::user_role", role)
    return {r["permission"] for r in rows}

async def has_permission(db, user_role: str, permission: str) -> bool:
    perms = await get_role_permissions(db, user_role)
    return "*" in perms or permission in perms
```

Backend enforcement stays at the `require_admin` / `require_staff` layer for now — permissions are a data fence (emails list, RLS, UI gating) rather than replacing existing guards. Future route-level permission checks can adopt `has_permission` as needed.

### Frontend helper — `frontend/src/lib/permissions.ts` (new file)

Fetches once per page load via a new backend endpoint `GET /admin/me/permissions`:

```ts
export async function fetchMyPermissions(): Promise<Set<string>> { /* apiFetch + cache */ }
export function can(perms: Set<string>, permission: string): boolean {
  return perms.has("*") || perms.has(permission);
}
```

New backend endpoint `GET /admin/me/permissions` (in `admin.py`): returns `{ role, permissions: [...] }` for the calling user. Protected by `require_staff`.

Used in the frontend to:
- Filter admin tabs in `AdminSidebar.tsx` / admin `page.tsx`.
- Hide destructive buttons in modals and campaign actions.

## Design — Extend backend `PATCH /admin/users/:id/role`

**File:** `backend/src/api/admin.py:332-372` (existing handler `admin_update_user_role`).

**Changes:**
1. Update `VALID_ROLES = {"user", "collaborator", "sales", "admin"}` (add `sales`).
2. Return `200` no-op early if `target.role == new_role` (avoid spurious email + audit rows).
3. After the `UPDATE users SET role …` call, write to `audit_log` with:
   - `actor_id = user.id` (the calling admin)
   - `action = 'role_change'`
   - `target_id = user_id`
   - `metadata = {"old": old_role, "new": new_role}`
4. After the DB updates, call `send_role_change_email(db, user_id, old_role, new_role, actor_email=user.email)`. Wrap in try/except — failure must not abort the request. Log warnings with structlog.
5. Response body adds `{"previous_role": old_role}` to help the frontend update state without an extra fetch.

**Guards (most already present):**
- `require_admin` (existing).
- Self-modify guard: already present at line 343 (`Non puoi modificare il tuo ruolo`).
- Last-active-admin guard: already present at line 359-365. This already covers the "admin cannot self-demote as the last admin" case; with the self-modify guard, self-demote is impossible in any situation. The spec's "self-demote guard" is therefore already implemented.
- No-op guard: add `if target["role"] == new_role: return {"role": new_role, "previous_role": new_role}` before the UPDATE.

**Type determination (promotion vs demotion):**

Ranks: `user=0, collaborator=1, sales=1, admin=2`.
- `rank(new) > rank(old)` → `type = "promotion"`
- `rank(new) < rank(old)` → `type = "demotion"`
- `rank(new) == rank(old)` (collaborator ↔ sales) → `type = "promotion"` (uses promotion template with its permissions list, copy is neutral)

Logic lives in `role_change_emails.py`, not in the route handler.

## Design — Backend email service

**New files:**
- `backend/src/services/role_change_emails.py` — render + send, mirroring `meta_status_emails.py`. Exposes `send_role_change_email(db, user_id, old_role, new_role, actor_email)`.
- `backend/templates/emails/role-promoted.html`
- `backend/templates/emails/role-demoted.html`

**No internal HTTP endpoint** — the email service is called directly from `admin_update_user_role` in the same FastAPI process. Simpler than originally designed (no token, no second hop, no Kong routing).

**Function signature:**

```python
async def send_role_change_email(
    db: asyncpg.Pool,
    user_id: str,
    old_role: str,
    new_role: str,
    actor_email: str,
) -> bool:
    """Load target email/name, compute promotion/demotion type, render template,
    send via existing SMTP helper. Returns True if sent, False on any failure
    (logged as warning, does not raise)."""
```

**Render logic:**
- Query `role_permissions WHERE role = new_role` (only needed for promotion).
- Map permission keys to Italian labels via `PERMISSION_LABELS` dict. Unknown keys are skipped silently.
- Render with existing `_render()` (supports `{{key}}` + `{{#BLOCK}}…{{/BLOCK}}`).
- Variables: `USER_NAME`, `OLD_ROLE_LABEL`, `NEW_ROLE_LABEL`, `CHANGED_BY`, `PERMISSIONS_LIST_HTML`, `CTA_URL` (= `APP_URL + /admin`).

**Role labels (Italian):**
- `user` → "Utente"
- `collaborator` → "Collaboratore"
- `sales` → "Sales"
- `admin` → "Amministratore"

**Permission labels:**
```python
PERMISSION_LABELS = {
  'admin.overview.view': 'Visualizzare la dashboard amministrativa',
  'admin.users.view': 'Visualizzare la lista utenti',
  'admin.users.edit': 'Modificare, sospendere ed eliminare utenti',
  'admin.staff.manage': 'Promuovere e retrocedere membri dello staff',
  'admin.campaigns.view': 'Visualizzare le campagne di tutti gli utenti',
  'admin.campaigns.suspend': 'Sospendere ed eliminare campagne',
  'admin.whatsapp.manage': 'Gestire le applicazioni WhatsApp Business',
  'admin.ai_costs.view': 'Visualizzare i costi AI',
  'admin.ai_revenue.view': 'Visualizzare i ricavi AI',
  'admin.ai_key.configure': 'Configurare la system key Claude API',
}
```

**Template layout (both) — match existing `meta-approved.html` style:**

Dark theme, consistent with the other transactional emails already in `backend/templates/emails/`:

- Background `#0B1628` (brand navy deep).
- Outer card `#132240` with `1px solid #1E2F52`, border-radius 16px, max-width 600px.
- Header gradient `#1B2A4A → #0F1B33` with inline wordmark "Wam**ply**" (white "Wam" + teal `#0D9488` "ply") — no image asset needed.
- Status pill top-right: teal tint "Promosso" (promoted) or slate tint "Ruolo modificato" (demoted).
- H1 title, sub-paragraph `#94A3B8`.
- Info box: `#0B1628` background with `1px solid #0D9488`, centered, shows `OLD_ROLE_LABEL → NEW_ROLE_LABEL`.
- Promoted only: `{{#PERMISSIONS_LIST_HTML}}…{{/PERMISSIONS_LIST_HTML}}` conditional block with bullet list.
- CTA button teal `#0D9488`, white text, rounded pill: "Accedi al pannello admin" → `CTA_URL`.
- Small footnote: "Modificato da {{CHANGED_BY}}".
- Footer divider + copyright line `© Wamply — WhatsApp Campaign Manager`.
- Font-stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`.
- Table-based layout for email client compatibility.

**Copy — role-promoted.html body:**
> Buone notizie: il tuo ruolo su Wamply è stato aggiornato a **{{NEW_ROLE_LABEL}}**.
>
> Da ora hai accesso all'area amministrativa con le seguenti funzionalità:
>
> {{PERMISSIONS_LIST_HTML}}

**Copy — role-demoted.html body:**
> Ti informiamo che il tuo ruolo su Wamply è stato modificato da **{{OLD_ROLE_LABEL}}** a **{{NEW_ROLE_LABEL}}**.
>
> Se pensi sia un errore o vuoi chiarimenti, contatta l'amministratore.

**SMTP:** reuse `_send_email()` from `meta_status_emails.py` (same SSL/STARTTLS handling, same env vars). No image attachment — the wordmark is inline text/CSS, matching `meta-approved.html:22-25`.

## Design — UI cleanup

### Remove "Torna alla dashboard"

**`frontend/src/app/(admin)/layout.tsx:22-24`** — remove the anchor. Keep whatever title/branding sits next to it; if empty, leave a minimal "Admin" label.

**`frontend/src/app/(admin)/admin/_components/AdminSidebar.tsx:184-186`** — remove the `<Link href="/dashboard">`. Replace with a "Esci" (logout) button that calls Supabase `signOut()` then redirects to `/login`. No `/dashboard` navigation anywhere in the admin UI, for any role.

### Filter admin tabs by permission

In `frontend/src/app/(admin)/admin/page.tsx`, each tab is gated by one permission:

```ts
const TAB_PERMISSIONS: Record<TabId, string> = {
  overview: 'admin.overview.view',
  users: 'admin.users.view',
  staff: 'admin.staff.manage',
  campaigns: 'admin.campaigns.view',
  whatsapp: 'admin.whatsapp.manage',
  ai_costs: 'admin.ai_costs.view',
  ai_revenue: 'admin.ai_revenue.view',
  ai_key: 'admin.ai_key.configure',
};
```

Compute `visibleTabs = allTabs.filter(t => perms.has('*') || perms.has(TAB_PERMISSIONS[t]))` server-side. If the default selected tab is filtered out, fall back to the first visible tab.

Result per role:
- admin: all 8 tabs
- collaborator: overview, users, campaigns, whatsapp (4)
- sales: overview, users, campaigns, whatsapp, ai_costs, ai_revenue (6)

### Hide destructive actions in components

- `UserEditModal` — "Sospendi" and "Elimina" buttons hidden unless `hasPermission('admin.users.edit')`.
- `StaffTable` — "Cambia ruolo" / "Promuovi" button hidden unless `hasPermission('admin.staff.manage')`.
- Campaigns tab — "Sospendi campagna" / "Elimina campagna" actions hidden unless `hasPermission('admin.campaigns.suspend')`.

API-side checks remain regardless — UI hiding is cosmetic, the real fence is in the API route.

## Testing

Unit tests:
- `hasPermission()` — admin wildcard true for any permission, collaborator true for own perms false for others, sales has ai_costs true staff.manage false, user false for any admin.* perm.
- Email template renderer — given fixture data, produces expected HTML; handles empty PERMISSIONS_LIST_HTML in demoted template; skips unknown permission keys.

Backend API tests (route `PATCH /admin/users/:user_id/role`, via FastAPI `TestClient`):

- Admin promotes user → collaborator → 200, DB updated, audit_log row written.
- Admin promotes collaborator → admin → 200.
- Admin demotes collaborator → user → 200.
- Admin lateral collaborator ↔ sales → 200 (promotion template).
- Admin same role → 200 no-op, no audit, no email call.
- Non-admin (collaborator/sales/user) calls route → 403.
- Admin self-modify attempt → 400 (existing guard).
- Last active admin demoting self blocked → 400 (existing guard).
- Invalid role in body → 400.
- Target user not found → 404.
- Email send raising exception → role still updated, audit_log still written, warning logged.

Email rendering tests (pure unit, no SMTP):

- `send_role_change_email` computes `type=promotion` for user → collaborator, collaborator → admin, user → sales.
- Computes `type=demotion` for admin → collaborator, sales → user.
- Computes `type=promotion` for lateral collaborator → sales and sales → collaborator.
- Promoted template includes `<ul>` list from `PERMISSIONS_LIST_HTML` with Italian labels.
- Demoted template has no permissions block (conditional stripped).
- Italian role labels rendered correctly.
- Unknown permission key is silently skipped.
- SMTP smoke test against MailHog: `SMTP_HOST=mailhog SMTP_PORT=1025` — email visible at `http://localhost:8025`.

E2E (Playwright):
- Login as collaborator → admin tabs visible = overview/users/campaigns/whatsapp. No "staff", "ai_costs", "ai_revenue", "ai_key" tabs.
- Login as sales → same as collaborator + "ai_costs" + "ai_revenue". No "staff" or "ai_key".
- Login as admin → all 8 tabs.
- For every staff role: "Torna alla dashboard" not present anywhere.
- "Esci" button in sidebar logs out and redirects to `/login`.

## Risks & open points

- **Enum alter risk.** Postgres requires that `ALTER TYPE … ADD VALUE` be committed before the new label can appear as a literal in an `INSERT`. If the migration runner wraps the whole file in a single transaction, the seed `INSERT … VALUES ('sales', …)` will fail with "unsafe use of new value". Two acceptable fixes: (a) split into two migration files `018_add_sales_role.sql` (only the ALTER TYPE) and `019_role_permissions.sql` (table + seed), or (b) keep one file but run it outside a transaction. Prefer (a) — clearer, no runner-specific flags. The spec's "migration 018" in the implementation order should be read as "migrations 018 + 019" in this case.
- **`CurrentUser.email` availability.** The existing route reads `user.id` but not `user.email`. Must verify `CurrentUser` from `src.auth.jwt` exposes `email` (for `actor_email` in audit and email). If not, load it from `users` table alongside target in a single query.
- **Audit log growth.** No retention policy yet. Acceptable for now given low volume of role changes. Add retention as future work if volume grows.
- **Frontend permission fetch.** `GET /admin/me/permissions` is called on admin page mount. A stale cache could show tabs that are then 403'd. Acceptable: refresh on login / page reload; worst case user sees a tab but the action fails server-side.

## Out of scope / future work

- Admin UI to edit `role_permissions` at runtime.
- Audit log viewer UI in the admin area.
- Retention policy for `audit_log`.
- Email delivery retries / dead-letter queue (currently single-shot, synchronous call from route handler).
- Backend route-level permission enforcement (currently relies on `require_admin`/`require_staff` coarse checks + RLS; granular per-endpoint `require_permission('...')` is future work).

## File change summary

**New files:**
- `supabase/migrations/018_add_sales_role.sql` (ALTER TYPE only)
- `supabase/migrations/019_role_permissions_and_audit_log.sql` (tables + seed)
- `frontend/src/lib/permissions.ts`
- `backend/src/services/role_change_emails.py`
- `backend/templates/emails/role-promoted.html`
- `backend/templates/emails/role-demoted.html`
- `backend/tests/test_admin_role_change.py`
- `frontend/tests/admin/permissions.test.ts`

**Modified files:**

- `frontend/src/app/(admin)/layout.tsx` — remove "Torna alla dashboard" anchor (line 22-24).
- `frontend/src/app/(admin)/admin/_components/AdminSidebar.tsx` — replace dashboard link with logout button; filter nav sections by permission (lines 183-187 + NAV_SECTIONS rendering).
- `frontend/src/app/(admin)/admin/page.tsx` — fetch user permissions on mount, filter tabs.
- `frontend/src/app/(admin)/admin/_components/RoleModal.tsx` — add `sales` to `Role` type and add a third `RoleOption`.
- `frontend/src/components/admin/UserEditModal.tsx` — hide destructive buttons without `admin.users.edit`.
- `frontend/src/components/admin/StaffTable.tsx` — hide "Cambia ruolo" without `admin.staff.manage`.
- Campaigns admin view — hide suspend/delete without `admin.campaigns.suspend`.
- `backend/src/auth/permissions.py` — add `get_role_permissions` and `has_permission`.
- `backend/src/api/admin.py` — extend `admin_update_user_role` (add sales, no-op guard, audit log, email call); add new `GET /admin/me/permissions` endpoint.

## Implementation order (revised for writing-plans)

1. Migrations 018 (ALTER TYPE add 'sales') + 019 (role_permissions + audit_log tables + seed).
2. Backend helper `has_permission` in `permissions.py` + unit test.
3. Backend email templates + `role_change_emails.py` + rendering unit tests + MailHog smoke test.
4. Extend backend `admin_update_user_role`: add sales to VALID_ROLES, no-op guard, audit log insert, email call. Backend API tests with `TestClient`.
5. Backend new endpoint `GET /admin/me/permissions` + test.
6. Frontend `lib/permissions.ts` helper + unit test.
7. Frontend `RoleModal` update: add `sales` option.
8. Remove "Torna alla dashboard" in `layout.tsx`; add logout button in `AdminSidebar.tsx`.
9. Frontend tab filtering in admin `page.tsx` and `AdminSidebar.tsx` using fetched permissions.
10. Frontend destructive-action hiding in user/staff/campaign components.
11. Playwright E2E scenarios.
