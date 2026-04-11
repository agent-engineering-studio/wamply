# Wamply Backend Extraction — Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Scope:** Extract API routes from Next.js into a standalone Python/FastAPI backend, refactor the agent to use MS Agent Framework memory patterns with Redis Stack, and reduce the frontend to a pure UI layer.

---

## 1. Architecture Overview

Three independent services behind a Kong API gateway:

| Service | Tech | Port | Responsibility |
|---------|------|------|----------------|
| **Frontend** | Next.js 15 | :3000 | UI only — pages, components, chat widget |
| **Backend** | Python FastAPI | :8200 | CRUD, business logic, plan limits, webhooks |
| **Agent** | Python FastAPI | :8000 | Conversational AI, tool-use on backend, memory, campaign worker |
| **Kong** | API Gateway | :8100 | Route: `/api/v1/*` → Backend, `/agent/v1/*` → Agent, `/auth/v1/*` → GoTrue, `/rest/v1/*` → PostgREST |
| **PostgreSQL** | Supabase Postgres 15 | :5432 | Application data + session archive |
| **Redis Stack** | redis/redis-stack | :6379 | Cache, queue, vector search, agent memory |

### Request Flows

**UI (classic CRUD):**
```
Browser → Kong /api/v1/* → Backend (JWT user token)
```

**Chat AI:**
```
Browser → Kong /agent/v1/chat → Agent (JWT user token)
  Agent → @tool → Backend /api/v1/* (AGENT_SECRET + X-On-Behalf-Of: user_id)
```

**Async tasks:**
```
Backend enqueue → Redis queue → Agent worker consumes → Agent uses Backend tools
```

### Authentication Model

- **Browser → Backend:** Supabase JWT in `Authorization: Bearer` header. Backend verifies using `JWT_SECRET` directly (no GoTrue dependency at runtime). Extracts `sub` claim as `user_id`, queries DB for role.
- **Browser → Agent:** Same JWT. Agent extracts user identity for session context.
- **Agent → Backend:** Service-to-service via `X-Agent-Secret` header + `X-On-Behalf-Of: {user_id}`. Backend verifies the secret, then applies all policies (plan limits, RLS) as if the user made the request.

---

## 2. Backend (`backend/`)

New standalone Python/FastAPI project. Replaces all 16 Next.js API routes.

### Directory Structure

```
backend/
├── Dockerfile
├── pyproject.toml
├── src/
│   ├── main.py                    # FastAPI app + lifespan (db pool, redis)
│   ├── config.py                  # Settings (pydantic-settings)
│   ├── dependencies.py            # Shared deps (db pool, redis, current_user)
│   │
│   ├── auth/
│   │   ├── jwt.py                 # Supabase JWT decode + verify (python-jose)
│   │   ├── permissions.py         # Depends: require_admin, require_user
│   │   └── service_auth.py        # AGENT_SECRET + X-On-Behalf-Of verification
│   │
│   ├── api/
│   │   ├── router.py              # Main APIRouter, mounts sub-routers
│   │   ├── contacts.py            # CRUD contacts + import
│   │   ├── campaigns.py           # CRUD campaigns
│   │   ├── templates.py           # CRUD templates
│   │   ├── settings.py            # WhatsApp + AI config
│   │   ├── plan.py                # GET /me/plan
│   │   ├── admin.py               # Admin overview, users, campaigns
│   │   └── webhooks.py            # Meta webhook + Stripe webhook
│   │
│   ├── services/
│   │   ├── plan_limits.py         # Quota check + usage tracking (Redis cache)
│   │   └── encryption.py          # AES-256-GCM encrypt/decrypt
│   │
│   └── db/
│       └── pool.py                # asyncpg connection pool singleton
```

### API Endpoints

All mounted under `/api/v1/` via Kong (strip_path: true, so backend sees `/contacts`, `/campaigns`, etc.)

**CRUD:**
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /contacts | JWT | List contacts (pagination, search, tags filter) |
| POST | /contacts | JWT + plan limit | Create contact |
| GET | /contacts/{id} | JWT | Get single contact |
| PUT | /contacts/{id} | JWT | Update contact |
| POST | /contacts/import | JWT + plan limit | Bulk import (CSV-style batch) |
| GET | /campaigns | JWT | List campaigns (status filter) |
| POST | /campaigns | JWT + plan limit | Create campaign |
| GET | /campaigns/{id} | JWT | Get campaign with template data |
| PUT | /campaigns/{id} | JWT | Update campaign |
| POST | /campaigns/{id}/launch | JWT + plan limit | Enqueue campaign to Redis for agent worker |
| GET | /templates | JWT | List templates |
| POST | /templates | JWT + plan limit | Create template |
| GET | /templates/{id} | JWT | Get template |
| PUT | /templates/{id} | JWT | Update template |
| GET | /me/plan | JWT | Current user plan, usage, subscription |

