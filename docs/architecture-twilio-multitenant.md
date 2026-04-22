# Wamply — Architettura Twilio Multi-Tenant

> Documento tecnico di riferimento per team di sviluppo.
> Versione: 2026-04-21
> Complemento a `business-model.md` (sezione 9) e `task-messages-topup.md`.

---

## 1. Obiettivo

Isolare ogni cliente Wamply in un ambiente Twilio dedicato, mantenendo fatturazione consolidata e gestione centralizzata. Permettere al team Wamply di gestire le pratiche Meta Business Approval al posto del cliente PMI.

---

## 2. Architettura Twilio: master account + subaccounts

### 2.1 Schema

```
┌──────────────────────────────────────────────┐
│   TWILIO MASTER ACCOUNT (Wamply Srl)         │
│   SID: ACxxxx...                              │
│   Auth Token: secretxxxx                      │
│   Fattura consolidata                         │
│                                               │
│   ┌─── SUBACCOUNT #1 (Pizzeria Mario) ─────┐ │
│   │   SID: ACsubxxxx...                    │ │
│   │   1 numero IT: +39 02 xxxx             │ │
│   │   1 WhatsApp sender: pizzeria_mario    │ │
│   │   Meta Approval: approved              │ │
│   │   Messaggi: inviati separatamente      │ │
│   └────────────────────────────────────────┘ │
│                                               │
│   ┌─── SUBACCOUNT #2 (Boutique Anna) ──────┐ │
│   │   SID: ACsubyyyy...                    │ │
│   │   1 numero IT: +39 02 yyyy             │ │
│   │   1 WhatsApp sender: boutique_anna     │ │
│   │   Meta Approval: in_review             │ │
│   └────────────────────────────────────────┘ │
│                                               │
│   ┌─── SUBACCOUNT #3 (cliente N)  ─────────┐ │
│   │   ...                                   │ │
│   └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### 2.2 Vantaggi

- **Isolamento per cliente**: rate limit, quota, sospensione — tutto per subaccount
- **Un cliente bannato non impatta gli altri**: Meta sospende il subaccount, non tutto Wamply
- **Fatturazione consolidata**: una sola fattura Twilio a Wamply a fine mese (Wamply internamente attribuisce per cliente via `ai_usage_ledger` pattern)
- **Setup automatico via API**: Twilio permette di creare subaccount programmaticamente (`POST /2010-04-01/Accounts.json`)
- **Portabilità**: numero Twilio può essere trasferito al cliente se lascia Wamply

### 2.3 Limiti noti

- Ogni subaccount costa €1/mese per il numero (~100 clienti = €100/mese fisso)
- Meta Business verification richiede un brand per sender — non possibile "sender generico Wamply che cambia display"
- I subaccount **non ereditano** automaticamente feature del master (devi abilitarle una per una in alcuni casi)

---

## 3. Schema DB

### 3.1 Tabella `businesses`

Estensione "Business Profile" dei dati utente. Una riga per user (1:1).

```sql
CREATE TABLE IF NOT EXISTS businesses (
  id              uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid       UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Identificativi legali
  legal_name      text       NOT NULL,   -- Ragione sociale
  brand_name      text       NOT NULL,   -- Nome commerciale (display WhatsApp)
  vat_number      text,                  -- Partita IVA (IT: IT12345678901)
  tax_code        text,                  -- Codice fiscale (se diverso da PIVA)

  -- Indirizzo sede legale
  address_line1   text,
  address_line2   text,
  city            text,
  postal_code     text,
  region          text,                  -- Provincia/Regione
  country         text       NOT NULL DEFAULT 'IT',

  -- Contatti
  business_phone  text,                  -- Numero che diventerà sender WhatsApp (formato E.164)
  business_email  text,                  -- Email Meta contact
  website_url     text,

  -- Asset visivi
  logo_url        text,                  -- Supabase Storage path
  meta_category   text,                  -- Categoria business Meta (dropdown)

  -- Metadata
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid       REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_businesses_user ON businesses(user_id);
```

### 3.2 Tabella `meta_applications`

Una riga per business (1:1). Tracking della pratica Meta Business Approval.

```sql
CREATE TYPE meta_application_status AS ENUM (
  'draft',              -- pratica creata, dati incompleti
  'awaiting_docs',      -- in attesa documenti da cliente
  'submitted_to_meta',  -- inviata Meta Business Manager
  'in_review',          -- Meta in revisione
  'approved',           -- Meta approvata, sender attivabile
  'rejected',           -- Meta rifiutata
  'active',             -- sender operativo, primo invio fatto
  'suspended'           -- Meta ha sospeso post-attivazione
);

CREATE TABLE IF NOT EXISTS meta_applications (
  id                          uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id                 uuid       UNIQUE NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status                      meta_application_status NOT NULL DEFAULT 'draft',

  -- Dati Twilio (popolati progressivamente dal socio)
  twilio_subaccount_sid       text,      -- AC...
  twilio_subaccount_auth_token_encrypted bytea, -- cifrato AES-256-GCM
  twilio_phone_number         text,      -- +39...
  twilio_phone_number_sid     text,      -- PN...
  twilio_whatsapp_sender_sid  text,      -- XE...
  twilio_messaging_service_sid text,     -- MG...

  -- Riferimenti Meta
  meta_waba_id                text,      -- WhatsApp Business Account ID (post-approval)
  meta_display_name_approved  text,
  meta_rejection_reason       text,

  -- Timestamps
  submitted_at                timestamptz,
  approved_at                 timestamptz,
  rejected_at                 timestamptz,
  activated_at                timestamptz,
  suspended_at                timestamptz,

  -- Note interne (solo staff)
  admin_notes                 text,

  -- Metadata
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid       REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_meta_applications_status ON meta_applications(status);
CREATE INDEX idx_meta_applications_business ON meta_applications(business_id);
```

### 3.3 Audit log

Per trasparenza e supporto, ogni modifica a `businesses` / `meta_applications` va loggata.

```sql
CREATE TABLE IF NOT EXISTS business_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid REFERENCES businesses(id) ON DELETE CASCADE,
  action       text NOT NULL,        -- 'create_business' | 'update_field' | 'submit_meta' | 'state_change' | ...
  actor_id     uuid REFERENCES users(id) ON DELETE SET NULL,  -- chi ha agito (cliente o admin staff)
  changes      jsonb,                -- { "field": "logo_url", "old": null, "new": "..." }
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_business ON business_audit_log(business_id, created_at DESC);
```

### 3.4 Relazione esistente

Nel DB attuale `whatsapp_config` (migration 001) ha campi tipo `phone_number_id`, `waba_id`, `encrypted_token`. È pensata **per un solo set di credenziali per utente** — non compatibile col modello multi-tenant.

**Strategia di migrazione**:
- La nuova `meta_applications` sostituisce progressivamente `whatsapp_config`
- Migration 022 duplica i dati di `whatsapp_config` esistenti in `meta_applications`
- Il codice backend/worker che legge `whatsapp_config` va aggiornato per leggere da `meta_applications` (con fallback a `whatsapp_config` finché non si completa il refactor)
- Dopo 1 sprint di coesistenza, deprecare `whatsapp_config`

### 3.5 Migration 022 proposta

```sql
-- 022_businesses_and_meta_applications.sql
-- Introduce business profile + Meta application tracking

BEGIN;

-- Enum stato pratica
CREATE TYPE meta_application_status AS ENUM (
  'draft', 'awaiting_docs', 'submitted_to_meta', 'in_review',
  'approved', 'rejected', 'active', 'suspended'
);

-- Tabella businesses (vedi §3.1)
CREATE TABLE IF NOT EXISTS businesses ( ... );

-- Tabella meta_applications (vedi §3.2)
CREATE TABLE IF NOT EXISTS meta_applications ( ... );

-- Audit log (vedi §3.3)
CREATE TABLE IF NOT EXISTS business_audit_log ( ... );

-- Backfill da whatsapp_config esistente
INSERT INTO businesses (user_id, legal_name, brand_name, created_at)
SELECT u.id, u.email, u.email, now()
FROM users u
WHERE EXISTS (SELECT 1 FROM whatsapp_config wc WHERE wc.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO meta_applications (business_id, status, twilio_phone_number, created_at)
SELECT b.id, 'active', wc.phone_number, now()
FROM businesses b
JOIN whatsapp_config wc ON wc.user_id = b.user_id
WHERE wc.phone_number IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
```

---

## 4. Flussi operativi

### 4.1 Registrazione cliente

```
User → POST /register (email, password)
     ↓
Backend crea auth.users → public.users (trigger)
     ↓
NON crea businesses (per ora)
     ↓
Trial 14gg attivo, sandbox Twilio shared (+14155238886)
User può: importare contatti, creare template, chattare con AI,
          inviare a contatti opt-in personal test (sandbox)
User NON può: inviare a contatti reali con brand proprio
```

### 4.2 Attivazione (compilazione dati azienda)

**Path A — Cliente compila da solo (Pro/Enterprise evoluti)**

```
User → /settings/business (nuova pagina)
     → compila form (ragione sociale, PIVA, indirizzo, logo…)
     → submit
     ↓
POST /settings/business → crea businesses + meta_applications(status='draft')
     ↓
Trigger audit_log: action='create_business', actor_id=user.id
     ↓
Banner dashboard: "Dati inviati. Stiamo verificando la documentazione per Meta."
     ↓
Alert admin sidebar: +1 pratica da lavorare
```

**Path B — Socio compila per conto del cliente (Starter PMI low-tech)**

```
Cliente → email/WhatsApp/telefono al socio con i dati
     ↓
Socio → /admin → Pratiche WhatsApp → tab "Nuova pratica"
     → seleziona user dalla lista
     → compila form (stessi campi del Path A)
     → submit + upload logo (se cliente l'ha mandato)
     ↓
POST /admin/businesses → crea businesses + meta_applications(status='draft')
     ↓
Trigger audit_log: action='create_business', actor_id=socio.id
     ↓
Cliente vede i dati nella sua dashboard (piena trasparenza)
```

### 4.3 Pagamento piano

```
User su /settings/billing → click "Scegli Professional"
     ↓
Stripe Checkout
     ↓ (redirect) /settings/billing?checkout=success
     ↓ (webhook) customer.subscription.created
     ↓
Backend _sync_subscription_from_stripe aggiorna DB
     ↓
Alert admin sidebar: "Utente X ha pagato — pratica pronta per submit Meta"
```

### 4.4 Submit pratica Meta (operazione manuale del socio)

Il socio fa questo da `/admin` una volta che:

- Il cliente ha pagato
- Tutti i campi obbligatori in `businesses` sono compilati
- Il logo è stato caricato

**Step operativi del socio:**

1. Apre la scheda del business in admin
2. Click **"Crea subaccount Twilio"**
   - Backend chiama `POST /2010-04-01/Accounts.json` con `FriendlyName={business.legal_name}`
   - Salva il SID + auth_token (cifrato) in `meta_applications.twilio_subaccount_sid/auth_token_encrypted`
3. Click **"Acquista numero italiano"**
   - Backend cerca disponibilità: `GET /2010-04-01/Accounts/{sub_sid}/AvailablePhoneNumbers/IT/Local.json`
   - Acquista il primo disponibile: `POST /2010-04-01/Accounts/{sub_sid}/IncomingPhoneNumbers.json`
   - Salva `meta_applications.twilio_phone_number + twilio_phone_number_sid`
4. Il socio apre **Meta Business Manager** (fuori Wamply) e compila la richiesta per WABA per questo brand + numero. Meta richiede:
   - Legal business name
   - Business address
   - Tax ID (PIVA)
   - Brand display name (max 20 caratteri)
   - Logo ufficiale
   - Categoria business
   - Telefono business (quello appena acquistato Twilio)
5. Il socio clicca **dropdown stato → `submitted_to_meta`** in admin. Inserisce `submitted_at = now()`.
6. Cliente riceve email automatica: **"Abbiamo inviato la tua richiesta a WhatsApp Business. Riceverai conferma entro 3–14 giorni."**

### 4.5 Approvazione o rifiuto (lato Meta)

Meta invia comunicazione al Business Manager del socio (email + dashboard Meta). Quando:

**Se approvato:**

- Socio va in admin → scheda business → dropdown `approved`
- Inserisce `meta_waba_id` e `meta_display_name_approved` manualmente
- Backend chiama Twilio API per registrare il sender WhatsApp: `POST /v1/WhatsAppSenders`
- Cliente riceve email: **"🎉 Il tuo WhatsApp Business è attivo. Manda la tua prima campagna al pubblico reale!"**
- Dashboard cliente: banner verde "Sender WhatsApp attivo", pulsante "Crea campagna" non più bloccato

**Se rifiutato:**

- Socio → dropdown `rejected` + nota motivo
- Cliente riceve email con motivo e passi per correggere
- Se correggibile → dropdown torna a `awaiting_docs` → cliente invia nuovi dati → resubmit

### 4.6 Primo invio (status → active)

```
Cliente crea campagna → click "Invia ora"
     ↓
Backend verifica: meta_applications.status = 'approved'
     ↓
Se approved: avvia invio, status → 'active', activated_at = now()
Se diverso: HTTP 403 con messaggio "Il tuo WhatsApp non è ancora attivo"
```

### 4.7 Disdetta e portabilità

Quando il cliente disdice l'abbonamento (Stripe → `customer.subscription.deleted`):

1. Wamply **non elimina** subaccount Twilio per 30 giorni (grace period)
2. Email al cliente: "Vuoi trasferire il tuo numero WhatsApp a un altro provider Twilio? Compila questo form"
3. Se cliente conferma → Wamply avvia procedura Twilio Transfer Subaccount (operazione manuale, c'è un form in admin Twilio)
4. Se cliente non risponde entro 30gg → Wamply chiude il subaccount e rilascia il numero

**Policy commerciale:** il cliente **è proprietario** del sender approvato Meta. Non lock-in. Questa regola va comunicata chiaramente nei T&C e sulla pagina FAQ.

---

## 5. Endpoint backend da implementare

### 5.1 User-facing

| Metodo | Path | Scope | Descrizione |
|--------|------|-------|-------------|
| GET | `/settings/business` | user | Ottiene dati business dell'utente loggato |
| POST | `/settings/business` | user | Crea/aggiorna business profile dell'utente |
| GET | `/settings/meta-application` | user | Stato pratica Meta + tempistiche |
| POST | `/settings/business/logo` | user | Upload logo (multipart) |

### 5.2 Admin-facing (scope `staff`)

| Metodo | Path | Scope | Descrizione |
|--------|------|-------|-------------|
| GET | `/admin/businesses` | staff | Lista businesses con stato pratica + filtri |
| GET | `/admin/businesses/{id}` | staff | Scheda singolo business + meta_application + audit log |
| PUT | `/admin/businesses/{id}` | staff | Aggiorna campi business (da parte del socio) |
| POST | `/admin/businesses/{id}/logo` | staff | Upload logo per conto del cliente |
| PATCH | `/admin/meta-applications/{id}/status` | staff | Cambia stato (dropdown) con note opzionali |
| POST | `/admin/meta-applications/{id}/create-subaccount` | admin | Crea subaccount Twilio |
| POST | `/admin/meta-applications/{id}/purchase-number` | admin | Acquista numero IT locale |
| GET | `/admin/meta-applications/{id}/audit` | staff | Audit log pratica |

### 5.3 Webhook

| Metodo | Path | Descrizione |
|--------|------|-------------|
| POST | `/webhooks/twilio/status` | Già esistente — estendere per ricevere WhatsApp sender status (attivazione, sospensione) |

---

## 6. Endpoint Twilio API chiave

Per riferimento, ecco le chiamate Twilio che il backend deve fare:

### Creazione subaccount

```http
POST https://api.twilio.com/2010-04-01/Accounts.json
Authorization: Basic {MASTER_SID}:{MASTER_AUTH_TOKEN}
Content-Type: application/x-www-form-urlencoded

FriendlyName=Pizzeria%20Mario
```

Response: `{ "sid": "ACxxx", "auth_token": "..." }` — salvare cifrato.

### Acquisto numero

```http
GET https://api.twilio.com/2010-04-01/Accounts/{SUB_SID}/AvailablePhoneNumbers/IT/Local.json
Authorization: Basic {MASTER_SID}:{MASTER_AUTH_TOKEN}
```

Response: lista di numeri disponibili. Poi:

```http
POST https://api.twilio.com/2010-04-01/Accounts/{SUB_SID}/IncomingPhoneNumbers.json
PhoneNumber=+390212345678
```

### Registrazione WhatsApp Sender (post-Meta approval)

Twilio fornisce API WhatsApp Senders per collegare un numero Twilio a un WABA approvato da Meta:

```http
POST https://messaging.twilio.com/v2/Channels/Senders
Authorization: Basic {SUB_SID}:{SUB_AUTH_TOKEN}
```

Questa parte è documentata qui:
https://www.twilio.com/docs/whatsapp/api/whatsapp-senders

---

## 7. Supabase Storage per logo

### 7.1 Bucket setup

```sql
-- Crea bucket privato
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-logos', 'business-logos', false);

-- Policy: solo owner può leggere il proprio logo (via signed URL)
CREATE POLICY "Users can read own business logo"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-logos' AND
         (auth.uid()::text = (storage.foldername(name))[1] OR
          EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'collaborator'))));

CREATE POLICY "Users can upload own business logo"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'business-logos' AND
              auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Staff can upload any business logo"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'business-logos' AND
              EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'collaborator')));
