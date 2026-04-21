# Wamply — WhatsApp Campaign Manager

> SaaS per campagne WhatsApp Business massive con agent AI conversazionale

## Panoramica

Wamply permette a PMI, agenzie marketing e professionisti di creare e lanciare campagne di messaggistica massiva su WhatsApp Business. Un agent AI basato su **Microsoft Agent Framework** orchestra l'intero processo: dalla segmentazione dei contatti alla personalizzazione di ogni singolo messaggio tramite **Claude (Anthropic)**, fino all'invio automatizzato via **Twilio WhatsApp API** (Programmable Messaging + Content Templates).

A differenza delle soluzioni tradizionali che inviano lo stesso template con variabili statiche, Wamply **personalizza ogni messaggio** per ogni destinatario tramite un agent AI che apprende dalle campagne precedenti.

---

## Stack tecnologico

| Layer | Tecnologia |
|-------|-----------|
| **Frontend** | Next.js 15 (App Router) + React 19 + Tailwind CSS 4 |
| **Backend API** | Python FastAPI (standalone, porta 8200) |
| **Agent AI** | Python FastAPI + Microsoft Agent Framework pattern |
| **LLM** | Claude Sonnet 4 / Haiku 4.5 via Anthropic API |
| **Embeddings** | Voyage-3 (Anthropic/Voyage AI) |
| **Auth** | Supabase Auth (GoTrue) — email/password, OAuth Google |
| **Database** | PostgreSQL 15 (Supabase) |
| **Cache/Queue/Vector** | Redis Stack (RediSearch + RedisJSON + Vector Search) |
| **API Gateway** | Kong 3.9 |
| **Pagamenti** | Stripe Billing |
| **WhatsApp** | Twilio WhatsApp API (SDK `twilio` Python + Node) |
| **Tracing** | Jaeger (dev) |

---

## Architettura

```text
Browser
  │
  ▼
Kong API Gateway (:8100)
  ├── /auth/v1/*   → GoTrue (:9999)        Auth
  ├── /rest/v1/*   → PostgREST (:3001)     Direct DB access
  ├── /api/v1/*    → Backend (:8200)        CRUD + business logic
  └── /agent/v1/*  → Agent (:8000)          Chat AI + campaign worker
                         │
                         ├── @tool calls → Backend API
                         │                  (AGENT_SECRET + X-On-Behalf-Of)
                         │
                         ▼
                    PostgreSQL (:5432)  +  Redis Stack (:6379)
```

### Servizi

| Servizio | Porta | Funzione |
|----------|-------|----------|
| **Frontend** (Next.js) | 3000 | UI pura — zero API routes |
| **Backend** (FastAPI) | 8200 | CRUD, plan limits, webhooks, encryption |
| **Agent** (FastAPI) | 8000 | Chat AI, tool-use, campaign workflow, memory |
| **Kong** | 8100 | API gateway, routing, CORS |
| **GoTrue** | 9999 | Auth (login, register, JWT) |
| **PostgREST** | 3001 | Auto-generated REST from DB schema |
| **PostgreSQL** | 5432 | Application data |
| **Redis Stack** | 6379 / 8001 | Cache + queue + vector search + RedisInsight UI |
| **Jaeger** | 16686 | Distributed tracing (dev) |

### Flussi

- **UI classica**: Browser → Kong `/api/v1/*` → Backend (JWT utente)
- **Chat AI**: Browser → Kong `/agent/v1/chat` → Agent (JWT) → Agent chiama Backend via `@tool`
- **Task asincroni**: Backend enqueue su Redis → Agent worker consuma → esegue campagna

### Sicurezza

- JWT Supabase per auth utente, `AGENT_SECRET` per service-to-service
- Row Level Security (RLS) su tutte le tabelle
- Twilio Auth Token e API Key criptati con AES-256-GCM
- Validazione webhook Twilio via firma `X-Twilio-Signature` (HMAC-SHA1)
- Plan limits con Redis cache (TTL 5min)
- Audit trail per azioni admin

---

## Quick Start

### Prerequisiti

- **Docker Desktop** ≥ 4.30 con Docker Compose v2
- **Git** ≥ 2.40
- **Make** (incluso in Git Bash su Windows)

### Setup

```bash
git clone <repo-url> wamply
cd wamply
make setup
```

`make setup` fa tutto automaticamente:

