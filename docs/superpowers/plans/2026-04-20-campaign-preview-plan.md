# Campaign Message Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only preview panel in `/campaigns/new` that shows the selected template as a WhatsApp bubble plus a compact metadata card.

**Architecture:** Reuse the existing `PreviewBubble` component by moving it to `frontend/src/components/templates/` so both the template editor and the campaign creation page can import it. A new `TemplatePreview` component in the campaigns route fetches `GET /templates/{id}` when `templateId` changes and renders bubble + metadata. Pure helpers in `frontend/src/lib/templates/preview-meta.ts` extract variables and body length.

**Tech Stack:** Next.js 15 App Router (client components), React 19, Tailwind v4 (dark theme: `bg-brand-navy-*`, `text-slate-*`, `text-brand-teal`), existing `apiFetch` client. No backend changes.

---

## File Structure

**New files:**
- `frontend/src/lib/templates/preview-meta.ts` — pure helpers: `collectVariables`, `bodyText`, `bodyLength`
- `frontend/src/components/templates/PreviewBubble.tsx` — moved from templates editor (see Task 1)
- `frontend/src/app/(dashboard)/campaigns/new/_components/MetadataCard.tsx` — metadata below the bubble
- `frontend/src/app/(dashboard)/campaigns/new/_components/TemplatePreview.tsx` — right-column wrapper with empty/loading/error/ready states

**Modified files:**
- `frontend/src/app/(dashboard)/templates/[id]/page.tsx` — update `PreviewBubble` import path
- `frontend/src/app/(dashboard)/campaigns/new/page.tsx` — add grid layout and include `<TemplatePreview />`

**Moved files (git mv preferred):**
- `frontend/src/app/(dashboard)/templates/[id]/_components/PreviewBubble.tsx` → `frontend/src/components/templates/PreviewBubble.tsx`

---

## Task 1: Move PreviewBubble to a shared location

**Files:**
- Move: `frontend/src/app/(dashboard)/templates/[id]/_components/PreviewBubble.tsx` → `frontend/src/components/templates/PreviewBubble.tsx`
- Modify: `frontend/src/app/(dashboard)/templates/[id]/page.tsx:15`

- [ ] **Step 1: Create the target directory and move the file with git**

From repo root `c:\Users\GiuseppeZileni\Git\wamply`:

```bash
mkdir -p frontend/src/components/templates
git mv "frontend/src/app/(dashboard)/templates/[id]/_components/PreviewBubble.tsx" frontend/src/components/templates/PreviewBubble.tsx
```

Do not edit the file contents. Keep the component exactly as-is — it already imports from `@/lib/templates/variables` and `@/lib/templates/types`, which are absolute aliases that do not depend on the file's location.

- [ ] **Step 2: Update the import in the template editor**

Open `frontend/src/app/(dashboard)/templates/[id]/page.tsx`. Line 15 currently reads:

```tsx
import { PreviewBubble } from "./_components/PreviewBubble";
```

Replace it with:

```tsx
import { PreviewBubble } from "@/components/templates/PreviewBubble";
```

- [ ] **Step 3: Typecheck**

From repo root:

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "PreviewBubble|templates/\[id\]" | head -10
```

Expected: no output (no errors on these paths).

- [ ] **Step 4: Visual smoke test**

The frontend container should auto-reload on file change. Visit `http://localhost:3000/templates/<an-existing-id>` and confirm the right-column WhatsApp preview still renders exactly as before.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/templates/PreviewBubble.tsx "frontend/src/app/(dashboard)/templates/[id]/page.tsx"
git commit -m "refactor(templates): move PreviewBubble to shared components"
```

---

## Task 2: Preview metadata helpers

**Files:**
- Create: `frontend/src/lib/templates/preview-meta.ts`

- [ ] **Step 1: Write the helpers file**

Create `frontend/src/lib/templates/preview-meta.ts` with this exact content:

```typescript
import type {
  TemplateComponent,
  HeaderComponent,
  BodyComponent,
} from "./types";
import { extractVariables } from "./variables";

export function bodyText(components: TemplateComponent[]): string {
  const body = components.find((c): c is BodyComponent => c.type === "BODY");
  return body?.text ?? "";
}

export function bodyLength(components: TemplateComponent[]): number {
  return bodyText(components).length;
}

export function collectVariables(components: TemplateComponent[]): string[] {
  const header = components.find((c): c is HeaderComponent => c.type === "HEADER");
  const body = components.find((c): c is BodyComponent => c.type === "BODY");
  const headerVars = header ? extractVariables(header.text) : [];
  const bodyVars = body ? extractVariables(body.text) : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of [...headerVars, ...bodyVars]) {
    if (!seen.has(v)) {
      seen.add(v);
      result.push(v);
    }
  }
  return result;
}
```

Note: footer is excluded by design (the validator already forbids variables in footer). Buttons are also excluded because button text is not template-personalization content.

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "preview-meta" | head -5
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/templates/preview-meta.ts
git commit -m "feat(campaigns): add template preview metadata helpers"
```

---

## Task 3: MetadataCard component

