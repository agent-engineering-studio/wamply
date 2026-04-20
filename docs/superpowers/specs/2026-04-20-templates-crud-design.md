# Templates CRUD — Design Doc

**Date:** 2026-04-20
**Status:** Approved for implementation
**Scope:** Feature C of the "Campaign Creation Improvements" triad (C → B → A)

## Goal

Give users a dedicated page to create, view, edit, and delete WhatsApp message templates. Templates are reusable structured message blueprints (header + body + footer + buttons) that campaigns reference.

This is the prerequisite for Feature B (message preview in campaign flow) and Feature A (AI assistant that generates templates).

## Context

**Backend:** already complete.
- `backend/src/api/templates.py` exposes `GET /templates`, `POST /templates`, `GET /templates/{id}`, `PUT /templates/{id}`. Missing: `DELETE /templates/{id}`.
- DB table `templates` has columns `name`, `language`, `category` (enum `marketing|utility|authentication`), `components` (jsonb), `status`, `meta_template_id`.

**Frontend:** route `/templates` does not exist. The campaign creation page already fetches `/templates` for a dropdown; today the select is empty because the user has no templates yet.

**Sidebar:** will need a new "Template" entry.

## Data model

Templates keep Meta WhatsApp Business API compatibility in the `components` jsonb array:

```json
[
  { "type": "HEADER", "format": "TEXT", "text": "Offerta per {{nome}}" },
  { "type": "BODY", "text": "Ciao {{nome}}, ecco il tuo sconto del 20%." },
  { "type": "FOOTER", "text": "Wamply Srl" },
  {
    "type": "BUTTONS",
    "buttons": [
      { "type": "URL", "text": "Scopri", "url": "https://example.com" },
      { "type": "QUICK_REPLY", "text": "Interessato" }
    ]
  }
]
```

Only `BODY` is mandatory. `HEADER`, `FOOTER`, `BUTTONS` are optional blocks that the UI renders conditionally.

### Variables

Variables use named placeholders bound to contact fields: `{{nome}}`, `{{email}}`, `{{phone}}`, `{{azienda}}`, and `{{tag:XXX}}` for arbitrary tag-based substitution.

- The literal `{{var}}` form is stored in the jsonb `text` fields. No translation to Meta numeric `{{1}}`/`{{2}}` form at this stage — that transformation belongs to the future Meta Cloud API integration and is out of scope.
- The UI surfaces a "Insert variable" toolbar so users don't need to type braces.

## UI structure

### List page — `/templates/page.tsx`

- Header row: title "Template", subtitle "I tuoi template WhatsApp", primary button "+ Nuovo template" (linking to `/templates/new`).
- Card grid (2-3 columns responsive). Each card shows:
  - Name (bold)
  - Category badge (color-coded: marketing = green, utility = blue, authentication = amber)
  - Language code
  - Short preview of body text (truncated)
  - Created date
  - Action menu (⋮): Modifica, Elimina
- Empty state when list is empty: illustration-free card saying "Non hai ancora creato template. Creane uno per iniziare a inviare campagne personalizzate." with a primary button to `/templates/new`.

### Editor page — `/templates/[id]/page.tsx`

Handles both create (`id = "new"`) and edit (`id = <uuid>`). Server component fetches template on edit; passes data to a client component with the form.

**Two-column layout on desktop (single column on mobile, preview collapsed into an accordion above the form):**

#### Left column — structured editor

1. **Nome template** (text input, required, 1-80 chars)
2. **Lingua** (select: it, en, es, de, fr) and **Categoria** (select: marketing, utility, authentication) on the same row
3. **Header** (collapsible section, toggle "Aggiungi header")
   - Tipo: for MVP only "Testo" (future: Media/Image/Video)
   - Textarea (max 60 chars) with variable toolbar
4. **Body** (always visible, required)
   - Textarea (max 1024 chars) with variable toolbar and char counter
5. **Footer** (collapsible, toggle "Aggiungi footer")
   - Textarea (max 60 chars, no variables per Meta rules)
6. **Buttons** (collapsible, toggle "Aggiungi bottoni", max 3)
   - Per button: type select (Quick Reply / URL / Phone) + label (max 25 chars) + value (URL or E.164 phone) if applicable
   - "+ Aggiungi bottone" button disabled after 3

**Variable toolbar:** appears under each text input that accepts variables. Small pills — `{{nome}}`, `{{email}}`, `{{phone}}`, `{{azienda}}`, and a "+ Tag" pill that opens a small popover to type a tag name and insert `{{tag:XXX}}`. Clicking a pill inserts the token at cursor position.

#### Right column — preview

A sticky preview panel styled as a WhatsApp green bubble:

- Renders header, body, footer, buttons with correct WhatsApp typography (monospaced header, ~14px body, smaller footer, button list below).
- Variables are rendered as highlighted pills (`{{nome}}` shown on a pale-yellow background) so the user can see where substitution will happen.
- Char counter for body: `123 / 1024`.
- Below the bubble: a compact "example" toggle that replaces variables with sample values (Mario Rossi / mario@rossi.it / +39...) to show what the message will look like once sent.

#### Footer

- Secondary button "Annulla" → `/templates`
- Primary button "Salva template" (enabled only when form valid)

### Sidebar

Add a "Template" entry between existing entries (order decided at implementation time by following existing sidebar conventions). Icon: document/file icon matching the existing icon set.

## API changes

Backend additions limited to:

1. **Add `DELETE /templates/{id}`** — checks user ownership, soft delete (we keep the row but set `status = 'archived'`) to avoid breaking references from historical campaigns.
2. **No schema changes.** The `components` jsonb already accommodates the structure.

No other backend work is required.

## Validation

Client-side (for responsive UX) and server-side (for security):

| Field | Rule |
|---|---|
| `name` | required, 1-80 chars, unique per user |
| `language` | required, enum of supported codes |
| `category` | required, enum `marketing|utility|authentication` |
| `body.text` | required, 1-1024 chars |
| `header.text` | if present, 1-60 chars |
| `footer.text` | if present, 1-60 chars, no `{{var}}` tokens allowed |
| `buttons` | max 3; each `text` 1-25 chars; `url` valid http(s) if type URL; `phone` E.164 if type PHONE |
| variable tokens | match `/\{\{(nome|email|phone|azienda|tag:[a-z0-9_-]+)\}\}/i` — unknown tokens rejected |

The unique-name check happens server-side; frontend shows the error returned by the API.

## Navigation

- Sidebar → `/templates`
- From `/campaigns/new`, when the template list is empty the existing hint becomes a link to `/templates/new`
- After successful save: redirect to `/templates` with a transient toast "Template salvato"
- After successful delete: stay on `/templates`, toast "Template eliminato"

## Out of scope

- Media headers (image, video, document)
- Meta WhatsApp Business API integration / template approval flow
- Template versioning or change history
- Sharing templates between users
- AI-generated templates (that's Feature A, later)
- Rich text formatting inside body (WhatsApp supports `*bold*`, `_italic_`, but we render text as-is for now; users can type the markers themselves)

## Success criteria

1. User can open `/templates`, see a list (or empty state) of their templates.
2. User can create a template with at least a body; optionally add header, footer, up to 3 buttons.
3. User can insert variable placeholders via toolbar pills.
4. User sees a live WhatsApp-style preview that mirrors the form state.
5. User can edit an existing template and changes persist.
6. User can delete a template (soft-delete); it disappears from the list.
7. The campaign creation dropdown (`/campaigns/new`) lists the newly-created template without code changes on the campaign side.
