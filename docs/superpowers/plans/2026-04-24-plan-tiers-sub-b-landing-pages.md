# Plan Tiers — Sub-project B: Segment-Based Landing Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire un framework "1 template + N content files" per landing pages segment-based su `/soluzioni/[segmento]`, compilare il pilota parrucchieri, generare placeholder per i 10 segmenti restanti, ridisegnare la homepage con grid 11 settori, aggiungere SEO (sitemap, robots, OG, schema.org).

**Architecture:** Next.js 15 App Router dynamic route `/soluzioni/[segmento]` che legge JSON tipizzati da `frontend/src/content/soluzioni/*.json`. Loader TypeScript restituisce il content o chiama `notFound()` per segmenti sconosciuti. La homepage `/` esistente (`frontend/src/app/[locale]/page.tsx`) resta per ora come landing localizzata; aggiungiamo una nuova landing marketing non-localizzata su `/` via redirect aggiornato — oppure (approccio scelto) lasciamo `/` → `/it` e aggiungiamo un nuovo homepage template dentro `[locale]/page.tsx` che include la grid 11 settori. In questo plan scegliamo la **via minima invasiva**: `/soluzioni/**` e `/piani` sono fuori dal gruppo `[locale]` (marketing IT-only per ora, come Sub-A). Il redesign homepage aggiunge un blocco "Settori" al landing page esistente.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind (brand tokens in `globals.css`), vitest + @testing-library/react, next-sitemap-less approach (sitemap.ts nativo di Next).

**Reference Spec:** `docs/superpowers/specs/2026-04-24-plan-tiers-and-positioning-design.md` §7 (landing pages), §6 (11 segmenti), §5 (listino), §12.2 (sub-project B).

**Dipendenza da Sub-A:** `frontend/src/lib/plans.ts` (slug `avvio`/`starter`/`professional`/`enterprise` mappati a displayName `Avvio`/`Essenziale`/`Plus`/`Premium`). Questo plan non modifica `plans.ts`: lo assume esistente.

---

## File Structure

**Create:**
- `frontend/src/content/soluzioni/_schema.ts`
- `frontend/src/content/soluzioni/_loader.ts`
- `frontend/src/content/soluzioni/_segments.ts`
- `frontend/src/content/soluzioni/parrucchieri.json`
- `frontend/src/content/soluzioni/ristoranti.json`
- `frontend/src/content/soluzioni/palestre.json`
- `frontend/src/content/soluzioni/studi_medici.json`
- `frontend/src/content/soluzioni/avvocati.json`
- `frontend/src/content/soluzioni/immobiliari.json`
- `frontend/src/content/soluzioni/autofficine.json`
- `frontend/src/content/soluzioni/retail.json`
- `frontend/src/content/soluzioni/scuole.json`
- `frontend/src/content/soluzioni/hotel.json`
- `frontend/src/content/soluzioni/autosaloni.json`
- `frontend/src/app/soluzioni/layout.tsx`
- `frontend/src/app/soluzioni/page.tsx`
- `frontend/src/app/soluzioni/[segmento]/page.tsx`
- `frontend/src/app/soluzioni/[segmento]/_components/Hero.tsx`
- `frontend/src/app/soluzioni/[segmento]/_components/Bullets.tsx`
- `frontend/src/app/soluzioni/[segmento]/_components/UseCases.tsx`
- `frontend/src/app/soluzioni/[segmento]/_components/TemplatesPreview.tsx`
- `frontend/src/app/soluzioni/[segmento]/_components/PlanTeaser.tsx`
- `frontend/src/app/soluzioni/[segmento]/_components/SegmentFooter.tsx`
- `frontend/src/app/soluzioni/_components/SegmentsGrid.tsx`
- `frontend/src/app/sitemap.ts`
- `frontend/src/app/robots.ts`
- `frontend/tests/content/loader.test.ts`
- `frontend/tests/pages/soluzioni-segmento.test.tsx`
- `frontend/tests/pages/soluzioni-index.test.tsx`

**Modify:**
- `frontend/src/middleware.ts` — excludere `/soluzioni`, `/piani`, `/prova` dal matcher auth (public routes).
- `frontend/src/app/[locale]/page.tsx` — aggiungere sezione "Settori" con grid 11 tile prima del blocco Pricing.

---

## Task 1: Content schema + segments registry

**Files:**
- Create: `frontend/src/content/soluzioni/_schema.ts`
- Create: `frontend/src/content/soluzioni/_segments.ts`

- [ ] **Step 1: Create the TypeScript schema**

Create `frontend/src/content/soluzioni/_schema.ts`:

```typescript
/**
 * Content schema for /soluzioni/[segmento] landing pages.
 *
 * One JSON file per segment lives next to this file. The loader (_loader.ts)
 * reads and validates them at build time. Field names are English for code
 * readability; every user-facing value stays in Italian.
 */

export type BulletIcon =
  | "calendar"
  | "gift"
  | "users"
  | "chat"
  | "clock"
  | "star"
  | "shield"
  | "sparkles"
  | "check";

export interface SegmentBullet {
  icon: BulletIcon;
  text: string;
}

export interface SegmentUseCase {
  title: string;
  description: string;
  roi: string;
}

export interface SegmentTemplate {
  slug: string;
  title: string;
  preview: string;
}

export interface SegmentTestimonial {
  author: string;
  role: string;
  body: string;
}

export interface SegmentContent {
  segmento: string;
  label: string;
  metaTitle: string;
  metaDescription: string;
  hero: {
    pain: string;
    solution: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  bullets: SegmentBullet[];
  useCases: SegmentUseCase[];
  templatesPreview: SegmentTemplate[];
  /** Slug in plans.ts — avvio / starter (Essenziale) / professional (Plus) / enterprise (Premium). */
  recommendedPlan: "avvio" | "starter" | "professional" | "enterprise";
  testimonial: SegmentTestimonial | null;
  /** Placeholder content = shallow copy with generic body. Used by the index page to label as "in arrivo". */
  isPlaceholder?: boolean;
}
```

- [ ] **Step 2: Create the segments registry**

Create `frontend/src/content/soluzioni/_segments.ts`:

```typescript
/**
 * Canonical list of 11 MVP segments.
 * Order drives homepage grid and sitemap output.
 * Slugs must match filenames in frontend/src/content/soluzioni/<slug>.json.
 */
export const SEGMENTS = [
  { slug: "parrucchieri", label: "Parrucchieri & Estetisti" },
  { slug: "ristoranti", label: "Ristoranti & Bar" },
  { slug: "palestre", label: "Palestre & Personal Trainer" },
  { slug: "studi_medici", label: "Studi Medici & Dentisti" },
  { slug: "avvocati", label: "Avvocati & Commercialisti" },
  { slug: "immobiliari", label: "Agenti Immobiliari" },
  { slug: "autofficine", label: "Autofficine & Carrozzerie" },
  { slug: "retail", label: "Negozi & Retail locale" },
  { slug: "scuole", label: "Scuole & Centri formazione" },
  { slug: "hotel", label: "Hotel, B&B & Agriturismo" },
  { slug: "autosaloni", label: "Autosaloni & Concessionarie" },
] as const;

export type SegmentSlug = (typeof SEGMENTS)[number]["slug"];

export const SEGMENT_SLUGS: readonly SegmentSlug[] = SEGMENTS.map(
  (s) => s.slug,
);

export function isSegmentSlug(value: string): value is SegmentSlug {
  return (SEGMENT_SLUGS as readonly string[]).includes(value);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/content/soluzioni/_schema.ts frontend/src/content/soluzioni/_segments.ts
git commit -m "feat(content): add schema + registry for /soluzioni segments"
```

---

## Task 2: Content loader (TDD)

**Files:**
- Create: `frontend/tests/content/loader.test.ts`
- Create: `frontend/src/content/soluzioni/_loader.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/content/loader.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  loadSegmentContent,
  loadAllSegments,
} from "@/content/soluzioni/_loader";

describe("content loader", () => {
  it("returns null for unknown segment slug", () => {
    expect(loadSegmentContent("unknown-segment-xyz")).toBeNull();
  });

  it("loads the pilot parrucchieri content with all required fields", () => {
    const content = loadSegmentContent("parrucchieri");
    expect(content).not.toBeNull();
    expect(content!.segmento).toBe("parrucchieri");
    expect(content!.label).toMatch(/Parrucchieri/);
    expect(content!.hero.pain.length).toBeGreaterThan(10);
    expect(content!.bullets).toHaveLength(3);
    expect(content!.useCases).toHaveLength(3);
    expect(content!.templatesPreview).toHaveLength(3);
    expect(content!.recommendedPlan).toBe("starter");
    expect(content!.isPlaceholder).toBeFalsy();
  });

  it("loads placeholder content for non-pilot segments", () => {
    const content = loadSegmentContent("ristoranti");
    expect(content).not.toBeNull();
    expect(content!.isPlaceholder).toBe(true);
  });

  it("loadAllSegments returns one entry per registered segment", () => {
    const all = loadAllSegments();
    expect(all.length).toBe(11);
    const slugs = all.map((s) => s.segmento);
    expect(slugs).toContain("parrucchieri");
    expect(slugs).toContain("autosaloni");
  });
});
```

