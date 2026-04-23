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
- `PATCH /api/admin/users/:id/role` — **missing** (called from `RoleModal.tsx:43`).
- Backend Python SMTP already wired (`backend/src/services/meta_status_emails.py`) with template engine supporting `{{key}}` and `{{#BLOCK}}...{{/BLOCK}}`. Templates live in `backend/templates/emails/`.
- No granular permission system. RLS policies distinguish admin from others; the new system is **additive**, not replacing RLS.

## Architecture Overview

Four sub-features, implemented in this order:

1. **RBAC matrix (foundation).** DB table `role_permissions`, shared helper `hasPermission()`, seeded with the agreed matrix.
2. **`PATCH /api/admin/users/:id/role` route.** Guards via `withAdminRole` + `hasPermission('admin.staff.manage')`, updates DB, writes audit log, calls backend to send email.
3. **Backend email service.** New `POST /internal/notify-role-change` endpoint protected by shared token, renders one of two templates, sends via existing SMTP.
4. **UI cleanup.** Remove dashboard links, filter admin tabs by permission, hide destructive buttons.

### End-to-end flow — role change

```
Admin clicks "Promote" in RoleModal
  → PATCH /api/admin/users/:id/role { role: 'collaborator' }
    → withAdminRole guard
    → hasPermission(session.user.id, 'admin.staff.manage') guard
    → load target user (old_role, email, name)
    → guard: self-demote forbidden
    → guard: no-op if same role
    → UPDATE users SET role = :new_role
    → INSERT audit_log (actor, 'role_change', target, {old, new})
    → POST {BACKEND}/internal/notify-role-change (fire-and-forget, 5s timeout)
        → verify X-Internal-Token
        → query role_permissions for new_role (for PERMISSIONS_LIST)
        → render role-promoted.html or role-demoted.html
        → SMTP send (background task)
    → 200 { ok, role }
```

Email is UX-level fire-and-forget: role change is always committed regardless of backend email success/failure. Backend failure is logged as a warning.

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

### Helper — `frontend/src/lib/permissions.ts`

```ts
export async function getUserPermissions(userId: string): Promise<Set<string>>;
export async function hasPermission(userId: string, permission: string): Promise<boolean>;
```

- Reads `users.role` then `role_permissions` where `role = user.role`.
- `hasPermission` returns true if permissions contain `*` or exact match.
- Per-request cache via React `cache()` (server components) or a simple Map in API routes to avoid repeated DB hits in one request.

Used in three layers:
- **API routes** — hard block with 403.
- **Server components** — conditional rendering of tabs/buttons.
- **`withStaffRole` / `withAdminRole` middleware** — unchanged; permission check is an additional layer on top of role check.

## Design — Route `PATCH /api/admin/users/:id/role`

**File:** `frontend/src/app/api/admin/users/[id]/role/route.ts`

**Contract:**
- Method: `PATCH`
- Body: `{ role: 'user' | 'collaborator' | 'sales' | 'admin' }`
- Auth: Supabase session cookie
- Response 200: `{ ok: true, role }`

**Guards (in order):**
1. `withAdminRole` → 401/403.
2. Zod validate body.
3. `hasPermission(caller, 'admin.staff.manage')` → 403.
4. Load target user: 404 if missing.
5. **Self-demote guard:** if `target.id === caller.id && new_role !== 'admin'` → 400 with message "Un admin non può retrocedersi da solo. Chiedi a un altro amministratore."
6. If `old_role === new_role` → 200 no-op (no update, no audit, no email).

**Side effects (atomic-ish, in single request):**
1. `UPDATE users SET role = :new_role WHERE id = :target_id`.
2. `INSERT INTO audit_log` with actor, action=`role_change`, target, metadata=`{old, new}`.
3. Determine email type (promotion | demotion | lateral-as-promotion).
4. `fetch POST {BACKEND_URL}/internal/notify-role-change` with header `X-Internal-Token: ${INTERNAL_API_TOKEN}` and body `{ user_email, user_name, old_role, new_role, changed_by_email, type }`. Timeout 5s. Fire-and-forget: on failure, `console.warn` and continue — **do not** roll back the role change.