1. Crea `.env` da `.env.example`
2. Avvia tutti i container Docker
3. Aspetta che il DB sia pronto
4. Esegue il seed con dati di test

### Credenziali di sviluppo

| Ruolo | Email | Password |
|-------|-------|----------|
| **Admin** | `admin@wcm.local` | `Admin123!` |
| User 1 (Starter) | `user1@test.local` | `User123!` |
| User 2 (Professional) | `user2@test.local` | `User123!` |

### Ripristino admin in emergenza (break-glass)

Se perdi la password dell'unico admin e non puoi più entrare nella UI, usa uno
di questi percorsi (in ordine di preferenza):

**1. Riseeding completo** — risolve tutto resettando le credenziali di seed.

```bash
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db \
  psql -U supabase_admin -d postgres < supabase/seed.sql
```

Riporta `admin@wcm.local` alla password `Admin123!`. Tutti gli altri dati di
seed vengono ripristinati o duplicati (idempotente per gli utenti seed).

**2. Reset password mirato** — cambia solo la password, senza toccare altro.

```bash
# Sostituisci <email> e <nuova-password>
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db \
  psql -U supabase_admin -d postgres -c \
  "UPDATE auth.users SET encrypted_password = crypt('<nuova-password>', gen_salt('bf')), updated_at = now() WHERE email = '<email>';"
```

**3. Promuovere un utente esistente a admin** — se hai accesso a un'altra
utenza ma non all'admin:

```bash
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db \
  psql -U supabase_admin -d postgres -c \
  "UPDATE public.users SET role = 'admin' WHERE email = '<email>';"
```

**4. Rimuovere un ban persistente**:

```bash
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db \
  psql -U supabase_admin -d postgres -c \
  "UPDATE auth.users SET banned_until = NULL WHERE email = '<email>';"
```

> **Protezioni attive nel backend**
>
> - Un admin non può cancellare, disabilitare o modificare il proprio account (HTTP 400).
> - Non è possibile cancellare o disabilitare l'ultimo amministratore attivo (HTTP 400).
> - Il reset password via UI è disponibile sotto `/admin` → modale utente; revoca tutte le sessioni attive dell'utente.

### URL di sviluppo

| Servizio | URL |
|----------|-----|
| **Frontend** | <http://localhost:3000> |
| **Login** | <http://localhost:3000/login> |
| **Dashboard** | <http://localhost:3000/dashboard> |
| **Admin** | <http://localhost:3000/admin> |
| **Backend API** | <http://localhost:8100/api/v1/health> |
| **RedisInsight** | <http://localhost:8001> |
| **Jaeger UI** | <http://localhost:16686> |

---

## Comandi Makefile

### Setup e ambiente

```bash
make setup           # Primo avvio completo (env + containers + seed)
make env             # Crea .env da .env.example se non esiste
make clean           # Rimuove tutto (container + volumi + node_modules + venv)
```

### Docker Compose

```bash
make up              # Avvia stack base
make up-full         # Aggiunge realtime, storage, mailhog (profilo full)
make up-debug        # Aggiunge stripe-cli (profilo debug)
make down            # Ferma container (mantiene dati)
make build           # Builda le immagini Docker
make reset           # Cancella volumi + ricrea + seed
make rebuild         # Ricostruisce frontend (pulisce cache .next)
```

### Sviluppo locale (senza container app)

```bash
make dev-services    # Avvia solo infra (supabase-db, redis, auth, rest, kong)
make dev             # Esegue scripts\dev-all.bat (avvio locale completo)
```

### Database

```bash
make seed            # Popola database con dati di esempio
make migrate         # Esegue tutte le migrations SQL in /docker-entrypoint-initdb.d
make db-shell        # Apre psql sul container supabase-db
```

### Testing

```bash
make test            # Esegue test unitari (frontend npm + backend pytest)
make test-e2e        # Esegue test end-to-end con Playwright
```

### Logs

```bash
make logs            # Tail di tutti i log
make logs-frontend   # Tail log frontend
make logs-backend    # Tail log backend
make logs-agent      # Tail log agent
```

### Utilità

```bash
make health          # Health check di Kong, GoTrue e PostgREST
make stripe-listen   # Stripe CLI forward webhook → backend
```

---

## Struttura del progetto

