# WhatsApp Campaign Manager

> CMS gestionale SaaS per campagne WhatsApp Business massive con agent AI — Microsoft Agent Framework Python 1.0

## Panoramica

WhatsApp Campaign Manager (WCM) è una piattaforma SaaS che permette a PMI, agenzie marketing e professionisti di creare e lanciare campagne di messaggistica massiva su WhatsApp Business. Un agent AI basato su **Microsoft Agent Framework (MAF) Python 1.0** orchestra l'intero processo: dalla segmentazione dei contatti alla personalizzazione di ogni singolo messaggio tramite **Claude (Anthropic)**, fino all'invio automatizzato via **Meta Cloud API**.

### Differenziatore

A differenza delle soluzioni tradizionali che inviano lo stesso template con variabili statiche, WCM **personalizza ogni messaggio** per ogni destinatario tramite un agent AI che apprende dalle campagne precedenti. Risultato atteso: response rate dal 40% (media settore) al 55-60%.

---

## Stack tecnologico

| Layer | Tecnologia |
|-------|-----------|
| **Frontend** | Next.js 15 (App Router) + React 19 + Tailwind CSS + shadcn/ui |
| **Auth** | Supabase Auth (email/password, magic link, OAuth Google) |
| **Backend API** | Next.js API Routes (Node.js 22) |
| **Agent AI** | Microsoft Agent Framework Python 1.0 + FastAPI |
| **LLM** | Claude Sonnet 4 / Haiku 4.5 via Anthropic API |
| **Database** | Supabase (PostgreSQL 15 + pgvector) |
| **Cache/Queue** | Redis 7 (Upstash in prod, locale in Docker) |
| **Pagamenti** | Stripe Billing (Checkout, Portal, Webhooks) |
| **WhatsApp** | Meta Cloud API v21.0 |
| **Monitoring** | Sentry + OpenTelemetry + Jaeger (dev) |
| **Testing** | Vitest + Playwright (frontend), pytest (agent) |

---

## Prerequisiti

Prima di iniziare, assicurati di avere installato:

- **Docker Desktop** ≥ 4.30 con Docker Compose v2
- **Node.js** ≥ 22 (consigliato: via nvm)
- **Python** ≥ 3.12 (consigliato: via pyenv)
- **Supabase CLI** — `npm install -g supabase`
- **Stripe CLI** — https://docs.stripe.com/stripe-cli
- **Git** ≥ 2.40

Account necessari (free tier sufficiente per sviluppo):

- **Supabase** — https://supabase.com (per le chiavi del progetto)
- **Stripe** — https://dashboard.stripe.com (per test mode)
- **Anthropic** — https://console.anthropic.com (per API Key Claude, opzionale in dev con MOCK_LLM=true)
- **Meta Developer** — https://developers.facebook.com (per WhatsApp Business, opzionale in dev con mock server)

---

## Quick Start

### 1. Clona il repository

```bash
cd C:\Users\GiuseppeZileni\Git
git clone <repo-url> whatsapp-campaign-manager
cd whatsapp-campaign-manager
```

### 2. Configura le variabili d'ambiente

```bash
cp .env.example .env.local
```

Apri `.env.local` e compila almeno:

```env
# Supabase — genera con: npx supabase init
SUPABASE_URL=http://localhost:3001
SUPABASE_ANON_KEY=<generata da supabase init>
SUPABASE_SERVICE_ROLE_KEY=<generata da supabase init>
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres

# Redis
REDIS_URL=redis://localhost:6379

# Agent
AGENT_URL=http://localhost:8000
AGENT_SECRET=dev-secret-cambia-in-produzione

# Claude (opzionale in dev — usa MOCK_LLM=true per sviluppare senza)
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-20250514

# WhatsApp (punta al mock in dev)
WHATSAPP_API_URL=http://localhost:9090
WHATSAPP_PHONE_ID=123456789012345
WHATSAPP_TOKEN=mock-token-dev

# Stripe (test mode)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Encryption (32 bytes per AES-256-GCM — CAMBIA IN PRODUZIONE)
ENCRYPTION_KEY=dev-32-byte-key-change-in-prod!!
```

### 3. Avvia lo stack Docker