**Admin (require_admin):**
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /admin/overview | JWT + admin | Dashboard stats (MRR, users, campaigns, plan breakdown) |
| GET | /admin/users | JWT + admin | All users with subscription and usage data |
| GET | /admin/campaigns | JWT + admin | Running/scheduled campaigns across all users |

**Settings:**
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /settings/whatsapp | JWT | Get WhatsApp config |
| POST | /settings/whatsapp | JWT | Update WhatsApp config (encrypts token) |
| GET | /settings/ai | JWT | Get AI config |
| POST | /settings/ai | JWT | Update AI config (encrypts API key if BYOK) |

**Webhooks (no JWT — verified by signature/token):**
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET/POST | /webhooks/meta | Verify token / signature | WhatsApp webhook verification + message status |
| POST | /billing/webhook | Stripe signature | Stripe webhook (checkout, subscription events) |

### Dependencies

```toml
[project]
name = "wcm-backend"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "asyncpg>=0.30",
    "redis[hiredis]>=5.2",
    "cryptography>=44.0",
    "pydantic-settings>=2.7",
    "python-jose[cryptography]>=3.3",
    "httpx>=0.28",
    "structlog>=24.4",
    "python-dotenv>=1.0",
]
```

---

## 3. Agent Refactoring (`agent/`)

The agent is refactored from a procedural campaign runner into a conversational AI assistant following the Microsoft Agent Framework pattern.

### Directory Structure

```
agent/
├── Dockerfile
├── pyproject.toml
├── src/
│   ├── main.py                      # FastAPI app + lifespan
│   ├── config.py                    # Settings
│   │
│   ├── api/
│   │   ├── router.py                # /chat, /sessions, /health
│   │   └── endpoints/
│   │       ├── chat.py              # POST /chat — streaming SSE response
│   │       └── sessions.py          # GET/DELETE /sessions
│   │
│   ├── agent/
│   │   ├── core.py                  # Agent class — orchestrates tools + memory providers
│   │   ├── instructions.py          # System prompt (Italian WhatsApp campaign expert)
│   │   └── session.py               # AgentSession — state dict management
│   │
│   ├── memory/
│   │   ├── history_provider.py      # HistoryProvider — Redis Hash + PG archive
│   │   ├── context_provider.py      # ContextProvider — user facts in Redis JSON
│   │   ├── semantic_memory.py       # SemanticMemory — Redis Vector + Voyage-3
│   │   └── semantic_cache.py        # SemanticCache — LangCache pattern
│   │
│   ├── tools/
│   │   ├── backend_client.py        # HTTP client (AGENT_SECRET + X-On-Behalf-Of)
│   │   ├── contacts_tool.py         # @tool: search, create, import contacts
│   │   ├── campaigns_tool.py        # @tool: create, launch, pause, status campaigns
│   │   ├── templates_tool.py        # @tool: list, create templates
│   │   ├── analytics_tool.py        # @tool: query campaign stats, delivery rates
│   │   └── settings_tool.py         # @tool: read/update WhatsApp and AI config
│   │
│   ├── workflow/
│   │   ├── campaign_runner.py       # 3-stage pipeline (plan → compose → dispatch)
│   │   ├── message_composer.py      # LLM personalization (Claude)
│   │   └── dispatcher.py            # WhatsApp send + rate limiting
│   │
│   └── worker/
│       └── queue_consumer.py        # Redis queue consumer (async campaigns)
```

### Agent Memory Model (3 layers + semantic cache)

**HistoryProvider** — Chat history per session
- Storage: Redis Hash `agent:history:{session_id}` (TTL: 24h for active sessions)
- Archive: PostgreSQL `agent_sessions` table (on session close or TTL expiry)
- `before_run`: loads last N messages from Redis into context
- `after_run`: appends new messages to Redis Hash

**ContextProvider** — User preferences and facts
- Storage: Redis JSON `agent:ctx:{user_id}` (persistent, no TTL)
- Backup: PostgreSQL `agent_memory` table
- `before_run`: injects user context into system prompt (name, preferred tone, language, business info)
- `after_run`: extracts new facts from conversation ("user prefers formal tone", "company is in fashion industry")

