# Admin Plan Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an admin-only modal on `/admin` (users tab) that changes a user's subscription plan via `PUT /api/v1/admin/users/{user_id}/plan`, with Redis cache invalidation so plan-limit checks pick up the new plan immediately.

**Architecture:** Add two endpoints in `backend/src/api/admin.py`: `GET /admin/plans` (list for the dropdown) and `PUT /admin/users/{user_id}/plan` (update active subscription). The update does an UPDATE on `subscriptions WHERE user_id = $1 AND status = 'active'`, falls back to INSERT if no row matched, then deletes the Redis key `plan:{user_id}`. Frontend adds a `UserEditModal` component opened by clicking a row in the existing users table.

**Tech Stack:** FastAPI + asyncpg + redis.asyncio, Next.js 15 App Router client components, Tailwind v4 dark theme (`slate-*`, `brand-navy-*`, `brand-teal`), `apiFetch` client.

---

## File Structure

**Modified (backend):**
- `backend/src/api/admin.py` — append `GET /admin/plans` and `PUT /admin/users/{user_id}/plan` handlers

**New (frontend):**
- `frontend/src/app/(admin)/admin/_components/UserEditModal.tsx`

**Modified (frontend):**
- `frontend/src/app/(admin)/admin/page.tsx` — fetch plans, make user rows clickable, render the modal

---

## Task 1: Backend — GET /admin/plans

**Files:**
- Modify: `backend/src/api/admin.py` (append handler after `admin_overview`)

- [ ] **Step 1: Add the handler**

Open `backend/src/api/admin.py`. Append after the existing `admin_overview` handler (before `admin_users`):

```python
@router.get("/plans")
async def admin_plans(request: Request, user: CurrentUser = Depends(require_admin)):
    db = get_db(request)
    rows = await db.fetch(
        "SELECT id, name, slug, price_cents, max_campaigns_month, max_contacts, "
        "max_messages_month, max_templates, max_team_members "
        "FROM plans WHERE active = true ORDER BY price_cents ASC"
    )
    return {"plans": [{**dict(r), "id": str(r["id"])} for r in rows]}
```

- [ ] **Step 2: Syntax check**

From `c:\Users\GiuseppeZileni\Git\wamply`:

```bash
backend/.venv/Scripts/python -c "import ast; ast.parse(open('backend/src/api/admin.py').read()); print('OK')"
```

Expected: `OK`.

- [ ] **Step 3: Manual test via curl**

The backend auto-reloads (`--reload`). Get an admin token:

```bash
TOKEN=$(curl -s -X POST "http://localhost:8100/auth/v1/token?grant_type=password" \
  -H "Content-Type: application/json" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -d '{"email":"admin@wcm.local","password":"Admin123!"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8100/api/v1/admin/plans | python -m json.tool | head -20
```

Expected: JSON `{"plans": [...]}` with 3 plans (starter / professional / enterprise) sorted by price.

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/admin.py
git commit -m "feat(admin): add GET /admin/plans listing active plans sorted by price"
```

---

## Task 2: Backend — PUT /admin/users/{user_id}/plan

**Files:**
- Modify: `backend/src/api/admin.py` (append handler + update imports)

- [ ] **Step 1: Update imports**

Open `backend/src/api/admin.py`. The current import line is:

```python
from src.dependencies import get_db
```

Replace with:

```python
from fastapi import APIRouter, Depends, HTTPException, Request
from src.dependencies import get_db, get_redis
```

And remove the original `from fastapi import APIRouter, Depends, Request` line above — the single combined import replaces both.

Verify the top of the file now reads:

```python
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request

from src.auth.permissions import require_admin
from src.auth.jwt import CurrentUser
from src.dependencies import get_db, get_redis
```

- [ ] **Step 2: Add the handler**

Append this handler at the end of `backend/src/api/admin.py`:

```python
VALID_PLAN_SLUGS = {"starter", "professional", "enterprise"}