```bash
# Stack base (frontend + agent + db + redis)
make up

# Stack completo con debug tools
make up-full

# Stack completo + WhatsApp mock + Stripe CLI
make up-debug
```

### 4. Inizializza il database

```bash
make migrate    # Esegue le 7 migration SQL
make seed       # Popola con dati di esempio
```

### 5. Accedi alla piattaforma

| Servizio | URL | Credenziali dev |
|----------|-----|-----------------|
| **Frontend** | http://localhost:3000 | Registra nuovo utente |
| **Admin** | http://localhost:3000/admin | admin@wcm.local / password |
| **Supabase Studio** | http://localhost:54323 | Nessuna auth in dev |
| **Redis Commander** | http://localhost:8081 | Nessuna auth in dev |
| **WhatsApp Mock UI** | http://localhost:9090 | Nessuna auth |
| **MailHog** | http://localhost:8025 | Nessuna auth |
| **Jaeger UI** | http://localhost:16686 | Nessuna auth |
| **Agent Health** | http://localhost:8000/health | Nessuna auth |

---

## Comandi di sviluppo (Makefile)

```bash
make up              # Avvia stack base
make up-full         # Avvia tutti i servizi
make up-debug        # Aggiunge mock + stripe-cli + jaeger
make down            # Ferma container (mantiene dati)
make reset           # Ferma + cancella volumi + ricrea tutto
make seed            # Popola database con dati di esempio
make migrate         # Esegue migration SQL
make test            # pytest (agent) + vitest (frontend)
make test-e2e        # Playwright end-to-end
make logs agent      # Tail log del container agent
make logs frontend   # Tail log del container frontend
make stripe-listen   # Forward webhook Stripe in locale
make db-studio       # Apre Supabase Studio
```

---

## Architettura

### Diagramma di flusso

```
Utente (Browser)
    │
    ▼
┌─────────────────────────────┐
│  Frontend (Next.js 15)      │
│  Dashboard + Settings +     │
│  Admin Panel                │
│  Porta 3000                 │
└─────────┬───────────────────┘
          │ API Routes (Node.js)
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌────────┐  ┌──────────────┐
│Supabase│  │ Redis Queue  │
│  Auth  │  │  (job queue) │
│  + DB  │  └──────┬───────┘
│  + RT  │         │ BRPOP
└────────┘         ▼
            ┌──────────────────────────────┐
            │  Agent MAF Python 1.0        │
            │  (FastAPI, porta 8000)       │
            │                              │
            │  Sequential Workflow:        │
            │  ┌────────────────────────┐  │
            │  │ 1. CampaignPlanner    │  │
            │  │    (Claude Sonnet)     │  │
            │  ├────────────────────────┤  │
            │  │ 2. MessageComposer    │  │
            │  │    (Claude Sonnet/     │  │
            │  │     Haiku)            │  │
            │  ├────────────────────────┤  │
            │  │ 3. Dispatcher         │  │
            │  │    (Executor, no LLM) │  │
            │  └────────────┬───────────┘  │
            └───────────────┼──────────────┘
                            │
                            ▼
                   Meta Cloud API v21.0
                   (WhatsApp Business)
                            │
                            ▼
                    Destinatario WhatsApp
                            │
                            ▼ webhook
                   Supabase (status update)
                            │
                            ▼ realtime
                   Dashboard (live progress)
```

### Multi-tenancy e isolamento dati

Ogni utente è isolato tramite Row Level Security (RLS) di PostgreSQL. Il campo `user_id` è presente in tutte le tabelle e le policy RLS garantiscono che `user_id = auth.uid()`. L'admin ha una policy separata che permette lettura cross-tenant.

### Controllo abbonamento

Il sistema verifica i limiti del piano su tre livelli:

1. **Middleware API** (`withPlanLimits`) — blocca la creazione di risorse se il limite è raggiunto (HTTP 402)
2. **Database** (`usage_counters`) — contatori incrementali resettati a ogni rinnovo Stripe
3. **Frontend** (`FeatureGate` + `usePlan`) — nasconde/disabilita feature non incluse nel piano

I piani (Starter 49€, Professional 149€, Enterprise 399€) sono definiti nel database con limiti numerici e feature flags JSON. Stripe gestisce il ciclo di vita (pagamento, rinnovo, upgrade/downgrade, cancellazione) tramite webhook.