- [ ] **Step 2: Run tests — expect ModuleNotFound**

```bash
cd frontend && npx vitest run tests/content/loader.test.ts
```

Expected: fails importing `_loader` (module not yet created).

- [ ] **Step 3: Implement the loader**

Create `frontend/src/content/soluzioni/_loader.ts`:

```typescript
/**
 * Synchronous loader for /soluzioni/[segmento] content.
 *
 * Uses static imports so Next.js bundles all content at build time. Adding a
 * new segment requires (a) a new JSON file, (b) an entry in _segments.ts, and
 * (c) one line in the `FILES` map below.
 */
import type { SegmentContent } from "./_schema";
import { SEGMENTS, isSegmentSlug, type SegmentSlug } from "./_segments";

import parrucchieri from "./parrucchieri.json";
import ristoranti from "./ristoranti.json";
import palestre from "./palestre.json";
import studi_medici from "./studi_medici.json";
import avvocati from "./avvocati.json";
import immobiliari from "./immobiliari.json";
import autofficine from "./autofficine.json";
import retail from "./retail.json";
import scuole from "./scuole.json";
import hotel from "./hotel.json";
import autosaloni from "./autosaloni.json";

const FILES: Record<SegmentSlug, SegmentContent> = {
  parrucchieri: parrucchieri as SegmentContent,
  ristoranti: ristoranti as SegmentContent,
  palestre: palestre as SegmentContent,
  studi_medici: studi_medici as SegmentContent,
  avvocati: avvocati as SegmentContent,
  immobiliari: immobiliari as SegmentContent,
  autofficine: autofficine as SegmentContent,
  retail: retail as SegmentContent,
  scuole: scuole as SegmentContent,
  hotel: hotel as SegmentContent,
  autosaloni: autosaloni as SegmentContent,
};

export function loadSegmentContent(slug: string): SegmentContent | null {
  if (!isSegmentSlug(slug)) return null;
  return FILES[slug] ?? null;
}

export function loadAllSegments(): SegmentContent[] {
  return SEGMENTS.map((s) => FILES[s.slug]);
}
```

- [ ] **Step 4: Content files don't exist yet — tests still fail with import error**

