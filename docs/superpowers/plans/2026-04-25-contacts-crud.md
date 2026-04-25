# Contacts CRUD + CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add edit/delete per contact and a working CSV import flow (modal + file picker + template download) to the contacts dashboard page.

**Architecture:** Two new backend endpoints (`PUT /contacts/:id`, `DELETE /contacts/:id`, `POST /contacts/import`), one CSV template static file, and two new frontend components (`ContactModal` for create/edit, `CsvImportModal`) wired into the existing contacts page. No new pages — everything is modal-based.

**Tech Stack:** FastAPI + asyncpg (backend), Next.js 15 App Router client components, Vitest + @testing-library/react (frontend tests), csv.reader stdlib (import parsing).

---

### Task 1: Backend — PUT /contacts/:id and DELETE /contacts/:id

**Files:**
- Modify: `backend/src/api/contacts.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_contacts_crud.py`:

```python
import pytest
from httpx import AsyncClient

@pytest.mark.anyio
async def test_update_contact(authed_client: AsyncClient, contact_factory):
    c = await contact_factory(phone="+39333000001")
    r = await authed_client.put(f"/contacts/{c['id']}", json={"name": "Updated", "tags": ["vip"]})
    assert r.status_code == 200
    assert r.json()["name"] == "Updated"
    assert "vip" in r.json()["tags"]

@pytest.mark.anyio
async def test_update_contact_not_found(authed_client: AsyncClient):
    r = await authed_client.put("/contacts/00000000-0000-0000-0000-000000000000", json={"name": "X"})
    assert r.status_code == 404

@pytest.mark.anyio
async def test_delete_contact(authed_client: AsyncClient, contact_factory):
    c = await contact_factory(phone="+39333000002")
    r = await authed_client.delete(f"/contacts/{c['id']}")
    assert r.status_code == 204
    r2 = await authed_client.get(f"/contacts?search={c['phone']}")
    assert r2.json()["total"] == 0

@pytest.mark.anyio
async def test_delete_contact_not_found(authed_client: AsyncClient):
    r = await authed_client.delete("/contacts/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && pytest tests/test_contacts_crud.py -v
```
Expected: FAIL — routes not found (404 from router).

- [ ] **Step 3: Add PUT and DELETE to contacts.py**

Append after `apply_tags` in `backend/src/api/contacts.py`:

```python
@router.put("/{contact_id}")
async def update_contact(
    request: Request,
    contact_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    body = await request.json()
    fields, params = [], []
    idx = 1
    for key in ["phone", "name", "email", "language", "tags", "variables"]:
        if key in body:
            fields.append(f"{key} = ${idx}")
            params.append(body[key])
            idx += 1
    if not fields:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare.")
    params.extend([contact_id, user.id])
    row = await db.fetchrow(
        f"UPDATE contacts SET {', '.join(fields)}, updated_at = now() "
        f"WHERE id = ${idx} AND user_id = ${idx + 1} RETURNING *",
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Contatto non trovato.")
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "hex"):
            d[k] = str(v)
        elif hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    return d


@router.delete("/{contact_id}", status_code=204)
async def delete_contact(
    request: Request,
    contact_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    result = await db.execute(
        "DELETE FROM contacts WHERE id = $1 AND user_id = $2",
        contact_id, user.id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Contatto non trovato.")
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && pytest tests/test_contacts_crud.py -v
```
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/contacts.py backend/tests/test_contacts_crud.py
git commit -m "feat(contacts): add PUT and DELETE endpoints"
```

---

### Task 2: Backend — POST /contacts/import (CSV)

**Files:**
- Modify: `backend/src/api/contacts.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_contacts_crud.py`:

```python
import io

@pytest.mark.anyio
async def test_import_csv(authed_client: AsyncClient):
    csv_content = b"phone,name,email,tags\n+39333111111,Mario Rossi,mario@example.it,\"vip,clienti\"\n+39333222222,,,"
    files = {"file": ("contatti.csv", io.BytesIO(csv_content), "text/csv")}
    r = await authed_client.post("/contacts/import", files=files)
    assert r.status_code == 200
    body = r.json()
    assert body["imported"] == 2
    assert body["skipped"] == 0

