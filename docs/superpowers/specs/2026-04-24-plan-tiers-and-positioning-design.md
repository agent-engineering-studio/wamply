# Plan Tiers and Segment-Based Positioning — Design

**Data:** 2026-04-24
**Branch:** `feature/plan-tiers-positioning`
**Status:** Proposta (in attesa review utente)

---

## 1. Contesto e motivazione

Wamply oggi ha un listino a 3 piani (`starter €49`, `professional €149`, `enterprise €399`) con posizionamento generico "WhatsApp Campaign Manager". Due problemi critici:

1. **Posizionamento debole** — un imprenditore SME italiano di bassa informatizzazione (parrucchiere, avvocato, ristoratore) non capisce perché scegliere Wamply invece di Twilio self-serve o di un'agenzia di marketing locale. Manca una narrativa verticale.
2. **Listino scollegato dai costi reali** — i piani esistenti non includono quote Twilio esplicite, mentre le tariffe Meta Italia (fonte: Meta WhatsApp rate card, USD, aprile 2026) sono significative: $0.0741/msg marketing, $0.035/msg utility. I margini a volume non sono stati verificati.

Questa spec ridisegna listino e posizionamento su due direttrici:
- **Listino β+ v2** ibrido canone software + piccola quota inclusa + overage metered, con margine verificato.
- **Posizionamento segment-based** con 11 settori italiani target, veicolato tramite landing pages dedicate.

## 2. Obiettivi

1. Nuovo listino a 5 piani (`Avvio`/`Essenziale`/`Plus`/`Premium`/`Enterprise`) con quote Twilio e feature AI gate esplicite.
2. Pagine landing pubbliche `/soluzioni/[segmento]` per 11 segmenti SME italiani, architettate come **1 framework + N content files**.
3. Nuova tab admin per configurazione master Twilio + policy di provisioning + overview costi.
4. Marketing brief master in repo per colleghi, con libreria di prompt ready-to-use per Claude Desktop.
5. Migrazione utenti esistenti senza churn (mapping 1:1 sui prezzi attuali, Avvio come piano nuovo).

## 3. Non-goals