Next task creates the JSON files. Leave the tests red; they go green at the end of Task 4.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/content/soluzioni/_loader.ts frontend/tests/content/loader.test.ts
git commit -m "feat(content): add typed loader + failing tests for segment content"
```

---

## Task 3: Pilot content — parrucchieri

**Files:**
- Create: `frontend/src/content/soluzioni/parrucchieri.json`

- [ ] **Step 1: Create the pilot JSON (copy exactly from spec §7.4)**

Create `frontend/src/content/soluzioni/parrucchieri.json`:

```json
{
  "segmento": "parrucchieri",
  "label": "Parrucchieri & Estetisti",
  "metaTitle": "WhatsApp per parrucchieri e centri estetici | Wamply",
  "metaDescription": "Manda promemoria appuntamenti, promozioni e ricontatti automatici ai clienti del tuo salone su WhatsApp. Prova 14 giorni gratis.",
  "hero": {
    "pain": "Quanti appuntamenti perdi ogni mese per no-show?",
    "solution": "Ricorda tutto ai tuoi clienti con un messaggio automatico, scritto dall'AI.",
    "ctaPrimary": "Prova 14 giorni gratis",
    "ctaSecondary": "Vedi esempi template"
  },
  "bullets": [
    { "icon": "calendar", "text": "Promemoria appuntamento 24h prima, automatico" },
    { "icon": "gift", "text": "Promo compleanno scritte dall'AI in italiano colloquiale" },
    { "icon": "users", "text": "Ricontatti clienti inattivi in 1 click" }
  ],
  "useCases": [
    {
      "title": "Promemoria appuntamento",
      "description": "Il giorno prima del taglio, il cliente riceve un WhatsApp personalizzato. Risponde 'OK' o 'Sposta'.",
      "roi": "Riduce no-show del 40% — dato medio clienti Wamply"
    },
    {
      "title": "Promo compleanno",
      "description": "L'AI scrive il messaggio di auguri + sconto taglio omaggio, tu clicchi invia.",
      "roi": "+18% conversione a prenotazione vs email"
    },
    {
      "title": "Recall clienti inattivi",
      "description": "Chi non viene da 90+ giorni riceve 'Ci manchi, torna con -20%'.",
      "roi": "Riattiva il 12-15% dei clienti dormienti"
    }
  ],
  "templatesPreview": [
    { "slug": "parrucchieri_reminder_24h", "title": "Promemoria 24h", "preview": "Ciao {{nome}}, ti ricordiamo l'appuntamento di domani alle {{ora}} da {{salone}}. Rispondi OK per confermare o SPOSTA per modificare." },
    { "slug": "parrucchieri_birthday", "title": "Auguri + promo", "preview": "Buon compleanno {{nome}}! 🎁 Regalati un taglio col -30% entro fine mese — prenota qui: {{link}}" },
    { "slug": "parrucchieri_winback", "title": "Recall inattivi", "preview": "Ciao {{nome}}, ci manchi! Torna da {{salone}} con il 20% di sconto sul tuo prossimo appuntamento." }
  ],
  "recommendedPlan": "starter",
  "testimonial": null
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/content/soluzioni/parrucchieri.json
git commit -m "feat(content): add pilot parrucchieri landing content"
```

---

## Task 4: Placeholder content for 10 remaining segments

**Files:**
- Create: `ristoranti.json`, `palestre.json`, `studi_medici.json`, `avvocati.json`, `immobiliari.json`, `autofficine.json`, `retail.json`, `scuole.json`, `hotel.json`, `autosaloni.json` (all in `frontend/src/content/soluzioni/`).

Ogni placeholder usa la stessa struttura del pilota ma con copy generico e `"isPlaceholder": true`. Il template rende comunque una pagina valida, la index page marca "in arrivo".

- [ ] **Step 1: Create `ristoranti.json`**

```json
{
  "segmento": "ristoranti",
  "label": "Ristoranti & Bar",
  "metaTitle": "WhatsApp per ristoranti, pizzerie e bar | Wamply",
  "metaDescription": "Conferma prenotazioni, promuovi il menu della sera e fidelizza i clienti del tuo locale con WhatsApp. Prova 14 giorni gratis.",
  "hero": {
    "pain": "I clienti non confermano la prenotazione e il tavolo resta vuoto?",
    "solution": "Gestisci prenotazioni e promozioni del tuo locale direttamente su WhatsApp.",
    "ctaPrimary": "Prova 14 giorni gratis",
    "ctaSecondary": "Vedi esempi template"
  },
  "bullets": [
    { "icon": "calendar", "text": "Conferma prenotazioni con un tap, niente più tavoli vuoti" },
    { "icon": "star", "text": "Promo serali e menu del giorno ai tuoi clienti abituali" },
    { "icon": "chat", "text": "Rispondi veloce alle domande sui piatti e gli orari" }
  ],
  "useCases": [
    { "title": "Conferma prenotazione", "description": "Quando il cliente prenota, riceve un WhatsApp di conferma con orario e coperti.", "roi": "Riduce no-show fino al 35%" },
    { "title": "Menu della sera", "description": "Ogni sera invii un messaggio con il piatto del giorno a chi ti ha autorizzato.", "roi": "+22% coperti nelle serate feriali" },
    { "title": "Richiamo clienti", "description": "Chi non viene da due mesi riceve un invito personalizzato.", "roi": "Fino al 10% di clienti riattivati ogni mese" }
  ],
  "templatesPreview": [
    { "slug": "ristoranti_confirm", "title": "Conferma prenotazione", "preview": "Ciao {{nome}}, confermiamo il tuo tavolo per {{coperti}} persone alle {{ora}}. A presto da {{locale}}." },
    { "slug": "ristoranti_menu", "title": "Menu della sera", "preview": "Stasera da {{locale}}: {{piatto}}. Prenota rispondendo a questo messaggio." },
    { "slug": "ristoranti_winback", "title": "Torna a trovarci", "preview": "Ciao {{nome}}, ci manchi! Torna da {{locale}} questa settimana e offriamo noi il dolce." }
  ],
  "recommendedPlan": "starter",
  "testimonial": null,
  "isPlaceholder": true
}
```

- [ ] **Step 2: Create `palestre.json`**

```json
{
  "segmento": "palestre",
  "label": "Palestre & Personal Trainer",
  "metaTitle": "WhatsApp per palestre e personal trainer | Wamply",
  "metaDescription": "Ricorda gli allenamenti, fidelizza gli iscritti e recupera chi non viene più. Prova 14 giorni gratis.",
  "hero": {
    "pain": "Gli iscritti spariscono dopo un mese e non sai come recuperarli?",
    "solution": "Allena la tua community con messaggi motivazionali, promemoria e inviti mirati.",
    "ctaPrimary": "Prova 14 giorni gratis",
    "ctaSecondary": "Vedi esempi template"
  },
  "bullets": [
    { "icon": "clock", "text": "Promemoria lezione o corso il giorno prima" },
    { "icon": "sparkles", "text": "Promo rinnovo abbonamento prima della scadenza" },
    { "icon": "users", "text": "Recall chi non si allena da settimane" }
  ],
  "useCases": [
    { "title": "Promemoria corso", "description": "Il giorno prima del corso, l'iscritto riceve l'orario e la sala.", "roi": "+25% presenze ai corsi serali" },
    { "title": "Rinnovo abbonamento", "description": "Due settimane prima della scadenza parte un messaggio con sconto rinnovo.", "roi": "+30% tasso di rinnovo" },
    { "title": "Recall iscritti dormienti", "description": "Chi non viene da 20 giorni riceve una proposta per tornare in sala.", "roi": "Recupera 1 iscritto su 5" }
  ],
  "templatesPreview": [
    { "slug": "palestre_class_reminder", "title": "Promemoria corso", "preview": "Ciao {{nome}}, domani alle {{ora}} c'è {{corso}} con {{trainer}}. Ti aspettiamo." },
    { "slug": "palestre_renewal", "title": "Rinnovo abbonamento", "preview": "Ciao {{nome}}, il tuo abbonamento scade il {{data}}. Rinnova ora con il 10% di sconto." },
    { "slug": "palestre_winback", "title": "Recall inattivi", "preview": "Ciao {{nome}}, la sala ti aspetta. Torna entro venerdì e ti regaliamo una PT session." }
  ],
  "recommendedPlan": "starter",
  "testimonial": null,
  "isPlaceholder": true
}
```

- [ ] **Step 3: Create `studi_medici.json`**

```json
{
  "segmento": "studi_medici",
  "label": "Studi Medici & Dentisti",
  "metaTitle": "WhatsApp per studi medici e dentistici | Wamply",
  "metaDescription": "Conferma visite, riduci i no-show e comunica i risultati agli appuntamenti di controllo. Prova 14 giorni gratis.",
  "hero": {
    "pain": "I pazienti saltano le visite di controllo e non ti avvertono?",
    "solution": "Conferma automatiche e promemoria visite su WhatsApp, nel rispetto della privacy.",
    "ctaPrimary": "Prova 14 giorni gratis",
    "ctaSecondary": "Vedi esempi template"
  },
  "bullets": [
    { "icon": "calendar", "text": "Promemoria visita 24h e 2h prima" },
    { "icon": "shield", "text": "Comunicazioni conformi alla privacy del paziente" },
    { "icon": "check", "text": "Richiamo controlli annuali e follow-up terapie" }
  ],
  "useCases": [
    { "title": "Promemoria visita", "description": "Il paziente riceve l'orario della visita il giorno prima, con possibilità di spostare.", "roi": "Riduce no-show del 45%" },
    { "title": "Richiamo controllo annuale", "description": "A un anno dalla visita, messaggio automatico per prenotare il controllo.", "roi": "Fino al 40% di pazienti che riprenotano" },
    { "title": "Follow-up post visita", "description": "Dopo una terapia, il paziente riceve istruzioni e invito al controllo.", "roi": "Aumenta la fidelizzazione del paziente" }
  ],
  "templatesPreview": [
    { "slug": "studi_medici_reminder", "title": "Promemoria visita", "preview": "Gentile {{nome}}, le ricordiamo la visita di domani alle {{ora}} presso {{studio}}. Risponda CONFERMO o SPOSTA." },
    { "slug": "studi_medici_annual", "title": "Controllo annuale", "preview": "Gentile {{nome}}, è passato un anno dall'ultima visita. Prenoti il controllo annuale rispondendo a questo messaggio." },
    { "slug": "studi_medici_followup", "title": "Follow-up", "preview": "Gentile {{nome}}, come sta andando dopo la terapia del {{data}}? Se serve possiamo fissare un controllo." }
  ],
  "recommendedPlan": "professional",
  "testimonial": null,
  "isPlaceholder": true
}
```

- [ ] **Step 4: Create `avvocati.json`**

```json
{
  "segmento": "avvocati",
  "label": "Avvocati & Commercialisti",
  "metaTitle": "WhatsApp per avvocati, commercialisti e notai | Wamply",
  "metaDescription": "Comunica scadenze, ricorda udienze e gestisci la relazione col cliente in modo professionale su WhatsApp. Prova 14 giorni gratis.",
  "hero": {
    "pain": "Le scadenze fiscali e le udienze si accumulano e il cliente si dimentica?",
    "solution": "Un assistente che tiene aggiornati i tuoi clienti su scadenze e documenti, nel tono giusto.",
    "ctaPrimary": "Prova 14 giorni gratis",
    "ctaSecondary": "Vedi esempi template"
  },
  "bullets": [
    { "icon": "clock", "text": "Promemoria scadenze fiscali e udienze" },
    { "icon": "shield", "text": "Comunicazioni formali, nel tono dello studio" },
    { "icon": "check", "text": "Richieste documenti con un messaggio, senza rincorse" }
  ],
  "useCases": [
    { "title": "Promemoria scadenza", "description": "Il cliente riceve un messaggio con largo anticipo sulla scadenza fiscale.", "roi": "Meno pratiche in urgenza, più tempo per lo studio" },
    { "title": "Promemoria udienza", "description": "Il giorno prima dell'udienza, messaggio formale con ora e aula.", "roi": "Zero udienze perse per dimenticanza del cliente" },
    { "title": "Richiesta documenti", "description": "Invio di checklist con la lista documenti da portare al prossimo incontro.", "roi": "Tempo dello studio ridotto del 30%" }
  ],
  "templatesPreview": [
    { "slug": "avvocati_deadline", "title": "Promemoria scadenza", "preview": "Gentile {{nome}}, le ricordiamo la scadenza {{pratica}} il {{data}}. Lo studio è a disposizione per chiarimenti." },
    { "slug": "avvocati_hearing", "title": "Promemoria udienza", "preview": "Gentile {{nome}}, domani udienza ore {{ora}} presso {{tribunale}} aula {{aula}}. Ci vediamo 30 minuti prima." },
    { "slug": "avvocati_docs", "title": "Richiesta documenti", "preview": "Gentile {{nome}}, per l'incontro del {{data}} serve: {{checklist}}. Può rispondere quando ha tutto pronto." }
  ],
  "recommendedPlan": "starter",
  "testimonial": null,
  "isPlaceholder": true
}
```

- [ ] **Step 5: Create `immobiliari.json`**

```json
{
  "segmento": "immobiliari",
  "label": "Agenti Immobiliari",
  "metaTitle": "WhatsApp per agenti immobiliari | Wamply",
  "metaDescription": "Proponi immobili, gestisci visite e mantieni calda la relazione con acquirenti e venditori su WhatsApp. Prova 14 giorni gratis.",
  "hero": {
    "pain": "Gli acquirenti si raffreddano mentre rincorri 30 contatti al giorno?",
    "solution": "Tieni caldi tutti i contatti con messaggi mirati, visite confermate, nuovi immobili su misura.",
    "ctaPrimary": "Prova 14 giorni gratis",
    "ctaSecondary": "Vedi esempi template"
  },
  "bullets": [
    { "icon": "calendar", "text": "Conferma visite e cambia appuntamenti in un tap" },
    { "icon": "star", "text": "Nuovi immobili inviati solo a chi cerca quella tipologia" },
    { "icon": "chat", "text": "Follow-up automatico dopo ogni visita" }
  ],
  "useCases": [
    { "title": "Conferma visita", "description": "L'acquirente conferma o sposta la visita rispondendo al messaggio.", "roi": "Riduce visite saltate del 50%" },
    { "title": "Nuovo immobile su misura", "description": "Quando entra un immobile, parte un messaggio solo ai contatti compatibili.", "roi": "3× più richieste di visita per immobile nuovo" },
    { "title": "Follow-up post visita", "description": "Il giorno dopo la visita chiedi un parere e proponi alternative.", "roi": "Aumenta il tasso di conversione del 20%" }
  ],
  "templatesPreview": [
    { "slug": "immobiliari_confirm", "title": "Conferma visita", "preview": "Ciao {{nome}}, confermiamo la visita a {{indirizzo}} il {{data}} alle {{ora}}. Rispondi OK o SPOSTA." },
    { "slug": "immobiliari_new", "title": "Nuovo immobile", "preview": "Ciao {{nome}}, è entrato un {{tipologia}} in {{zona}} a {{prezzo}}. Ti mando la scheda se ti interessa?" },
    { "slug": "immobiliari_followup", "title": "Follow-up visita", "preview": "Ciao {{nome}}, che ne pensi di {{immobile}}? Se non è quello giusto ne ho altri due da proporti." }
  ],
  "recommendedPlan": "professional",
  "testimonial": null,
  "isPlaceholder": true
}
```

- [ ] **Step 6: Create `autofficine.json`**

```json
{
  "segmento": "autofficine",
  "label": "Autofficine & Carrozzerie",
  "metaTitle": "WhatsApp per autofficine e carrozzerie | Wamply",
  "metaDescription": "Comunica con i clienti sui lavori in corso, ricorda tagliandi e revisioni su WhatsApp. Prova 14 giorni gratis.",
  "hero": {
    "pain": "Il cliente chiama 3 volte per sapere se l'auto è pronta?",
    "solution": "Aggiornamenti automatici sullo stato lavori e promemoria tagliandi, senza più telefonate.",
    "ctaPrimary": "Prova 14 giorni gratis",
    "ctaSecondary": "Vedi esempi template"
  },
  "bullets": [
    { "icon": "clock", "text": "Aggiornamento stato lavori quando l'auto è pronta" },
    { "icon": "calendar", "text": "Promemoria tagliando e revisione annuale" },
    { "icon": "check", "text": "Preventivi e conferme via WhatsApp, niente carta" }
  ],
  "useCases": [
    { "title": "Auto pronta", "description": "Appena l'auto è pronta, il cliente riceve un messaggio con l'orario di ritiro.", "roi": "Meno telefonate di controllo, più tempo in officina" },
    { "title": "Promemoria tagliando", "description": "A 11 mesi dall'ultimo tagliando, messaggio con proposta appuntamento.", "roi": "Fidelizza il 35% dei clienti sull'anno" },
    { "title": "Preventivo WhatsApp", "description": "Mandi foto del danno e il preventivo scritto, il cliente approva con OK.", "roi": "Tempi di chiusura preventivi ridotti del 40%" }
  ],
  "templatesPreview": [
    { "slug": "autofficine_ready", "title": "Auto pronta", "preview": "Ciao {{nome}}, l'auto {{targa}} è pronta. Puoi passare da {{officina}} entro le {{ora}}." },
    { "slug": "autofficine_service", "title": "Promemoria tagliando", "preview": "Ciao {{nome}}, tra poco è ora del tagliando sulla {{targa}}. Vuoi che ti fissi un appuntamento?" },
    { "slug": "autofficine_quote", "title": "Preventivo", "preview": "Ciao {{nome}}, il preventivo per {{lavoro}} è {{prezzo}}€ IVA inclusa, tempo stimato {{giorni}} giorni. Rispondi OK per confermare." }
  ],
  "recommendedPlan": "starter",
  "testimonial": null,
  "isPlaceholder": true
}
```

- [ ] **Step 7: Create `retail.json`**

```json
{
  "segmento": "retail",
  "label": "Negozi & Retail locale",
  "metaTitle": "WhatsApp per negozi e retail | Wamply",
  "metaDescription": "Promo, nuovi arrivi e recall clienti: porta il tuo negozio sul canale che i clienti aprono ogni giorno. Prova 14 giorni gratis.",
  "hero": {
    "pain": "Le vetrine si vedono solo da chi passa davanti. E gli altri?",
    "solution": "Arriva nelle chat dei tuoi clienti con nuovi arrivi, promo e inviti personalizzati.",
    "ctaPrimary": "Prova 14 giorni gratis",
    "ctaSecondary": "Vedi esempi template"
  },
  "bullets": [
    { "icon": "sparkles", "text": "Nuovi arrivi inviati ai clienti più attivi" },
    { "icon": "gift", "text": "Promo di stagione con un click" },
    { "icon": "users", "text": "Recall clienti che non tornano da mesi" }
  ],
  "useCases": [
    { "title": "Nuovi arrivi", "description": "Quando arriva la collezione nuova, messaggio ai clienti abituali.", "roi": "+28% visite in negozio la settimana del lancio" },
    { "title": "Promo stagionale", "description": "I saldi partono col messaggio giusto, mezza giornata prima degli altri.", "roi": "+15% incasso nei primi due giorni di saldi" },
    { "title": "Recall cliente", "description": "A 60 giorni dall'ultimo acquisto, invito con piccola promo.", "roi": "Riattiva 1 cliente ogni 5" }
  ],
  "templatesPreview": [
    { "slug": "retail_new_arrivals", "title": "Nuovi arrivi", "preview": "Ciao {{nome}}, da {{negozio}} è arrivata la nuova collezione {{collezione}}. Passa a provarla entro {{data}}." },
    { "slug": "retail_sale", "title": "Promo stagionale", "preview": "Ciao {{nome}}, da domani sconti fino al {{sconto}}% da {{negozio}}. Per te che sei cliente, oggi già visibile in anteprima." },
    { "slug": "retail_winback", "title": "Recall cliente", "preview": "Ciao {{nome}}, ci manchi! Passa da {{negozio}} entro venerdì e ti facciamo il 15% sul tuo acquisto." }
  ],
  "recommendedPlan": "starter",
  "testimonial": null,
  "isPlaceholder": true
}
```

- [ ] **Step 8: Create `scuole.json`**

```json
{
  "segmento": "scuole",
  "label": "Scuole & Centri formazione",
  "metaTitle": "WhatsApp per scuole, asili e centri formazione | Wamply",
  "metaDescription": "Comunicazioni alle famiglie, avvisi di chiusura, iscrizioni aperte: tutto su WhatsApp, chiaro e diretto. Prova 14 giorni gratis.",
  "hero": {
    "pain": "Le circolari cartacee si perdono e i genitori non ricevono l'avviso?",
    "solution": "Comunicazioni chiare alle famiglie su WhatsApp, con conferma di lettura.",
    "ctaPrimary": "Prova 14 giorni gratis",
    "ctaSecondary": "Vedi esempi template"
  },
  "bullets": [
    { "icon": "chat", "text": "Avvisi alle famiglie con conferma di lettura" },
    { "icon": "calendar", "text": "Promemoria iscrizioni, scadenze, riunioni" },
    { "icon": "star", "text": "Novità dei corsi per ex alunni e interessati" }
  ],
  "useCases": [
    { "title": "Avviso chiusura", "description": "Scuola chiusa per maltempo: messaggio a tutte le famiglie in 2 minuti.", "roi": "Comunicazione certa, niente famiglie davanti al cancello" },
    { "title": "Iscrizioni aperte", "description": "Periodo iscrizioni: messaggio a ex alunni e contatti interessati.", "roi": "+22% iscrizioni rispetto alle sole email" },
    { "title": "Promemoria riunione", "description": "Il giorno prima della riunione, messaggio di promemoria ai genitori.", "roi": "+30% presenze ai colloqui" }
  ],
  "templatesPreview": [
    { "slug": "scuole_notice", "title": "Avviso chiusura", "preview": "Famiglie {{classe}}: domani {{data}} la scuola sarà chiusa per {{motivo}}. Le lezioni riprenderanno il {{ripresa}}." },
    { "slug": "scuole_enrollment", "title": "Iscrizioni aperte", "preview": "Sono aperte le iscrizioni a {{corso}} per l'anno {{anno}}. Info e moduli: {{link}}. Posti limitati." },
    { "slug": "scuole_meeting", "title": "Promemoria riunione", "preview": "Gentili famiglie {{classe}}, le ricordiamo la riunione di domani alle {{ora}} in {{aula}}." }
  ],
  "recommendedPlan": "professional",
  "testimonial": null,
  "isPlaceholder": true
}
```

- [ ] **Step 9: Create `hotel.json`**

```json
{
  "segmento": "hotel",
  "label": "Hotel, B&B & Agriturismo",
  "metaTitle": "WhatsApp per hotel, B&B e agriturismo | Wamply",
  "metaDescription": "Pre-check-in, conferme prenotazione e richieste di recensione direttamente su WhatsApp. Prova 14 giorni gratis.",
  "hero": {
    "pain": "Gli ospiti arrivano stanchi e il check-in rallenta tutto?",
    "solution": "Dati del check-in raccolti prima dell'arrivo via WhatsApp, benvenuto in italiano o inglese.",
    "ctaPrimary": "Prova 14 giorni gratis",
    "ctaSecondary": "Vedi esempi template"
  },
  "bullets": [
    { "icon": "calendar", "text": "Pre check-in online tramite WhatsApp" },
    { "icon": "star", "text": "Richiesta recensione dopo il soggiorno" },
    { "icon": "chat", "text": "Risposte veloci a domande su orari, colazione, parcheggio" }
  ],
  "useCases": [
    { "title": "Pre check-in", "description": "Due giorni prima dell'arrivo, il cliente manda i documenti e sceglie l'orario.", "roi": "Riduce tempo check-in del 60%" },
    { "title": "Richiesta recensione", "description": "Il giorno della partenza, messaggio gentile con link alla recensione.", "roi": "+40% recensioni raccolte" },
    { "title": "Info rapide", "description": "Risposte automatiche su orari colazione, parcheggio, Wi-Fi.", "roi": "Meno telefonate alla reception" }
  ],
  "templatesPreview": [
    { "slug": "hotel_precheckin", "title": "Pre check-in", "preview": "Ciao {{nome}}, ti aspettiamo il {{data}} da {{struttura}}. Per velocizzare il check-in, ci mandi un documento rispondendo qui?" },
    { "slug": "hotel_review", "title": "Richiesta recensione", "preview": "Ciao {{nome}}, grazie per aver scelto {{struttura}}! Se ti va, lasciaci un parere qui: {{link}}" },
    { "slug": "hotel_info", "title": "Info utili", "preview": "Ciao {{nome}}, benvenuto! Colazione dalle {{ora}}, Wi-Fi {{wifi}}, parcheggio incluso. Qualsiasi cosa, siamo qui." }
  ],
  "recommendedPlan": "professional",
  "testimonial": null,
  "isPlaceholder": true
}
```

- [ ] **Step 10: Create `autosaloni.json`**

```json
{
  "segmento": "autosaloni",
  "label": "Autosaloni & Concessionarie",
  "metaTitle": "WhatsApp per autosaloni e concessionarie | Wamply",
  "metaDescription": "Test drive, nuovi ingressi e promemoria tagliando per i clienti della concessionaria, via WhatsApp. Prova 14 giorni gratis.",
  "hero": {
    "pain": "Il cliente chiede informazioni su un'auto e poi sparisce?",
    "solution": "Tieni caldi tutti i contatti con foto, test drive e follow-up mirati su WhatsApp.",
    "ctaPrimary": "Prova 14 giorni gratis",
    "ctaSecondary": "Vedi esempi template"
  },
  "bullets": [
    { "icon": "calendar", "text": "Conferma test drive con un messaggio" },
    { "icon": "sparkles", "text": "Nuovi ingressi usato e km 0 ai contatti in target" },
    { "icon": "clock", "text": "Promemoria tagliando e scadenza bollo" }
  ],
  "useCases": [
    { "title": "Test drive", "description": "Quando il cliente prenota il test drive, riceve conferma e indicazioni.", "roi": "Meno test drive saltati, più chiusure" },
    { "title": "Nuovo ingresso", "description": "Entra un usato interessante: foto e scheda ai contatti compatibili.", "roi": "1 trattativa aperta ogni 10 messaggi inviati" },
    { "title": "Post vendita", "description": "Promemoria tagliando, scadenza bollo, anno di garanzia residua.", "roi": "Fidelizza il 45% dei clienti per il prossimo acquisto" }
  ],
  "templatesPreview": [
    { "slug": "autosaloni_testdrive", "title": "Test drive", "preview": "Ciao {{nome}}, confermiamo il test drive della {{modello}} il {{data}} alle {{ora}} da {{salone}}. Porta patente e documento." },
    { "slug": "autosaloni_new", "title": "Nuovo ingresso", "preview": "Ciao {{nome}}, è appena entrata una {{modello}} {{anno}} {{km}} km a {{prezzo}}. Ti mando la scheda?" },
    { "slug": "autosaloni_reminder", "title": "Promemoria tagliando", "preview": "Ciao {{nome}}, la tua {{modello}} ha bisogno del tagliando entro {{data}}. Ti fisso un appuntamento in officina?" }
  ],
  "recommendedPlan": "professional",
  "testimonial": null,
  "isPlaceholder": true
}
```

- [ ] **Step 11: Run loader tests — they should pass now**

```bash
cd frontend && npx vitest run tests/content/loader.test.ts
```

Expected: 4 passed.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/content/soluzioni/*.json
git commit -m "feat(content): add placeholder content for 10 non-pilot segments"
```

---

## Task 5: Presentational components for `/soluzioni/[segmento]`

**Files:**
- Create: `frontend/src/app/soluzioni/[segmento]/_components/Hero.tsx`
- Create: `frontend/src/app/soluzioni/[segmento]/_components/Bullets.tsx`
- Create: `frontend/src/app/soluzioni/[segmento]/_components/UseCases.tsx`
- Create: `frontend/src/app/soluzioni/[segmento]/_components/TemplatesPreview.tsx`
- Create: `frontend/src/app/soluzioni/[segmento]/_components/PlanTeaser.tsx`
- Create: `frontend/src/app/soluzioni/[segmento]/_components/SegmentFooter.tsx`

- [ ] **Step 1: Create Hero**

Create `frontend/src/app/soluzioni/[segmento]/_components/Hero.tsx`:

```tsx
import Link from "next/link";
import type { SegmentContent } from "@/content/soluzioni/_schema";

export function Hero({ content }: { content: SegmentContent }) {
  return (
    <section className="relative overflow-hidden border-b border-white/10 px-6 py-20">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[520px] w-[520px] rounded-full bg-brand-teal/10 blur-[140px]" />
      </div>
      <div className="relative mx-auto max-w-4xl text-center">
        <span className="mb-5 inline-flex items-center gap-2 rounded-pill border border-brand-teal/30 bg-brand-teal/10 px-4 py-1.5 text-[12px] font-medium text-brand-teal">
          {content.label}
        </span>
        <h1 className="text-[44px] font-semibold leading-[1.1] tracking-tight text-white">
          {content.hero.pain}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-brand-slate-light">
          {content.hero.solution}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href={`/prova?plan=${content.recommendedPlan}&segmento=${content.segmento}`}
            className="rounded-pill bg-brand-teal px-8 py-3 text-[15px] font-medium text-white shadow-teal hover:bg-brand-teal-dark transition-colors"
          >
            {content.hero.ctaPrimary}
          </Link>
          <a
            href="#templates"
            className="rounded-pill border border-brand-slate px-8 py-3 text-[15px] font-medium text-brand-slate-light hover:border-brand-slate-light hover:text-white transition-colors"
          >
            {content.hero.ctaSecondary}
          </a>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create Bullets**

Create `frontend/src/app/soluzioni/[segmento]/_components/Bullets.tsx`:

```tsx
import type { SegmentBullet } from "@/content/soluzioni/_schema";

const ICON_PATHS: Record<string, string> = {
  calendar: "M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 3v4M16 3v4",
  gift: "M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  clock: "M12 6v6l4 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  sparkles: "M12 3v3M12 18v3M3 12h3M18 12h3M5.64 5.64l2.12 2.12M16.24 16.24l2.12 2.12M5.64 18.36l2.12-2.12M16.24 7.76l2.12-2.12",
  check: "M5 13l4 4L19 7",
};

function Icon({ name }: { name: string }) {
  const d = ICON_PATHS[name] ?? ICON_PATHS.check;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d={d} />
    </svg>
  );
}

