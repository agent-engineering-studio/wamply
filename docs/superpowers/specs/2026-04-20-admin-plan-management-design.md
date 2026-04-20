# Admin Plan Management — Design Doc

**Date:** 2026-04-20
**Status:** Approved for implementation
**Scope:** Feature B of three sub-projects (password strength → admin plan management → user billing view).

## Goal

Give the admin UI a modal on `/admin` (users tab) that lets an admin change a user's subscription plan by clicking on their row. The change persists via a new `PUT /api/v1/admin/users/{user_id}/plan` endpoint and invalidates the Redis plan-limits cache so subsequent quota checks read the new plan immediately.

## Context

- Table `subscriptions(user_id, plan_id, status, …)` already exists; users signing up get a default active subscription.
- `backend/src/api/admin.py` already ships admin overview/users/campaigns read endpoints gated by `require_admin`.
- `frontend/src/app/(admin)/admin/page.tsx` renders three tabs (overview / users / campaigns). The users tab shows a table of users with their current plan but offers no way to change it.
- `check_plan_limit` in `backend/src/services/plan_limits.py` caches the plan limits in Redis (5-minute TTL, same pattern as other plan checks in the app).

## Non-goals

- Stripe or any payment integration. The plan change is a DB-only operation.
- User-facing email notification after a plan change.
- Audit log of who changed what. No new table, no new column.
- Bulk plan changes (N users at once).
- Resetting usage counters. The counters stay as-is; only the active plan and its limits change.
- Suspending/activating accounts or flipping subscription `status` to anything other than `active`.

## Backend

### New endpoint — `PUT /api/v1/admin/users/{user_id}/plan`

Added to `backend/src/api/admin.py`. Protected by `require_admin`.

Request body:

```json
{ "plan_slug": "starter" | "professional" | "enterprise" }
```

Behavior:

1. Parse body; reject with 400 if `plan_slug` is missing or not one of the three known slugs.
2. Look up the plan: `SELECT id, name, slug FROM plans WHERE slug = $1`. 404 if no row.
3. Verify the user exists: `SELECT id FROM users WHERE id = $1`. 404 if not.
4. UPSERT the active subscription. Two-step approach (no ON CONFLICT because `subscriptions.user_id` is not UNIQUE):

   ```sql
   UPDATE subscriptions
   SET plan_id = $1, status = 'active', updated_at = now()
   WHERE user_id = $2
   RETURNING id
   ```

   If no row is returned, insert:

   ```sql
   INSERT INTO subscriptions (user_id, plan_id, status) VALUES ($2, $1, 'active')
   ```

5. Invalidate Redis plan-limits cache for that user. We remove any key whose structure matches the pattern used by `check_plan_limit` — verified at implementation time but the canonical form is `plan:{user_id}:*` or similar. Use `SCAN` + `DEL` so we don't block Redis.
6. Return:

   ```json
   {
     "subscription": {
       "plan": { "name": "Professional", "slug": "professional" },
       "status": "active"
     }
   }
   ```

Errors:

- 400 — body missing/invalid
- 403 — not admin (handled upstream by `require_admin`)
- 404 — plan_slug unknown, or user_id unknown

### No other backend changes

Read endpoints stay as they are. The existing `GET /admin/users` already returns each user's current subscription plan (`subscription.plans.slug`), which is all the modal needs.

The plans list is already reachable in the codebase — either through the public `GET /plans` endpoint (if present) or a new tiny `GET /admin/plans` handler. At implementation time, check `backend/src/api/plan.py` and the router to decide whether to add a new handler or reuse the existing one.

## Frontend

### New component — `frontend/src/app/(admin)/admin/_components/UserEditModal.tsx`

Client component. Props:

```typescript
interface Plan { id: string; name: string; slug: string; price_cents: number }
interface Props {
  user: AdminUser | null;
  plans: Plan[];
  onClose: () => void;
  onSaved: (updatedUser: AdminUser) => void;
}
```

Rendering:

