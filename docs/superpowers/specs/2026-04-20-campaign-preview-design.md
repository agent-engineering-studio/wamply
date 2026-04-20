# Campaign Message Preview — Design Doc

**Date:** 2026-04-20
**Status:** Approved for implementation
**Scope:** Feature B of the "Campaigns UX improvements" triad (C → B → A). Feature C (templates CRUD) is shipped. Feature A (AI assistant) is queued after this.

## Goal

When the user picks a template in `/campaigns/new`, show a read-only preview of the message that will be sent: a WhatsApp-style bubble plus a compact metadata card (category, language, body length, variables used, recipients placeholder). The campaign itself keeps using the template as-is — no per-campaign override.

## Context

`/campaigns/new` today is a single-column form: name, template select, send-mode (immediate/scheduled), submit. There is no visual feedback about the template chosen. Users cannot see what their message looks like before launching.

Feature C already provides:
- `GET /templates/{id}` returning `{ id, name, language, category, components, ... }` with `components` as a proper object array (jsonb deserialized).
- `PreviewBubble` component in `frontend/src/app/(dashboard)/templates/[id]/_components/PreviewBubble.tsx` that renders components with a WhatsApp bubble style and highlights variables.
- `TemplateComponent`, `TemplateFormState`, and `componentsToForm` helpers in `frontend/src/lib/templates/types.ts`.

## Non-goals

Explicit out of scope for this feature:

- Recipients selection (groups / segments / per-contact) — separate feature.
- Per-campaign message override — user explicitly chose read-only preview.
- Real recipients count — Groups API is not built yet.
- AI-powered personalization preview — that is Feature A.
- Any backend change — the endpoint exists and returns what we need.

## UI

### Layout

The page becomes a responsive 2-column grid on `lg:` breakpoints and above:

- **Left column** (`lg:col-span-3`) — the existing form (name, template select, empty-state hint, send-mode buttons, submit).
- **Right column** (`lg:col-span-2`) — the preview panel. Sticky on desktop (`sticky top-4`).

On mobile (`<lg`) the preview stacks above the submit button and below the form card. This mirrors what the template editor already does, keeping the page feel consistent.

### Preview states

The preview panel has three states driven by `templateId`:

1. **Empty** (no template selected): a dashed card with the text "Seleziona un template per vedere l'anteprima" centered vertically. No bubble, no metadata.
2. **Loading** (template selected, fetch in flight): neutral skeleton — "Caricamento anteprima..." with a pulse animation.
3. **Error** (fetch fails or 404): compact red-ish card "Impossibile caricare l'anteprima." with no retry button. If the user re-selects the template from the dropdown, it re-fetches naturally.
4. **Ready** (fetch ok): renders the bubble + the metadata card.

### Ready state contents

1. **WhatsApp bubble** — the existing `PreviewBubble` component rendered with a `TemplateFormState` built from the fetched template via the existing `componentsToForm` helper. No behavioral changes to `PreviewBubble`.
2. **Metadata card** below the bubble, inside the same rounded container the bubble uses as parent wrapper. Fields shown in this order:
   - **Template name** — bold, 13px
   - **Badges row** — category (color-coded pill, same styles as the template list card) and language code (muted pill)
   - **Body length** — "123 / 1024 caratteri"
   - **Variables used** — "Usa: `{{nome}}`, `{{tag:estate}}`". If none: "Nessuna variabile". Computed from `header.text` and `body.text`; footer excluded (footer forbids variables by design).
   - **Recipients placeholder** — "Verrà inviata a **—** destinatari". The `—` is literal; we have no way to compute it yet.

## Refactor

`PreviewBubble` currently lives under the templates editor route. This feature needs it from `campaigns/new` too, so we move it to a shared location:

- `frontend/src/app/(dashboard)/templates/[id]/_components/PreviewBubble.tsx` → `frontend/src/components/templates/PreviewBubble.tsx`
- Update the import in `frontend/src/app/(dashboard)/templates/[id]/page.tsx`

This is the only file move in the refactor. No API change.

## Data flow

```
user picks template in <select>
  → templateId state updates in NewCampaignPage
  → <TemplatePreview templateId={templateId} /> rerenders
  → useEffect fetches GET /templates/{id}
  → on success: componentsToForm(...) → build TemplateFormState
  → render PreviewBubble and metadata card
```

No caching, no debouncing. One fetch per select change.

### Abort semantics

If the user changes the selection while a previous fetch is still in flight, the earlier response must not overwrite the later one. Use an `AbortController` (or the already-established `cancelled` boolean pattern used in the templates list page) in the effect cleanup.

## Components

### New files

- `frontend/src/lib/templates/preview-meta.ts` — pure helpers:
  - `collectVariables(components: TemplateComponent[]): string[]` — extracts unique tokens (by name, e.g. `nome`, `tag:estate`) from HEADER and BODY text fields only.
  - `bodyText(components: TemplateComponent[]): string` — returns the `BODY.text` or empty string.
  - `bodyLength(components: TemplateComponent[]): number` — convenience for the metadata card.
- `frontend/src/app/(dashboard)/campaigns/new/_components/TemplatePreview.tsx` — the right-column component. Props: `{ templateId: string | null }`. Handles empty/loading/error/ready states internally.
- `frontend/src/app/(dashboard)/campaigns/new/_components/MetadataCard.tsx` — the card shown under the bubble. Props: `{ template: Template }`. Pure presentational.

### Modified files

- `frontend/src/app/(dashboard)/campaigns/new/page.tsx` — change layout to 2-column grid, include `<TemplatePreview />`.
- `frontend/src/app/(dashboard)/templates/[id]/page.tsx` — update import path for `PreviewBubble`.

### Moved files

- `frontend/src/app/(dashboard)/templates/[id]/_components/PreviewBubble.tsx` → `frontend/src/components/templates/PreviewBubble.tsx`

## Validation

No validation changes. The existing submit path (create campaign → optionally launch → redirect) is unchanged. If `PUT/POST` is attempted with a template that has been archived between selection and submit, the backend returns the existing error and the form's existing error banner shows it.

## Accessibility

- The preview panel uses a region landmark with an `aria-label="Anteprima messaggio"`.
- Loading/error states are announced via `aria-live="polite"` on the panel wrapper so screen readers get told when state transitions.
- All color-coded badges have a text label alongside — the color is decoration, not the only signal.

## Success criteria

1. Opening `/campaigns/new` without selecting a template shows the "Seleziona un template" placeholder on the right.
2. Selecting a template: within 1 second on local network the bubble + metadata card appear.
3. Switching template: the preview updates to the new template; a fetch already in flight does not clobber the new result.
4. Body length counter matches the actual body `.length`.
5. Variables list shows every distinct `{{...}}` token that appears in header or body; none from footer or buttons.
6. Submitting the form still creates the campaign and (if "immediato") launches it, exactly as today.
7. `/templates/[id]` editor still renders its preview (refactor didn't break it).
8. Mobile: the preview appears stacked above the submit button; on desktop it's a sticky right column.
