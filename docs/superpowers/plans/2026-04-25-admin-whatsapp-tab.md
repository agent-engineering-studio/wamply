# Admin WhatsApp Tab Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Admin WhatsApp tab with KPI cards, context-aware empty state, inline status quick-actions, and a manual "Crea pratica" button.

**Architecture:** All changes are confined to `WhatsAppApplicationsTab.tsx` and a new `CreateBusinessModal.tsx` component. The backend `POST /admin/businesses` endpoint handles the create flow; `PUT /admin/businesses/:id` already exists for status updates. No new backend routes needed except one helper: `PATCH /admin/businesses/:id/status` to change status inline.

**Tech Stack:** Next.js 15, React, Tailwind CSS, apiFetch, existing FastAPI backend.

---

## File Map

| File | Action |
|---|---|
| `frontend/src/app/(admin)/admin/_components/WhatsAppApplicationsTab.tsx` | Modify — add KPI cards, better empty state, inline status actions |
| `frontend/src/app/(admin)/admin/_components/CreateBusinessModal.tsx` | Create — modal to create business + meta application from admin |
| `backend/src/api/business.py` | Modify — add `PATCH /admin/businesses/:id/status` |
| `frontend/tests/admin/whatsapp-tab.test.tsx` | Create — vitest unit tests |

---

### Task 1: KPI summary cards at the top of the tab

**Files:**
- Modify: `frontend/src/app/(admin)/admin/_components/WhatsAppApplicationsTab.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/tests/admin/whatsapp-tab.test.tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({
    json: () => Promise.resolve({
      businesses: [
        { business_id: "1", status: "draft", user_email: "a@b.it", brand_name: "A", legal_name: "A SRL", plan_name: null, plan_slug: null, subscription_status: null, application_id: null, vat_number: null, logo_url: null, user_full_name: null, twilio_phone_number: null, submitted_at: null, approved_at: null, rejected_at: null, business_created_at: "2026-01-01T00:00:00Z", application_updated_at: null },
        { business_id: "2", status: "approved", user_email: "c@d.it", brand_name: "B", legal_name: "B SRL", plan_name: null, plan_slug: null, subscription_status: null, application_id: null, vat_number: null, logo_url: null, user_full_name: null, twilio_phone_number: null, submitted_at: null, approved_at: null, rejected_at: null, business_created_at: "2026-01-02T00:00:00Z", application_updated_at: null },
        { business_id: "3", status: "awaiting_docs", user_email: "e@f.it", brand_name: "C", legal_name: "C SRL", plan_name: null, plan_slug: null, subscription_status: null, application_id: null, vat_number: null, logo_url: null, user_full_name: null, twilio_phone_number: null, submitted_at: null, approved_at: null, rejected_at: null, business_created_at: "2026-01-03T00:00:00Z", application_updated_at: null },
      ],
    }),
  }),
}));

import { WhatsAppApplicationsTab } from "@/app/(admin)/admin/_components/WhatsAppApplicationsTab";

describe("WhatsAppApplicationsTab KPI cards", () => {
  it("shows total, da lavorare, approvate KPI cards", async () => {
    render(<WhatsAppApplicationsTab />);
    await screen.findByText("3"); // total
    expect(screen.getAllByText(/Totale|Da lavorare|Approvate|Sospese/).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd frontend && npx vitest run tests/admin/whatsapp-tab.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `WhatsAppApplicationsTab` renders without KPI cards

- [ ] **Step 3: Add KPI cards to WhatsAppApplicationsTab**

In `frontend/src/app/(admin)/admin/_components/WhatsAppApplicationsTab.tsx`, add after the `counts` useMemo (around line 160), insert this block before the filter tabs `<div>`:

```tsx
{/* KPI cards */}
<div className="grid grid-cols-4 gap-3">
  {[
    { label: "Totale aziende", value: counts.all, color: "text-slate-100" },
    { label: "Da lavorare", value: counts.to_work ?? 0, color: counts.to_work > 0 ? "text-amber-300" : "text-slate-100" },
    { label: "Approvate / Attive", value: (counts.approved ?? 0) + (counts.active ?? 0), color: "text-emerald-300" },
    { label: "Sospese / Rifiutate", value: (counts.suspended ?? 0) + (counts.rejected ?? 0), color: (counts.suspended ?? 0) + (counts.rejected ?? 0) > 0 ? "text-rose-300" : "text-slate-100" },
  ].map((k) => (
    <div key={k.label} className="rounded-card border border-slate-800 bg-brand-navy-light p-4 shadow-card">
      <div className={`text-[26px] font-semibold ${k.color}`}>{k.value}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{k.label}</div>
    </div>
  ))}