**Env vars added:**
- `BACKEND_INTERNAL_URL` — e.g. `http://backend:8000`
- `INTERNAL_API_TOKEN` — shared secret, same value in Next.js and Python backend env.

## Design — Backend email service

**New files:**
- `backend/src/api/internal.py` — FastAPI router exposing `POST /internal/notify-role-change`.
- `backend/src/services/role_change_emails.py` — render + send, mirroring `meta_status_emails.py`.
- `backend/templates/emails/role-promoted.html`
- `backend/templates/emails/role-demoted.html`
- `backend/templates/emails/assets/wamply-logo.png` — copy of the logo to embed via CID.

**Endpoint:**
```
POST /internal/notify-role-change
Header: X-Internal-Token: <INTERNAL_API_TOKEN>   # 401 if mismatch
Body JSON: {
  user_email: str,
  user_name: str,
  old_role: str,
  new_role: str,
  changed_by_email: str,
  type: 'promotion' | 'demotion'   # lateral is sent as 'promotion'
}

# Rationale for lateral=promotion: a lateral change (collaborator ↔ sales)
# has the same rank. Using the demotion template would wrongly imply a
# downgrade; using the promotion template with its permission list is the
# most informative for the user (they see what they now can do). The copy
# is neutral enough ("il tuo ruolo è stato aggiornato a X") to cover this.
Response: 200 { queued: true } immediately; send runs in FastAPI BackgroundTasks.
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

**Template layout (both):**
- Header bar navy `#0B1D3A`, inline logo via CID (`cid:wamply-logo`).
- Greeting: "Ciao {{USER_NAME}},".
- Body paragraph (varies promoted vs demoted — see copy below).
- Info box with rounded corners, background `#F3F6FA`, border-left `4px solid #1ABC9C`, showing "Ruolo precedente: {{OLD_ROLE_LABEL}}" and "Ruolo attuale: **{{NEW_ROLE_LABEL}}**".
- Only in promoted: "Ora hai accesso a:" + bullet list `{{PERMISSIONS_LIST_HTML}}` (rendered as `<ul><li>…</li></ul>`).
- CTA button teal `#1ABC9C`, text white, rounded 8px: "Accedi a Wamply" → `CTA_URL`.
- Small footnote: "Modificato da {{CHANGED_BY}}".
- Footer: "Wamply · WhatsApp Campaign Manager" + `support@wamply.it` + privacy link.
- Font-stack: `-apple-system, 'Segoe UI', Inter, Roboto, sans-serif`.
- Single-column, max-width 600px, table-based layout for email client compatibility.

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

**SMTP:** reuse `_send_email()` from `meta_status_emails.py` (same SSL/STARTTLS handling, same env vars). Attach logo PNG as `MIMEImage` with Content-ID `wamply-logo`, inline disposition.

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

API tests (route `PATCH /api/admin/users/:id/role`):
- Admin promotes user → collaborator → 200, DB updated, audit_log row written, backend called with `type=promotion`.
- Admin promotes collaborator → admin → 200, `type=promotion`.
- Admin demotes collaborator → user → 200, `type=demotion`.
- Admin lateral collaborator ↔ sales → 200, `type=promotion` (copy neutral).
- Admin same role → 200 no-op, no audit, no backend call.
- Collaborator calls route → 403.
- Sales calls route → 403.
- Anonymous → 401.
- Admin self-demote → 400.
- Invalid role in body → 400.
- Target user not found → 404.
- Backend down / timeout → role still updated, audit_log still written, warning logged.

Backend tests (endpoint `/internal/notify-role-change`):
- Missing / wrong `X-Internal-Token` → 401.
- Valid request → 200 immediately, email dispatched in background.
- Promotion template includes PERMISSIONS_LIST rendered as `<ul>` with Italian labels.
- Demotion template has no PERMISSIONS_LIST section.
- Italian role labels applied.
- Smoke test against MailHog (dev) — email visible at `localhost:8025`.