```

### 7.2 Path convention

```
business-logos/
  {user_id}/
    logo.png          (corrente)
    logo-v2.png       (versioning opzionale)
```

Il backend salva in `businesses.logo_url` una signed URL (scadenza 1 anno) oppure il path per generarla al volo quando serve.

---

## 8. UI Admin — "Pratiche WhatsApp"

### 8.1 Tab nella sidebar admin

Aggiungere tab `/admin` sidebar: **"Pratiche WhatsApp"** con badge numerico se ci sono pratiche in stato `draft`/`awaiting_docs`/`submitted_to_meta`/`rejected` (cioè "da lavorare").

### 8.2 Tabella principale

Colonne:
- Nome azienda (clickable → scheda)
- Piano corrente
- Stato pratica (pill colorata)
- Giorni in stato corrente (per identificare pratiche "ferme")
- Data ultima azione
- Azioni rapide: "Apri" | "Cambia stato"

Filtri:
- Per stato
- Per piano (Free / Starter / Pro / Enterprise)
- Per range date registrazione
- Ricerca per nome/PIVA

Sorting default: pratiche più recenti che richiedono azione in cima.

### 8.3 Scheda singola business

Sezioni:

**A. Identità**
- Legal name (editabile)
- Brand name (editabile)
- PIVA + CF (editabili)
- Categoria Meta (dropdown)

**B. Sede**
- Indirizzo completo (editabile)
- Paese

**C. Contatti**
- Business phone (editabile)
- Business email
- Website

**D. Asset**
- Logo (anteprima + pulsante upload/sostituisci)
- Preview: come apparirebbe su WhatsApp (brand name + logo tondo)

**E. Pratica Meta**
- Stato attuale (dropdown editabile)
- Storico cambi stato (timeline)
- Campi Twilio:
  - Subaccount SID (read-only, post-creazione)
  - Phone number (read-only, post-acquisto)
  - Messaging Service SID
  - WhatsApp Sender SID
- Campi Meta:
  - WABA ID (input manuale)
  - Display name approved (input manuale)
  - Rejection reason (textarea, solo se stato `rejected`)
- Pulsanti azione (condizionati sullo stato):
  - `draft` + tutti i campi compilati → **"Crea subaccount Twilio"**
  - `subaccount_creato` → **"Acquista numero italiano"**
  - `numero_acquistato` → **"Segnala come inviato a Meta"**
  - `submitted_to_meta` → **"Marca in review"**
  - `in_review` → **"Marca approvata"** / **"Marca rifiutata"**

**F. Note interne (socio)**
- Textarea libero, visibile solo allo staff
- Markdown-lite supportato

**G. Audit log**
- Timeline ultimi eventi (who + what + when)
- Filtro per tipo azione

### 8.4 Alert e notifiche

**Email giornaliera al socio** (cron):
- Riepilogo pratiche ferme da > 7 giorni in `submitted_to_meta` o `in_review`
- Nuove pratiche da lavorare
- Pratiche approvate oggi

**Alert interno dashboard** (Redis pub-sub):
- Nuova pratica creata → toast notification se socio è online
- Cliente aggiorna dati → highlight riga

---

## 9. UI Cliente — comunicazione stato

### 9.1 Banner nella dashboard

In cima alla dashboard (sotto gli altri banner trial/crediti), un nuovo **`MetaApplicationBanner`** che mostra stato e tempi:

| Status | Colore | Messaggio | CTA |
|--------|--------|-----------|-----|
| `draft` | amber | "Completa i dati della tua azienda per attivare WhatsApp" | "Completa ora" → `/settings/business` |
| `awaiting_docs` | amber | "Serve ancora il logo aziendale. Caricalo o inviacelo per email" | "Carica logo" / "Inviaci per email" |
| `submitted_to_meta` | blue | "Richiesta inviata a Meta. I tempi di approvazione vanno da 3 a 14 giorni e non dipendono da Wamply. Ti avviseremo via email." | — |
| `in_review` | blue | "Meta sta revisionando la tua richiesta. Potrebbe volerci qualche giorno." | — |
| `approved` | emerald | "🎉 Il tuo WhatsApp è approvato! Stiamo completando la configurazione." | — |
| `rejected` | rose | "Meta ha richiesto alcune modifiche. Motivo: {reason}" | "Correggi i dati" → `/settings/business` |
| `active` | nascosto | (nessun banner, tutto funziona) | — |
| `suspended` | rose | "Il tuo sender WhatsApp è stato sospeso da Meta. Ti contatteremo per assistenza." | "Contattaci" → mailto |

### 9.2 Pagina `/settings/business`

Form completo per compilare i dati azienda. Campi obbligatori marcati con *.

In cima, se `meta_applications.status = 'draft'`:
> "Appena salvi, il nostro team inizierà a preparare la tua richiesta a Meta per attivare WhatsApp ufficiale."

Se `status = 'submitted_to_meta'` o successivi:
> "I dati sono stati inviati. Modifiche ora possono richiedere di rifare la procedura Meta. Contattaci prima."

---

## 10. Sicurezza e compliance

### 10.1 Cifratura credenziali Twilio

- `twilio_subaccount_auth_token` memorizzato **cifrato** con AES-256-GCM usando `ENCRYPTION_KEY` (già presente nel sistema)
- Decifrato solo quando serve (chiamate API)
- Mai loggato in plaintext

### 10.2 Accesso admin

- Tutti gli endpoint `/admin/businesses/*` e `/admin/meta-applications/*` richiedono `require_staff`
- Creazione subaccount + acquisto numero richiedono `require_admin` (azioni con costo reale: per Enterprise il socio può, per test interni solo admin proprietà)

### 10.3 Audit trail

Ogni mutazione su `businesses` o `meta_applications` scrive un record in `business_audit_log`:
- `action` = 'update_field' | 'state_change' | 'logo_upload' | 'subaccount_created' | 'number_purchased' | ...
- `actor_id` = user che ha fatto l'azione (cliente o staff)
- `changes` = jsonb con diff old/new

Il cliente può vedere il proprio audit log da `/settings/business/history` (trasparenza).

### 10.4 GDPR

- Al disdire l'abbonamento, cliente può **esportare tutti i dati** (contatti + template + campagne + audit) via bottone "Esporta dati"
- Cancellazione completa dopo 90gg dalla disdetta (default GDPR)
- Il sender Meta è **suo** (data subject) — trasferibile a altro provider

---

## 11. Costi operativi

| Voce | Costo | Note |
|------|-------|------|
| Subaccount Twilio | €0 | Gratuito |
| Numero IT Local | ~€1/mese | Per ogni cliente attivo |
| Messaggi WhatsApp Business (marketing) | ~€0,065/msg | Tariffa base Italia marketing |
| Messaggi WhatsApp Business (utility) | ~€0,03/msg | Notifiche, reminder, transazionali |
| Meta Business Verification | €0 | Gratuito |
| Tempo socio per pratica | ~2h | €60/pratica (internalizzato) |

**Budget operativo mensile per 100 clienti attivi:**
- Numeri Twilio: €100/mese fisso
- Messaggi (media 2k/mese per cliente): 200k × €0,065 = €13.000
- Tempo socio per nuove pratiche (10 nuove/mese): 20h

---

## 12. Piano di implementazione (sprint)

### Sprint 1 (1 settimana)

- [ ] Migration 022: tabelle `businesses`, `meta_applications`, `business_audit_log`
- [ ] Backend endpoint `GET/POST /settings/business`
- [ ] Backend endpoint `POST /settings/business/logo`
- [ ] Frontend pagina `/settings/business` con form
- [ ] `MetaApplicationBanner` in dashboard

### Sprint 2 (1 settimana)

- [ ] Backend endpoint admin `/admin/businesses/*`
- [ ] Frontend admin tab "Pratiche WhatsApp" con tabella + scheda
- [ ] Upload logo admin-side
- [ ] Audit log integration

### Sprint 3 (2 settimane)

- [ ] Backend: Twilio subaccount creation API wiring
- [ ] Backend: Twilio number purchase API wiring
- [ ] Admin buttons per triggera creazione subaccount + acquisto numero
- [ ] Cifratura auth_token subaccount
- [ ] Test end-to-end con account Twilio di test

### Sprint 4 (2 settimane)

- [ ] Backend: invio campagna usa meta_application.twilio_messaging_service_sid del subaccount cliente (non più credenziali master)
- [ ] Webhook Twilio status per subaccount
- [ ] Email automatiche stato (submitted, approved, rejected)
- [ ] Sandbox Twilio routing durante trial
- [ ] Dashboard stato Meta in tempo reale

### Sprint 5 (1 settimana)

- [ ] Deprecazione `whatsapp_config` legacy (mantenere per backward-compat, non leggere più)
- [ ] Documentazione per il socio (come compilare pratica Meta step-by-step)
- [ ] Video interno tutorial socio

---

## 13. Rischi e mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| Meta cambia i requirements | Alta | Medio | Monitoring Meta changelog, aggiornamento form |
| Subaccount Twilio sospeso | Media | Alto | Policy di moderazione proactive, spike detection spam |
| Sender sospeso post-approval | Bassa | Alto | Template messaggi approvati, rate limit interno conservativo |
| Socio non disponibile (malattia, ferie) | Alta | Medio | Procedura documentata, backup con admin Wamply |
| Cliente paga ma pratica si blocca | Media | Alto | Rimborso pro-rata fino a approvazione o escalation a Meta |
| Furto credenziali master Twilio | Bassissima | Catastrofico | Master auth token in vault, IP whitelist backend, 2FA Twilio |

---

## 14. Domande aperte (per il team)

- Il socio vuole una **view mobile-friendly** della admin per gestire pratiche dal telefono? Priorità?
- Serve un **SLA scritto** sulla tempistica setup (es. "entro 48h dal pagamento creiamo subaccount")?
- Come gestiamo i clienti che **vogliono portarsi un numero esistente** (porting)? Twilio lo supporta ma è lavoro extra
- Ha senso supportare anche **SMS fallback** via stesso subaccount, o solo WhatsApp?
- Lingua del display name Meta: limitata a 20 caratteri — il cliente può scegliere il proprio?

---

*Questo documento va aggiornato a ogni sprint completato o cambio architetturale significativo.*