</div>
```

- [ ] **Step 4: Run test to confirm pass**

```bash
cd frontend && npx vitest run tests/admin/whatsapp-tab.test.tsx 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/'(admin)'/admin/_components/WhatsAppApplicationsTab.tsx frontend/tests/admin/whatsapp-tab.test.tsx
git commit -m "feat(admin): add KPI summary cards to WhatsApp tab"
```

---

### Task 2: Context-aware empty state

**Files:**
- Modify: `frontend/src/app/(admin)/admin/_components/WhatsAppApplicationsTab.tsx`

- [ ] **Step 1: Add the context-aware empty state**

Replace the existing empty state block (the single `<div>Nessuna pratica corrisponde ai filtri.</div>`) with:

```tsx
) : filtered.length === 0 ? (
  <div className="rounded-card border border-slate-800 bg-brand-navy-light p-10 text-center shadow-card">
    {items.length === 0 ? (
      // DB is empty — no businesses at all
      <>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal/15 text-brand-teal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
            <line x1="12" y1="12" x2="12" y2="16" />
            <line x1="10" y1="14" x2="14" y2="14" />
          </svg>
        </div>
        <h2 className="mb-1 text-[14px] font-semibold text-slate-100">Nessuna pratica ancora</h2>
        <p className="mx-auto mb-5 max-w-xs text-[12px] text-slate-400">
          Quando un utente registra un&apos;azienda e avvia la richiesta WhatsApp Business, appare qui per la lavorazione.
          Puoi anche creare manualmente una pratica per conto di un cliente.
        </p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-teal-dark"
        >
          + Crea prima pratica
        </button>
      </>
    ) : (
      // Items exist but filter/search returns nothing
      <>
        <h2 className="mb-1 text-[14px] font-semibold text-slate-100">Nessuna pratica corrisponde ai filtri</h2>
        <p className="text-[12px] text-slate-400">Modifica il filtro o la ricerca per trovare le pratiche.</p>
        <button
          type="button"
          onClick={() => { setFilter("all"); setQuery(""); }}
          className="mt-4 rounded-pill border border-slate-700 px-4 py-2 text-[12px] font-medium text-slate-300 hover:text-white"
        >
          Rimuovi filtri
        </button>
      </>
    )}
  </div>
```

Also add `const [createOpen, setCreateOpen] = useState(false);` to the state declarations at the top of the component (around line 133).

- [ ] **Step 2: Run all tests**

```bash
cd frontend && npx vitest run tests/admin/ 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/'(admin)'/admin/_components/WhatsAppApplicationsTab.tsx
git commit -m "feat(admin): context-aware empty state for WhatsApp tab"
```

---

### Task 3: Backend PATCH /admin/businesses/:id/status

**Files:**
- Modify: `backend/src/api/business.py`
- Test: `backend/tests/test_admin_business_status.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_business_status.py
import os, pytest, httpx

BASE = os.getenv("BASE_URL", "http://localhost:8200")
ADMIN_JWT = os.getenv("ADMIN_JWT", "")
pytestmark = pytest.mark.skipif(not ADMIN_JWT, reason="ADMIN_JWT required")

def test_patch_unknown_business_returns_404():
    r = httpx.patch(
        f"{BASE}/admin/businesses/00000000-0000-0000-0000-000000000000/status",
        headers={"Authorization": f"Bearer {ADMIN_JWT}"},
        json={"status": "approved"},
    )
    assert r.status_code == 404

def test_patch_invalid_status_returns_422():
    r = httpx.patch(
        f"{BASE}/admin/businesses/00000000-0000-0000-0000-000000000000/status",
        headers={"Authorization": f"Bearer {ADMIN_JWT}"},
        json={"status": "banana"},
    )
    assert r.status_code in (400, 422)
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd backend && python -m pytest tests/test_admin_business_status.py -v 2>&1 | tail -15
```

Expected: SKIP (no ADMIN_JWT) — acceptable, confirms file is valid

- [ ] **Step 3: Add PATCH endpoint to business.py**

Add after `admin_update_business` (around line 215 in `backend/src/api/business.py`):

```python
_VALID_STATUSES = {
    "draft", "awaiting_docs", "submitted_to_meta",
    "in_review", "approved", "rejected", "active", "suspended",
}

@router.patch("/admin/businesses/{business_id}/status")
async def admin_patch_business_status(
    request: Request,
    business_id: str,
    user: CurrentUser = Depends(require_staff),
):
    """Quick status change without touching other fields."""
    db = get_db(request)
    body = await request.json()
    status = (body or {}).get("status", "").strip()
    if status not in _VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status non valido: {status}. Valori ammessi: {sorted(_VALID_STATUSES)}")

    # Find the meta_application linked to this business
    ma = await db.fetchrow(
        "SELECT id FROM meta_applications WHERE business_id = $1",
        business_id,
    )
    if not ma:
        raise HTTPException(status_code=404, detail="Pratica non trovata.")

    await db.execute(
        "UPDATE meta_applications SET status = $1::application_status, updated_at = now() WHERE id = $2",
        status, ma["id"],
    )
    await log_business_event(db, business_id, str(user.id), f"status_changed_to_{status}", {})
    return {"ok": True, "status": status}
```

- [ ] **Step 4: Confirm server starts without errors**

```bash
cd backend && python -c "from src.api.business import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/business.py backend/tests/test_admin_business_status.py
git commit -m "feat(backend): PATCH /admin/businesses/:id/status for inline status change"
```

---

### Task 4: Inline status quick-action dropdown per row

**Files:**
- Modify: `frontend/src/app/(admin)/admin/_components/WhatsAppApplicationsTab.tsx`

- [ ] **Step 1: Add inline status change function to component**

Add this function inside `WhatsAppApplicationsTab`, before the `return`:

```tsx
async function handleStatusChange(businessId: string, newStatus: string) {
  try {
    const r = await apiFetch(`/admin/businesses/${businessId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    setItems((prev) =>
      prev.map((it) =>
        it.business_id === businessId ? { ...it, status: newStatus as BusinessListItem["status"] } : it
      )
    );
    setMsg({ type: "ok", text: `Stato aggiornato: ${newStatus}` });
  } catch (e) {
    setMsg({ type: "err", text: e instanceof Error ? e.message : "Errore" });
  }
}

const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
```

- [ ] **Step 2: Replace the "Apri" button cell with a two-button group**

Replace the `<td className="px-3.5 py-3 text-right">` block (the last `<td>` in the row) with:

```tsx
<td className="px-3.5 py-3 text-right">
  <div className="flex items-center justify-end gap-1.5">
    <select
      value={it.status ?? ""}
      onChange={(e) => handleStatusChange(it.business_id, e.target.value)}
      className="rounded-sm border border-slate-700 bg-brand-navy-deep px-2 py-1 text-[11px] text-slate-200 focus:border-brand-teal focus:outline-none"
      onClick={(e) => e.stopPropagation()}
    >
      {(["draft","awaiting_docs","submitted_to_meta","in_review","approved","rejected","active","suspended"] as const).map((s) => (
        <option key={s} value={s}>{STATUS_META[s]?.label ?? s}</option>
      ))}
    </select>
    <button
      type="button"
      onClick={() => setSelectedId(it.business_id)}
      className="rounded-pill border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-brand-navy-deep hover:text-white"
    >
      Dettaglio
    </button>
  </div>
</td>
```

- [ ] **Step 3: Add the flash message banner just above the filter row**

After the opening `<div className="space-y-4">`, add:

```tsx
{msg && (
  <div className={`rounded-sm border px-3 py-2 text-[12px] ${
    msg.type === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : "border-rose-500/30 bg-rose-500/10 text-rose-300"
  }`}>
    {msg.text}
    <button type="button" onClick={() => setMsg(null)} className="ml-2 text-slate-500 hover:text-slate-300">×</button>
  </div>
)}
```

- [ ] **Step 4: Run full frontend test suite**

```bash
cd frontend && npx vitest run 2>&1 | tail -15
```

Expected: all existing tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/'(admin)'/admin/_components/WhatsAppApplicationsTab.tsx
git commit -m "feat(admin): inline status dropdown per row in WhatsApp tab"
```

---

### Task 5: CreateBusinessModal — admin creates a business manually

**Files:**
- Create: `frontend/src/app/(admin)/admin/_components/CreateBusinessModal.tsx`
- Modify: `frontend/src/app/(admin)/admin/_components/WhatsAppApplicationsTab.tsx`

- [ ] **Step 1: Create the modal component**

```tsx
// frontend/src/app/(admin)/admin/_components/CreateBusinessModal.tsx
"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateBusinessModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    user_email: "",
    legal_name: "",
    brand_name: "",
    vat_number: "",
    initial_status: "draft" as const,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.user_email.trim() || !form.legal_name.trim() || !form.brand_name.trim()) {
      setError("Email utente, ragione sociale e brand name sono obbligatori.");
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch("/admin/businesses/create", {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail ?? `HTTP ${r.status}`);
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-card border border-slate-700 bg-brand-navy-light p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-slate-100">Crea pratica WhatsApp</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>

        {error && (
          <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Email utente *
            </label>
            <input
              type="email"
              value={form.user_email}
              onChange={(e) => setForm({ ...form, user_email: e.target.value })}
              placeholder="cliente@esempio.it"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Ragione sociale *
            </label>
            <input
              type="text"
              value={form.legal_name}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              placeholder="Rossi Parrucchieri SRL"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Brand name *
            </label>
            <input
              type="text"
              value={form.brand_name}
              onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
              placeholder="Rossi Hair"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Partita IVA
            </label>
            <input
              type="text"
              value={form.vat_number}
              onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
              placeholder="IT12345678901"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Stato iniziale
            </label>
            <select
              value={form.initial_status}
              onChange={(e) => setForm({ ...form, initial_status: e.target.value as typeof form.initial_status })}
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 focus:border-brand-teal focus:outline-none"
            >
              <option value="draft">In preparazione</option>
              <option value="awaiting_docs">Attesa documenti</option>
              <option value="submitted_to_meta">Inviata a Meta</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-pill border border-slate-700 py-2 text-[12.5px] font-medium text-slate-300 hover:text-white">
              Annulla
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-pill bg-brand-teal py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50">
              {saving ? "Creazione…" : "Crea pratica"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add backend endpoint POST /admin/businesses/create**

In `backend/src/api/business.py`, add after `admin_list_businesses`:

```python
@router.post("/admin/businesses/create")
async def admin_create_business(
    request: Request,
    user: CurrentUser = Depends(require_staff),
):
    """Staff creates a business + meta application on behalf of a user."""
    from src.services.business_profile import upsert_business
    db = get_db(request)
    body = await request.json()

    user_email = (body.get("user_email") or "").strip().lower()
    legal_name = (body.get("legal_name") or "").strip()
    brand_name = (body.get("brand_name") or "").strip()
    if not user_email or not legal_name or not brand_name:
        raise HTTPException(status_code=400, detail="user_email, legal_name e brand_name sono obbligatori.")

    # Resolve user_id from email
    target_user = await db.fetchrow("SELECT id FROM users WHERE email = $1", user_email)
    if not target_user:
        raise HTTPException(status_code=404, detail=f"Utente con email {user_email!r} non trovato.")
    target_user_id = str(target_user["id"])

    # Upsert business profile
    business = await upsert_business(db, target_user_id, str(user.id), {
        "legal_name": legal_name,
        "brand_name": brand_name,
        "vat_number": body.get("vat_number"),
    })

    # Ensure meta_application exists
    initial_status = body.get("initial_status", "draft")
    if initial_status not in {"draft", "awaiting_docs", "submitted_to_meta"}:
        initial_status = "draft"

    existing_ma = await db.fetchrow(
        "SELECT id FROM meta_applications WHERE business_id = $1", business["id"]
    )
    if not existing_ma:
        await db.execute(
            """INSERT INTO meta_applications (business_id, status)
               VALUES ($1, $2::application_status)""",
            business["id"], initial_status,
        )
    else:
        await db.execute(
            "UPDATE meta_applications SET status = $1::application_status WHERE id = $2",
            initial_status, existing_ma["id"],
        )

    await log_business_event(db, str(business["id"]), str(user.id), "admin_created", {"email": user_email})
    return {"ok": True, "business_id": str(business["id"])}
```

- [ ] **Step 3: Wire modal into WhatsAppApplicationsTab**

Import the modal and add it at the bottom of the component JSX (before the closing `</div>`):

```tsx
// Add import at top of file
import { CreateBusinessModal } from "./CreateBusinessModal";

// Add below BusinessDetailModal
<CreateBusinessModal
  open={createOpen}
  onClose={() => setCreateOpen(false)}
  onCreated={() => {
    setCreateOpen(false);
    reload();
  }}
/>
```

Also add a "+ Crea pratica" button next to the search input in the filter bar:

```tsx
{/* In the filter + search row, after the search input */}
<button
  type="button"
  onClick={() => setCreateOpen(true)}
  className="rounded-pill bg-brand-teal px-4 py-1.5 text-[12px] font-medium text-white hover:bg-brand-teal-dark"
>
  + Crea pratica
</button>
```

- [ ] **Step 4: Run full test suite**

```bash
cd frontend && npx vitest run 2>&1 | tail -10
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/'(admin)'/admin/_components/CreateBusinessModal.tsx \
        frontend/src/app/'(admin)'/admin/_components/WhatsAppApplicationsTab.tsx \
        backend/src/api/business.py
git commit -m "feat(admin): CreateBusinessModal + POST /admin/businesses/create"
```