```text
wamply/
├── frontend/                  # Next.js 15 — UI pura
│   ├── src/
│   │   ├── app/               # Pages (App Router)
│   │   ├── components/        # Shared components
│   │   ├── hooks/             # React hooks (usePlan, useChat)
│   │   ├── lib/               # api-client, supabase client
│   │   └── types/             # TypeScript types
│   └── tailwind.config.ts
│
├── backend/                   # Python FastAPI — CRUD + business logic
│   ├── src/
│   │   ├── api/               # Route handlers (contacts, campaigns, admin, ...)
│   │   ├── auth/              # JWT verification, permissions, service auth
│   │   ├── services/          # Plan limits, encryption
│   │   ├── db/                # asyncpg pool
│   │   ├── config.py          # Settings (pydantic-settings)
│   │   └── main.py            # FastAPI app entrypoint
│   └── Dockerfile
│
├── agent/                     # Python FastAPI — AI agent + campaign worker
│   ├── src/
│   │   ├── agents/            # Workflow orchestration
│   │   ├── memory/            # HistoryProvider, ContextProvider, SemanticMemory
│   │   ├── tools/             # Backend API wrappers (@tool)
│   │   ├── worker/            # Redis queue consumer
│   │   └── main.py            # FastAPI app entrypoint
│   └── Dockerfile
│
├── supabase/
│   ├── migrations/            # SQL migrations (001-012)
│   ├── kong.yml               # Kong gateway routes
│   └── seed.sql               # Dev seed data (users, contacts, campaigns)
│
├── docker-compose.yml         # Full stack definition
├── docker-compose.override.yml # Dev overrides (debug, jaeger)
├── Makefile                   # Dev commands
├── .env.example               # Template environment variables
└── docs/
    └── superpowers/
        ├── specs/             # Design specs
        └── plans/             # Implementation plans
```

---

## Backend API Endpoints

Tutti accessibili via Kong su `http://localhost:8100/api/v1/`.

### CRUD (JWT richiesto)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /me/plan | Piano, usage e subscription dell'utente |
| GET/POST | /contacts | Lista (paginata) / crea contatto |
| GET/PUT | /contacts/{id} | Dettaglio / aggiorna contatto |
| POST | /contacts/import | Import bulk contatti |
| GET/POST | /campaigns | Lista / crea campagna |
| GET/PUT | /campaigns/{id} | Dettaglio / aggiorna campagna |
| POST | /campaigns/{id}/launch | Lancia campagna (enqueue Redis) |
| GET/POST | /templates | Lista / crea template |
| GET/PUT | /templates/{id} | Dettaglio / aggiorna template |
| GET/POST | /settings/twilio | Config Twilio WhatsApp (Account SID, Auth Token, From/Messaging Service SID) |
| GET/POST | /settings/ai | Config AI (model, BYOK) |

### Admin (JWT + ruolo admin)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /admin/overview | Dashboard (MRR, utenti, campagne attive) |
| GET | /admin/users | Lista utenti con subscription e usage |
| GET | /admin/campaigns | Campagne running/scheduled cross-tenant |

### Webhooks (auth via firma)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| POST | /webhooks/twilio | Twilio status callback (delivered / read / failed) — firma `X-Twilio-Signature` |
| POST | /billing/webhook | Stripe webhook (checkout, subscription) — firma `Stripe-Signature` |

### Billing (JWT richiesto)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /plans | Lista piani pagati visibili all'utente (esclude `free`) |
| GET | /settings/subscription | Stato abbonamento, piano, giorni rimanenti nel trial |
| POST | /billing/checkout | Crea una Stripe Checkout Session, ritorna l'URL |

---

## Stripe Billing

Wamply usa **Stripe** per gestire gli abbonamenti. Checkout hosted (niente form custom), webhook per sincronizzare lo stato in DB, Customer Portal pianificato nelle prossime iterazioni.

### Flusso utente (post-registrazione)

1. L'utente si registra → trigger DB crea automaticamente una subscription `trialing` sul piano **Professional** di 14 giorni.
2. Banner in dashboard mostra il countdown; email automatiche inviate a 3 giorni e 1 giorno dalla scadenza.
3. In qualunque momento può andare su `/settings/billing` e scegliere un piano → reindirizzato a Stripe Checkout.
4. Dopo il pagamento:
   - Stripe invia webhook `checkout.session.completed` e `customer.subscription.created` al backend.
   - Il backend aggiorna la subscription (`status=active`, `stripe_subscription_id`, periodo) e il banner trial sparisce.
