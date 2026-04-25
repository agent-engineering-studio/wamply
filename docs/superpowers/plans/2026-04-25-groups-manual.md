# Groups Manual Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full manual CRUD to the groups page: create without AI, rename/edit description, add/remove individual contacts from a group's member list.

**Architecture:** Three new backend endpoints (`PUT /groups/:id`, `POST /groups/:id/members`, `DELETE /groups/:id/members/:contact_id`), plus two new frontend components (`GroupModal` for create/edit, `GroupMembersModal` for member management), wired into the existing groups page. The AI wizard stays untouched alongside the new manual flow.

**Tech Stack:** FastAPI + asyncpg (backend), Next.js 15 App Router client components, Vitest + @testing-library/react (frontend tests).

---

### Task 1: Backend — PUT /groups/:id

**Files:**
- Modify: `backend/src/api/groups.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_groups_crud.py`:

```python
import pytest
from httpx import AsyncClient

@pytest.mark.anyio
async def test_update_group(authed_client: AsyncClient, group_factory):
    g = await group_factory(name="Original")
    r = await authed_client.put(f"/groups/{g['id']}", json={"name": "Renamed", "description": "New desc"})
    assert r.status_code == 200
    assert r.json()["name"] == "Renamed"
    assert r.json()["description"] == "New desc"

@pytest.mark.anyio
async def test_update_group_not_found(authed_client: AsyncClient):
    r = await authed_client.put("/groups/00000000-0000-0000-0000-000000000000", json={"name": "X"})
    assert r.status_code == 404

@pytest.mark.anyio
async def test_update_group_empty_name(authed_client: AsyncClient, group_factory):
    g = await group_factory(name="Test")
    r = await authed_client.put(f"/groups/{g['id']}", json={"name": ""})
    assert r.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && pytest tests/test_groups_crud.py::test_update_group tests/test_groups_crud.py::test_update_group_not_found tests/test_groups_crud.py::test_update_group_empty_name -v
```
Expected: FAIL.

- [ ] **Step 3: Add PUT /groups/:id**

Append after `delete_group` in `backend/src/api/groups.py`:

```python
@router.put("/{group_id}")
async def update_group(
    request: Request,
    group_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if "name" in body and not name:
        raise HTTPException(status_code=400, detail="Il nome del gruppo è obbligatorio.")
    description = (body.get("description") or "").strip() or None

    fields, params = [], []
    idx = 1
    if "name" in body and name:
        fields.append(f"name = ${idx}")
        params.append(name)
        idx += 1
    if "description" in body:
        fields.append(f"description = ${idx}")
        params.append(description)
        idx += 1
    if not fields:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare.")

    params.extend([group_id, user.id])
    row = await db.fetchrow(
        f"UPDATE contact_groups SET {', '.join(fields)}, updated_at = now() "
        f"WHERE id = ${idx} AND user_id = ${idx + 1} RETURNING *",
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Gruppo non trovato.")
    return _serialize(row)
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && pytest tests/test_groups_crud.py -v
```
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/groups.py backend/tests/test_groups_crud.py
git commit -m "feat(groups): add PUT /groups/:id endpoint"
```

---

### Task 2: Backend — member add/remove endpoints

**Files:**
- Modify: `backend/src/api/groups.py`
- Modify: `backend/tests/test_groups_crud.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_groups_crud.py`:

```python
@pytest.mark.anyio
async def test_add_member(authed_client: AsyncClient, group_factory, contact_factory):
    g = await group_factory(name="Members test")
    c = await contact_factory(phone="+39333777001")
    r = await authed_client.post(f"/groups/{g['id']}/members", json={"contact_id": c["id"]})
    assert r.status_code == 201
    assert r.json()["member_count"] == 1

@pytest.mark.anyio
async def test_add_member_duplicate(authed_client: AsyncClient, group_factory, contact_factory):
    g = await group_factory(name="Members dup")
    c = await contact_factory(phone="+39333777002")
    await authed_client.post(f"/groups/{g['id']}/members", json={"contact_id": c["id"]})
    r = await authed_client.post(f"/groups/{g['id']}/members", json={"contact_id": c["id"]})
    assert r.status_code == 201
    assert r.json()["member_count"] == 1  # still 1, idempotent