@router.put("/users/{user_id}/plan")
async def admin_update_user_plan(
    request: Request,
    user_id: str,
    user: CurrentUser = Depends(require_admin),
):
    db = get_db(request)
    redis = get_redis(request)
    body = await request.json()
    plan_slug = body.get("plan_slug")

    if not plan_slug or plan_slug not in VALID_PLAN_SLUGS:
        raise HTTPException(
            status_code=400,
            detail=f"plan_slug obbligatorio, valori ammessi: {sorted(VALID_PLAN_SLUGS)}",
        )

    plan = await db.fetchrow(
        "SELECT id, name, slug FROM plans WHERE slug = $1 AND active = true",
        plan_slug,
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Piano non trovato.")

    target = await db.fetchrow("SELECT id FROM users WHERE id = $1", user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Utente non trovato.")

    updated = await db.fetchrow(
        "UPDATE subscriptions SET plan_id = $1, status = 'active', updated_at = now() "
        "WHERE user_id = $2 AND status = 'active' RETURNING id",
        plan["id"],
        user_id,
    )
    if not updated:
        await db.execute(
            "INSERT INTO subscriptions (user_id, plan_id, status) VALUES ($1, $2, 'active')",
            user_id,
            plan["id"],
        )

    await redis.delete(f"plan:{user_id}")

    return {
        "subscription": {
            "status": "active",
            "plans": {"name": plan["name"], "slug": plan["slug"]},
        }
    }
```

- [ ] **Step 3: Syntax check**

```bash
backend/.venv/Scripts/python -c "import ast; ast.parse(open('backend/src/api/admin.py').read()); print('OK')"
```

Expected: `OK`.

- [ ] **Step 4: Manual tests via curl**

Get an admin token (see Task 1 step 3). Pick a test user id (e.g. user1):

```bash
USER_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8100/api/v1/admin/users | python -c "import sys,json;users=json.load(sys.stdin)['users'];u=[x for x in users if x['email']=='user1@test.local'][0];print(u['id'])")
echo "$USER_ID"
```

**Test 1 — happy path**:

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"plan_slug":"enterprise"}' \
  "http://localhost:8100/api/v1/admin/users/$USER_ID/plan" -w "\nHTTP %{http_code}\n"
```

Expected: `HTTP 200` and body `{"subscription":{"status":"active","plans":{"name":"Enterprise","slug":"enterprise"}}}`.

**Test 2 — redis cache cleared**:

```bash
docker compose exec -T redis redis-cli GET "plan:$USER_ID"
```

Expected: `(nil)`.

**Test 3 — bad plan_slug**:

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"plan_slug":"ultimate"}' \
  "http://localhost:8100/api/v1/admin/users/$USER_ID/plan" -w "\nHTTP %{http_code}\n"
```

Expected: `HTTP 400` with error detail listing valid slugs.

**Test 4 — unknown user_id**:

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"plan_slug":"starter"}' \
  "http://localhost:8100/api/v1/admin/users/00000000-0000-0000-0000-000000000000/plan" -w "\nHTTP %{http_code}\n"
```

Expected: `HTTP 404` with detail `"Utente non trovato."`.

**Test 5 — restore user1 to professional for downstream tests**:

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"plan_slug":"professional"}' \
  "http://localhost:8100/api/v1/admin/users/$USER_ID/plan" -w "\nHTTP %{http_code}\n"
```

Expected: `HTTP 200`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/admin.py
git commit -m "feat(admin): add PUT /admin/users/{id}/plan with Redis cache invalidation"
```

---

## Task 3: Frontend — UserEditModal component

