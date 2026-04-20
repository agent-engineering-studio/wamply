# Templates CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/templates` route where users can list, create, edit, delete, and preview WhatsApp message templates (header/body/footer/buttons) with named variable placeholders bound to contact fields.

**Architecture:** New Next.js route under `(dashboard)/templates` (list + editor), reuses existing `apiFetch` and the already-complete backend `/templates` endpoints. The only backend addition is `DELETE /templates/{id}` (soft-delete by setting `status='archived'`). A small set of frontend utilities isolates the components-jsonb shape and variable validation; the editor is split into focused components to keep files under ~250 lines.

**Tech Stack:** Next.js 15 App Router (client components), React 19, Tailwind v4, existing `apiFetch` client, FastAPI + asyncpg on the backend.

---

## File Structure

**Backend (new or modified):**
- Modify: `backend/src/api/templates.py` — add `DELETE /templates/{id}` (soft-delete)
- Modify: `backend/src/api/templates.py` — filter out archived templates from `GET /templates` list

**Frontend — new files:**
- `frontend/src/lib/templates/types.ts` — TS types for components jsonb (HeaderComponent, BodyComponent, FooterComponent, ButtonsComponent, Button)
- `frontend/src/lib/templates/variables.ts` — allowed variables constant + validator regex + variable-insertion helper
- `frontend/src/lib/templates/validation.ts` — client-side form validation returning `{ok, errors}` shape
- `frontend/src/app/(dashboard)/templates/page.tsx` — list page (client component, uses SWR-like pattern already in the app)
- `frontend/src/app/(dashboard)/templates/_components/TemplateCard.tsx` — single card for list
- `frontend/src/app/(dashboard)/templates/[id]/page.tsx` — editor page, top-level (client component)
- `frontend/src/app/(dashboard)/templates/[id]/_components/EditorForm.tsx` — the form (left column)
- `frontend/src/app/(dashboard)/templates/[id]/_components/PreviewBubble.tsx` — WhatsApp-style preview (right column)
- `frontend/src/app/(dashboard)/templates/[id]/_components/VariableToolbar.tsx` — pill toolbar for inserting variables
- `frontend/src/app/(dashboard)/templates/[id]/_components/ButtonsEditor.tsx` — buttons subsection

**Frontend — modified files:**
- `frontend/src/components/layout/Sidebar.tsx` — add "Template" nav entry between "Nuovo invio" and "Contatti"
- `frontend/src/app/(dashboard)/campaigns/new/page.tsx` — when templates list is empty, show a working link to `/templates/new` (restoring the link removed earlier)

**Manual-test scripts (no unit test framework change):**
- Testing is done manually by following "Verify" steps in each task. The backend soft-delete task adds one pytest-style test in an existing pattern; everything else is end-to-end manual verification against the running stack.

---

## Task 1: Backend — add soft-delete endpoint

**Files:**
- Modify: `backend/src/api/templates.py` (append new handler)

- [ ] **Step 1: Add the DELETE endpoint**

Append this handler to `backend/src/api/templates.py` (after `update_template`):

```python
@router.delete("/{template_id}", status_code=204)
async def delete_template(
    request: Request, template_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    db = get_db(request)
    row = await db.fetchrow(
        "UPDATE templates SET status = 'archived', updated_at = now() "
        "WHERE id = $1 AND user_id = $2 AND status != 'archived' "
        "RETURNING id",
        template_id, user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template non trovato.")
    return None
```

- [ ] **Step 2: Filter archived templates from list**

In the same file, replace the `list_templates` function body with:

```python
@router.get("")
async def list_templates(request: Request, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    rows = await db.fetch(
        "SELECT * FROM templates WHERE user_id = $1 AND status != 'archived' "
        "ORDER BY created_at DESC",
        user.id,
    )
    return {"templates": [_serialize_row(r) for r in rows]}
```

- [ ] **Step 3: Also hide archived templates from GET by id**

Replace `get_template` function body:

```python
@router.get("/{template_id}")
async def get_template(request: Request, template_id: str, user: CurrentUser = Depends(get_current_user)):
    db = get_db(request)
    row = await db.fetchrow(
        "SELECT * FROM templates WHERE id = $1 AND user_id = $2 AND status != 'archived'",
        template_id, user.id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template non trovato.")
    return _serialize_row(row)
```

- [ ] **Step 4: Verify manually**

Backend auto-reloads (uvicorn `--reload`). Then from a terminal with a valid user JWT (replace `$TOKEN`):

```bash
# List templates (should return existing ones)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8100/api/v1/templates | head -c 200

# Create one for testing
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"TestDel","components":[{"type":"BODY","text":"x"}]}' \
  http://localhost:8100/api/v1/templates

# Grab its id from the response, then soft-delete
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:8100/api/v1/templates/<ID> -w "HTTP %{http_code}\n"
# Expected: HTTP 204

# List again — the deleted one should be gone
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8100/api/v1/templates | grep -c TestDel
# Expected: 0
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/templates.py
git commit -m "feat(templates): add soft-delete endpoint and filter archived from list"
```

---

## Task 2: Frontend — shared types and variables helper

**Files:**
- Create: `frontend/src/lib/templates/types.ts`
- Create: `frontend/src/lib/templates/variables.ts`

- [ ] **Step 1: Write the types file**