**Files:**
- Create: `frontend/src/app/(dashboard)/campaigns/new/_components/MetadataCard.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/app/(dashboard)/campaigns/new/_components/MetadataCard.tsx` with this exact content:

```tsx
"use client";

import type { Template } from "@/lib/templates/types";
import { bodyLength, collectVariables } from "@/lib/templates/preview-meta";

const CATEGORY_STYLES: Record<string, string> = {
  marketing: "bg-brand-navy-light text-brand-teal",
  utility: "bg-blue-50 text-blue-700",
  authentication: "bg-amber-50 text-amber-700",
};

export function MetadataCard({ template }: { template: Template }) {
  const len = bodyLength(template.components);
  const vars = collectVariables(template.components);

  return (
    <div className="mt-3 rounded-card border border-slate-800 bg-brand-navy-light p-3">
      <div className="text-[13px] font-semibold text-slate-100">{template.name}</div>

      <div className="mt-1.5 flex items-center gap-2">
        <span
          className={`rounded-pill px-2 py-0.5 text-[10.5px] font-medium ${
            CATEGORY_STYLES[template.category] ?? "bg-brand-navy-deep text-slate-400"
          }`}
        >
          {template.category}
        </span>
        <span className="rounded-pill bg-brand-navy-deep px-2 py-0.5 text-[10.5px] uppercase tracking-wider text-slate-400">
          {template.language}
        </span>
      </div>

      <dl className="mt-3 space-y-1.5 text-[11.5px]">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Lunghezza corpo</dt>
          <dd className="text-slate-200">{len} / 1024 caratteri</dd>
        </div>
        <div className="flex items-start justify-between gap-2">
          <dt className="shrink-0 text-slate-500">Variabili</dt>
          <dd className="text-right text-slate-200">
            {vars.length === 0 ? (
              <span className="text-slate-500">Nessuna variabile</span>
            ) : (
              <span className="inline-flex flex-wrap justify-end gap-1">
                {vars.map((v) => (
                  <code
                    key={v}
                    className="rounded-sm bg-brand-navy-deep px-1.5 py-0.5 text-[10.5px] text-brand-teal"
                  >
                    {`{{${v}}}`}
                  </code>
                ))}
              </span>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Destinatari</dt>
          <dd className="text-slate-200">
            Verrà inviata a <span className="font-semibold">—</span> destinatari
          </dd>
        </div>
      </dl>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "MetadataCard" | head -5
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(dashboard)/campaigns/new/_components/MetadataCard.tsx"
git commit -m "feat(campaigns): add template metadata card"
```

---

## Task 4: TemplatePreview wrapper