- Non toccare l'architettura Twilio subaccount (resta com'è).
- Non introdurre BYOK Twilio lato utente (l'utente non vede mai Twilio).
- Non scrivere tutti gli 11 content file nell'MVP — MVP = framework + **1 segmento pilota: parrucchieri**.
- Non rifare AI credits, auth, Stripe integration.
- Non produrre materiali marketing polished (slide, brochure). Il brief documenta la **direzione**; la produzione esce dal team marketing.

## 4. Positioning statement

> *"Wamply è WhatsApp Business chiavi in mano per l'impresa italiana — senza API, senza inglese, senza carta in dollari."*

**Non competiamo con:** Twilio, Meta Cloud API self-serve, dev toolchain. Sono infrastruttura per sviluppatori, non prodotti per SME.

**Competiamo con:**
- Agenzie di marketing locali (€200-500/mese gestione social+WhatsApp in white-glove).
- ManyChat, WATI, Respond.io (piattaforme internazionali, UX in inglese, pricing USD, fattura estera).
- CRM con add-on WhatsApp (HubSpot, Zoho) — eccessivi per SME.

**Il moat di Wamply:**
1. Onboarding guidato in italiano (verifica P.IVA, registrazione WhatsApp Business, scelta numero in 10 min) invece di dashboard Twilio in inglese.
2. Template pre-fatti per settore, compliance WhatsApp già verificata.
3. AI che scrive in italiano colloquiale con tono del mestiere.
4. Prezzo flat in euro + fattura elettronica italiana.
5. Supporto in italiano con SLA settimanali.

## 5. Listino β+ v2

### 5.1 Cost model — rate card Twilio/Meta Italia

Fonte: **Meta WhatsApp rate card Italia** (USD, valido aprile 2026 — va rivisto ogni trimestre perché Meta aggiorna periodicamente).

| Categoria | Meta fee | Twilio fee | Totale |
|---|---|---|---|
| Marketing template | $0.0691 | $0.005 | **$0.0741 / msg** |
| Utility template (fuori finestra 24h) | $0.0300 | $0.005 | **$0.0350 / msg** |
| Authentication / OTP | $0.0300 | $0.005 | **$0.0350 / msg** |
| Free-form (entro finestra 24h) | $0.0000 | $0.005 | **$0.0050 / msg** |
| Inbound (ricevuto dall'utente) | — | $0.005 | **$0.0050 / msg** |

Cambio USD/EUR assunto: 0.92 (da parametrizzare in backend, update periodico).

**Mix assunto SME italiana** (da validare con telemetria post-launch — assunzione working):
- 40% marketing template
- 40% utility template
- 20% free-form

**Costo medio ponderato**: `0.40 × $0.0741 + 0.40 × $0.0350 + 0.20 × $0.0050 = $0.0446 ≈ €0.041 / msg`.

### 5.2 Listino 5 piani

| Piano | Canone mensile | Msg inclusi | Overage marketing | Overage utility | Overage free-form | AI Features | Target |
|---|---|---|---|---|---|---|---|
| **Avvio** | €19 | 0 | €0.09 | €0.05 | €0.01 | compliance check | micro-impresa / singolo |
| **Essenziale** | €49 | 300 | €0.09 | €0.05 | €0.01 | + generate + improve | piccola attività (team <5) |
| **Plus** | €149 | 1500 | €0.08 | €0.045 | €0.01 | + translate + analytics standard | media / multi-sede |
| **Premium** | €399 | 5000 | €0.07 | €0.04 | €0.01 | tutto + analytics avanzati + onboarding 1:1 | grande / catena |
| **Enterprise** | custom | custom | negoziabile | negoziabile | negoziabile | + BYOK Claude + SLA dedicato | B2B contratti, >20k msg/mese |

### 5.3 Verifica margine lordo (mix 40/40/20)

| Piano | Revenue | COGS incl. | GM € | GM % |
|---|---|---|---|---|
| Avvio | €19.00 | €0.00 | €19.00 | 100% |
| Essenziale | €49.00 | €12.30 | €36.70 | 75% |
| Plus | €149.00 | €61.50 | €87.50 | 59% |
| Premium | €399.00 | €205.00 | €194.00 | 49% |

Overage: markup 2-3× sul costo Twilio → marginale positivo anche a saturazione.

### 5.4 AI features per piano (feature gating)

Feature AI già implementate in backend (Claude system key + credits + BYOK):
- `ai.compliance_check` — verifica conformità WhatsApp (tono, vietate promesse aggressive, opt-out)
- `ai.generate` — genera template/campagne da brief
- `ai.improve` — riscrive messaggio migliorando tono/lunghezza
- `ai.translate` — traduce multi-lingua (IT → EN, DE, FR, ES)
- `ai.analytics_standard` — KPI campagne (open, click, reply)
- `ai.analytics_advanced` — cohort, funnel, prediction no-show

Gating per piano:

| Feature | Avvio | Essenziale | Plus | Premium | Enterprise |
|---|---|---|---|---|---|
| compliance_check | ✅ | ✅ | ✅ | ✅ | ✅ |
| generate | ❌ | ✅ | ✅ | ✅ | ✅ |
| improve | ❌ | ✅ | ✅ | ✅ | ✅ |
| translate | ❌ | ❌ | ✅ | ✅ | ✅ |
| analytics_standard | ❌ | ❌ | ✅ | ✅ | ✅ |
| analytics_advanced | ❌ | ❌ | ❌ | ✅ | ✅ |
| onboarding 1:1 (servizio, non feature) | ❌ | ❌ | ❌ | ✅ | ✅ |
| BYOK Claude come sconto visibile | ✅* | ✅* | ✅* | ✅* | ✅ (incluso) |

\*BYOK Claude resta disponibile come setting `/settings/ai` per chiunque, ma non è pubblicizzato come bullet di piano prima di Enterprise.

### 5.5 Strategia di migrazione utenti esistenti

Mapping 1:1 sui prezzi attuali → **zero churn forzato**:

- `starter` (€49) → `essenziale` (€49) + comunicazione email "abbiamo rinominato il tuo piano, hai AI generate+improve incluse GRATIS"
- `professional` (€149) → `plus` (€149) + "hai translate + analytics standard GRATIS"
- `enterprise` (€399) → `premium` (€399) + "hai analytics avanzati + onboarding GRATIS"
- `avvio` (€19) è piano **nuovo** → promosso a chi si iscrive, nessuna migrazione
- `enterprise` custom → venduto manualmente da Sales, non più un prezzo a listino

Tempi: migrazione DB atomica, email agli esistenti inviate entro 48h dalla deploy con subject "Il tuo piano Wamply ha appena guadagnato feature gratis".

## 6. Segmenti MVP

11 segmenti prioritari per il lancio:

1. **Parrucchieri / Estetisti / Barbieri**
2. **Ristoranti / Pizzerie / Bar**
3. **Palestre / Personal trainer / Centri fitness**
4. **Studi medici / Dentisti / Veterinari**
5. **Avvocati / Commercialisti / Notai**
6. **Agenti immobiliari**
7. **Autofficine / Carrozzerie**
8. **Retail / Negozi locali**
9. **Scuole / Asili / Centri formazione**
10. **Hotel / B&B / Agriturismo**
11. **Autosaloni / Concessionarie auto**

Criteri usati: (a) densità nel tessuto SME italiano, (b) alto valore unitario del cliente (giustifica €19+ mensili), (c) use case ripetitivi e automatizzabili (promemoria, conferme, promo).

## 7. Landing pages segment-based

### 7.1 Approccio "1 framework, N contenuti"

Invece di 11 pagine scritte a mano, UNA sola pagina template dinamica alimentata da N file di contenuti.

**Beneficio**: aggiungere il 12° settore = 1-2h di copywriting (non 2-3 giorni).

### 7.2 URL scheme

| Route | Scopo | SEO priority |
|---|---|---|
| `/` | Landing principale, tagline + grid 11 segmenti | P1 |
| `/soluzioni` | Indice segmenti (grid completo con filtri) | P2 |
| `/soluzioni/[segmento]` | Landing dedicata per settore | P1 |
| `/piani` | Pricing page con 5 tier + calculator overage | P1 |
| `/prova` | Redirect a signup con flag "trial 14 giorni" | P2 |

### 7.3 Struttura pagina segmento

```
┌─ Hero
│  ├─ Headline (pain del settore)
│  ├─ Sub (soluzione in 1 frase)
│  ├─ CTA primaria "Prova 14 giorni gratis"
│  └─ CTA secondaria "Vedi esempi template"
│
├─ 3 Bullet soluzione
│  (es. parrucchieri: "Ricorda appuntamenti", "Promo compleanno", "Ricontatta clienti inattivi")
│
├─ 3 Use case concreti (con screenshot mockup campagna)
│  ├─ Titolo caso
│  ├─ Descrizione (2 frasi)
│  └─ ROI misurabile (es. "Riduce no-show del 40%")
│
├─ Preview 3 template pre-fatti (cards con testo campione)
│
├─ Quote cliente (opzionale, placeholder inizialmente)
│
├─ Piano suggerito per il settore (deep-link a /piani#essenziale)
│
├─ CTA finale
│
└─ Footer (privacy, terms, partita IVA Hevolus, link altri segmenti)
```

### 7.4 Content file schema

Location: `frontend/src/content/soluzioni/<segmento>.json`

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
  "recommendedPlan": "essenziale",
  "testimonial": null
}
```

### 7.5 MVP scope

- Compilare **solo `parrucchieri.json`** in MVP (il segmento più validante: alto volume appuntamenti + use case ripetitivi).
- Gli altri 10 segmenti: placeholder auto-generati con copy generico + CTA "Vuoi una pagina dedicata al tuo settore? Contattaci".
- Post-MVP: compilare progressivamente (1-2h × 10 segmenti = ~1 settimana di copywriting, parallelizzabile).

## 8. Admin Twilio management

### 8.1 Motivazione

Il modello "managed Twilio" oggi è implicito nel codice (subaccount creato on signup via `twilio_provisioning.py`), ma l'admin NON ha un pannello dove:
- Configurare/ruotare le master credentials Twilio (oggi solo ENV).
- Definire policy di provisioning (auto-create subaccount vs manuale).
- Vedere l'elenco subaccount con volume mensile e costo stimato per utente.
- Gestire pool di numeri WhatsApp disponibili.
- Monitorare audit log provisioning.

Senza questo tab l'admin è cieco sul costo variabile Twilio aggregato e non può intervenire su abusi/anomalie.

### 8.2 UI: nuovo tab `AdminTwilioTab`

URL: `/admin?tab=twilio`

Struttura (4 sezioni verticali):

1. **Master config**
   - `account_sid` (display-only se da ENV; editable se in tabella `sys_config`)
   - `auth_token` (masked + rotate button)
   - `messaging_service_sid` default
   - Verified WABA count (fetched da Twilio API)
   - Stato connessione ("OK" / errore con dettaglio)

2. **Provisioning policy**
   - Toggle "Auto-create subaccount on signup" (default ON)
   - Default region/numero pool per subaccount
   - Lista numeri WhatsApp Business disponibili (pool)

3. **Subaccount overview**
   - Tabella: utente, subaccount_sid, msg mese, costo Twilio stimato, stato
   - Filtri: stato, costo > soglia, utente ricerca testuale
   - Azione: sospendi subaccount (emergency kill-switch)

4. **Audit log Twilio**
   - Vista filtrata di `audit_log` dove `action` inizia con `twilio_*` (provision, rotate, suspend, restore)

### 8.3 Backend

Nuovi endpoint:
- `GET /admin/twilio/overview` — aggrega config + policy + subaccount stats
- `PATCH /admin/twilio/policy` — aggiorna policy
- `POST /admin/twilio/rotate-master` — rotate master credentials (cifrate in `sys_config`)
- `POST /admin/twilio/subaccount/{sid}/suspend` — sospensione emergenza

Nuova tabella: estende `sys_config` con righe `twilio_master_auth_token`, `twilio_provisioning_policy` (criptate riuso `encryption.py` già in repo).

### 8.4 Permission

Nuova permission: `admin.twilio.manage`.
Seed in `role_permissions`:
- `admin` → ✅ (tramite `*` wildcard)
- `collaborator` → ❌
- `sales` → ❌

## 9. BYOK Claude — advanced setting, non dimensione listino

**Decisione**: BYOK Claude NON è una dimensione del listino. Resta com'è oggi: setting `/settings/ai` user-level.

Chi attiva BYOK su piano Avvio/Essenziale/Plus/Premium non consuma gli AI credits inclusi. Leva upsell psicologica ("porti la tua chiave, risparmi"), ma non è bullet centrale del marketing.

Solo `Enterprise` include BYOK come bullet ufficiale con SLA dedicato (il target Enterprise tipicamente HA già una chiave Claude).

Zero modifiche architetturali richieste — `resolve_api_key()` in `backend/src/services/ai_credits.py` già gestisce tutto.

## 10. Marketing brief

Location repo: `docs/marketing/wamply-brief.md`.

Non-code asset, versionato in git per:
- Source of truth per il team marketing e partner esterni.
- Input per Claude Desktop quando i colleghi generano copy/slide.
- Review agile via PR se qualcuno vuole proporre modifiche al positioning.

### 10.1 Sezioni

1. **Positioning statement** (1 frase, da §4).
2. **Pubblico target** (micro/piccola/media impresa italiana bassa informatizzazione, per settore).
3. **Tono di voce**: italiano colloquiale, "tu" informale, zero tecnicismi.
4. **Vietato dire**: API, webhook, SID, endpoint, integration, SaaS, dashboard → alternative italiane ("pannello", "collegamento", "strumento").
5. **Value prop per segmento** — 11 sub-sezioni, compilate progressivamente.
6. **Copy approvato + anti-esempi** (copy reali validi e invalidi con spiegazione).
7. **Libreria prompt Claude Desktop** per auto-generare asset.

### 10.2 Esempio libreria prompt

```
# Generare headline per landing segmento
Scrivi 3 headline per la landing page `<segmento>` di Wamply (strumento WhatsApp
Business chiavi in mano per SME italiane). Italiano colloquiale, pain-focused,
max 60 caratteri ciascuna. Esempi di pain validi: perdita no-show, difficoltà
comunicazione, messaggi manuali ripetitivi.

# Generare use case realistico
Genera 3 use case per settore `<segmento>`. Formato: titolo (5-6 parole),
descrizione (2 frasi), ROI misurabile (1 frase con numero credibile).

# Generare template WhatsApp
Scrivi un template WhatsApp Business (marketing/utility) per `<segmento>`,
caso d'uso `<caso>`. Max 160 caratteri. Includi 2 variabili in {{graffe}}.
Italiano colloquiale. Zero emoji eccessive.

# Generare slide pitch per un settore
Struttura una slide di pitch B2B di 8 slot per proporre Wamply a un `<settore>`.
Include: problema, dimensione mercato italiano, soluzione, 2 use case, ROI
atteso, pricing piano consigliato, call to action.
```

## 11. Pre-requisiti Meta Business Manager (critico per go-live)

La sandbox Twilio (`+14155238886`) va bene per dev/test con numeri whitelist, **non per produzione**. Prima del lancio serve:

1. Creare WhatsApp Business Account Wamply su Meta Business Manager (account business di Hevolus).
2. Verifica business Meta (documenti P.IVA, prova attività, tempo: 3-14 giorni).
3. Registrazione numero WABA ufficiale Wamply (minimo 1 numero italiano, idealmente 2-3 per capacity).
4. Registrazione template Meta-approved per casi d'uso comuni (onboarding, promemoria, promo, OTP) — timeline: 1-3 giorni per template.
5. Link WABA ↔ Twilio Content API per usare `content_sid` in produzione.

**Questa è la catena critica da iniziare in parallelo al coding.** Suggerisco di aprire pratica Meta il giorno stesso dell'approvazione di questa spec. Responsabile: da definire (probabilmente Giuseppe come business owner Hevolus).

## 12. Architettura per sub-progetti

Lo scope si divide in 3 sub-progetti indipendenti che diventeranno 3 plan con `superpowers:writing-plans`:

### 12.1 Sub-project A — Listino & migration DB

**Scope:**
- Migration DB: add piano `avvio`, rinomina esistenti, aggiungi colonne `ai_features jsonb`, `msg_included int`, `overage_rates jsonb`, `active_segments text[]`.
- Backend: enforcement `msg_included` + calcolo overage + endpoint `GET /campaigns/:id/cost-preview` (mostra costo stimato prima di send).
- Frontend: pricing page `/piani` + plan picker signup + upgrade/downgrade flow.
- Script batch migrazione subscription esistenti + email ai paganti.
- Update `AdminPlanManagementTab` (già esistente) per riflettere nuovo schema.

**Dipendenze:** nessuna — parte per primo.
**Stima:** 5-7 giorni.

### 12.2 Sub-project B — Landing pages segment-based

**Scope:**
- Route template `/soluzioni/[segmento]` in Next.js App Router.
- Content schema + loader (lettura da `frontend/src/content/soluzioni/*.json`).
- Pagina pilota "parrucchieri" completamente compilata.
- Homepage `/` ridisegnata con grid 11 settori + tagline + CTA.
- Pagina `/piani` (se non già fatta in A).
- SEO: sitemap.xml auto, metadata per page, OG tags, schema.org `Service`.
- Placeholder auto-generati per 10 segmenti non ancora compilati.

**Dipendenze:** riutilizza `recommendedPlan` da sub-project A.
**Stima:** 4-6 giorni per framework + 1-2h per ogni segmento aggiuntivo al pilota.

### 12.3 Sub-project C — Admin Twilio management

**Scope:**
- Migration DB: estende `sys_config` per Twilio master creds criptate.
- Permission `admin.twilio.manage` aggiunta in `role_permissions` (migration).
- Endpoint backend: `GET /admin/twilio/overview`, `PATCH /admin/twilio/policy`, `POST /admin/twilio/rotate-master`, `POST /admin/twilio/subaccount/:sid/suspend`.
- Frontend `AdminTwilioTab` — 4 sezioni descritte in §8.2.
- Permission_tabs map aggiornata in `AdminSidebar.tsx`.
- Tests: unit su permission + endpoint, E2E Playwright su tab visibility per ruolo.

**Dipendenze:** dipende da sub-project A per schema plans aggiornato (usato nel calcolo costi aggregati) + dipende da `feature/admin-roles-permissions` branch già mergiato (per `require_permission` factory + `admin.twilio.manage` permission row).
**Stima:** 3-4 giorni.

### 12.4 Ordine di esecuzione suggerito

```
feature/admin-roles-permissions (merge prima di tutto) ──┐
                                                          │
Sub-project A (listino + migration DB) ──────────────────┤
                                                          │
              ┌─── Sub-project B (landing pages) ─────────┤ → deploy
              │                                           │
              └─── Sub-project C (admin Twilio) ──────────┘
```

B e C sono indipendenti dopo A — possono andare in parallelo se ci sono 2 dev, o in sequenza se 1.

## 13. Pre-requisiti non-tech (parallel track)

Da iniziare **il giorno di approvazione spec**, in parallelo al coding:

- [ ] Aprire pratica Meta Business Manager verification per WhatsApp Business
- [ ] Acquistare numero WhatsApp Business italiano (Twilio o vendor telco)
- [ ] Preparare documenti aziendali (P.IVA Hevolus, prove attività) per verifica Meta
- [ ] Scrivere `docs/marketing/wamply-brief.md` (v1 positioning + tone-of-voice + prompt library; sezioni value-prop-per-segmento compilate progressivamente)
- [ ] Identificare 1-2 clienti pilota per testimonial reali (post-launch)

## 14. Ipotesi aperte (da validare)

1. **Quanti utenti paganti attivi oggi?** — Working assumption: <50, migrazione senza attriti. Se >100, rivedere piano migrazione con maggiore cautela.
2. **Tariffe Twilio wholesale negoziate?** — Working assumption: listino pubblico, no sconti volume. Se Hevolus ha accordi, ricalibrare quote `msg_included` verso l'alto.
3. **Tempistica Meta Business Manager** — 3-14 giorni worst case. Se blocca il go-live, si può lanciare il listino e le landing page senza produzione Twilio (mostrando solo demo) + aprire beta signup con waitlist.
4. **Mix messaggi 40/40/20** — assunzione working. Post-launch: telemetria reale da `ai_usage_ledger` + nuova tabella `twilio_usage_ledger` (da creare in sub-project A) darà il mix vero.
5. **Cambio USD/EUR 0.92** — assunzione working. Aggiornamento parametrizzato mensile via cron o ENV variable.
6. **Chi compila i 10 content file restanti?** — marketing interno con prompt library della §10.2, oppure outsourcing a copywriter, oppure Claude-assisted dal team. Decisione post-MVP.
7. **Location marketing brief** — `docs/marketing/wamply-brief.md` è la proposta; alternative Notion/Google Docs. Consiglio: tenere in repo per single source of truth + versioning git.

## 15. Success criteria

Il progetto è "completato" quando:

- [ ] Migration DB applicata, 5 piani visibili in `/admin` e in `/piani`.
- [ ] Utenti esistenti migrati senza incident, email comunicazione inviata.
- [ ] Segnup nuovo su `/prova` porta a piano `avvio` by default con upsell a `essenziale`.
- [ ] Pagina `/soluzioni/parrucchieri` indicizzabile da Google, responsive, Core Web Vitals green.
- [ ] Framework `/soluzioni/[segmento]` funziona con placeholder per gli altri 10 segmenti.
- [ ] Tab admin Twilio permette rotate credentials + vedere overview subaccount.
- [ ] `docs/marketing/wamply-brief.md` v1 scritto e commitato.
- [ ] Test automatizzati: backend pytest green, frontend vitest green, E2E Playwright per role-based visibility (se Playwright installato).
- [ ] Pre-requisiti Meta: pratica aperta (non necessariamente completata al merge).

Metriche post-launch (30 giorni):
- Conversion rate `/prova` → piano pagante
- Distribuzione piani nuovi signup (attesa: 60% Avvio, 25% Essenziale, 10% Plus, 5% Premium)
- Costo Twilio effettivo vs stimato (per calibrare mix)
- Bounce rate landing `/soluzioni/parrucchieri` vs `/`

## 16. Decisioni registrate in questa spec

| # | Decisione | Motivazione |
|---|---|---|
| D1 | 5 piani invece di 3 | Avvio cattura micro-SME sotto €49; Enterprise resta custom |
| D2 | BYOK Twilio eliminato | Contrasta con target "bassa informatizzazione" |
| D3 | BYOK Claude setting user, non dimensione listino | Claude API key ancora rara in target SME italiano |
| D4 | Canone + quota piccola + overage invece di canone-only | Margini reggono anche con 100% marketing mix |
| D5 | 11 segmenti con framework "1+N" invece di 11 pagine a mano | Scope sostenibile, estendibile |
| D6 | Landing `/soluzioni/[segmento]` a parte, non integrato nel landing principale | SEO verticale + messaggio mirato |
| D7 | Admin Twilio tab nuova | Manca osservabilità master account Twilio |
| D8 | Mapping piano 1:1 su prezzi esistenti | Zero churn forzato da migrazione |
| D9 | Aggiunta AI features GRATIS ai migrati | Fidelizzazione + narrativa "abbiamo migliorato il tuo piano" |

---

**Next steps**: user review di questa spec. Se approvata, passaggio a `superpowers:writing-plans` per i 3 sub-progetti.