- Returns `null` when `user === null`.
- Full-screen overlay (`fixed inset-0 bg-black/50`) with a centered card (`max-w-md rounded-card bg-brand-navy-light p-6`).
- Header: user avatar circle with initials (reuse the `buildInitials` logic from `Sidebar.tsx`), full name, email, role badge.
- "Piano attuale" section: static badge showing the current plan name/slug.
- "Utilizzo del mese": a read-only line showing `messages_used` (already present in the user row from `/admin/users`) so the admin has context before downgrading.
- "Cambia piano" section: a `<select>` listing the three plans (sorted by price ascending). Preselected to the user's current plan.
- Error banner (red) for API errors.
- Buttons row: "Annulla" (outline) on the left, "Salva modifiche" (teal) on the right.

Save flow:

- On "Salva modifiche" click, disable the button, `apiFetch('/admin/users/{user.id}/plan', { method: 'PUT', body: JSON.stringify({ plan_slug }) })`.
- On 2xx: call `onSaved({ ...user, subscription: { status: 'active', plans: { name, slug } } })` then `onClose()`.
- On non-2xx: read `body.detail`, show in the error banner. Re-enable the button.

Accessibility:

- Modal wrapper gets `role="dialog"` and `aria-modal="true"`.
- Title heading gets an `id` and the dialog references it via `aria-labelledby`.
- `Escape` key closes the modal (listener on `document`, guarded by the `user != null` state).
- Outside-click on the overlay closes.

### Modified — `frontend/src/app/(admin)/admin/page.tsx`

- New state: `editingUser: AdminUser | null`, `plans: Plan[]`.
- In the existing mount effect, fetch plans in parallel with the other three admin endpoints.
- In the users tab, the `<tr>` for each user becomes `onClick={() => setEditingUser(user)}` with `cursor-pointer`. Add an unobtrusive hover effect (`hover:bg-brand-navy-deep/40`).
- At the bottom of the page, render `<UserEditModal user={editingUser} plans={plans} onClose={...} onSaved={...} />`.
- `onSaved(updated)` replaces the matching user in the `users` state array immutably.

### No other frontend changes

The sidebar and other routes are unaffected.

## Data flow

```
admin clicks user row
  → setEditingUser(user)
  → UserEditModal renders with the selected user's data
  → admin picks a different plan_slug in the <select>
  → click "Salva modifiche"
  → PUT /api/v1/admin/users/{user.id}/plan {plan_slug}
      backend:
        - verify plan_slug and user_id exist
        - UPDATE subscription (or INSERT if none)
        - invalidate Redis cache keys for that user
        - respond with { subscription: { plan: {...}, status: 'active' } }
  → frontend:
        - onSaved merges the new plan into the row, closes the modal
        - no page reload
```

## Cache invalidation

The Redis keys we delete must match what `check_plan_limit` writes. At implementation time, grep the services file to confirm the exact key pattern. The spec requires: after a successful PUT, the *next* `check_plan_limit(user_id, resource)` call must read limits from the **new** plan, not the cached old one. If for any reason the SCAN+DEL approach is too fragile for the actual key shape, fall back to deleting only the well-known keys (e.g. one per resource type: `campaigns`, `contacts`, `messages`, `ai_template_ops`, `templates`).

## Validation

- `plan_slug` is validated server-side against a whitelist set derived from the `plans` table (via the `SELECT … WHERE slug = $1` lookup).
- Frontend only sends known slugs (the `<select>` is populated from `/admin/plans` or `/plans`).
- No validation on "is the new plan different from the current one?" — the UPSERT is idempotent and the endpoint accepts same-plan updates (treated as a no-op from the user's perspective).

## Out of scope

As listed in Non-goals.

## Success criteria

1. Logged in as admin, clicking a user row on `/admin` (users tab) opens the modal populated with that user's data.
2. Changing plan in the `<select>` then clicking "Salva modifiche" persists: the table row updates in-place to show the new plan, without a page refresh.
3. Re-opening the modal for the same user shows the just-saved plan as "current".
4. A PUT with an unknown `plan_slug` returns 404 and the modal shows the error banner.
5. A PUT from a non-admin account returns 403 and the frontend surfaces the generic error.
6. After a plan change, the next call that reads plan limits (`check_plan_limit` in any feature flow) returns the new plan's limits, not the previous cached values.
7. No changes to `usage_counters`: a user's `messages_used`, `campaigns_used`, etc. remain the same after the plan change.