export function Bullets({ items }: { items: SegmentBullet[] }) {
  return (
    <section className="border-b border-white/10 py-16">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 px-6 md:grid-cols-3">
        {items.map((b, i) => (
          <div
            key={i}
            className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
          >
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-teal/15 text-brand-teal">
              <Icon name={b.icon} />
            </div>
            <p className="text-[14px] leading-relaxed text-white">{b.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create UseCases**

Create `frontend/src/app/soluzioni/[segmento]/_components/UseCases.tsx`:

```tsx
import type { SegmentUseCase } from "@/content/soluzioni/_schema";

export function UseCases({ items }: { items: SegmentUseCase[] }) {
  return (
    <section className="border-b border-white/10 py-20">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="mb-12 text-center text-[28px] font-semibold text-white">
          Tre casi concreti, pensati per te
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {items.map((u, i) => (
            <div
              key={i}
              className="flex flex-col rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
            >
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-brand-teal">
                Caso {i + 1}
              </div>
              <h3 className="mb-3 text-[17px] font-semibold text-white">
                {u.title}
              </h3>
              <p className="mb-5 flex-1 text-[13.5px] leading-relaxed text-brand-slate-light">
                {u.description}
              </p>
              <div className="rounded-md border border-brand-teal/30 bg-brand-teal/5 px-3 py-2 text-[12.5px] font-medium text-brand-teal">
                {u.roi}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create TemplatesPreview**

Create `frontend/src/app/soluzioni/[segmento]/_components/TemplatesPreview.tsx`:

```tsx
import type { SegmentTemplate } from "@/content/soluzioni/_schema";

export function TemplatesPreview({ items }: { items: SegmentTemplate[] }) {
  return (
    <section id="templates" className="border-b border-white/10 py-20">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="mb-3 text-center text-[28px] font-semibold text-white">
          Messaggi pronti, da personalizzare in 30 secondi
        </h2>
        <p className="mb-12 text-center text-[14px] text-brand-slate-light">
          Cambi le parti tra parentesi e il messaggio è pronto per i tuoi clienti.
        </p>
        <div className="grid gap-5 md:grid-cols-3">
          {items.map((t) => (
            <article
              key={t.slug}
              className="flex flex-col rounded-xl border border-white/10 bg-brand-navy-deep p-5"
            >
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-brand-teal">
                {t.title}
              </div>
              <div className="mt-2 flex-1 rounded-md bg-[#dcf8c6] p-3 text-[13px] leading-relaxed text-[#111b21]">
                {t.preview}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create PlanTeaser**

Create `frontend/src/app/soluzioni/[segmento]/_components/PlanTeaser.tsx`:

```tsx
import Link from "next/link";
import { PLANS } from "@/lib/plans";
import type { SegmentContent } from "@/content/soluzioni/_schema";

export function PlanTeaser({ content }: { content: SegmentContent }) {
  const plan = PLANS.find((p) => p.slug === content.recommendedPlan);
  if (!plan) return null;
  return (
    <section className="border-b border-white/10 py-20">
      <div className="mx-auto max-w-3xl rounded-2xl border border-brand-teal/30 bg-brand-teal/5 p-8 text-center backdrop-blur-sm">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-brand-teal">
          Piano consigliato per il tuo settore
        </div>
        <h2 className="mb-2 text-[30px] font-semibold text-white">
          {plan.displayName} — €{plan.priceEur}/mese
        </h2>
        <p className="mb-6 text-[14px] text-brand-slate-light">
          {plan.msgIncluded > 0
            ? `${plan.msgIncluded} messaggi inclusi. Paghi solo se superi la quota.`
            : "Canone minimo, paghi solo i messaggi che invii davvero."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/piani#${plan.slug}`}
            className="rounded-pill bg-brand-teal px-6 py-2.5 text-[14px] font-medium text-white hover:bg-brand-teal-dark transition-colors"
          >
            Vedi dettagli piano
          </Link>
          <Link
            href="/piani"
            className="rounded-pill border border-white/20 px-6 py-2.5 text-[14px] font-medium text-white/80 hover:border-white hover:text-white transition-colors"
          >
            Confronta tutti i piani
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Create SegmentFooter**

Create `frontend/src/app/soluzioni/[segmento]/_components/SegmentFooter.tsx`:

```tsx
import Link from "next/link";
import { SEGMENTS } from "@/content/soluzioni/_segments";

export function SegmentFooter({ currentSlug }: { currentSlug: string }) {
  const others = SEGMENTS.filter((s) => s.slug !== currentSlug);
  return (
    <footer className="border-t border-white/10 bg-brand-navy-deep py-12">
      <div className="mx-auto max-w-5xl px-6">
        <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-brand-slate-muted">
          Altri settori
        </h3>
        <div className="mb-8 flex flex-wrap gap-2">
          {others.map((s) => (
            <Link
              key={s.slug}
              href={`/soluzioni/${s.slug}`}
              className="rounded-pill border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-brand-slate-light hover:border-brand-teal/40 hover:text-white transition-colors"
            >
              {s.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-[12px] text-brand-slate-muted">
          <span>© Wamply — un prodotto Hevolus S.r.l. · P.IVA 02517560742</span>
          <div className="flex gap-4">
            <Link href="/privacy">Privacy</Link>
            <Link href="/termini">Termini</Link>
            <Link href="/soluzioni">Tutti i settori</Link>
            <Link href="/piani">Piani</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/soluzioni/\[segmento\]/_components/
git commit -m "feat(frontend): segment landing page components (hero, bullets, use cases, templates, plan teaser, footer)"
```

---

## Task 6: Dynamic route `/soluzioni/[segmento]` + layout (TDD)

**Files:**
- Create: `frontend/tests/pages/soluzioni-segmento.test.tsx`
- Create: `frontend/src/app/soluzioni/layout.tsx`
- Create: `frontend/src/app/soluzioni/[segmento]/page.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/tests/pages/soluzioni-segmento.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import SegmentoPage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/soluzioni/[segmento]/page";

describe("/soluzioni/[segmento]", () => {
  it("generateStaticParams returns all 11 segment slugs", async () => {
    const params = await generateStaticParams();
    expect(params).toHaveLength(11);
    expect(params.map((p) => p.segmento)).toContain("parrucchieri");
  });

  it("generateMetadata returns metaTitle for known segment", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ segmento: "parrucchieri" }),
    });
    expect(meta.title).toMatch(/parrucchieri/i);
    expect(meta.description).toBeTruthy();
  });

  it("renders pilot parrucchieri hero and use cases", async () => {
    const el = await SegmentoPage({
      params: Promise.resolve({ segmento: "parrucchieri" }),
    });
    render(el);
    expect(screen.getByText(/Quanti appuntamenti perdi/)).toBeInTheDocument();
    expect(screen.getByText(/Promemoria appuntamento/)).toBeInTheDocument();
    expect(screen.getByText(/Recall clienti inattivi/)).toBeInTheDocument();
  });

  it("throws NEXT_NOT_FOUND for unknown segment", async () => {
    await expect(
      SegmentoPage({
        params: Promise.resolve({ segmento: "non-esiste" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

- [ ] **Step 2: Run test — expect import failure**

```bash
cd frontend && npx vitest run tests/pages/soluzioni-segmento.test.tsx
```

Expected: ModuleNotFound on `@/app/soluzioni/[segmento]/page`.

- [ ] **Step 3: Create the layout**

Create `frontend/src/app/soluzioni/layout.tsx`:

```tsx
import type { ReactNode } from "react";

/**
 * Layout shared by /soluzioni and /soluzioni/[segmento].
 * Forces the marketing dark background and disables the dashboard shell.
 */
export default function SoluzioniLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-linear-to-br from-brand-navy via-brand-navy-light to-brand-navy-deep text-white">
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Create the dynamic page**

Create `frontend/src/app/soluzioni/[segmento]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadSegmentContent } from "@/content/soluzioni/_loader";
import { SEGMENTS } from "@/content/soluzioni/_segments";

import { Hero } from "./_components/Hero";
import { Bullets } from "./_components/Bullets";
import { UseCases } from "./_components/UseCases";
import { TemplatesPreview } from "./_components/TemplatesPreview";
import { PlanTeaser } from "./_components/PlanTeaser";
import { SegmentFooter } from "./_components/SegmentFooter";

type Params = { segmento: string };

export async function generateStaticParams(): Promise<Params[]> {
  return SEGMENTS.map((s) => ({ segmento: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { segmento } = await params;
  const content = loadSegmentContent(segmento);
  if (!content) {
    return { title: "Settore non trovato | Wamply" };
  }
  const url = `https://wamply.it/soluzioni/${content.segmento}`;
  return {
    title: content.metaTitle,
    description: content.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: content.metaTitle,
      description: content.metaDescription,
      url,
      siteName: "Wamply",
      locale: "it_IT",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: content.metaTitle,
      description: content.metaDescription,
    },
  };
}

function ServiceJsonLd({
  segmento,
  label,
  description,
}: {
  segmento: string;
  label: string;
  description: string;
}) {
  const json = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Wamply WhatsApp per ${label}`,
    description,
    provider: {
      "@type": "Organization",
      name: "Wamply",
      url: "https://wamply.it",
    },
    areaServed: "IT",
    serviceType: "WhatsApp Business automation",
    url: `https://wamply.it/soluzioni/${segmento}`,
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}

export default async function SegmentoPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { segmento } = await params;
  const content = loadSegmentContent(segmento);
  if (!content) notFound();

  return (
    <>
      <ServiceJsonLd
        segmento={content.segmento}
        label={content.label}
        description={content.metaDescription}
      />
      <Hero content={content} />
      <Bullets items={content.bullets} />
      <UseCases items={content.useCases} />
      <TemplatesPreview items={content.templatesPreview} />
      <PlanTeaser content={content} />
      <SegmentFooter currentSlug={content.segmento} />
    </>
  );
}
```

- [ ] **Step 5: Run tests — should pass**

```bash
cd frontend && npx vitest run tests/pages/soluzioni-segmento.test.tsx
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/soluzioni/layout.tsx \
        frontend/src/app/soluzioni/\[segmento\]/page.tsx \
        frontend/tests/pages/soluzioni-segmento.test.tsx
git commit -m "feat(frontend): dynamic /soluzioni/[segmento] page with SEO + JSON-LD"
```

---

## Task 7: Index page `/soluzioni` with 11-segment grid (TDD)

**Files:**
- Create: `frontend/src/app/soluzioni/_components/SegmentsGrid.tsx`
- Create: `frontend/src/app/soluzioni/page.tsx`
- Create: `frontend/tests/pages/soluzioni-index.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/tests/pages/soluzioni-index.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SoluzioniIndexPage from "@/app/soluzioni/page";

describe("/soluzioni", () => {
  it("renders grid with all 11 segments", () => {
    render(<SoluzioniIndexPage />);
    expect(screen.getByText("Parrucchieri & Estetisti")).toBeInTheDocument();
    expect(screen.getByText("Ristoranti & Bar")).toBeInTheDocument();
    expect(screen.getByText(/Autosaloni/)).toBeInTheDocument();
    const tiles = screen.getAllByRole("link", { name: /Scopri/i });
    expect(tiles.length).toBeGreaterThanOrEqual(11);
  });

  it("marks placeholder segments with 'in arrivo' label", () => {
    render(<SoluzioniIndexPage />);
    const inArrivo = screen.getAllByText(/in arrivo/i);
    expect(inArrivo.length).toBe(10);
  });
});
```

- [ ] **Step 2: Create SegmentsGrid component**

Create `frontend/src/app/soluzioni/_components/SegmentsGrid.tsx`:

```tsx
import Link from "next/link";
import { loadAllSegments } from "@/content/soluzioni/_loader";

export function SegmentsGrid() {
  const segments = loadAllSegments();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {segments.map((s) => (
        <Link
          key={s.segmento}
          href={`/soluzioni/${s.segmento}`}
          aria-label={`Scopri Wamply per ${s.label}`}
          className="group relative flex flex-col rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-colors hover:border-brand-teal/40 hover:bg-white/8"
        >
          {s.isPlaceholder && (
            <span className="absolute right-4 top-4 rounded-pill border border-brand-amber/40 bg-brand-amber/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-brand-amber">
              in arrivo
            </span>
          )}
          <h3 className="mb-2 text-[16px] font-semibold text-white">
            {s.label}
          </h3>
          <p className="flex-1 text-[13px] leading-relaxed text-brand-slate-light">
            {s.hero.solution}
          </p>
          <span className="mt-4 text-[12.5px] font-medium text-brand-teal group-hover:underline">
            Scopri &rarr;
          </span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create the index page**

Create `frontend/src/app/soluzioni/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { SegmentsGrid } from "./_components/SegmentsGrid";

export const metadata: Metadata = {
  title: "Soluzioni Wamply per ogni settore | WhatsApp Business per le PMI italiane",
  description:
    "Scopri come Wamply aiuta parrucchieri, ristoranti, palestre, studi medici, avvocati e altri settori italiani a usare WhatsApp per fidelizzare i clienti.",
  alternates: { canonical: "https://wamply.it/soluzioni" },
};

export default function SoluzioniIndexPage() {
  return (
    <>
      <section className="border-b border-white/10 px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-[40px] font-semibold leading-tight text-white">
            Una soluzione <span className="text-brand-teal">per il tuo settore</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[16px] text-brand-slate-light">
            Scegli il tuo mestiere e ti mostriamo come Wamply può aiutarti con
            esempi concreti, messaggi pronti e un piano suggerito.
          </p>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <SegmentsGrid />
        </div>
      </section>

      <section className="border-t border-white/10 px-6 py-16 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-[24px] font-semibold text-white">
            Il tuo settore non è qui?
          </h2>
          <p className="mt-3 text-[14px] text-brand-slate-light">
            Siamo in crescita: se hai un'attività fuori da questi 11 casi,
            scrivici e creiamo una pagina dedicata al tuo mestiere.
          </p>
          <Link
            href="mailto:ciao@wamply.it?subject=Settore%20non%20in%20lista"
            className="mt-6 inline-block rounded-pill bg-brand-teal px-6 py-2.5 text-[14px] font-medium text-white hover:bg-brand-teal-dark transition-colors"
          >
            Contattaci
          </Link>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 4: Run test**

```bash
cd frontend && npx vitest run tests/pages/soluzioni-index.test.tsx
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/soluzioni/page.tsx \
        frontend/src/app/soluzioni/_components/ \
        frontend/tests/pages/soluzioni-index.test.tsx
git commit -m "feat(frontend): add /soluzioni index page with 11-segment grid"
```

---

## Task 8: Middleware — mark `/soluzioni`, `/piani`, `/prova` as public

**Files:**
- Modify: `frontend/src/middleware.ts`

- [ ] **Step 1: Add public-path check at the top of middleware**

Edit `frontend/src/middleware.ts`. After the `isLocalizedMarketingPath` block, add:

```typescript
  // Public marketing routes (no locale prefix) — skip auth entirely.
  const isPublicMarketing =
    pathname === "/soluzioni" ||
    pathname.startsWith("/soluzioni/") ||
    pathname === "/piani" ||
    pathname === "/prova";
  if (isPublicMarketing) {
    return NextResponse.next();
  }
```

This ensures the middleware does not attempt `supabase.auth.getUser()` on public pages (faster TTFB, no 401 noise).

- [ ] **Step 2: Quick manual verification**

```bash
cd frontend && npm run dev
# browse to http://localhost:3000/soluzioni/parrucchieri logged-out → should render without redirect
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/middleware.ts
git commit -m "feat(middleware): exclude /soluzioni /piani /prova from auth middleware"
```

---

## Task 9: Sitemap + robots

**Files:**
- Create: `frontend/src/app/sitemap.ts`
- Create: `frontend/src/app/robots.ts`

- [ ] **Step 1: Create sitemap**

Create `frontend/src/app/sitemap.ts`:

```typescript
import type { MetadataRoute } from "next";
import { SEGMENTS } from "@/content/soluzioni/_segments";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wamply.it";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE}/soluzioni`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/piani`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
  ];
  const segmentRoutes: MetadataRoute.Sitemap = SEGMENTS.map((s) => ({
    url: `${BASE}/soluzioni/${s.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));
  return [...staticRoutes, ...segmentRoutes];
}
```

- [ ] **Step 2: Create robots.txt**

Create `frontend/src/app/robots.ts`:

```typescript
import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wamply.it";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/soluzioni", "/piani"],
        disallow: ["/admin", "/dashboard", "/api", "/settings", "/confirm-email"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
```

- [ ] **Step 3: Verify output in dev**

```bash
cd frontend && npm run dev
curl -s http://localhost:3000/sitemap.xml | head -30
curl -s http://localhost:3000/robots.txt
```

Expected: sitemap.xml lists 14 URLs (home, soluzioni index, piani, 11 segments). robots.txt has Sitemap line.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/sitemap.ts frontend/src/app/robots.ts
git commit -m "feat(seo): add sitemap.xml and robots.txt covering /soluzioni routes"
```

---

## Task 10: Homepage redesign — add "Settori" grid

**Files:**
- Modify: `frontend/src/app/[locale]/page.tsx`

Obiettivo minimo invasivo: aggiungere una sezione "Settori" con grid 11 tile subito **dopo** il blocco "How it works" e **prima** di "AI Auto-Selection" sulla landing `[locale]/page.tsx`. Non si tocca il resto. Il CTA primario del tile porta a `/soluzioni/<slug>`.

- [ ] **Step 1: Inspect current landing structure to confirm insertion point**

Open `frontend/src/app/[locale]/page.tsx` and locate the comment `{/* AI Auto-Selection */}`. The new section goes immediately above it.

- [ ] **Step 2: Insert a new `<Segments />` section**

Add (inside the same file, above the "AI Auto-Selection" section) the following block. The list is inline (no translation yet — spec §6 lists the 11 segments; translations can come later):

```tsx
{/* Settori */}
<section className="border-t border-white/10 py-20">
  <div className="mx-auto max-w-6xl px-6">
    <h2 className="mb-3 text-center text-[28px] font-semibold">
      Pensato per il tuo settore
    </h2>
    <p className="mb-12 text-center text-[14px] text-brand-slate-light">
      Scegli il tuo mestiere e ti mostriamo come funziona Wamply per te.
    </p>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {[
        { slug: "parrucchieri", label: "Parrucchieri & Estetisti" },
        { slug: "ristoranti", label: "Ristoranti & Bar" },
        { slug: "palestre", label: "Palestre & PT" },
        { slug: "studi_medici", label: "Studi Medici" },
        { slug: "avvocati", label: "Avvocati & Commercialisti" },
        { slug: "immobiliari", label: "Agenti Immobiliari" },
        { slug: "autofficine", label: "Autofficine" },
        { slug: "retail", label: "Negozi locali" },
        { slug: "scuole", label: "Scuole & Formazione" },
        { slug: "hotel", label: "Hotel & B&B" },
        { slug: "autosaloni", label: "Autosaloni" },
      ].map((s) => (
        <Link
          key={s.slug}
          href={`/soluzioni/${s.slug}`}
          className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-[13px] font-medium text-white backdrop-blur-sm transition-colors hover:border-brand-teal/40 hover:bg-white/8 hover:text-brand-teal"
        >
          {s.label}
        </Link>
      ))}
    </div>
    <div className="mt-10 text-center">
      <Link
        href="/soluzioni"
        className="inline-block rounded-pill border border-brand-teal/50 px-6 py-2.5 text-[13px] font-medium text-brand-teal hover:bg-brand-teal/10 transition-colors"
      >
        Vedi tutti i settori
      </Link>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Update hero CTAs to point to `/prova` and `/piani`**

Replace the `Link href="/register"` in the hero with `href="/prova"` and the anchor `href="#pricing"` with `href="/piani"`. Spec §7.2 lists `/prova` as redirect to signup with trial flag — lo step 11 confermerà la landing route esistente.

```tsx
<Link href="/prova" ...>...{t("hero.ctaTrial")}...</Link>
<Link href="/piani" ...>...{t("hero.ctaPlans")}...</Link>
```

- [ ] **Step 4: Verify landing renders**

```bash
cd frontend && npm run dev
# browse http://localhost:3000/it
```

Expected: "Settori" section visible between "How it works" and "AI Auto-Selection" with 11 tiles. Hero CTAs now point to `/prova` and `/piani`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\[locale\]/page.tsx
git commit -m "feat(landing): add Settori grid + redirect hero CTAs to /prova and /piani"
```

---

## Task 11: `/prova` route (signup redirect)

**Files:**
- Create: `frontend/src/app/prova/page.tsx`

- [ ] **Step 1: Create the redirect page**

Create `frontend/src/app/prova/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ plan?: string; segmento?: string }>;

export default async function ProvaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { plan, segmento } = await searchParams;
  const qs = new URLSearchParams({ trial: "14" });
  if (plan) qs.set("plan", plan);
  if (segmento) qs.set("segmento", segmento);
  redirect(`/register?${qs.toString()}`);
}
```

This is a thin redirect shim so links like `/prova?plan=starter&segmento=parrucchieri` work; the actual trial flag handling lives in sub-project A's signup work.

- [ ] **Step 2: Smoke test**

```bash
cd frontend && npm run dev
# visit http://localhost:3000/prova?plan=starter → redirects to /register?trial=14&plan=starter
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/prova/page.tsx
git commit -m "feat(frontend): add /prova redirect to /register with trial flag"
```

---

## Task 12: Full-suite integration check

- [ ] **Step 1: Run full vitest suite**

```bash
cd frontend && npx vitest run
```

Expected: all previously-passing tests still green; new tests from tasks 2, 6, 7 pass.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Production build**

```bash
cd frontend && npm run build
```

Expected: static generation of `/soluzioni` + 11 segment pages (look for `○ /soluzioni/[segmento]` lines in build output). sitemap/robots listed. No build errors.

- [ ] **Step 4: Manual smoke walkthrough**

1. `/` → vedi blocco "Settori" con 11 tile; CTA `Prova gratis` → `/prova`.
2. `/soluzioni` → grid 11 settori, 10 con badge "in arrivo".
3. `/soluzioni/parrucchieri` → hero, bullets, 3 use case, 3 template, plan teaser "Essenziale €49".
4. `/soluzioni/ristoranti` → stessa struttura con contenuto generico.
5. `/soluzioni/non-esiste` → 404.
6. `/sitemap.xml` → 14 URL.
7. `/robots.txt` → disallow su `/admin`, sitemap link presente.
8. Link da tile segmento → `/piani#starter`.

- [ ] **Step 5: Push branch**

```bash
git status
git push origin feature/plan-tiers-positioning
```

- [ ] **Step 6: Update or open draft PR**

If sub-A PR is already open, add a comment with the new commits. If not, open a draft PR that bundles A+B for a coherent review:

```bash
gh pr create --draft --title "feat(plans+landing): β+ v2 listino + segment landing pages" --body "$(cat <<'EOF'
## Summary
Sub-projects A + B of `docs/superpowers/specs/2026-04-24-plan-tiers-and-positioning-design.md`.

Sub-B additions:
- Content schema + loader for `/soluzioni/[segmento]`
- 11 segment JSON content files (parrucchieri compiled, 10 placeholder)
- Dynamic route `/soluzioni/[segmento]` with SEO (metadata, OG, JSON-LD Service)
- Index page `/soluzioni` with filtered grid
- Homepage `[locale]/page.tsx` augmented with "Settori" grid
- `/prova` redirect to `/register?trial=14`
- `sitemap.xml` + `robots.txt`
- Middleware excludes `/soluzioni`, `/piani`, `/prova` from auth

## Test plan
- [ ] Vitest green (loader, segmento page, soluzioni index)
- [ ] `npx tsc --noEmit` zero errors
- [ ] `npm run build` statically generates 11 segment pages
- [ ] Manual smoke: /, /soluzioni, /soluzioni/parrucchieri, /soluzioni/non-esiste → 404

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Summary — Sub-project B Deliverables

**New files (26):**
- `frontend/src/content/soluzioni/_schema.ts`
- `frontend/src/content/soluzioni/_segments.ts`
- `frontend/src/content/soluzioni/_loader.ts`
- `frontend/src/content/soluzioni/parrucchieri.json` (pilota)
- `frontend/src/content/soluzioni/{ristoranti,palestre,studi_medici,avvocati,immobiliari,autofficine,retail,scuole,hotel,autosaloni}.json` (10 placeholder)
- `frontend/src/app/soluzioni/layout.tsx`
- `frontend/src/app/soluzioni/page.tsx`
- `frontend/src/app/soluzioni/_components/SegmentsGrid.tsx`
- `frontend/src/app/soluzioni/[segmento]/page.tsx`
- `frontend/src/app/soluzioni/[segmento]/_components/{Hero,Bullets,UseCases,TemplatesPreview,PlanTeaser,SegmentFooter}.tsx`
- `frontend/src/app/prova/page.tsx`
- `frontend/src/app/sitemap.ts`
- `frontend/src/app/robots.ts`
- `frontend/tests/content/loader.test.ts`
- `frontend/tests/pages/soluzioni-segmento.test.tsx`
- `frontend/tests/pages/soluzioni-index.test.tsx`

**Modified files (2):**
- `frontend/src/middleware.ts` — bypass auth su rotte pubbliche marketing
- `frontend/src/app/[locale]/page.tsx` — sezione "Settori" + hero CTA → `/prova` e `/piani`

**Estimated effort:** 4-6 giorni (1 dev full-time), di cui ~1 giorno per il copy pilota + placeholder.

**Hard dependencies before starting:**
- Sub-project A must ship `frontend/src/lib/plans.ts` (used by `PlanTeaser`). Se non ancora merged, questo plan può iniziare creando un mock locale di `plans.ts` che viene sostituito al merge.

**Downstream unblocked by this:** team marketing può riempire i 10 placeholder incrementalmente (1-2h per settore) senza toccare codice.