5. Alla scadenza senza carta → subscription passa automaticamente al piano `free` (limiti a 0) → tutte le API bloccate con HTTP 402 → banner rosso persistente.
6. In caso di `past_due` (pagamento rinnovo fallito) → Stripe fa smart retries per ~3 settimane. Durante questo periodo tutte le API sono bloccate.

### Setup sviluppatore (test mode)

#### 1. Account Stripe test mode

1. Crea account su <https://dashboard.stripe.com> (gratuito).
2. Toggle in alto a destra su **"Test mode"** (tutti i dati creati qui sono sandbox).
3. **Developers → API keys**: copia la **Secret key** `sk_test_...` e la **Publishable key** `pk_test_...`.

#### 2. Variabili ambiente

Nel file `.env` alla radice del progetto, popola:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=         # popolato al passo 4
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

#### 3. Crea i Product + Price su Stripe

Da dashboard Stripe (test mode) → **Products → Add product**. Per ogni piano:

| Piano | Name | Price | Billing |
|-------|------|-------|---------|
| Starter | Wamply Starter | €49 | Recurring, monthly, EUR |
| Professional | Wamply Professional | €149 | Recurring, monthly, EUR |
| Enterprise | Wamply Enterprise | €399 | Recurring, monthly, EUR |

Dopo aver creato ogni Price, copia il suo id (inizia con `price_...`) e incollalo in DB:

```bash
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db \
  psql -U supabase_admin -d postgres <<SQL
UPDATE plans SET stripe_price_id = 'price_...STARTER_ID' WHERE slug = 'starter';
UPDATE plans SET stripe_price_id = 'price_...PRO_ID'     WHERE slug = 'professional';
UPDATE plans SET stripe_price_id = 'price_...ENT_ID'     WHERE slug = 'enterprise';
SQL
```

#### 4. Stripe CLI per webhook locali