@pytest.mark.anyio
async def test_import_csv_missing_phone(authed_client: AsyncClient):
    csv_content = b"phone,name\n,Mario"
    files = {"file": ("c.csv", io.BytesIO(csv_content), "text/csv")}
    r = await authed_client.post("/contacts/import", files=files)
    assert r.status_code == 200
    assert r.json()["skipped"] == 1
    assert r.json()["imported"] == 0
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && pytest tests/test_contacts_crud.py::test_import_csv tests/test_contacts_crud.py::test_import_csv_missing_phone -v
```
Expected: FAIL.

- [ ] **Step 3: Add import endpoint**

Add imports at top of `backend/src/api/contacts.py`:
```python
import csv
import io
from fastapi import File, UploadFile
```

Add endpoint before `PUT /{contact_id}`:

```python
@router.post("/import")
async def import_contacts(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    file: UploadFile = File(...),
):
    db = get_db(request)
    redis = get_redis(request)

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    imported = 0
    skipped = 0
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):
        phone = (row.get("phone") or "").strip()
        if not phone:
            skipped += 1
            errors.append(f"Riga {i}: telefono mancante.")
            continue
        name = (row.get("name") or "").strip() or None
        email = (row.get("email") or "").strip() or None
        language = (row.get("language") or "it").strip()
        tags_raw = (row.get("tags") or "").strip()
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []

        try:
            await check_plan_limit(db, redis, user.id, "contacts")
            await db.execute(
                """INSERT INTO contacts (user_id, phone, name, email, language, tags, opt_in, opt_in_date)
                   VALUES ($1, $2, $3, $4, $5, $6, true, now())
                   ON CONFLICT (user_id, phone) DO UPDATE
                   SET name = EXCLUDED.name,
                       email = EXCLUDED.email,
                       language = EXCLUDED.language,
                       tags = EXCLUDED.tags,
                       updated_at = now()""",
                user.id, phone, name, email, language, tags,
            )
            imported += 1
        except Exception as e:
            skipped += 1
            errors.append(f"Riga {i} ({phone}): {e}")

    return {"imported": imported, "skipped": skipped, "errors": errors[:10]}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && pytest tests/test_contacts_crud.py -v
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/contacts.py backend/tests/test_contacts_crud.py
git commit -m "feat(contacts): add CSV import endpoint"
```

---

### Task 3: CSV template static file

**Files:**
- Create: `frontend/public/templates/contatti-wamply.csv`

- [ ] **Step 1: Create the CSV template file**

```
phone,name,email,tags,language,city
+39 333 1234567,Mario Rossi,mario.rossi@example.it,"vip,clienti",it,Milano
+39 02 9999999,Acme SRL,,newsletter,it,Roma
```

- [ ] **Step 2: Verify the file is downloadable**

Start the dev server and navigate to `/templates/contatti-wamply.csv` — browser should prompt download.

- [ ] **Step 3: Commit**

```bash
git add frontend/public/templates/contatti-wamply.csv
git commit -m "feat(contacts): add CSV template for import"
```

---

### Task 4: Frontend — ContactModal (create + edit)

**Files:**
- Create: `frontend/src/app/(dashboard)/contacts/_components/ContactModal.tsx`
- Modify: `frontend/src/app/(dashboard)/contacts/page.tsx`

- [ ] **Step 1: Write the failing component test**

Create `frontend/src/app/(dashboard)/contacts/_components/ContactModal.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContactModal } from "./ContactModal";
import { vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1", phone: "+39333000001", name: "Mario" }) }),
}));