### Sicurezza

- Token WhatsApp e API Key Claude criptati con **AES-256-GCM** nel database
- JWT Supabase per auth utente, shared secret per auth API→Agent
- RLS su tutte le tabelle, nessun accesso cross-tenant
- Audit trail per ogni azione admin
- Rate limiting API (100 req/min) e WhatsApp (configurabile)

---

## Sviluppo

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev          # Dev server con hot-reload su :3000
npm run build        # Build di produzione
npm run lint         # ESLint
npm run type-check   # TypeScript strict
```

### Agent (Python MAF)

```bash
cd agent
python -m venv .venv
source .venv/bin/activate        # Linux/Mac
# .venv\Scripts\activate         # Windows
pip install -e ".[dev]"
uvicorn src.main:app --reload --port 8000
```

**Debug con VS Code**: il progetto include `.vscode/launch.json` per attach a debugpy sul container agent (porta 5678).

**Mock LLM**: imposta `MOCK_LLM=true` nel `.env` dell'agent per sviluppare senza consumare token Claude. L'agent usa risposte preconfigurate.

### Database

```bash
supabase start                    # Avvia Supabase locale
supabase migration up             # Applica migration
supabase db reset                 # Reset + seed
supabase gen types typescript --local > frontend/src/types/database.ts  # Genera tipi TS
```

---

## Configurazione WhatsApp Business API

Per l'ambiente di **produzione** (non necessario in dev con mock):

1. Crea un'app su [Meta Developer](https://developers.facebook.com)
2. Aggiungi il prodotto "WhatsApp" all'app
3. Registra un numero di telefono business
4. Genera un **System User Token** permanente da Meta Business Manager:
   - Business Manager → Impostazioni → Utenti di sistema → Aggiungi
   - Ruolo: Admin
   - Genera token con permessi: `whatsapp_business_messaging`, `whatsapp_business_management`
5. Annota: **Phone Number ID**, **WABA ID**, **System User Token**
6. Nella dashboard WCM: Impostazioni → WhatsApp → inserisci i dati → Testa connessione

### Limiti Meta

- Numeri nuovi: 250 messaggi/24h
- Dopo verifica business: 1.000 → 10.000 → 100.000 → illimitato
- Messaggi business-initiated richiedono template pre-approvati
- Meta addebita per conversazione (finestra 24h), non per messaggio
- Dal gennaio 2026: vietati bot AI "general purpose", solo task-specific

---

## Configurazione Claude API

Nella dashboard WCM → Impostazioni → AI:

**Modalità Shared (default)**: la piattaforma usa la propria API Key. Il costo LLM è incluso nell'abbonamento. L'utente non deve configurare nulla.

**Modalità BYOK** (solo piano Enterprise): l'utente inserisce la propria API Key Anthropic (`sk-ant-...`). Il costo LLM è a suo carico, il prezzo dell'abbonamento rimane invariato. La chiave viene criptata e mai esposta dopo il salvataggio.

---

## Pannello di Amministrazione

Accessibile su `/admin` con account ruolo `admin`.

### Funzionalità

- **Dashboard**: metriche realtime (utenti, MRR, campagne, coda, costi LLM, uptime)
- **Gestione utenti**: visualizza, cambia piano, sospendi, riattiva, impersona (read-only), resetta contatori, promuovi admin
- **Gestione piani**: crea/modifica/disattiva piani, coupon, sync Stripe
- **Monitoraggio campagne**: coda realtime, pause/cancel, filtri cross-tenant
- **Log agent**: storico esecuzioni MAF, token consumati, errori
- **Audit trail**: ogni azione admin registrata con chi/cosa/quando/IP

### Primo admin

L'utente admin viene creato dal seed SQL (`admin@wcm.local`). Per promuovere un utente esistente:

```sql
UPDATE users SET role = 'admin' WHERE email = 'utente@esempio.com';
```

---

## Struttura Docker per debug locale

### Container

| Container | Porta | Funzione |
|-----------|-------|----------|
| frontend | 3000 | Next.js dev server con hot-reload |
| agent | 8000 (+ 5678 debug) | FastAPI + MAF + queue consumer |
| supabase-db | 5432 | PostgreSQL 15 |
| supabase-auth | 9999 | Auth server |
| supabase-rest | 3001 | PostgREST auto-API |
| supabase-realtime | 4000 | WebSocket (profilo full) |
| supabase-storage | 5000 | File storage (profilo full) |
| redis | 6379 | Cache + queue + rate limiting |
| redis-commander | 8081 | UI Redis (profilo full) |
| mailhog | 1025/8025 | SMTP fake (profilo full) |
| stripe-cli | - | Webhook forward (profilo debug) |
| whatsapp-mock | 9090 | Mock Meta Cloud API (profilo debug) |
| jaeger | 16686 | Tracing UI (override) |

### Profili Docker Compose

```bash
docker compose up                        # Base: frontend + agent + db + redis
docker compose --profile full up         # + realtime, storage, redis-commander, mailhog
docker compose --profile debug up        # + whatsapp-mock, stripe-cli
docker compose --profile agent-only up   # Solo agent + redis + db (debug isolato)
```

### WhatsApp Mock Server

Il mock su porta 9090 replica i principali endpoint Meta:

- `POST /v21.0/:phoneId/messages` — accetta payload, simula rate limiting
- `GET /v21.0/:phoneId/message_templates` — template di esempio
- `GET /v21.0/:phoneId/whatsapp_business_profile` — profilo fittizio
- UI web su `http://localhost:9090` con log realtime dei messaggi