**Files:**
- Create: `frontend/src/app/(dashboard)/campaigns/new/_components/TemplatePreview.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/app/(dashboard)/campaigns/new/_components/TemplatePreview.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { componentsToForm, emptyForm, type Template, type TemplateFormState } from "@/lib/templates/types";
import { PreviewBubble } from "@/components/templates/PreviewBubble";
import { MetadataCard } from "./MetadataCard";

type State =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; template: Template; form: TemplateFormState };

export function TemplatePreview({ templateId }: { templateId: string | null }) {
  const [state, setState] = useState<State>({ kind: "empty" });

  useEffect(() => {
    if (!templateId) {
      setState({ kind: "empty" });
      return;
    }
    setState({ kind: "loading" });
    let cancelled = false;
    apiFetch(`/templates/${templateId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Template;
      })
      .then((template) => {
        if (cancelled) return;
        const form: TemplateFormState = {
          ...emptyForm(),
          name: template.name,
          language: template.language,
          category: template.category,
          ...componentsToForm(template.components ?? []),
        };
        setState({ kind: "ready", template, form });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  return (
    <section
      aria-label="Anteprima messaggio"
      aria-live="polite"
      className="lg:sticky lg:top-4"
    >
      {state.kind === "empty" && (
        <div className="rounded-card border border-dashed border-slate-800 bg-brand-navy-light p-8 text-center text-[12px] text-slate-500">
          Seleziona un template per vedere l&apos;anteprima.
        </div>
      )}

      {state.kind === "loading" && (
        <div className="animate-pulse rounded-card border border-slate-800 bg-brand-navy-light p-8 text-center text-[12px] text-slate-500">
          Caricamento anteprima...
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-card border border-red-900/40 bg-red-950/30 p-4 text-[12px] text-red-300">
          Impossibile caricare l&apos;anteprima.
        </div>
      )}

      {state.kind === "ready" && (
        <div>
          <PreviewBubble form={state.form} />
          <MetadataCard template={state.template} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "TemplatePreview" | head -5
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(dashboard)/campaigns/new/_components/TemplatePreview.tsx"
git commit -m "feat(campaigns): add template preview wrapper with empty/loading/error states"
```

---

## Task 5: Wire preview into the new-campaign page

**Files:**
- Modify: `frontend/src/app/(dashboard)/campaigns/new/page.tsx`

- [ ] **Step 1: Add the TemplatePreview import**

Open `frontend/src/app/(dashboard)/campaigns/new/page.tsx`. After the existing imports (right after `import { apiFetch } from "@/lib/api-client";`), add:

```tsx
import { TemplatePreview } from "./_components/TemplatePreview";
```

- [ ] **Step 2: Change the layout to a 2-column grid**

Find the block starting with `<form onSubmit={handleSubmit} className="space-y-5">` and wrap it so the form and the preview share a responsive grid. Replace the current structure:

```tsx
  return (
    <>
      <h1 className="mb-1 text-[15px] font-semibold text-brand-ink">Nuovo invio</h1>
      <p className="mb-6 text-[11px] text-brand-ink-60">Crea e invia una campagna WhatsApp</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ... existing form body ... */}
      </form>
    </>
  );
```

With this structure (keep the inner form body identical — only the outer layout changes):

```tsx
  return (
    <>
      <h1 className="mb-1 text-[15px] font-semibold text-slate-100">Nuovo invio</h1>
      <p className="mb-6 text-[11px] text-slate-400">Crea e invia una campagna WhatsApp</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <form onSubmit={handleSubmit} className="space-y-5 lg:col-span-3">
          {/* keep the existing form children unchanged */}
        </form>

        <aside className="lg:col-span-2">
          <TemplatePreview templateId={templateId || null} />
        </aside>
      </div>
    </>
  );
```

**Important:** do not re-type the form's inner children. Keep them as-is. Only change:
- the outer `<>...<form>` into `<>...<div class="grid ...">...<form ... class="... lg:col-span-3">...`
- add the `<aside>` with `<TemplatePreview />`
- close the `<div>` instead of just closing the form before `</>`.

Also update the two title/subtitle text colors from `text-brand-ink` / `text-brand-ink-60` to `text-slate-100` / `text-slate-400` to match the dark theme already used across the app.

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "campaigns/new" | head -5
```

Expected: no output.

- [ ] **Step 4: Manual smoke test**

1. Start or ensure all containers are running: `docker ps | grep -E "wcm-frontend|wcm-backend|wcm-supabase-kong"` should show all three up.
2. Log in as `user1@test.local` / `User123!`.
3. Go to `/campaigns/new`.
4. Without selecting a template: right column shows the dashed "Seleziona un template" placeholder.
5. Select a template: within ~1s the WhatsApp bubble appears with variables highlighted, and below it a metadata card with name, category badge, language, body length, variables list, "— destinatari".
6. Change template selection: preview updates to the new one.
7. Open DevTools Network tab: when switching template fast, older requests should not clobber the final state (the `cancelled` flag handles this — verify that the rendered preview always matches the last selected id).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/(dashboard)/campaigns/new/page.tsx"
git commit -m "feat(campaigns): add live template preview to new-campaign page"
```

---

## Task 6: Regression smoke test and end-to-end verification

- [ ] **Step 1: Template editor still works**

Visit `/templates/<existing-id>`. The right-column preview should render identically to before (this verifies the `PreviewBubble` move didn't break the editor).

- [ ] **Step 2: Campaign creation flow end-to-end**

1. `/campaigns/new` → pick a template → preview shows
2. Fill campaign name "Smoke B"
3. Keep "Immediato" selected
4. Click "Crea e invia subito"
5. Redirect to `/campaigns/<id>` should succeed
6. Go to `/campaigns` → the new campaign appears

- [ ] **Step 3: Mobile layout check**

Open DevTools device emulation at iPhone 14 width. On `/campaigns/new`:
- Form card on top, preview stacks below, submit button at the bottom.
- The "sticky" behavior should not apply (confirmed by the `lg:sticky` class).

- [ ] **Step 4: Final git status check**

```bash
git status
# Expected: clean working tree.
git log --oneline -8
# Expected: see the 5 commits from this plan in chronological order.
```

If clean, no additional commit needed.

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - SC1 (empty state placeholder) → Task 4
  - SC2 (bubble + metadata within 1s) → Task 4 + Task 5 manual test
  - SC3 (switching doesn't clobber) → Task 4 (cancelled flag) + Task 5 manual test
  - SC4 (body length matches) → Task 2 (`bodyLength`) + Task 3 (renders it)
  - SC5 (variables from header+body only) → Task 2 (`collectVariables` excludes footer/buttons)
  - SC6 (submit still works) → Task 6 e2e test
  - SC7 (editor preview still renders) → Task 1 step 4 + Task 6 step 1
  - SC8 (mobile stack, desktop sticky) → Task 4 (`lg:sticky`) + Task 5 layout + Task 6 mobile test
- [x] **Placeholder scan:** no TBD / TODO / "add error handling" / "handle edge cases" — every step has full code or exact commands.
- [x] **Type consistency:** `Template`, `TemplateComponent`, `TemplateFormState`, `HeaderComponent`, `BodyComponent`, `componentsToForm`, `emptyForm`, `extractVariables`, `apiFetch`, `PreviewBubble` are all imported from already-shipped locations and referenced with consistent names throughout the plan.
- [x] **File move note:** Task 1 explicitly uses `git mv` to preserve history; update to the only import in `templates/[id]/page.tsx` is line 15 — no other file references `_components/PreviewBubble`.