@pytest.mark.anyio
async def test_remove_member(authed_client: AsyncClient, group_factory, contact_factory):
    g = await group_factory(name="Members remove")
    c = await contact_factory(phone="+39333777003")
    await authed_client.post(f"/groups/{g['id']}/members", json={"contact_id": c["id"]})
    r = await authed_client.delete(f"/groups/{g['id']}/members/{c['id']}")
    assert r.status_code == 204
```

- [ ] **Step 2: Run to verify they fail**

```
cd backend && pytest tests/test_groups_crud.py::test_add_member tests/test_groups_crud.py::test_add_member_duplicate tests/test_groups_crud.py::test_remove_member -v
```
Expected: FAIL.

- [ ] **Step 3: Add member endpoints**

Append after `update_group` in `backend/src/api/groups.py`:

```python
@router.post("/{group_id}/members", status_code=201)
async def add_group_member(
    request: Request,
    group_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    body = await request.json()
    contact_id = (body.get("contact_id") or "").strip()
    if not contact_id:
        raise HTTPException(status_code=400, detail="contact_id obbligatorio.")

    group_row = await db.fetchrow(
        "SELECT id FROM contact_groups WHERE id = $1 AND user_id = $2",
        group_id, user.id,
    )
    if not group_row:
        raise HTTPException(status_code=404, detail="Gruppo non trovato.")

    contact_row = await db.fetchrow(
        "SELECT id FROM contacts WHERE id = $1 AND user_id = $2",
        contact_id, user.id,
    )
    if not contact_row:
        raise HTTPException(status_code=404, detail="Contatto non trovato.")

    await db.execute(
        "INSERT INTO contact_group_members (contact_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        contact_id, group_id,
    )
    count_row = await db.fetchrow(
        "SELECT count(*)::int AS n FROM contact_group_members WHERE group_id = $1",
        group_id,
    )
    return {"group_id": group_id, "member_count": count_row["n"] if count_row else 0}


@router.delete("/{group_id}/members/{contact_id}", status_code=204)
async def remove_group_member(
    request: Request,
    group_id: str,
    contact_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    group_row = await db.fetchrow(
        "SELECT id FROM contact_groups WHERE id = $1 AND user_id = $2",
        group_id, user.id,
    )
    if not group_row:
        raise HTTPException(status_code=404, detail="Gruppo non trovato.")

    await db.execute(
        "DELETE FROM contact_group_members WHERE contact_id = $1 AND group_id = $2",
        contact_id, group_id,
    )
    return None
```

- [ ] **Step 4: Run all group tests**

```
cd backend && pytest tests/test_groups_crud.py -v
```
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/groups.py backend/tests/test_groups_crud.py
git commit -m "feat(groups): add member add/remove endpoints"
```

---

### Task 3: Frontend — GroupModal (create + edit)

**Files:**
- Create: `frontend/src/app/(dashboard)/groups/_components/GroupModal.tsx`
- Modify: `frontend/src/app/(dashboard)/groups/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/(dashboard)/groups/_components/GroupModal.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GroupModal } from "./GroupModal";
import { vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1", name: "VIP" }) }),
}));

describe("GroupModal", () => {
  it("renders create mode with empty fields", () => {
    render(<GroupModal open={true} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText(/Nome gruppo/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: /Crea gruppo/i })).toBeInTheDocument();
  });

  it("renders edit mode with prefilled fields", () => {
    const group = { id: "1", name: "VIP", description: "Clienti top", member_count: 5, created_at: "" };
    render(<GroupModal open={true} group={group} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText(/Nome gruppo/i)).toHaveValue("VIP");
    expect(screen.getByRole("button", { name: /Salva/i })).toBeInTheDocument();
  });

  it("calls POST /groups on create", async () => {
    const { apiFetch } = await import("@/lib/api-client");
    const onSaved = vi.fn();
    render(<GroupModal open={true} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Nome gruppo/i), { target: { value: "VIP Milano" } });
    fireEvent.click(screen.getByRole("button", { name: /Crea gruppo/i }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/groups", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd frontend && npx vitest run src/app/\(dashboard\)/groups/_components/GroupModal.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Create GroupModal**

Create `frontend/src/app/(dashboard)/groups/_components/GroupModal.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Group {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  created_at: string;
}

interface Props {
  open: boolean;
  group?: Group;
  onClose: () => void;
  onSaved: () => void;
}

export function GroupModal({ open, group, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(group?.name ?? "");
      setDescription(group?.description ?? "");
      setError(null);
    }
  }, [open, group]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Il nome del gruppo è obbligatorio."); return; }
    setSaving(true);
    setError(null);
    const body = { name: name.trim(), description: description.trim() || null };
    try {
      const r = await apiFetch(
        group ? `/groups/${group.id}` : "/groups",
        { method: group ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-card border border-slate-800 bg-brand-navy-light p-6 shadow-card">
        <h2 className="mb-4 text-[15px] font-semibold text-slate-100">
          {group ? "Modifica gruppo" : "Nuovo gruppo"}
        </h2>
        {error && (
          <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="gm-name" className="mb-1 block text-[11.5px] font-medium text-slate-400">
              Nome gruppo *
            </label>
            <input
              id="gm-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="es. VIP Milano"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="gm-desc" className="mb-1 block text-[11.5px] font-medium text-slate-400">Descrizione</label>
            <textarea
              id="gm-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Clienti premium della sede di Milano"
              className="w-full resize-none rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-pill border border-slate-700 px-4 py-2 text-[12.5px] font-medium text-slate-300 hover:border-slate-600"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50"
            >
              {saving ? "Salvataggio…" : group ? "Salva" : "Crea gruppo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd frontend && npx vitest run src/app/\(dashboard\)/groups/_components/GroupModal.test.tsx
```
Expected: 3 PASS.

- [ ] **Step 5: Wire GroupModal into groups page**

In `frontend/src/app/(dashboard)/groups/page.tsx`:

1. Add import:
```typescript
import { GroupModal } from "./_components/GroupModal";
```

2. Add state (after `deletingId`):
```typescript
const [groupModalOpen, setGroupModalOpen] = useState(false);
const [editingGroup, setEditingGroup] = useState<Group | undefined>(undefined);
```

3. In the header, add a "Crea manuale" button next to the existing AI button:
```typescript
<div className="flex items-center gap-2">
  <button
    type="button"
    onClick={() => aiEnabled && setWizardOpen(true)}
    disabled={!aiEnabled}
    title={aiEnabled ? "Crea gruppo con AI" : "AI non attiva"}
    className="flex items-center gap-1.5 rounded-sm border border-indigo-500/40 bg-indigo-500/10 px-3.5 py-2 text-[13px] font-medium text-indigo-300 transition-colors hover:border-indigo-400 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
      <path d="M19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
    </svg>
    Crea con AI
  </button>
  <button
    type="button"
    onClick={() => { setEditingGroup(undefined); setGroupModalOpen(true); }}
    className="rounded-sm bg-brand-teal px-3.5 py-2 text-[13px] font-medium text-white hover:bg-brand-teal-dark"
  >
    + Crea manuale
  </button>
</div>
```

4. In empty state (when AI disabled), add a "Crea manuale" fallback CTA:
```typescript
<div className="flex items-center justify-center gap-2">
  {aiEnabled ? (
    <button type="button" onClick={() => setWizardOpen(true)}
      className="rounded-pill bg-indigo-500 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-indigo-400">
      Crea con AI
    </button>
  ) : null}
  <button
    type="button"
    onClick={() => { setEditingGroup(undefined); setGroupModalOpen(true); }}
    className="rounded-pill border border-slate-700 px-4 py-2 text-[12.5px] font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100"
  >
    + Crea manuale
  </button>
</div>
```

5. In the group card footer, add an "Edit" button alongside delete:
```typescript
<div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2.5">
  <span className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
    {g.member_count} contatti
  </span>
  <div className="flex items-center gap-3">
    <button
      type="button"
      onClick={() => { setEditingGroup(g); setGroupModalOpen(true); }}
      className="text-[11px] font-medium text-slate-400 hover:text-slate-100"
    >
      Modifica
    </button>
    <button
      type="button"
      onClick={() => handleDelete(g.id, g.name)}
      disabled={deletingId === g.id}
      className="text-[11px] font-medium text-rose-400 hover:text-rose-300 disabled:opacity-40"
    >
      {deletingId === g.id ? "Elimino..." : "Elimina"}
    </button>
  </div>
</div>
```

6. Add modal before `SmartGroupWizard`:
```typescript
<GroupModal
  open={groupModalOpen}
  group={editingGroup}
  onClose={() => setGroupModalOpen(false)}
  onSaved={() => { setGroupModalOpen(false); reload(); }}
/>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(dashboard\)/groups/_components/GroupModal.tsx \
        frontend/src/app/\(dashboard\)/groups/_components/GroupModal.test.tsx \
        frontend/src/app/\(dashboard\)/groups/page.tsx
git commit -m "feat(groups): add GroupModal for create/edit, wire into page"
```

---

### Task 4: Frontend — GroupMembersModal (add/remove contacts)

**Files:**
- Create: `frontend/src/app/(dashboard)/groups/_components/GroupMembersModal.tsx`
- Modify: `frontend/src/app/(dashboard)/groups/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/(dashboard)/groups/_components/GroupMembersModal.test.tsx`:

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { GroupMembersModal } from "./GroupMembersModal";
import { vi } from "vitest";

const mockContacts = [
  { id: "c1", phone: "+39333000001", name: "Mario", email: null, tags: null, opt_in: true, created_at: "" },
];
const mockMembers = [{ id: "c1", phone: "+39333000001", name: "Mario" }];

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn((url: string) => {
    if (url.includes("/members")) return Promise.resolve({ ok: true, json: async () => ({ members: mockMembers }) });
    return Promise.resolve({ ok: true, json: async () => ({ contacts: mockContacts, total: 1 }) });
  }),
}));

describe("GroupMembersModal", () => {
  it("renders modal title and member list", async () => {
    render(<GroupMembersModal open={true} groupId="g1" groupName="VIP" onClose={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText(/Membri di VIP/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Mario")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd frontend && npx vitest run src/app/\(dashboard\)/groups/_components/GroupMembersModal.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Create GroupMembersModal**

Create `frontend/src/app/(dashboard)/groups/_components/GroupMembersModal.tsx`:

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface MemberRow {
  id: string;
  phone: string;
  name: string | null;
}

interface ContactRow {
  id: string;
  phone: string;
  name: string | null;
}

interface Props {
  open: boolean;
  groupId: string;
  groupName: string;
  onClose: () => void;
  onChanged: () => void;
}

export function GroupMembersModal({ open, groupId, groupName, onClose, onChanged }: Props) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [mRes, cRes] = await Promise.all([
      apiFetch(`/groups/${groupId}/members`).then((r) => r.json()),
      apiFetch(`/contacts?search=${encodeURIComponent(search)}`).then((r) => r.json()),
    ]);
    setMembers(mRes.members || []);
    setContacts(cRes.contacts || []);
    setLoading(false);
  }, [groupId, search]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  if (!open) return null;

  const memberIds = new Set(members.map((m) => m.id));

  async function handleAdd(contactId: string) {
    const r = await apiFetch(`/groups/${groupId}/members`, {
      method: "POST",
      body: JSON.stringify({ contact_id: contactId }),
    });
    if (!r.ok) { setMsg("Errore aggiunta membro."); return; }
    setMsg(null);
    onChanged();
    loadData();
  }

  async function handleRemove(contactId: string) {
    const r = await apiFetch(`/groups/${groupId}/members/${contactId}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) { setMsg("Errore rimozione membro."); return; }
    setMsg(null);
    onChanged();
    loadData();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-2xl flex-col rounded-card border border-slate-800 bg-brand-navy-light shadow-card" style={{ maxHeight: "80vh" }}>
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-slate-100">Membri di {groupName}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {msg && (
          <div className="mx-4 mt-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {msg}
          </div>
        )}

        <div className="grid flex-1 grid-cols-2 gap-0 overflow-hidden">
          {/* Left: current members */}
          <div className="flex flex-col border-r border-slate-800">
            <div className="border-b border-slate-800 px-4 py-2.5">
              <p className="text-[11.5px] font-medium text-slate-400">
                Membri attuali ({members.length})
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-[12px] text-slate-500">Caricamento…</div>
              ) : members.length === 0 ? (
                <div className="p-4 text-center text-[12px] text-slate-500">Nessun membro.</div>
              ) : members.map((m) => (
                <div key={m.id} className="flex items-center justify-between border-b border-slate-800/40 px-4 py-2">
                  <div>
                    <div className="text-[12.5px] text-slate-100">{m.name || "Senza nome"}</div>
                    <div className="font-mono text-[11px] text-slate-400">{m.phone}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(m.id)}
                    className="text-[11px] text-rose-400 hover:text-rose-300"
                  >
                    Rimuovi
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right: all contacts search + add */}
          <div className="flex flex-col">
            <div className="border-b border-slate-800 px-4 py-2.5">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca contatto…"
                className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-2 py-1.5 text-[12px] text-slate-100 placeholder-slate-500 focus:border-brand-teal focus:outline-none"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {contacts.map((c) => {
                const isMember = memberIds.has(c.id);
                return (
                  <div key={c.id} className="flex items-center justify-between border-b border-slate-800/40 px-4 py-2">
                    <div>
                      <div className="text-[12.5px] text-slate-100">{c.name || "Senza nome"}</div>
                      <div className="font-mono text-[11px] text-slate-400">{c.phone}</div>
                    </div>
                    {isMember ? (
                      <span className="text-[11px] text-brand-teal">Già membro</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAdd(c.id)}
                        className="text-[11px] text-brand-teal hover:text-brand-teal-dark"
                      >
                        + Aggiungi
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

The modal requires a `GET /groups/:id/members` endpoint. Add it to `backend/src/api/groups.py`:

```python
@router.get("/{group_id}/members")
async def list_group_members(
    request: Request,
    group_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    group_row = await db.fetchrow(
        "SELECT id FROM contact_groups WHERE id = $1 AND user_id = $2",
        group_id, user.id,
    )
    if not group_row:
        raise HTTPException(status_code=404, detail="Gruppo non trovato.")
    rows = await db.fetch(
        """SELECT c.id, c.phone, c.name FROM contact_group_members m
           JOIN contacts c ON c.id = m.contact_id
           WHERE m.group_id = $1 ORDER BY c.name NULLS LAST""",
        group_id,
    )
    members = []
    for r in rows:
        d = dict(r)
        d["id"] = str(d["id"])
        members.append(d)
    return {"members": members}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd frontend && npx vitest run src/app/\(dashboard\)/groups/_components/GroupMembersModal.test.tsx
cd backend && pytest tests/test_groups_crud.py -v
```
Expected: all PASS.

- [ ] **Step 5: Wire GroupMembersModal into groups page**

In `frontend/src/app/(dashboard)/groups/page.tsx`:

1. Add import:
```typescript
import { GroupMembersModal } from "./_components/GroupMembersModal";
```

2. Add state:
```typescript
const [membersModalGroup, setMembersModalGroup] = useState<Group | null>(null);
```

3. In the group card footer, add a "Membri" button:
```typescript
<button
  type="button"
  onClick={() => setMembersModalGroup(g)}
  className="text-[11px] font-medium text-brand-teal hover:text-brand-teal-dark"
>
  Membri
</button>
```

4. Add modal at bottom:
```typescript
{membersModalGroup && (
  <GroupMembersModal
    open={!!membersModalGroup}
    groupId={membersModalGroup.id}
    groupName={membersModalGroup.name}
    onClose={() => setMembersModalGroup(null)}
    onChanged={() => reload()}
  />
)}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/groups.py \
        frontend/src/app/\(dashboard\)/groups/_components/GroupMembersModal.tsx \
        frontend/src/app/\(dashboard\)/groups/_components/GroupMembersModal.test.tsx \
        frontend/src/app/\(dashboard\)/groups/page.tsx
git commit -m "feat(groups): add GroupMembersModal and GET /groups/:id/members"
```

---

### Self-review

**Spec coverage:**
- ✅ Create group manually → GroupModal (POST /groups, no AI required)
- ✅ Edit group name/description → GroupModal (PUT /groups/:id)
- ✅ Delete group → already existed, button wired in task 3
- ✅ Add/remove individual contacts → GroupMembersModal + POST/DELETE /groups/:id/members/:cid
- ✅ "Crea con AI" wizard unchanged

**Placeholder scan:** No TBDs.

**Type consistency:** `Group` interface used in both `page.tsx` and `GroupModal.tsx`; `MemberRow` returned from backend matches frontend shape.