---

## Modello di business

### Piani

| | Starter | Professional | Enterprise |
|--|---------|-------------|------------|
| **Prezzo** | 49 €/mese | 149 €/mese | 399 €/mese |
| Campagne/mese | 5 | 20 | Illimitate |
| Contatti | 500 | 5.000 | 50.000 |
| Messaggi AI/mese | 2.500 | 15.000 | 100.000 |
| LLM | Haiku (shared) | Sonnet (shared) | Sonnet + BYOK |
| Team | 1 | 3 | 10 |
| API access | No | Sì | Sì |
| A/B testing | No | Sì | Sì |
| White-label | No | No | Add-on |

### Costi infrastruttura

| Servizio | Costo/mese |
|----------|-----------|
| Vercel Pro | 20 € |
| Supabase Pro | 25 € |
| Railway (agent) | 15-25 € |
| Upstash Redis | 5-15 € |
| **Totale fisso** | **67-87 €** |

Break-even: 2 utenti Starter.

---

## Deployment in produzione

### Checklist pre-deploy

- [ ] Cambiare `ENCRYPTION_KEY` con chiave random 32 bytes
- [ ] Cambiare `AGENT_SECRET` con secret random
- [ ] Configurare Stripe live mode (chiavi `sk_live_...`)
- [ ] Configurare Meta Business API con numero verificato
- [ ] Abilitare HTTPS su tutti gli endpoint
- [ ] Configurare Sentry per error tracking
- [ ] Configurare backup automatico Supabase
- [ ] Testare flusso completo con numero WhatsApp reale
- [ ] Verificare RLS: un utente non deve vedere dati altrui

### Hosting consigliato

| Componente | Servizio | Note |
|-----------|---------|------|
| Frontend | Vercel | Deploy automatico da Git |
| Agent | Railway / Render | Container always-on, min 1 vCPU |
| Database | Supabase Cloud | Piano Pro per produzione |
| Redis | Upstash | Serverless, pay-per-request |
| DNS | Cloudflare | Protezione DDoS inclusa |

---

## Claude Code

Per costruire il progetto con Claude Code, usa il prompt in `CLAUDE_CODE_PROMPT.md`:

```bash
cd C:\Users\GiuseppeZileni\Git\whatsapp-campaign-manager
claude
# Poi incolla o referenzia il contenuto di CLAUDE_CODE_PROMPT.md
```

Il prompt è strutturato in **8 fasi e 58 file**, ordinati per dipendenza. Claude Code li implementerà nell'ordine corretto.

---

## Licenza

Proprietario — Hevolus Srl / Agent Engineering Studio

---

## Contatti

- **Giuseppe Zileni** — giuseppe.zileni@hevolus.it
- **Web** — https://agentengineering.it