Create `frontend/src/lib/templates/types.ts`:

```typescript
export type TemplateCategory = "marketing" | "utility" | "authentication";

export type Language = "it" | "en" | "es" | "de" | "fr";

export interface HeaderComponent {
  type: "HEADER";
  format: "TEXT";
  text: string;
}

export interface BodyComponent {
  type: "BODY";
  text: string;
}

export interface FooterComponent {
  type: "FOOTER";
  text: string;
}

export type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

export interface TemplateButton {
  type: ButtonType;
  text: string;
  url?: string;
  phone_number?: string;
}

export interface ButtonsComponent {
  type: "BUTTONS";
  buttons: TemplateButton[];
}

export type TemplateComponent =
  | HeaderComponent
  | BodyComponent
  | FooterComponent
  | ButtonsComponent;

export interface Template {
  id: string;
  name: string;
  language: Language;
  category: TemplateCategory;
  components: TemplateComponent[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateFormState {
  name: string;
  language: Language;
  category: TemplateCategory;
  header: HeaderComponent | null;
  body: BodyComponent;
  footer: FooterComponent | null;
  buttons: TemplateButton[];
}

export function emptyForm(): TemplateFormState {
  return {
    name: "",
    language: "it",
    category: "marketing",
    header: null,
    body: { type: "BODY", text: "" },
    footer: null,
    buttons: [],
  };
}

export function componentsToForm(
  components: TemplateComponent[]
): Pick<TemplateFormState, "header" | "body" | "footer" | "buttons"> {
  const header = components.find((c): c is HeaderComponent => c.type === "HEADER") ?? null;
  const body =
    components.find((c): c is BodyComponent => c.type === "BODY") ??
    ({ type: "BODY", text: "" } as BodyComponent);
  const footer = components.find((c): c is FooterComponent => c.type === "FOOTER") ?? null;
  const buttonsBlock = components.find((c): c is ButtonsComponent => c.type === "BUTTONS");
  return {
    header,
    body,
    footer,
    buttons: buttonsBlock?.buttons ?? [],
  };
}

export function formToComponents(form: TemplateFormState): TemplateComponent[] {
  const list: TemplateComponent[] = [];
  if (form.header && form.header.text.trim()) list.push(form.header);
  list.push(form.body);
  if (form.footer && form.footer.text.trim()) list.push(form.footer);
  if (form.buttons.length > 0) list.push({ type: "BUTTONS", buttons: form.buttons });
  return list;
}
```

- [ ] **Step 2: Write the variables helper**

Create `frontend/src/lib/templates/variables.ts`:

```typescript
export const KNOWN_VARIABLES = ["nome", "email", "phone", "azienda"] as const;
export type KnownVariable = (typeof KNOWN_VARIABLES)[number];

const TOKEN_RE = /\{\{([a-z0-9_:-]+)\}\}/gi;
const VALID_TOKEN_RE = /^(nome|email|phone|azienda|tag:[a-z0-9_-]+)$/i;

export interface VariableOption {
  label: string;
  token: string;
}

export const BUILTIN_VARIABLE_OPTIONS: VariableOption[] = [
  { label: "Nome", token: "{{nome}}" },
  { label: "Email", token: "{{email}}" },
  { label: "Telefono", token: "{{phone}}" },
  { label: "Azienda", token: "{{azienda}}" },
];

export function tagToken(tag: string): string {
  const sanitized = tag.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return sanitized ? `{{tag:${sanitized}}}` : "";
}

export function extractVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(TOKEN_RE)) {
    found.add(match[1]);
  }
  return [...found];
}

export function invalidVariables(text: string): string[] {
  return extractVariables(text).filter((v) => !VALID_TOKEN_RE.test(v));
}

export function insertAtCursor(
  textarea: HTMLTextAreaElement | HTMLInputElement,
  token: string
): string {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const next = before + token + after;
  // Restore cursor after inserted token in the next tick — caller should setValue then refocus
  queueMicrotask(() => {
    textarea.focus();
    const pos = start + token.length;
    textarea.setSelectionRange(pos, pos);
  });
  return next;
}

const SAMPLE_VALUES: Record<string, string> = {
  nome: "Marco",
  email: "marco@rossi.it",
  phone: "+39 333 1234567",
  azienda: "Rossi SRL",
};

export function renderWithSamples(text: string): string {
  return text.replace(TOKEN_RE, (_, name: string) => {
    if (SAMPLE_VALUES[name]) return SAMPLE_VALUES[name];
    if (name.startsWith("tag:")) return `[${name.slice(4)}]`;
    return _;
  });
}
```

