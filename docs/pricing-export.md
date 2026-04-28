# Listino Wamply β+ v2 — Export prezzi

> **Sorgente di verità**: tabella `plans` Supabase, dopo migration
> [026_plan_restructure.sql](../supabase/migrations/026_plan_restructure.sql).
> Specchio frontend tipato in [`frontend/src/lib/plans.ts`](../frontend/src/lib/plans.ts).
>
> Aggiornare *prima* il DB e `plans.ts`, poi rigenerare questo file.
> I `slug` sono stabili (legati a `stripe_price_id` su Stripe).
> I `display_name` sono il nome user-facing italiano.

---

## Riepilogo prezzi

| slug DB | display_name (UI) | Prezzo | Posizionamento |
|---|---|---|---|
| `free` | Trial 14 giorni | €0 | Onboarding, non pubblicizzato |
| `avvio` | **Avvio** | **€19/mese** | Micro-impresa o professionista singolo |
| `starter` | **Essenziale** ⭐ | **€49/mese** | Piccola attività con team fino a 5 |
| `professional` | **Plus** | **€149/mese** | Attività strutturata o multi-sede |
| `enterprise` | **Premium** | **€399/mese** | Grande attività o catena |

> ⚠️ Su Stripe i prodotti restano "Starter / Professional / Enterprise"
> (nomi tecnici legati a `slug` via `stripe_price_id`). I nomi italiani
> Avvio / Essenziale / Plus / Premium vivono solo lato UI.

---

## Limiti operativi

| Caratteristica | Avvio | Essenziale | Plus | Premium |
|---|---|---|---|---|
| **Prezzo / mese** | €19 | €49 | €149 | €399 |
| **Messaggi inclusi nel canone** (`msg_included`) | 0 (consumo puro) | 300 | 1.500 | 5.000 |
| **Tetto tecnico messaggi / mese** (`max_messages_month`) | 200 | 2.500 | 15.000 | 100.000 |
| **Campagne / mese** | 1 | 5 | 20 | illimitate |
| **Contatti max** | 500 | 500 | 5.000 | 50.000 |
| **Template max** | 3 | 5 | 20 | illimitati |
| **Membri team** | 1 | 1 | 3 | 10 |
| **AI Credits / mese** | 0 | 0 | 200 | 1.500 |
| **Trial 14 giorni** | ✅ | ✅ | ✅ | ✅ |

---

## Tariffe overage (€/messaggio fuori soglia)

| Categoria | Avvio | Essenziale | Plus | Premium |
|---|---|---|---|---|
| Marketing | €0,09 | €0,09 | €0,08 | €0,07 |
| Utility | €0,05 | €0,05 | €0,045 | €0,04 |
| Free-form (24h) | €0,01 | €0,01 | €0,01 | €0,01 |

**Modello di pricing**: canone flat con messaggi inclusi (tranne Avvio che è
canone + tutto a consumo). Oltre la soglia inclusa, ogni messaggio extra
viene fatturato a fine mese alla tariffa corrispondente alla categoria.

---

## Feature AI (chiavi `ai_features`)

| Feature AI | Avvio | Essenziale | Plus | Premium |
|---|:---:|:---:|:---:|:---:|
| Compliance check (controllo regole WhatsApp Business) | ✅ | ✅ | ✅ | ✅ |
| Genera template (`generate`) | — | ✅ | ✅ | ✅ |
| Migliora messaggio (`improve`) | — | ✅ | ✅ | ✅ |
| Traduzione multi-lingua (`translate`) | — | — | ✅ | ✅ |
| Analytics standard (open/click/reply) | — | — | ✅ | ✅ |
| Analytics avanzati (cohort, predizioni) | — | — | — | ✅ |

---

## Feature di piattaforma (chiavi `features`)

| Feature | Avvio | Essenziale | Plus | Premium |
|---|:---:|:---:|:---:|:---:|
| A/B testing | — | — | ✅ | ✅ |
| API access pubblica | — | — | ✅ | ✅ |
| Workflow approvazione | — | — | ✅ | ✅ |
| Membri team multipli | — | — | ✅ | ✅ |
| Custom sender name | — | — | ✅ | ✅ |
| Export dati (CSV) | — | — | ✅ | ✅ |
| Webhook events | — | — | — | ✅ |
| White-label (rimuovi branding) | — | — | — | ✅ |
| BYOK LLM (porta tua API key) | — | — | — | ✅ |
| Onboarding 1:1 in italiano | — | — | — | ✅ |

---

## Segmenti SME target

Tutti i piani sono attivi sui seguenti segmenti italiani per le landing
`/soluzioni/[segmento]`:

`parrucchieri` · `ristoranti` · `palestre` · `studi_medici` · `avvocati` ·
`immobiliari` · `autofficine` · `retail` · `scuole` · `hotel` · `autosaloni`

---

## Copy banner consigliato (Home page)

| Piano | Headline | Sotto-headline |
|---|---|---|
| **Avvio** | Parti con WhatsApp marketing a €19/mese | Compliance AI · 1 utente · paghi solo i messaggi che invii |
| **Essenziale** ⭐ | La base che ti serve, €49/mese | 300 messaggi inclusi · AI genera & migliora · 5 campagne/mese |
| **Plus** | Cresci senza limiti — €149/mese | 1.500 msg · AI traduzione & analytics · 3 utenti · API & A/B |
| **Premium** | Su misura per multisede — €399/mese | 5.000 msg · AI avanzato · white-label · webhook · BYOK LLM |

**CTA universale**: "Prova 14 giorni gratis" → `/signup?plan={slug}`

---

## Garanzie commerciali (per landing & home)

- **Trial 14 giorni** su tutti i piani, senza carta di credito
- **Fattura elettronica italiana** inclusa (SDI)
- **Setup chiavi in mano** — Twilio + WABA gestiti da noi
- **Supporto in italiano** via email/chat
- **No vincolo** — disdici quando vuoi dal pannello Billing