describe("ContactModal", () => {
  it("renders create mode with empty fields", () => {
    render(<ContactModal open={true} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText(/Telefono/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: /Crea contatto/i })).toBeInTheDocument();
  });

  it("renders edit mode with prefilled fields", () => {
    const contact = { id: "1", phone: "+39333000001", name: "Mario", email: null, tags: ["vip"], opt_in: true, created_at: "" };
    render(<ContactModal open={true} contact={contact} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText(/Telefono/i)).toHaveValue("+39333000001");
    expect(screen.getByRole("button", { name: /Salva/i })).toBeInTheDocument();
  });

  it("calls POST /contacts on create", async () => {
    const { apiFetch } = await import("@/lib/api-client");
    const onSaved = vi.fn();
    render(<ContactModal open={true} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Telefono/i), { target: { value: "+39333000001" } });
    fireEvent.click(screen.getByRole("button", { name: /Crea contatto/i }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/contacts", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd frontend && npx vitest run src/app/\(dashboard\)/contacts/_components/ContactModal.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create ContactModal component**

Create `frontend/src/app/(dashboard)/contacts/_components/ContactModal.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Contact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  tags: string[] | null;
  opt_in: boolean;
  created_at: string;
}

interface Props {
  open: boolean;
  contact?: Contact;
  onClose: () => void;
  onSaved: () => void;
}

export function ContactModal({ open, contact, onClose, onSaved }: Props) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPhone(contact?.phone ?? "");
      setName(contact?.name ?? "");
      setEmail(contact?.email ?? "");
      setTagsRaw((contact?.tags ?? []).join(", "));
      setError(null);
    }
  }, [open, contact]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) { setError("Il numero di telefono è obbligatorio."); return; }
    setSaving(true);
    setError(null);
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    const body = { phone: phone.trim(), name: name.trim() || null, email: email.trim() || null, tags };
    try {
      const r = await apiFetch(
        contact ? `/contacts/${contact.id}` : "/contacts",
        { method: contact ? "PUT" : "POST", body: JSON.stringify(body) },
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
          {contact ? "Modifica contatto" : "Nuovo contatto"}
        </h2>
        {error && (
          <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="cm-phone" className="mb-1 block text-[11.5px] font-medium text-slate-400">
              Telefono *
            </label>
            <input
              id="cm-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+39 333 1234567"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="cm-name" className="mb-1 block text-[11.5px] font-medium text-slate-400">Nome</label>
            <input
              id="cm-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mario Rossi"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="cm-email" className="mb-1 block text-[11.5px] font-medium text-slate-400">Email</label>
            <input
              id="cm-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mario@example.it"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="cm-tags" className="mb-1 block text-[11.5px] font-medium text-slate-400">
              Tag (separati da virgola)
            </label>
            <input
              id="cm-tags"
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="vip, clienti, newsletter"
              className="w-full rounded-sm border border-slate-700 bg-brand-navy-deep px-3 py-2 text-[13px] text-slate-100 placeholder-slate-600 focus:border-brand-teal focus:outline-none"
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
              {saving ? "Salvataggio…" : contact ? "Salva" : "Crea contatto"}
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
cd frontend && npx vitest run src/app/\(dashboard\)/contacts/_components/ContactModal.test.tsx
```
Expected: 3 PASS.

- [ ] **Step 5: Wire ContactModal into contacts page**

In `frontend/src/app/(dashboard)/contacts/page.tsx`:

1. Add import at top:
```typescript
import { ContactModal } from "./_components/ContactModal";
```

2. Add state variables (after existing state declarations):
```typescript
const [contactModalOpen, setContactModalOpen] = useState(false);
const [editingContact, setEditingContact] = useState<Contact | undefined>(undefined);
```

3. Add `handleDelete` function (after `reload`):
```typescript
async function handleDelete(id: string, name: string) {
  if (!confirm(`Eliminare "${name || id}"? L'operazione non può essere annullata.`)) return;
  try {
    const r = await apiFetch(`/contacts/${id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
    reload();
  } catch (e) {
    alert(e instanceof Error ? e.message : "Errore durante l'eliminazione.");
  }
}
```

4. Replace the two stub `+ Aggiungi` buttons (header and empty state) with:
```typescript
// Header button
<button
  type="button"
  onClick={() => { setEditingContact(undefined); setContactModalOpen(true); }}
  className="rounded-sm bg-brand-teal px-3 py-2 text-[12px] font-medium text-white hover:bg-brand-teal-dark"
>
  + Aggiungi
</button>

// Empty state button
<button
  type="button"
  onClick={() => { setEditingContact(undefined); setContactModalOpen(true); }}
  className="rounded-pill border border-slate-700 px-4 py-2 text-[12.5px] font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100"
>
  + Aggiungi manuale
</button>
```

5. In the contact list row, add edit and delete buttons after the tags div:
```typescript
<div className="ml-2 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
  <button
    type="button"
    onClick={() => { setEditingContact(c); setContactModalOpen(true); }}
    className="text-[11px] text-slate-400 hover:text-slate-100"
  >
    Modifica
  </button>
  <button
    type="button"
    onClick={() => handleDelete(c.id, c.name || c.phone)}
    className="text-[11px] text-rose-400 hover:text-rose-300"
  >
    Elimina
  </button>
</div>
```
Also add `group` class to the row div: `className="group flex items-center ..."`

6. Add modal at bottom (before `SmartTagsModal`):
```typescript
<ContactModal
  open={contactModalOpen}
  contact={editingContact}
  onClose={() => setContactModalOpen(false)}
  onSaved={() => { setContactModalOpen(false); reload(); }}
/>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(dashboard\)/contacts/_components/ContactModal.tsx \
        frontend/src/app/\(dashboard\)/contacts/_components/ContactModal.test.tsx \
        frontend/src/app/\(dashboard\)/contacts/page.tsx
git commit -m "feat(contacts): add ContactModal for create/edit, wire delete"
```

---

### Task 5: Frontend — CsvImportModal

**Files:**
- Create: `frontend/src/app/(dashboard)/contacts/_components/CsvImportModal.tsx`
- Modify: `frontend/src/app/(dashboard)/contacts/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/(dashboard)/contacts/_components/CsvImportModal.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CsvImportModal } from "./CsvImportModal";
import { vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ imported: 3, skipped: 1, errors: [] }) }),
}));

describe("CsvImportModal", () => {
  it("renders upload UI when open", () => {
    render(<CsvImportModal open={true} onClose={vi.fn()} onImported={vi.fn()} />);
    expect(screen.getByText(/Importa contatti CSV/i)).toBeInTheDocument();
    expect(screen.getByText(/Scarica template/i)).toBeInTheDocument();
  });

  it("shows result after successful import", async () => {
    render(<CsvImportModal open={true} onClose={vi.fn()} onImported={vi.fn()} />);
    const file = new File(["phone\n+39333000001"], "test.csv", { type: "text/csv" });
    const input = screen.getByLabelText(/Seleziona file/i);
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /Importa/i }));
    await waitFor(() => expect(screen.getByText(/3 contatti importati/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd frontend && npx vitest run src/app/\(dashboard\)/contacts/_components/CsvImportModal.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Create CsvImportModal**

Create `frontend/src/app/(dashboard)/contacts/_components/CsvImportModal.tsx`:

```typescript
"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export function CsvImportModal({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Seleziona un file CSV."); return; }
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await apiFetch("/contacts/import", { method: "POST", body: form });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${r.status}`);
      }
      const data: ImportResult = await r.json();
      setResult(data);
      if (data.imported > 0) onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore durante l'importazione.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-card border border-slate-800 bg-brand-navy-light p-6 shadow-card">
        <h2 className="mb-4 text-[15px] font-semibold text-slate-100">Importa contatti CSV</h2>

        {!result && (
          <>
            <p className="mb-3 text-[12px] text-slate-400">
              Il CSV deve avere almeno la colonna <code className="rounded bg-slate-800 px-1 text-brand-teal">phone</code>.
              Colonne opzionali: <code className="rounded bg-slate-800 px-1 text-slate-300">name, email, tags, language, city</code>.
            </p>
            <a
              href="/templates/contatti-wamply.csv"
              download="contatti-wamply.csv"
              className="mb-4 flex items-center gap-1.5 text-[12px] text-brand-teal hover:underline"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Scarica template
            </a>
            {error && (
              <div className="mb-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                {error}
              </div>
            )}
            <label htmlFor="csv-file-input" className="mb-1 block text-[11.5px] font-medium text-slate-400">
              Seleziona file CSV
            </label>
            <input
              id="csv-file-input"
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="mb-4 w-full text-[12px] text-slate-300 file:mr-3 file:rounded-pill file:border-0 file:bg-brand-teal/20 file:px-3 file:py-1.5 file:text-[11.5px] file:font-medium file:text-brand-teal"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-pill border border-slate-700 px-4 py-2 text-[12.5px] font-medium text-slate-300 hover:border-slate-600"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={uploading}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark disabled:opacity-50"
              >
                {uploading ? "Importazione…" : "Importa"}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-300">
              <strong>{result.imported} contatti importati</strong>
              {result.skipped > 0 && <span className="ml-2 text-[12px] text-slate-400">({result.skipped} saltati)</span>}
            </div>
            {result.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-sm border border-slate-700 bg-brand-navy-deep p-2">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-[11px] text-rose-300">{e}</p>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-pill bg-brand-teal px-5 py-2 text-[12.5px] font-medium text-white hover:bg-brand-teal-dark"
              >
                Chiudi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd frontend && npx vitest run src/app/\(dashboard\)/contacts/_components/CsvImportModal.test.tsx
```
Expected: 2 PASS.

- [ ] **Step 5: Wire CsvImportModal into contacts page**

In `frontend/src/app/(dashboard)/contacts/page.tsx`:

1. Add import:
```typescript
import { CsvImportModal } from "./_components/CsvImportModal";
```

2. Add state:
```typescript
const [csvModalOpen, setCsvModalOpen] = useState(false);
```

3. Replace the stub "Importa CSV" button (in header) with:
```typescript
<button
  type="button"
  onClick={() => setCsvModalOpen(true)}
  className="rounded-sm border border-slate-800 bg-brand-navy-light px-3 py-2 text-[12px] font-medium text-slate-400 hover:bg-brand-navy-deep"
>
  Importa CSV
</button>
```

4. Replace the stub "Importa CSV" button (in empty state) with:
```typescript
<button
  type="button"
  onClick={() => setCsvModalOpen(true)}
  className="rounded-pill bg-brand-teal px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-teal-dark"
>
  Importa CSV
</button>
```

5. Add modal at bottom (before `ContactModal`):
```typescript
<CsvImportModal
  open={csvModalOpen}
  onClose={() => setCsvModalOpen(false)}
  onImported={() => { setCsvModalOpen(false); reload(); }}
/>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/\(dashboard\)/contacts/_components/CsvImportModal.tsx \
        frontend/src/app/\(dashboard\)/contacts/_components/CsvImportModal.test.tsx \
        frontend/src/app/\(dashboard\)/contacts/page.tsx
git commit -m "feat(contacts): add CsvImportModal and wire all buttons"
```

---

### Self-review

**Spec coverage:**
- ✅ Add contact manually → ContactModal (POST /contacts)
- ✅ Edit contact → ContactModal (PUT /contacts/:id)
- ✅ Delete contact → inline button + DELETE /contacts/:id
- ✅ CSV import with template → CsvImportModal + POST /contacts/import + static CSV file
- ✅ CSV instructions already present in page (collapsible `<details>`)

**Placeholder scan:** No TBDs or incomplete steps.

**Type consistency:** `Contact` interface used consistently across page and modal; import endpoint returns `{imported, skipped, errors}` matched in frontend type.