- [ ] **Step 3: Verify files are type-correct**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: no errors related to the two new files. (Pre-existing errors unrelated to these files are acceptable.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/templates/
git commit -m "feat(templates): add shared types and variable helpers"
```

---

## Task 3: Frontend — validation module

**Files:**
- Create: `frontend/src/lib/templates/validation.ts`

- [ ] **Step 1: Write the validation module**

Create `frontend/src/lib/templates/validation.ts`:

```typescript
import { invalidVariables } from "./variables";
import type { TemplateFormState, TemplateButton } from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

const URL_RE = /^https?:\/\/\S+$/i;
const E164_RE = /^\+?[1-9]\d{7,14}$/;

function validateButton(b: TemplateButton, idx: number): Record<string, string> {
  const errs: Record<string, string> = {};
  const prefix = `buttons.${idx}`;
  if (!b.text || b.text.length > 25) {
    errs[`${prefix}.text`] = "Testo richiesto, max 25 caratteri.";
  }
  if (b.type === "URL") {
    if (!b.url || !URL_RE.test(b.url)) {
      errs[`${prefix}.url`] = "URL non valido (deve iniziare con http:// o https://).";
    }
  } else if (b.type === "PHONE_NUMBER") {
    if (!b.phone_number || !E164_RE.test(b.phone_number.replace(/\s+/g, ""))) {
      errs[`${prefix}.phone_number`] = "Numero non valido (formato E.164, es. +39333...).";
    }
  }
  return errs;
}

export function validateTemplate(form: TemplateFormState): ValidationResult {
  const errors: Record<string, string> = {};

  if (!form.name.trim()) {
    errors.name = "Il nome del template è obbligatorio.";
  } else if (form.name.length > 80) {
    errors.name = "Il nome può avere al massimo 80 caratteri.";
  }

  if (!form.body.text.trim()) {
    errors["body.text"] = "Il corpo del messaggio è obbligatorio.";
  } else if (form.body.text.length > 1024) {
    errors["body.text"] = "Il corpo può avere al massimo 1024 caratteri.";
  }

  if (form.header) {
    if (!form.header.text.trim()) {
      errors["header.text"] = "Se abilitato, l'header deve contenere del testo.";
    } else if (form.header.text.length > 60) {
      errors["header.text"] = "L'header può avere al massimo 60 caratteri.";
    }
  }

  if (form.footer) {
    if (!form.footer.text.trim()) {
      errors["footer.text"] = "Se abilitato, il footer deve contenere del testo.";
    } else if (form.footer.text.length > 60) {
      errors["footer.text"] = "Il footer può avere al massimo 60 caratteri.";
    } else if (/\{\{/.test(form.footer.text)) {
      errors["footer.text"] = "Il footer non può contenere variabili.";
    }
  }

  if (form.buttons.length > 3) {
    errors.buttons = "Massimo 3 bottoni.";
  }
  form.buttons.forEach((b, i) => Object.assign(errors, validateButton(b, i)));

  const textFields: [string, string][] = [
    ["body.text", form.body.text],
    ...(form.header ? ([["header.text", form.header.text]] as [string, string][]) : []),
  ];
  for (const [field, value] of textFields) {
    const bad = invalidVariables(value);
    if (bad.length > 0 && !errors[field]) {
      errors[field] = `Variabili non valide: ${bad.map((v) => `{{${v}}}`).join(", ")}`;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
```

- [ ] **Step 2: Verify type-check**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/templates/validation.ts
git commit -m "feat(templates): add client-side form validation"
```

---

## Task 4: Frontend — sidebar "Template" entry

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx` (NAV_ITEMS array and ICONS map)

- [ ] **Step 1: Add the template icon**

In `frontend/src/components/layout/Sidebar.tsx`, add a new key to the `ICONS` object (after the `edit` icon):

```typescript
  template: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>,
```

- [ ] **Step 2: Add the nav entry**

In the same file, insert this object into `NAV_ITEMS` between the "Nuovo invio" entry and the "Contatti" entry:

```typescript
  { href: "/templates", label: "Template", icon: "template" },
```

The array must read (only this portion shown for clarity):

```typescript
const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "grid" },
  { href: "/campaigns", label: "Campagne", icon: "send" },
  { href: "/campaigns/new", label: "Nuovo invio", icon: "edit" },
  { href: "/templates", label: "Template", icon: "template" },
  { href: "/contacts", label: "Contatti", icon: "users" },
  { href: "/groups", label: "Gruppi", icon: "users-plus" },
  { href: "/history", label: "Storico", icon: "clock" },
  { href: "/settings", label: "Impostazioni", icon: "settings" },
];
```

- [ ] **Step 3: Verify**

Load `http://localhost:3000/dashboard` in the browser. Confirm the sidebar now shows a "Template" entry with a document icon, and clicking it navigates to `/templates` (which will 404 until Task 5).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(templates): add sidebar nav entry"
```

---

## Task 5: Frontend — list page and card component

**Files:**
- Create: `frontend/src/app/(dashboard)/templates/_components/TemplateCard.tsx`
- Create: `frontend/src/app/(dashboard)/templates/page.tsx`

- [ ] **Step 1: Write the card component**

Create `frontend/src/app/(dashboard)/templates/_components/TemplateCard.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import type { Template, BodyComponent } from "@/lib/templates/types";

const CATEGORY_STYLES: Record<string, string> = {
  marketing: "bg-brand-green-pale text-brand-green-dark",
  utility: "bg-blue-50 text-blue-700",
  authentication: "bg-amber-50 text-amber-700",
};

export function TemplateCard({
  template,
  onDelete,
}: {
  template: Template;
  onDelete: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const body = template.components.find((c): c is BodyComponent => c.type === "BODY");
  const preview = body?.text ?? "";
  const date = new Date(template.created_at).toLocaleDateString("it-IT");

  return (
    <div className="group relative rounded-card border border-brand-ink-10 bg-white p-4 shadow-card transition hover:shadow-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-brand-ink">{template.name}</div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`rounded-pill px-2 py-0.5 text-[10.5px] font-medium ${
                CATEGORY_STYLES[template.category] ?? "bg-brand-ink-05 text-brand-ink-60"
              }`}
            >
              {template.category}
            </span>
            <span className="text-[10.5px] uppercase tracking-wider text-brand-ink-30">
              {template.language}
            </span>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-sm p-1 text-brand-ink-30 hover:bg-brand-ink-05 hover:text-brand-ink"
            aria-label="Azioni"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-7 z-10 w-36 rounded-sm border border-brand-ink-10 bg-white py-1 shadow-card"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <Link
                href={`/templates/${template.id}`}
                className="block px-3 py-1.5 text-[12.5px] text-brand-ink hover:bg-brand-ink-05"
              >
                Modifica
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  if (confirm(`Eliminare il template "${template.name}"?`)) onDelete(template.id);
                }}
                className="block w-full px-3 py-1.5 text-left text-[12.5px] text-red-600 hover:bg-red-50"
              >
                Elimina
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="mb-3 line-clamp-3 text-[12px] text-brand-ink-60">{preview}</p>

      <div className="flex items-center justify-between text-[11px] text-brand-ink-30">
        <span>Creato il {date}</span>
        <Link href={`/templates/${template.id}`} className="font-medium text-brand-teal-dark hover:underline">
          Modifica →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the list page**

Create `frontend/src/app/(dashboard)/templates/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import type { Template } from "@/lib/templates/types";
import { TemplateCard } from "./_components/TemplateCard";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/templates")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Errore ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setTemplates(data.templates ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(id: string) {
    const prev = templates;
    setTemplates((t) => (t ? t.filter((x) => x.id !== id) : t));
    const res = await apiFetch(`/templates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setTemplates(prev ?? null);
      alert("Errore durante l'eliminazione del template.");
    }
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-brand-ink">Template</h1>
          <p className="mt-1 text-[11.5px] text-brand-ink-60">I tuoi template WhatsApp riutilizzabili</p>
        </div>
        <Link
          href="/templates/new"
          className="rounded-sm bg-brand-green px-4 py-2 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(37,211,102,.3)] hover:bg-brand-green-dark"
        >
          + Nuovo template
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          {error}
        </div>
      )}

      {templates === null ? (
        <div className="animate-pulse text-brand-ink-30">Caricamento...</div>
      ) : templates.length === 0 ? (
        <div className="rounded-card border border-dashed border-brand-ink-10 bg-white p-10 text-center">
          <p className="text-[13px] text-brand-ink-60">
            Non hai ancora creato template. Creane uno per iniziare a inviare campagne personalizzate.
          </p>
          <Link
            href="/templates/new"
            className="mt-4 inline-block rounded-sm bg-brand-green px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-green-dark"
          >
            Crea il tuo primo template
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Verify**

Open `http://localhost:3000/templates` in the browser while logged in.

Expected:
- If no templates exist: empty-state card with CTA button.
- If some exist: grid of cards showing name, category badge, language, body preview, date, and action menu.
- Clicking "+ Nuovo template" goes to `/templates/new` (which will 404 until Task 7).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(dashboard\)/templates/
git commit -m "feat(templates): add list page with card grid and empty state"
```

---

## Task 6: Frontend — variable toolbar component

**Files:**
- Create: `frontend/src/app/(dashboard)/templates/[id]/_components/VariableToolbar.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/app/(dashboard)/templates/[id]/_components/VariableToolbar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { BUILTIN_VARIABLE_OPTIONS, tagToken } from "@/lib/templates/variables";

export function VariableToolbar({
  onInsert,
}: {
  onInsert: (token: string) => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const [tagOpen, setTagOpen] = useState(false);

  function commitTag() {
    const token = tagToken(tagInput);
    if (token) onInsert(token);
    setTagInput("");
    setTagOpen(false);
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[10.5px] uppercase tracking-wider text-brand-ink-30">Inserisci:</span>
      {BUILTIN_VARIABLE_OPTIONS.map((opt) => (
        <button
          key={opt.token}
          type="button"
          onClick={() => onInsert(opt.token)}
          className="rounded-pill border border-brand-ink-10 bg-white px-2 py-0.5 text-[11px] text-brand-ink-60 hover:border-brand-teal hover:text-brand-teal-dark"
        >
          {opt.label}
        </button>
      ))}
      {tagOpen ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTag();
              } else if (e.key === "Escape") {
                setTagOpen(false);
                setTagInput("");
              }
            }}
            placeholder="nome tag"
            className="w-28 rounded-sm border border-brand-ink-10 px-2 py-0.5 text-[11px] focus:border-brand-teal focus:outline-none"
          />
          <button
            type="button"
            onClick={commitTag}
            className="rounded-sm bg-brand-teal px-2 py-0.5 text-[11px] text-white hover:bg-brand-teal-dark"
          >
            OK
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setTagOpen(true)}
          className="rounded-pill border border-dashed border-brand-ink-10 px-2 py-0.5 text-[11px] text-brand-ink-60 hover:border-brand-teal hover:text-brand-teal-dark"
        >
          + Tag
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/templates/\[id\]/
git commit -m "feat(templates): add variable insertion toolbar"
```

---

## Task 7: Frontend — preview bubble component

**Files:**
- Create: `frontend/src/app/(dashboard)/templates/[id]/_components/PreviewBubble.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/app/(dashboard)/templates/[id]/_components/PreviewBubble.tsx`:

```tsx
"use client";

import { useState } from "react";
import { renderWithSamples } from "@/lib/templates/variables";
import type { TemplateFormState } from "@/lib/templates/types";

function highlight(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\{\{[a-z0-9_:-]+\}\}/gi;
  let lastIndex = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > lastIndex) parts.push(text.slice(lastIndex, start));
    parts.push(
      <span
        key={`${start}-${match[0]}`}
        className="rounded-sm bg-amber-100 px-1 text-amber-900"
      >
        {match[0]}
      </span>
    );
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function PreviewBubble({ form }: { form: TemplateFormState }) {
  const [showRendered, setShowRendered] = useState(false);

  const headerText = form.header?.text ?? "";
  const bodyText = form.body.text;
  const footerText = form.footer?.text ?? "";
  const buttons = form.buttons;

  const renderText = (t: string) =>
    showRendered ? renderWithSamples(t) : null;

  return (
    <div className="sticky top-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-brand-ink-30">
          Anteprima
        </span>
        <label className="flex items-center gap-1.5 text-[11px] text-brand-ink-60">
          <input
            type="checkbox"
            checked={showRendered}
            onChange={(e) => setShowRendered(e.target.checked)}
            className="h-3 w-3"
          />
          Mostra con valori esempio
        </label>
      </div>

      <div className="rounded-card bg-[#ECE5DD] p-4">
        <div className="ml-auto max-w-[90%] rounded-lg bg-[#DCF8C6] px-3 py-2 shadow-sm">
          {form.header && headerText && (
            <div className="mb-1 text-[13px] font-semibold text-[#1F2937]">
              {showRendered ? renderText(headerText) : highlight(headerText)}
            </div>
          )}
          <div className="whitespace-pre-wrap text-[13px] leading-snug text-[#1F2937]">
            {showRendered ? renderText(bodyText) || <span className="text-brand-ink-30">Scrivi il corpo del messaggio...</span> : bodyText ? highlight(bodyText) : <span className="text-brand-ink-30">Scrivi il corpo del messaggio...</span>}
          </div>
          {form.footer && footerText && (
            <div className="mt-1 text-[11px] text-[#6B7280]">{footerText}</div>
          )}
        </div>

        {buttons.length > 0 && (
          <div className="ml-auto mt-1.5 max-w-[90%] space-y-1">
            {buttons.map((b, i) => (
              <div
                key={i}
                className="rounded-lg bg-white px-3 py-1.5 text-center text-[12.5px] font-medium text-[#1E88E5] shadow-sm"
              >
                {b.type === "URL" && "🔗 "}
                {b.type === "PHONE_NUMBER" && "📞 "}
                {b.text || <span className="text-brand-ink-30">Testo bottone</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 text-right text-[11px] text-brand-ink-30">
        {bodyText.length} / 1024
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/templates/\[id\]/_components/PreviewBubble.tsx
git commit -m "feat(templates): add WhatsApp-style live preview bubble"
```

---

## Task 8: Frontend — buttons editor subsection

**Files:**
- Create: `frontend/src/app/(dashboard)/templates/[id]/_components/ButtonsEditor.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/app/(dashboard)/templates/[id]/_components/ButtonsEditor.tsx`:

```tsx
"use client";

import type { TemplateButton, ButtonType } from "@/lib/templates/types";

const BUTTON_TYPE_LABELS: Record<ButtonType, string> = {
  QUICK_REPLY: "Quick reply",
  URL: "URL",
  PHONE_NUMBER: "Telefono",
};

export function ButtonsEditor({
  buttons,
  errors,
  onChange,
}: {
  buttons: TemplateButton[];
  errors: Record<string, string>;
  onChange: (next: TemplateButton[]) => void;
}) {
  function update(idx: number, patch: Partial<TemplateButton>) {
    const next = buttons.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    onChange(next);
  }

  function remove(idx: number) {
    onChange(buttons.filter((_, i) => i !== idx));
  }

  function add() {
    if (buttons.length >= 3) return;
    onChange([...buttons, { type: "QUICK_REPLY", text: "" }]);
  }

  return (
    <div className="space-y-3">
      {buttons.map((b, idx) => (
        <div key={idx} className="rounded-sm border border-brand-ink-10 bg-brand-ink-05 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-brand-ink-60">Bottone {idx + 1}</span>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-[11px] text-red-600 hover:underline"
            >
              Rimuovi
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10.5px] font-medium text-brand-ink-60">Tipo</label>
              <select
                value={b.type}
                onChange={(e) => update(idx, { type: e.target.value as ButtonType })}
                className="w-full rounded-sm border border-brand-ink-10 bg-white px-2 py-1.5 text-[12.5px]"
              >
                <option value="QUICK_REPLY">{BUTTON_TYPE_LABELS.QUICK_REPLY}</option>
                <option value="URL">{BUTTON_TYPE_LABELS.URL}</option>
                <option value="PHONE_NUMBER">{BUTTON_TYPE_LABELS.PHONE_NUMBER}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] font-medium text-brand-ink-60">Testo</label>
              <input
                value={b.text}
                maxLength={25}
                onChange={(e) => update(idx, { text: e.target.value })}
                className="w-full rounded-sm border border-brand-ink-10 bg-white px-2 py-1.5 text-[12.5px]"
              />
              {errors[`buttons.${idx}.text`] && (
                <div className="mt-0.5 text-[10.5px] text-red-600">{errors[`buttons.${idx}.text`]}</div>
              )}
            </div>
          </div>

          {b.type === "URL" && (
            <div className="mt-2">
              <label className="mb-1 block text-[10.5px] font-medium text-brand-ink-60">URL</label>
              <input
                value={b.url ?? ""}
                onChange={(e) => update(idx, { url: e.target.value })}
                placeholder="https://esempio.it"
                className="w-full rounded-sm border border-brand-ink-10 bg-white px-2 py-1.5 text-[12.5px]"
              />
              {errors[`buttons.${idx}.url`] && (
                <div className="mt-0.5 text-[10.5px] text-red-600">{errors[`buttons.${idx}.url`]}</div>
              )}
            </div>
          )}
          {b.type === "PHONE_NUMBER" && (
            <div className="mt-2">
              <label className="mb-1 block text-[10.5px] font-medium text-brand-ink-60">Telefono</label>
              <input
                value={b.phone_number ?? ""}
                onChange={(e) => update(idx, { phone_number: e.target.value })}
                placeholder="+393331234567"
                className="w-full rounded-sm border border-brand-ink-10 bg-white px-2 py-1.5 text-[12.5px]"
              />
              {errors[`buttons.${idx}.phone_number`] && (
                <div className="mt-0.5 text-[10.5px] text-red-600">{errors[`buttons.${idx}.phone_number`]}</div>
              )}
            </div>
          )}
        </div>
      ))}

      {buttons.length < 3 && (
        <button
          type="button"
          onClick={add}
          className="w-full rounded-sm border border-dashed border-brand-ink-10 py-2 text-[12px] text-brand-ink-60 hover:border-brand-teal hover:text-brand-teal-dark"
        >
          + Aggiungi bottone
        </button>
      )}
      {errors.buttons && (
        <div className="text-[11px] text-red-600">{errors.buttons}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/templates/\[id\]/_components/ButtonsEditor.tsx
git commit -m "feat(templates): add buttons editor subsection"
```

---

## Task 9: Frontend — editor form component

**Files:**
- Create: `frontend/src/app/(dashboard)/templates/[id]/_components/EditorForm.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/app/(dashboard)/templates/[id]/_components/EditorForm.tsx`:

```tsx
"use client";

import { useRef } from "react";
import type {
  TemplateFormState,
  Language,
  TemplateCategory,
  HeaderComponent,
  FooterComponent,
} from "@/lib/templates/types";
import { insertAtCursor } from "@/lib/templates/variables";
import { VariableToolbar } from "./VariableToolbar";
import { ButtonsEditor } from "./ButtonsEditor";

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
];
const CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: "marketing", label: "Marketing" },
  { value: "utility", label: "Utility" },
  { value: "authentication", label: "Authentication" },
];

export function EditorForm({
  form,
  errors,
  onChange,
}: {
  form: TemplateFormState;
  errors: Record<string, string>;
  onChange: (next: TemplateFormState) => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const headerRef = useRef<HTMLInputElement>(null);

  function insertIntoBody(token: string) {
    if (!bodyRef.current) return;
    const nextText = insertAtCursor(bodyRef.current, token);
    onChange({ ...form, body: { type: "BODY", text: nextText } });
  }

  function insertIntoHeader(token: string) {
    if (!headerRef.current || !form.header) return;
    const nextText = insertAtCursor(headerRef.current, token);
    onChange({ ...form, header: { type: "HEADER", format: "TEXT", text: nextText } });
  }

  function toggleHeader() {
    const next: HeaderComponent | null = form.header
      ? null
      : { type: "HEADER", format: "TEXT", text: "" };
    onChange({ ...form, header: next });
  }

  function toggleFooter() {
    const next: FooterComponent | null = form.footer
      ? null
      : { type: "FOOTER", text: "" };
    onChange({ ...form, footer: next });
  }

  return (
    <div className="space-y-5">
      {/* Nome */}
      <div>
        <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">Nome template</label>
        <input
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          maxLength={80}
          placeholder="Es: Promo sconto estate"
          className="w-full rounded-sm border border-brand-ink-10 bg-white px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none"
        />
        {errors.name && <div className="mt-1 text-[11px] text-red-600">{errors.name}</div>}
      </div>

      {/* Lingua + Categoria */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">Lingua</label>
          <select
            value={form.language}
            onChange={(e) => onChange({ ...form, language: e.target.value as Language })}
            className="w-full rounded-sm border border-brand-ink-10 bg-white px-3 py-2 text-[13px]"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-medium text-brand-ink-60">Categoria</label>
          <select
            value={form.category}
            onChange={(e) => onChange({ ...form, category: e.target.value as TemplateCategory })}
            className="w-full rounded-sm border border-brand-ink-10 bg-white px-3 py-2 text-[13px]"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Header */}
      <div className="rounded-card border border-brand-ink-10 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-brand-ink">Header (opzionale)</span>
          <button
            type="button"
            onClick={toggleHeader}
            className="text-[11px] text-brand-teal-dark hover:underline"
          >
            {form.header ? "Rimuovi" : "Aggiungi"}
          </button>
        </div>
        {form.header && (
          <>
            <input
              ref={headerRef}
              value={form.header.text}
              maxLength={60}
              onChange={(e) => onChange({ ...form, header: { type: "HEADER", format: "TEXT", text: e.target.value } })}
              placeholder="Testo header"
              className="w-full rounded-sm border border-brand-ink-10 bg-white px-3 py-2 text-[13px]"
            />
            <VariableToolbar onInsert={insertIntoHeader} />
            {errors["header.text"] && <div className="mt-1 text-[11px] text-red-600">{errors["header.text"]}</div>}
          </>
        )}
      </div>

      {/* Body */}
      <div className="rounded-card border border-brand-ink-10 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-brand-ink">Corpo del messaggio *</span>
          <span className="text-[11px] text-brand-ink-30">{form.body.text.length} / 1024</span>
        </div>
        <textarea
          ref={bodyRef}
          value={form.body.text}
          maxLength={1024}
          rows={6}
          onChange={(e) => onChange({ ...form, body: { type: "BODY", text: e.target.value } })}
          placeholder="Ciao {{nome}}, ..."
          className="w-full rounded-sm border border-brand-ink-10 bg-white px-3 py-2 text-[13px] focus:border-brand-teal focus:outline-none"
        />
        <VariableToolbar onInsert={insertIntoBody} />
        {errors["body.text"] && <div className="mt-1 text-[11px] text-red-600">{errors["body.text"]}</div>}
      </div>

      {/* Footer */}
      <div className="rounded-card border border-brand-ink-10 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-brand-ink">Footer (opzionale)</span>
          <button
            type="button"
            onClick={toggleFooter}
            className="text-[11px] text-brand-teal-dark hover:underline"
          >
            {form.footer ? "Rimuovi" : "Aggiungi"}
          </button>
        </div>
        {form.footer && (
          <>
            <input
              value={form.footer.text}
              maxLength={60}
              onChange={(e) => onChange({ ...form, footer: { type: "FOOTER", text: e.target.value } })}
              placeholder="Testo footer"
              className="w-full rounded-sm border border-brand-ink-10 bg-white px-3 py-2 text-[13px]"
            />
            {errors["footer.text"] && <div className="mt-1 text-[11px] text-red-600">{errors["footer.text"]}</div>}
          </>
        )}
      </div>

      {/* Buttons */}
      <div className="rounded-card border border-brand-ink-10 bg-white p-4">
        <div className="mb-2 text-[12.5px] font-medium text-brand-ink">Bottoni (opzionale, max 3)</div>
        <ButtonsEditor
          buttons={form.buttons}
          errors={errors}
          onChange={(buttons) => onChange({ ...form, buttons })}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/templates/\[id\]/_components/EditorForm.tsx
git commit -m "feat(templates): add structured editor form"
```

---

## Task 10: Frontend — editor page (create + edit)

**Files:**
- Create: `frontend/src/app/(dashboard)/templates/[id]/page.tsx`

- [ ] **Step 1: Write the page**

Create `frontend/src/app/(dashboard)/templates/[id]/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import {
  emptyForm,
  componentsToForm,
  formToComponents,
  type TemplateFormState,
} from "@/lib/templates/types";
import { validateTemplate } from "@/lib/templates/validation";
import { EditorForm } from "./_components/EditorForm";
import { PreviewBubble } from "./_components/PreviewBubble";

export default function TemplateEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = params.id === "new";

  const [form, setForm] = useState<TemplateFormState>(emptyForm());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    apiFetch(`/templates/${params.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Errore ${r.status}`);
        return r.json();
      })
      .then((t) => {
        if (cancelled) return;
        setForm({
          name: t.name,
          language: t.language,
          category: t.category,
          ...componentsToForm(t.components ?? []),
        });
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setServerError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, params.id]);

  async function handleSave() {
    const result = validateTemplate(form);
    setErrors(result.errors);
    if (!result.ok) return;

    setSaving(true);
    setServerError(null);
    try {
      const payload = {
        name: form.name,
        language: form.language,
        category: form.category,
        components: formToComponents(form),
        status: "approved",
      };
      const path = isNew ? "/templates" : `/templates/${params.id}`;
      const method = isNew ? "POST" : "PUT";
      const res = await apiFetch(path, { method, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Errore ${res.status}`);
      }
      router.push("/templates");
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Errore imprevisto.");
      setSaving(false);
    }
  }

  if (loading) return <div className="animate-pulse text-brand-ink-30">Caricamento...</div>;

  return (
    <>
      <Link
        href="/templates"
        className="mb-4 inline-block text-[12px] text-brand-teal-dark hover:underline"
      >
        ← Torna ai template
      </Link>

      <div className="mb-6">
        <h1 className="text-[18px] font-semibold text-brand-ink">
          {isNew ? "Nuovo template" : "Modifica template"}
        </h1>
        <p className="mt-1 text-[11.5px] text-brand-ink-60">
          Crea un messaggio riutilizzabile con variabili dinamiche.
        </p>
      </div>

      {serverError && (
        <div className="mb-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          {serverError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <EditorForm form={form} errors={errors} onChange={setForm} />
        </div>
        <div className="lg:col-span-2">
          <PreviewBubble form={form} />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3 border-t border-brand-ink-10 pt-4">
        <Link
          href="/templates"
          className="rounded-sm px-4 py-2 text-[13px] font-medium text-brand-ink-60 hover:bg-brand-ink-05"
        >
          Annulla
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-sm bg-brand-green px-5 py-2 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(37,211,102,.3)] hover:bg-brand-green-dark disabled:opacity-50"
        >
          {saving ? "Salvataggio..." : "Salva template"}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Verify end-to-end — create**

In the browser (logged in):
1. Go to `/templates` → click "+ Nuovo template"
2. Fill nome "Test CRUD"
3. Leave lingua "Italiano", categoria "Marketing"
4. In the body, click variable pill `Nome` → should insert `{{nome}}`
5. Type `, benvenuto! Sconto 20% su {{tag:estate}}.` using the `+ Tag` pill for the tag
6. Toggle **footer** → type "Wamply Srl"
7. Add a button: type URL, text "Scopri", url `https://wamply.io`
8. Observe the preview on the right showing the bubble with highlighted variables
9. Toggle "Mostra con valori esempio" → variables replaced with samples
10. Click "Salva template" → should redirect to `/templates` showing the new card

- [ ] **Step 4: Verify end-to-end — edit**

1. From `/templates`, click "Modifica →" on the card you just created
2. Form should load with all previous values
3. Change the body text
4. Click "Salva template" → redirect to list, updated preview visible

- [ ] **Step 5: Verify end-to-end — delete**

1. From `/templates`, open the card's ⋮ menu → "Elimina"
2. Confirm → card disappears from the grid

- [ ] **Step 6: Verify end-to-end — validation**

1. Go to `/templates/new`
2. Click "Salva template" without filling anything → errors should appear under `Nome template` and `Corpo del messaggio`
3. Add a button with type URL but no URL → error under URL field

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/\(dashboard\)/templates/\[id\]/page.tsx
git commit -m "feat(templates): add editor page with create/edit/preview"
```

---

## Task 11: Frontend — link from campaigns/new when empty

**Files:**
- Modify: `frontend/src/app/(dashboard)/campaigns/new/page.tsx` (the empty-state hint)

- [ ] **Step 1: Restore the link in the empty-state hint**

Open `frontend/src/app/(dashboard)/campaigns/new/page.tsx`. Find the block:

```tsx
{templates.length === 0 && (
  <p className="mt-1 text-[11px] text-brand-ink-60">
    Non hai ancora template. Creane uno per inviare campagne personalizzate.
  </p>
)}
```

Replace with:

```tsx
{templates.length === 0 && (
  <p className="mt-1 text-[11px] text-brand-ink-60">
    Non hai ancora template.{" "}
    <Link href="/templates/new" className="font-medium text-brand-teal-dark hover:underline">
      Creane uno
    </Link>{" "}
    per inviare campagne personalizzate.
  </p>
)}
```

- [ ] **Step 2: Ensure `Link` is imported**

At the top of the same file, confirm this import exists (add if missing):

```tsx
import Link from "next/link";
```

- [ ] **Step 3: Verify**

1. Ensure at least one of your users has no templates (or soft-delete them all via the UI)
2. Go to `/campaigns/new` → the "Template" field shows the hint with a working link that navigates to `/templates/new`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(dashboard\)/campaigns/new/page.tsx
git commit -m "feat(templates): link empty-state hint in campaigns/new to /templates/new"
```

---

## Task 12: End-to-end smoke test

- [ ] **Step 1: Full flow verification**

Log in as `user1@test.local` / `User123!` and walk through:

1. Click sidebar "Template" → `/templates` → empty state appears
2. Click "Crea il tuo primo template" → `/templates/new`
3. Fill name "Promo primavera", body `Ciao {{nome}}, ...`, add a button (Quick reply "Interessato") → Save
4. Back on `/templates`, the new card is visible
5. Go to `/campaigns/new` → the Template dropdown now lists "Promo primavera (marketing)"
6. On `/templates`, open ⋮ → Modifica → change body → Save → changes reflected
7. On `/templates`, open ⋮ → Elimina → confirm → card disappears
8. Reload `/campaigns/new` → dropdown no longer lists "Promo primavera" (archived)

Expected: all 8 steps succeed without errors in the browser Console or frontend/backend logs.

- [ ] **Step 2: Final commit (if anything stray)**

```bash
git status
# If clean, no commit needed. Otherwise:
git add -A && git commit -m "chore(templates): polish after smoke test"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 7 success criteria in the spec have matching tasks (Task 5 covers list+empty, Task 10 covers create/edit/preview/variables, Task 1 covers delete, Task 11 covers the dropdown recovery, Task 12 covers end-to-end).
- [x] **Placeholder scan:** No TBD/TODO/"handle edge cases" placeholders.
- [x] **Type consistency:** `TemplateFormState`, `TemplateComponent`, `TemplateButton`, `Language`, `TemplateCategory`, `HeaderComponent`, `BodyComponent`, `FooterComponent`, `ButtonsComponent`, `ButtonType` are defined once in `types.ts` and referenced with the same names everywhere.
- [x] **File sizes:** Largest file is `EditorForm.tsx` (~190 lines), split into VariableToolbar + ButtonsEditor to stay focused. Editor page stays under 150 lines by delegating to subcomponents.
- [x] **Out of scope honored:** No media headers, no Meta approval, no versioning, no AI (that's Feature A) — spec alignment.