Installa la CLI Stripe ([guida ufficiale](https://docs.stripe.com/stripe-cli)):

```bash
# Windows (winget)
winget install --id Stripe.StripeCLI

# macOS
brew install stripe/stripe-cli/stripe

# Linux: scarica il binario da https://github.com/stripe/stripe-cli/releases
```

Autentica e avvia il forward:

```bash
stripe login
stripe listen --forward-to localhost:8100/api/v1/billing/webhook
```

La CLI stampa un `whsec_...` la prima volta: copialo in `STRIPE_WEBHOOK_SECRET` nel `.env` e riavvia il backend:

```bash
docker compose restart backend
```

Tieni `stripe listen` acceso in un terminale separato per tutta la sessione di sviluppo. In alternativa c'è `make stripe-listen` come shortcut.

#### 5. Test end-to-end del checkout

1. Login con un utente qualunque (es. `user1@test.local` / `User123!`).
2. Vai su <http://localhost:3000/settings/billing>.
3. Click "Scegli questo piano" su Professional → si apre Stripe Checkout.
4. Usa una carta di test:

   | Numero | Scenario |
   |--------|----------|
   | `4242 4242 4242 4242` | Pagamento OK (senza 3DS) |
   | `4000 0025 0000 3155` | Richiede 3D Secure (simula auth banca) |
   | `4000 0000 0000 9995` | Fondi insufficienti (decline) |
   | `4000 0000 0000 0341` | OK al primo, poi fallisce alla renewal |

   Data scadenza: qualsiasi futura (`12/34`). CVC: qualsiasi 3 cifre. Nome/CAP: qualsiasi.

5. Conferma → redirect a `/settings/billing?checkout=success`. Nel terminale di `stripe listen` vedrai arrivare gli eventi; nel log del backend vedrai `stripe_sub_synced`.
6. Verifica in DB:

   ```bash
   docker exec -it -e PGPASSWORD=postgres wcm-supabase-db \
     psql -U supabase_admin -d postgres -c \
     "select status, stripe_subscription_id, current_period_end from subscriptions where user_id=(select id from users where email='user1@test.local');"
   ```

#### 6. Simulare eventi avanzati (senza aspettare giorni reali)

**Test failed payment sul rinnovo**:

```bash
stripe trigger invoice.payment_failed
```

La subscription del tuo utente di test passa a `past_due`. Tutte le API ritornano 402.

**Test trial in scadenza**:

Dashboard Stripe test → Customers → seleziona customer → **Subscriptions → Actions → Advance test clock** (Test Clocks). Avanza di 14 giorni → la trigger `customer.subscription.updated` arriva al webhook e il trial scade.

**Forzare la scadenza trial senza Stripe** (solo per utenti trial pre-carta):

```bash
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db \
  psql -U supabase_admin -d postgres -c \
  "UPDATE subscriptions SET current_period_end = now() - interval '1 minute' WHERE user_id=(select id from users where email='user1@test.local');"
```

Prossima request dell'utente → `plan_limits` lo sposta automaticamente sul piano `free` (limiti 0).

**Test reminder email trial**:

```bash
# Forza current_period_end a tra ~3 giorni, flag a NULL → prossimo run (max 1h) invia l'email
docker exec -i -e PGPASSWORD=postgres wcm-supabase-db \
  psql -U supabase_admin -d postgres -c \
  "UPDATE subscriptions SET current_period_end = now() + interval '3 days', trial_reminder_3d_sent_at = NULL WHERE user_id=(select id from users where email='user1@test.local');"

# Riavvia backend per avviare subito il loop (il task parte dopo 30s)
docker compose restart backend

# Controlla mailhog http://localhost:8025 se SMTP_HOST=mailhog
```

### Guida utente finale

Questa sezione spiega il flusso dal punto di vista di un cliente Wamply.

#### Il trial gratuito

Ogni nuovo account parte con **14 giorni di prova gratuita** sul piano Professional — il più completo escluso Enterprise. Nessuna carta richiesta per iniziare.

Durante il trial vedrai un banner in alto alla dashboard con i giorni rimanenti. Gli ultimi 3 giorni e l'ultimo giorno riceverai un'email di promemoria.

#### Scegliere un piano

Vai su **Settings → Abbonamento** (`/settings/billing`). Vedrai i tre piani disponibili:

| Piano | Prezzo | Ideale per |
|-------|--------|------------|
| Starter | 49 €/mese | Freelance e piccole attività |
| Professional | 149 €/mese | PMI e agenzie marketing (più scelto) |
| Enterprise | 399 €/mese | Aziende strutturate con team e volumi elevati |

Click **"Scegli questo piano"** → ti reindirizza a Stripe Checkout. Inserisci:

- Carta di credito, debito o SEPA Direct Debit
- Email di fatturazione
- Dati azienda (nome, indirizzo, partita IVA se presente)

Stripe applica automaticamente **3D Secure** quando richiesto dalla tua banca.

Dopo la conferma, torni su Wamply con il piano attivo. La fattura arriva via email da Stripe.

#### Al termine del trial (senza carta)

Se non scegli un piano entro 14 giorni, l'account passa al piano **Free**: tutte le funzioni vengono bloccate, ma i tuoi dati (contatti, template, campagne) rimangono salvati. Puoi scegliere un piano in qualsiasi momento per riattivare tutto esattamente dov'era.

#### Cambiare metodo di pagamento o annullare

*(In arrivo nelle prossime iterazioni tramite Stripe Customer Portal.)*

Nel frattempo, contatta il supporto a <https://agentengineering.it> per:

- Aggiornare la carta di credito
- Scaricare le fatture passate
- Cancellare l'abbonamento
- Passare da mensile a annuale

### Customer Portal (self-service abbonamento)

Il **Billing Portal** di Stripe permette all'utente di gestire in autonomia il proprio abbonamento senza contattare il supporto: cambio piano, cancellazione, aggiornamento carta, download fatture.

**Setup (una tantum, sia test che live):**

1. Dashboard Stripe → **Settings → Billing → Customer portal** → clicca **Activate**.
2. Configura le feature da mostrare agli utenti:
   - ✅ **Invoice history** — sempre abilitato
   - ✅ **Update payment method**
   - ✅ **Cancel subscriptions** → scegli **"At end of billing period"** (coerente con policy Wamply)
   - ✅ **Switch plans** → seleziona i tre Product attivi (Starter, Professional, Enterprise). Abilita **Prorations** (create_prorations).
   - ❌ **Update customer info → email** — disabilitato: email = identity utente, va gestita da Wamply.
   - ✅ **Update billing address** + **Tax ID**
3. Salva.

**Come funziona lato utente:**

- Su `/settings/billing` compare il pulsante **"Gestisci abbonamento"** (visibile solo se la subscription ha un `stripe_subscription_id`, cioè dopo almeno un pagamento).
- Click → l'utente viene reindirizzato al Portal Stripe.
- Qualsiasi modifica fatta nel Portal (upgrade, cancel, aggiornamento carta) triggera eventi `customer.subscription.updated` / `customer.subscription.deleted` che il webhook Wamply già sincronizza in DB (`plan_id`, `status`, `cancel_at_period_end`).
- Al return, l'utente atterra su `/settings/billing?portal=return` con un messaggio di conferma.

**Test locale:** con `stripe listen` attivo, fai un checkout, poi clicca "Gestisci abbonamento", modifica il piano. Il webhook sincronizza automaticamente e la UI aggiorna al prossimo reload.

### Setup produzione

1. Passa dashboard Stripe in **Live mode**, crea le stesse Product+Price con id diversi (`price_...` live).
2. Nel `.env` di produzione metti le chiavi live (`sk_live_...`, `pk_live_...`).
3. Aggiorna `plans.stripe_price_id` nel DB di produzione con gli id live.
4. Configura il webhook endpoint su Stripe: **Developers → Webhooks → Add endpoint** → URL `https://<tuo-dominio>/api/v1/billing/webhook`. Eventi da sottoscrivere:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copia il **Signing secret** del webhook endpoint (inizia con `whsec_...`) in `STRIPE_WEBHOOK_SECRET`.
6. Configura **Dunning** (Settings → Billing → Revenue recovery): abilita Smart Retries, imposta email di sollecito.
7. Attiva il **Customer Portal** anche in Live mode (le feature sono separate tra test e live). Vedi sezione "Customer Portal" sopra.

### Troubleshooting

- **Webhook ritorna 400 "Invalid signature"**: il `STRIPE_WEBHOOK_SECRET` non corrisponde al secret che Stripe CLI o il Dashboard hanno generato. Riprendilo e riavvia il backend.
- **"Plan has no stripe_price_id configured"**: non hai ancora incollato i `price_...` in DB (passo 3).
- **Checkout redirect a `/settings/billing?checkout=cancelled`**: l'utente ha chiuso Stripe senza completare. Nessuna subscription creata.
- **Subscription creata su Stripe ma DB non sincronizzato**: verifica che `stripe listen` sia attivo e che il webhook secret sia corretto. In alternativa `stripe events resend evt_...` rimanda un evento.

---

## Piani e limiti

| | Starter | Professional | Enterprise |
|--|---------|-------------|------------|
| **Prezzo** | 49 €/mese | 149 €/mese | 399 €/mese |
| Campagne/mese | 5 | 20 | Illimitate |
| Contatti | 500 | 5.000 | 50.000 |
| Messaggi AI/mese | 2.500 | 15.000 | 100.000 |
| LLM | Haiku (shared) | Sonnet (shared) | Sonnet + BYOK |
| Team | 1 | 3 | 10 |
| A/B testing | No | Si | Si |
| API access | No | Si | Si |

Il backend enforza i limiti con HTTP 402 quando il piano è esaurito, suggerendo l'upgrade al piano successivo.

---

## Strategia di deploy

| Stadio | Infra | Redis | PostgreSQL |
|--------|-------|-------|------------|
| **Demo/Test** | VPS + Docker Compose | Container redis-stack | Container supabase/postgres |
| **Scale** | Azure Container Apps | Container redis-stack su ACA | Azure DB for PostgreSQL Flexible |
| **Enterprise** | Azure Container Apps | Azure Managed Redis Enterprise | Azure DB for PostgreSQL Flexible |

Stesso codice, stessi container in tutti gli stadi. Solo le connection string cambiano.

---

## Sviluppo locale senza Docker

### Frontend

```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

### Backend

```bash
cd backend
pip install uv && uv pip install --system -e ".[dev]"
uvicorn src.main:app --reload --port 8200
```

### Agent

```bash
cd agent
pip install uv && uv pip install --system -e ".[dev]"
MOCK_LLM=true uvicorn src.main:app --reload --port 8000
```

---

## Licenza

Proprietario — Hevolus Srl / Agent Engineering Studio

## Contatti

- **Giuseppe Zileni** — <giuseppe.zileni@hevolus.it>
- **Web** — <https://agentengineering.it>
