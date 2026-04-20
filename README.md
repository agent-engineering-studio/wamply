# Wamply — WhatsApp Campaign Manager

> SaaS per campagne WhatsApp Business massive con agent AI conversazionale

## Panoramica

Wamply permette a PMI, agenzie marketing e professionisti di creare e lanciare campagne di messaggistica massiva su WhatsApp Business. Un agent AI basato su **Microsoft Agent Framework** orchestra l'intero processo: dalla segmentazione dei contatti alla personalizzazione di ogni singolo messaggio tramite **Claude (Anthropic)**, fino all'invio automatizzato via **Meta Cloud API**.

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
| **WhatsApp** | Meta Cloud API v21.0 |
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
| **WhatsApp Mock** | 9090 | Meta API mock (profilo debug) |

### Flussi

- **UI classica**: Browser → Kong `/api/v1/*` → Backend (JWT utente)
- **Chat AI**: Browser → Kong `/agent/v1/chat` → Agent (JWT) → Agent chiama Backend via `@tool`
- **Task asincroni**: Backend enqueue su Redis → Agent worker consuma → esegue campagna

### Sicurezza

- JWT Supabase per auth utente, `AGENT_SECRET` per service-to-service
- Row Level Security (RLS) su tutte le tabelle
- Token WhatsApp e API Key criptati con AES-256-GCM
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
| **WhatsApp Mock** | <http://localhost:9090> (profilo debug) |

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
make up-debug        # Aggiunge whatsapp-mock, stripe-cli (profilo debug)
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
│   ├── migrations/            # SQL migrations (001-008)
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
| GET/POST | /settings/whatsapp | Config WhatsApp |
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
| GET/POST | /webhooks/meta | WhatsApp webhook verification + status |
| POST | /billing/webhook | Stripe webhook (checkout, subscription) |

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