**SemanticMemory** — Embedding-based retrieval
- Storage: Redis Vector index `agent:vec:{user_id}`
- Embeddings: Voyage-3 (Anthropic/Voyage AI)
- Index: HNSW, cosine similarity
- `before_run`: embeds current query, searches top-K similar past interactions, injects as context
- `after_run`: embeds conversation summary, stores in vector index

**SemanticCache** — LangCache pattern for cost reduction
- Flow: embed user question → search similar cached Q&A → hit (similarity > threshold)? return cached response → miss? call Claude → cache response with embedding
- Reduces Anthropic API costs for recurring questions

### Tools (Backend API wrappers)

Each tool is a Python function that wraps a backend API call. The `@tool` pattern is inspired by the MS Agent Framework but implemented using Anthropic's native tool-use API (since we use Claude, not Azure OpenAI). Tools are registered with the Claude client as function definitions and called automatically during chat:

```python
@tool(approval_mode="never_require")
async def search_contacts(
    query: Annotated[str, Field(description="Search by name or phone")],
    tags: Annotated[list[str] | None, Field(description="Filter by tags")] = None,
) -> str:
    """Search contacts in the user's address book."""
    response = await backend_client.get("/contacts", params={"q": query, "tags": tags})
    return format_contacts(response.json())
```

**`backend_client.py`** adds auth headers automatically:
```python
headers = {
    "X-Agent-Secret": settings.agent_secret,
    "X-On-Behalf-Of": current_user_id,  # from session context
}
```

### Chat Endpoint

```
POST /agent/v1/chat
Authorization: Bearer {jwt}
Content-Type: application/json

{
  "message": "Crea una campagna per i clienti VIP",
  "session_id": "uuid"  // optional, creates new if omitted
}

Response: text/event-stream (SSE)
data: {"type": "text", "content": "Cerco i contatti VIP..."}
data: {"type": "tool_call", "name": "search_contacts", "args": {"tags": ["vip"]}}
data: {"type": "tool_result", "name": "search_contacts", "result": "Found 847 contacts"}
data: {"type": "text", "content": "Ho trovato 847 contatti VIP. Quale template vuoi usare?"}
data: {"type": "done", "session_id": "uuid"}
```

### Agent Dependencies (updated)

```toml
[project]
name = "wcm-agent"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "httpx>=0.28",
    "asyncpg>=0.30",
    "redis[hiredis]>=5.2",
    "redisvl>=0.4",              # Redis Vector Library
    "cryptography>=44.0",
    "structlog>=24.4",
    "pydantic-settings>=2.7",
    "python-dotenv>=1.0",
    "anthropic>=0.52",           # Claude API
    "voyageai>=0.3",             # Voyage-3 embeddings
    "sse-starlette>=2.0",        # Server-Sent Events
]
```

---

## 4. Frontend Refactoring (`frontend/`)

The frontend becomes a pure UI layer with zero API routes.

### Removed

- `src/app/api/` — entire directory (16 API routes)
- `src/middleware/withAuth.ts`, `withAdminRole.ts`, `withPlanLimits.ts` — auth/policy logic moves to backend
- `src/lib/supabase/admin.ts` — no service role in frontend
- `src/lib/redis.ts` — frontend no longer talks to Redis
- `src/lib/encryption.ts` — frontend no longer encrypts/decrypts

### Added

```
frontend/src/
├── lib/
│   ├── api-client.ts         # Fetch wrapper for Kong /api/v1/* (JWT in Authorization header)
│   └── agent-client.ts       # Streaming fetch for Kong /agent/v1/chat (SSE)
│
├── components/
│   └── chat/
│       ├── ChatWidget.tsx     # Floating chat panel (open/close toggle)
│       ├── ChatMessages.tsx   # Message list (user + agent bubbles)
│       ├── ChatInput.tsx      # Text input + send button
│       └── ChatBubble.tsx     # Single message with markdown rendering
│
├── hooks/
│   └── useChat.ts            # Hook for streaming chat with agent
```

### `api-client.ts` Pattern