E2E (Playwright):
- Login as collaborator → admin tabs visible = overview/users/campaigns/whatsapp. No "staff", "ai_costs", "ai_revenue", "ai_key" tabs.
- Login as sales → same as collaborator + "ai_costs" + "ai_revenue". No "staff" or "ai_key".
- Login as admin → all 8 tabs.
- For every staff role: "Torna alla dashboard" not present anywhere.
- "Esci" button in sidebar logs out and redirects to `/login`.

## Risks & open points

- **Enum alter risk.** Postgres requires that `ALTER TYPE … ADD VALUE` be committed before the new label can appear as a literal in an `INSERT`. If the migration runner wraps the whole file in a single transaction, the seed `INSERT … VALUES ('sales', …)` will fail with "unsafe use of new value". Two acceptable fixes: (a) split into two migration files `018_add_sales_role.sql` (only the ALTER TYPE) and `019_role_permissions.sql` (table + seed), or (b) keep one file but run it outside a transaction. Prefer (a) — clearer, no runner-specific flags. The spec's "migration 018" in the implementation order should be read as "migrations 018 + 019" in this case.
- **Internal token.** `INTERNAL_API_TOKEN` must be present in both Next.js and Python envs. Missing → 401 everywhere. Add to `.env.example` in both projects.
- **Logo path.** Memory references `frontend/public/agent-engineering-logo.png`; verify during implementation whether a dedicated Wamply logo exists and use that instead.
- **Backend URL in dev vs prod.** `BACKEND_INTERNAL_URL` differs (`http://backend:8000` in Docker, `http://localhost:8000` outside). Document in `.env.example`.
- **Audit log growth.** No retention policy yet. Acceptable for now given low volume of role changes. Add retention as future work if volume grows.

## Out of scope / future work

- Admin UI to edit `role_permissions` at runtime.
- Audit log viewer UI in the admin area.
- Retention policy for `audit_log`.
- Email delivery retries / dead-letter queue (currently single-shot via FastAPI BackgroundTasks).

## File change summary

**New files:**
- `supabase/migrations/018_role_permissions.sql`
- `frontend/src/lib/permissions.ts`
- `frontend/src/app/api/admin/users/[id]/role/route.ts`
- `backend/src/api/internal.py`
- `backend/src/services/role_change_emails.py`
- `backend/templates/emails/role-promoted.html`
- `backend/templates/emails/role-demoted.html`
- `backend/templates/emails/assets/wamply-logo.png`

**Modified files:**
- `frontend/src/app/(admin)/layout.tsx` — remove dashboard link
- `frontend/src/app/(admin)/admin/_components/AdminSidebar.tsx` — replace dashboard link with logout button
- `frontend/src/app/(admin)/admin/page.tsx` — tab filtering by permission
- `frontend/src/components/admin/UserEditModal.tsx` — hide destructive actions
- `frontend/src/components/admin/StaffTable.tsx` — hide role-change when lacking permission
- Campaigns tab components — hide suspend/delete when lacking permission
- `backend/src/main.py` (or app factory) — register new internal router
- `.env.example` (frontend & backend) — add `INTERNAL_API_TOKEN`, `BACKEND_INTERNAL_URL`

## Implementation order (for writing-plans)

1. Migration 018 (enum + role_permissions + audit_log + seed).
2. `lib/permissions.ts` + unit tests.
3. Email templates + `role_change_emails.py` + renderer tests + MailHog smoke.
4. Backend `/internal/notify-role-change` endpoint + tests.
5. Next.js `PATCH /api/admin/users/:id/role` route + integration tests with mocked backend.
6. Remove "Torna alla dashboard" links + add logout button.
7. Tab filtering + destructive-action hiding in admin UI.
8. Playwright E2E scenarios.