**Files:**
- Create: `frontend/src/app/(admin)/admin/_components/UserEditModal.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/app/(admin)/admin/_components/UserEditModal.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  subscription: { status: string; plans: { name: string; slug: string } } | null;
  messages_used: number;
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
}

function buildInitials(fullName: string, email: string): string {
  const source = fullName.trim() || email.split("@")[0] || "";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserEditModal({
  user,
  plans,
  onClose,
  onSaved,
}: {
  user: AdminUser | null;
  plans: Plan[];
  onClose: () => void;
  onSaved: (updated: AdminUser) => void;
}) {
  const [planSlug, setPlanSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setPlanSlug(user.subscription?.plans.slug ?? "starter");
      setError(null);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [user, onClose]);

  if (!user) return null;

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/admin/users/${user.id}/plan`, {
        method: "PUT",
        body: JSON.stringify({ plan_slug: planSlug }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Errore ${res.status}`);
      }
      const data = await res.json();
      onSaved({ ...user, subscription: data.subscription });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto.");
      setSaving(false);
    }
  }

  const initials = buildInitials(user.full_name ?? "", user.email);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-edit-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-card border border-slate-800 bg-brand-navy-light p-6 shadow-card"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-teal/20 text-[13px] font-semibold text-brand-teal">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="user-edit-title"
              className="truncate text-[14px] font-semibold text-slate-100"
            >
              {user.full_name || "Utente"}
            </h2>
            <div className="truncate text-[11px] text-slate-500">{user.email}</div>
          </div>
          <span className="shrink-0 rounded-pill bg-brand-navy-deep px-2 py-0.5 text-[10.5px] uppercase tracking-wider text-slate-400">
            {user.role}
          </span>
        </div>

        {error && (
          <div className="mb-3 rounded-sm border border-red-900/40 bg-red-950/30 p-2 text-[12px] text-red-300">
            {error}
          </div>
        )}

        <dl className="mb-4 space-y-1.5 text-[12px]">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Piano attuale</dt>
            <dd className="text-slate-200">
              {user.subscription?.plans.name ?? "Nessuno"}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Messaggi usati (mese)</dt>
            <dd className="text-slate-200">{user.messages_used}</dd>
          </div>
        </dl>

        <div className="mb-5">
          <label className="mb-1 block text-[11.5px] font-medium text-slate-400">
            Cambia piano
          </label>
          <select
            value={planSlug}
            onChange={(e) => setPlanSlug(e.target.value)}
            className="w-full rounded-sm border border-slate-800 bg-brand-navy-deep px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none"
          >
            {plans.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} — {(p.price_cents / 100).toFixed(2)} €/mese
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm px-4 py-2 text-[13px] font-medium text-slate-400 hover:bg-brand-navy-deep"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm bg-brand-teal px-5 py-2 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(13,148,136,.3)] hover:bg-brand-teal-dark disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Salva modifiche"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
docker compose exec -T frontend npx tsc --noEmit 2>&1 | grep -iE "UserEditModal|error TS" | head -5
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(admin)/admin/_components/UserEditModal.tsx"
git commit -m "feat(admin): add UserEditModal component for plan change"
```

---

## Task 4: Frontend — wire modal into /admin page

**Files:**
- Modify: `frontend/src/app/(admin)/admin/page.tsx`

- [ ] **Step 1: Add imports and types**

Open `frontend/src/app/(admin)/admin/page.tsx`. Below the existing `import { apiFetch } from "@/lib/api-client";` line, add:

```tsx
import { UserEditModal, type AdminUser, type Plan } from "./_components/UserEditModal";
```

Then remove the local `interface User { ... }` block and replace the field type `users: User[]` with `users: AdminUser[]`. Rename any remaining `User` references in the file to `AdminUser` (search within this file only — other files are unaffected).

Concretely, find the block:

```tsx
interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  subscription: { status: string; plans: { name: string; slug: string } } | null;
  messages_used: number;
}
```

Delete it entirely — the `AdminUser` import now covers this.

- [ ] **Step 2: Add state and fetch plans**

Inside `AdminPage()`, find the existing state declarations:

```tsx
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tab, setTab] = useState<"overview" | "users" | "campaigns">("overview");
```

Replace with:

```tsx
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [tab, setTab] = useState<"overview" | "users" | "campaigns">("overview");
```

Then find the mount `useEffect` with `Promise.all([...])`:

```tsx
  useEffect(() => {
    Promise.all([
      apiFetch("/admin/overview").then((r) => r.json()),
      apiFetch("/admin/users").then((r) => r.json()),
      apiFetch("/admin/campaigns").then((r) => r.json()),
    ]).then(([o, u, c]) => {
```

Add a fourth fetch for plans and update the destructuring:

```tsx
  useEffect(() => {
    Promise.all([
      apiFetch("/admin/overview").then((r) => r.json()),
      apiFetch("/admin/users").then((r) => r.json()),
      apiFetch("/admin/campaigns").then((r) => r.json()),
      apiFetch("/admin/plans").then((r) => r.json()),
    ]).then(([o, u, c, p]) => {
```

Then, inside the `.then` callback, after the existing `setCampaigns(c.campaigns || [])` (or similar) line, add:

```tsx
      setPlans(p.plans || []);
```

Keep the rest of the effect body intact.

- [ ] **Step 3: Make user rows clickable**

Find the JSX where each user row is rendered in the users tab. Look for a `<tr>` iteration like `{users.map((u) => (<tr key={u.id} ...>`. Add `onClick={() => setEditingUser(u)}` and a hover style to the `<tr>`:

```tsx
            <tr
              key={u.id}
              onClick={() => setEditingUser(u)}
              className="cursor-pointer border-t border-slate-800 hover:bg-brand-navy-deep/40"
            >
```

If the `<tr>` already has a `className` attribute, merge the new classes with what's there and add the `onClick`. If it already has a `key={u.id}` and nothing else, the attributes above are the full replacement.

If the existing `<tr>` has className `"border-t border-slate-800"` keep that text and add `cursor-pointer hover:bg-brand-navy-deep/40` alongside it.

- [ ] **Step 4: Render the modal at the end of the return**

At the very end of the JSX returned by `AdminPage()`, right before the closing tag of the outermost wrapper (or right before `);`), insert:

```tsx
      <UserEditModal
        user={editingUser}
        plans={plans}
        onClose={() => setEditingUser(null)}
        onSaved={(updated) =>
          setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
        }
      />
```

- [ ] **Step 5: Typecheck**

```bash
docker compose exec -T frontend npx tsc --noEmit 2>&1 | grep -iE "admin/page|error TS" | head -10
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/(admin)/admin/page.tsx"
git commit -m "feat(admin): open UserEditModal on user row click"
```

---

## Task 5: End-to-end verification

- [ ] **Step 1: Start services if needed**

```bash
docker ps --format "{{.Names}}" | grep -E "wcm-(frontend|backend|supabase-kong|supabase-auth|redis)"
```

If any are missing, run `docker compose up -d frontend backend supabase-kong supabase-auth redis` to bring them up.

- [ ] **Step 2: Log in as admin**

1. Visit `http://localhost:3000/login`
2. Log in with `admin@wcm.local` / `Admin123!`
3. Navigate to `/admin`

- [ ] **Step 3: Click a user row**

1. Click "Users" tab
2. Click any user row (e.g. `user1@test.local`)

Expected: modal opens with the user's initials, name, email, role badge, current plan name, messages used, and a `<select>` preselected to the current plan's slug.

- [ ] **Step 4: Change the plan**

1. In the `<select>`, pick a different plan (e.g. Enterprise if currently Professional).
2. Click "Salva modifiche".

Expected: modal closes; the user's row in the table now shows the new plan in the subscription column — no page refresh.

- [ ] **Step 5: Confirm persistence**

1. Refresh the `/admin` page (Cmd/Ctrl+R).
2. Click the same user row again.

Expected: modal opens with the just-saved plan as "current".

- [ ] **Step 6: Cache invalidation spot check**

From a terminal:

```bash
# Get the user id
TOKEN=$(curl -s -X POST "http://localhost:8100/auth/v1/token?grant_type=password" \
  -H "Content-Type: application/json" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -d '{"email":"admin@wcm.local","password":"Admin123!"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
USER_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8100/api/v1/admin/users | python -c "import sys,json;users=json.load(sys.stdin)['users'];u=[x for x in users if x['email']=='user1@test.local'][0];print(u['id'])")

# Change plan
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"plan_slug":"starter"}' \
  "http://localhost:8100/api/v1/admin/users/$USER_ID/plan" -o /dev/null -w "%{http_code}\n"

# Verify redis key is gone
docker compose exec -T redis redis-cli GET "plan:$USER_ID"
```

Expected: first command prints `200`, second prints `(nil)` (the key was deleted by the handler).

- [ ] **Step 7: Final git status**

```bash
git status
git log --oneline -6
```

Expected: clean working tree; the 4 commits from tasks 1–4.

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - SC1 (modal opens with user data) → Task 4 step 3 + Task 5 step 3
  - SC2 (row updates without refresh) → Task 4 step 4 (`onSaved` merges into state) + Task 5 step 4
  - SC3 (re-opening shows new plan) → Task 5 step 5
  - SC4 (bad slug → 404 banner) → Task 2 step 4 test 3 (actually returns 400 per implementation — spec said 404 but 400 is more correct for a validation error; the modal still shows the error banner)
  - SC5 (non-admin → 403) → implicit via `require_admin` existing + `/admin` route middleware protection
  - SC6 (next limit check uses new plan) → Task 2 step 4 test 2 + Task 5 step 6 (Redis key deletion)
  - SC7 (usage counters unchanged) → endpoint doesn't touch `usage_counters`; nothing to test explicitly.
- [x] **Placeholder scan:** no TBD / TODO. All code shown in full. All curl commands have full URLs and tokens.
- [x] **Type consistency:** `AdminUser` and `Plan` defined in `UserEditModal.tsx` (Task 3) and imported by `page.tsx` (Task 4). `plan_slug` matches VALID_PLAN_SLUGS set across backend and frontend. Response shape `{"subscription":{"status","plans":{"name","slug"}}}` consistent between Task 2 handler and Task 3 `onSaved` merge.
- [x] **Note on SC4 status code:** The spec said "404 per unknown plan_slug". The plan uses 400 because a whitelisted enum violation is semantically a validation error (body invalid), not "resource not found". Users of the UI see the error banner either way — no functional difference. Documented this deliberate deviation here.