```typescript
export function createApiClient(session: Session) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; // Kong gateway
  return {
    get: (path: string) => fetch(`${baseUrl}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${session.access_token}` }
    }).then(r => r.json()),
    post: (path: string, body: unknown) => fetch(`${baseUrl}/api/v1${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }).then(r => r.json()),
  }
}
```

### SWR Migration

All SWR hooks change from `/api/*` to the api-client:

```typescript
// Before
const { data } = useSWR('/api/me/plan', fetcher)

// After
const { data } = useSWR('/api/v1/me/plan', apiFetcher)
```

### Middleware Simplification

`middleware.ts` retains only SSR auth redirect logic:
- `getUser()` via GoTrue (Kong internal URL) to check if authenticated
- Redirect unauthenticated users from protected routes to `/login`
- Redirect authenticated users from `/` to `/dashboard`
- No more admin role check in middleware (backend enforces it)

---

## 5. Database Migrations

### Migration 010: Agent Sessions Table

```sql
CREATE TABLE agent_sessions (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    title       text,
    messages    jsonb       DEFAULT '[]',
    metadata    jsonb       DEFAULT '{}',
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_agent_sessions_user ON agent_sessions (user_id, updated_at DESC);

CREATE TRIGGER trg_agent_sessions_updated_at
    BEFORE UPDATE ON agent_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Extend agent_memory with embedding reference
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS embedding_key text;

-- Enable pgcrypto for backend JWT verification (if not already)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

### Redis Data Structures

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `agent:history:{session_id}` | Hash | 24h | Chat messages (field per message index) |
| `agent:ctx:{user_id}` | JSON | none | User context/preferences |
| `agent:vec:{user_id}` | Vector (HNSW) | none | Semantic embeddings (Voyage-3) |
| `cache:semantic:{hash}` | JSON | 1h | Semantic cache (LangCache) |
| `plan:{user_id}` | String | 5min | Plan limits cache (existing) |
| `campaign:{campaign_id}:state` | String | none | Campaign workflow state (existing) |
| `campaign:{campaign_id}:progress` | Hash | none | Campaign progress (existing) |
| `campaigns` | List | none | Campaign job queue (existing) |

---

## 6. Docker Compose Changes

### New Services

```yaml
backend:
  container_name: wcm-backend
  build: ./backend
  ports: ["8200:8200"]
  environment:
    DATABASE_URL, REDIS_URL, JWT_SECRET,
    SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY,
    AGENT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
  depends_on: [supabase-db, redis]
```

### Modified Services

| Service | Change |
|---------|--------|
| `redis` | Image: `redis:7-alpine` → `redis/redis-stack:latest`. Add port 8001 (RedisInsight) |
| `redis-commander` | Removed — replaced by RedisInsight (included in Redis Stack on :8001) |
| `supabase-kong` | Add routes: `/api/v1/` → backend:8200, `/agent/v1/` → agent:8000 |
| `frontend` | Remove env vars: `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `ENCRYPTION_KEY`, `AGENT_URL`, `AGENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `agent` | Add env vars: `BACKEND_INTERNAL_URL=http://backend:8200`, `VOYAGE_API_KEY`. Remove direct DB query endpoints. |

### Environment Variables

| Variable | Frontend | Backend | Agent |
|----------|----------|---------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | — | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | — | — |
| `SUPABASE_INTERNAL_URL` | yes (middleware) | — | — |
| `JWT_SECRET` | — | yes | — |
| `SUPABASE_SERVICE_ROLE_KEY` | — | yes | — |
| `DATABASE_URL` | — | yes | yes |
| `REDIS_URL` | — | yes | yes |
| `ENCRYPTION_KEY` | — | yes | yes |
| `AGENT_SECRET` | — | yes | yes |
| `STRIPE_SECRET_KEY` | — | yes | — |
| `STRIPE_WEBHOOK_SECRET` | — | yes | — |
| `ANTHROPIC_API_KEY` | — | — | yes |
| `CLAUDE_MODEL` | — | — | yes |
| `VOYAGE_API_KEY` | — | — | yes |
| `BACKEND_INTERNAL_URL` | — | — | yes |
| `WHATSAPP_API_URL` | — | — | yes |

---

## 7. Deployment Strategy

Three stages of growth, same codebase and containers:

### Stage 1: Demo/Test (VPS per client)

Each demo/test client gets a dedicated VPS with the full Docker Compose stack.

```
VPS (e.g. Hetzner CX32 ~€15/month)
├── wcm-frontend        (Next.js :3000)
├── wcm-backend         (FastAPI :8200)
├── wcm-agent           (FastAPI :8000)
├── wcm-supabase-kong   (Kong :8100)
├── wcm-supabase-db     (PostgreSQL :5432 + volume)
├── wcm-supabase-auth   (GoTrue :9999)
├── wcm-supabase-rest   (PostgREST :3001)
└── wcm-redis           (Redis Stack :6379 + AOF persistence + volume)
```

**Deploy:** `docker compose up -d` + `make seed`
**Backup:** Automated pg_dump cron + Redis AOF on persistent volume
**SSL:** Caddy or nginx-proxy with Let's Encrypt in front of Kong
**Cost:** ~€15-30/month per client VPS

### Stage 2: Scale (Azure Container Apps)

When client volume grows, move all containers to Azure Container Apps (ACA). Each container becomes a scalable ACA app.

```
Azure Container Apps Environment
├── frontend          (ACA, min 1 replica, scale on HTTP)
├── backend           (ACA, min 1 replica, scale on HTTP)
├── agent             (ACA, min 1 replica, scale on HTTP + queue)
├── kong              (ACA, min 1 replica, ingress)
├── supabase-auth     (ACA, min 1 replica)
├── supabase-rest     (ACA, min 1 replica)
├── redis-stack       (ACA, min 1 replica, persistent volume)
└── PostgreSQL        → Azure Database for PostgreSQL Flexible Server
```

**Key changes vs Stage 1:**
- PostgreSQL moves to Azure managed (automatic backups, HA, scaling)
- Redis Stack stays as container on ACA with persistent Azure Files volume
- Same Docker images, same environment variables — only connection strings change
- Kong ingress gets Azure Front Door / Application Gateway for SSL + CDN
- Azure Container Registry (ACR) for private image storage

**Cost estimate:** ~€80-150/month (ACA consumption + PostgreSQL Flexible Basic + storage)

### Stage 3: Enterprise (Azure Managed Services)

When revenue justifies the cost, upgrade Redis to managed service:

```
Azure Container Apps Environment
├── frontend, backend, agent, kong, auth, rest  (ACA — same as Stage 2)
├── Redis             → Azure Managed Redis Enterprise (modules: Vector Search, JSON, Search)
└── PostgreSQL        → Azure Database for PostgreSQL Flexible Server (same as Stage 2)
```

**Key changes vs Stage 2:**
- Redis container replaced by Azure Managed Redis Enterprise (~$200/month)
- Gains: 99.999% SLA, active-active geo-replication, managed backups, auto-scaling
- Application code change: only `REDIS_URL` connection string — zero code changes

**Cost estimate:** ~€300-500/month (ACA + PostgreSQL Flexible + Redis Enterprise)

### What stays constant across all stages

| Component | Same everywhere |
|-----------|----------------|
| Docker images | Identical Dockerfiles, same `docker compose build` output |
| Application code | Zero code changes between stages |
| Redis features | Vector Search, JSON, Search modules available in all 3 stages |
| Environment variables | Same variable names, different values (connection strings) |
| Kong routing | Same `kong.yml` configuration |
| API contracts | Same endpoints, same auth model |

### Stage-specific configuration

Configuration differences are isolated to environment variables:

```env
# Stage 1 (VPS)
DATABASE_URL=postgresql://supabase_admin:postgres@supabase-db:5432/postgres
REDIS_URL=redis://redis:6379

# Stage 2 (Azure Container Apps)
DATABASE_URL=postgresql://wamply:***@wamply-db.postgres.database.azure.com:5432/postgres?sslmode=require
REDIS_URL=redis://redis-stack:6379  # still container, on ACA

# Stage 3 (Azure Managed)
DATABASE_URL=postgresql://wamply:***@wamply-db.postgres.database.azure.com:5432/postgres?sslmode=require
REDIS_URL=rediss://wamply-redis.eastus.redis.azure.net:6380  # managed Redis Enterprise
```

---

## 8. Implementation Strategy

The extraction is done incrementally to avoid a big-bang migration:

1. **Phase 1: Backend scaffold** — Create `backend/` project, implement auth (JWT + service auth), and port 2-3 simple endpoints (contacts, me/plan). Test via Kong.
2. **Phase 2: Complete backend** — Port all remaining endpoints (campaigns, templates, settings, admin, webhooks). Keep frontend API routes working in parallel.
3. **Phase 3: Frontend migration** — Create `api-client.ts`, migrate SWR hooks to use Kong/backend. Remove old API routes one by one.
4. **Phase 4: Agent refactoring** — Implement memory providers (HistoryProvider, ContextProvider, SemanticMemory). Add tools as backend API wrappers. Create chat endpoint.
5. **Phase 5: Chat widget** — Build frontend chat components. Integrate streaming SSE. Test dual-mode (UI + chat).
6. **Phase 6: Redis Stack migration** — Switch from `redis:7-alpine` to `redis/redis-stack`. Implement vector indexes, semantic cache. Migrate agent memory from PostgreSQL to Redis.
7. **Phase 7: Cleanup** — Remove all unused frontend code (old API routes, middleware wrappers, lib utilities). Update Makefile, documentation, .env files.
