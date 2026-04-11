# Phase 1 — Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the complete development infrastructure for WhatsApp Campaign Manager (WCM) — Docker services, environment config, build tooling, and database schema with seed-ready migrations.

**Architecture:** Multi-container Docker Compose stack with Next.js frontend, Python FastAPI agent, self-hosted Supabase (PostgreSQL + Auth + REST + Realtime + Storage), Redis, and dev tooling (mailhog, stripe-cli, whatsapp-mock). Database schema uses 4 migrations covering users/auth config, contacts/templates, campaigns/messages, and plans/subscriptions. All tables use UUIDs, timestamptz, and are RLS-ready.

**Tech Stack:** Docker Compose, PostgreSQL 15, Redis 7, Node.js 22, Python 3.12, Supabase self-hosted, Make

---

## File Structure

| File | Responsibility |
|------|---------------|
| `.gitignore` | Ignore node_modules, __pycache__, .env, volumes, build artifacts |
| `docker-compose.yml` | All service definitions, networks, volumes, profiles |
| `docker-compose.override.yml` | Dev-only: debugpy, jaeger, mock LLM |
| `.env.example` | Documented template of all required env vars |
| `Makefile` | Dev workflow commands (up, down, reset, test, seed, logs, etc.) |
| `supabase/config.toml` | Supabase local dev configuration |
| `supabase/migrations/001_initial_schema.sql` | users, whatsapp_config, ai_config tables |
| `supabase/migrations/002_contacts_templates.sql` | contacts, templates tables with indexes |
| `supabase/migrations/003_campaigns_messages.sql` | campaigns, messages tables with status enums |
| `supabase/migrations/004_plans_subscriptions.sql` | plans (with seed data), subscriptions, usage_counters |

---

### Task 1: Create .gitignore

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create .gitignore**

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Build
.next/
out/
dist/
build/

# Python
__pycache__/
*.py[cod]
*$py.class
*.egg-info/
.eggs/
*.egg
.venv/
venv/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Docker volumes
supabase-data/
redis-data/

# Testing
coverage/
htmlcov/
.pytest_cache/
.vitest/

# Misc
*.log
.vercel
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add .gitignore"
```

---

### Task 2: Create docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
name: wcm

services:
  # ── Frontend ────────────────────────────────────────────
  frontend:
    image: node:22-alpine
    working_dir: /app
    command: sh -c "npm install && npm run dev"
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - frontend_node_modules:/app/node_modules
    environment:
      - NODE_ENV=development
      - NEXT_TELEMETRY_DISABLED=1
      - SUPABASE_URL=${SUPABASE_URL:-http://localhost:3001}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - AGENT_URL=${AGENT_URL:-http://agent:8000}
      - AGENT_SECRET=${AGENT_SECRET}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - REDIS_URL=${REDIS_URL:-redis://redis:6379}
    depends_on:
      supabase-db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - wcm-network

  # ── Agent AI ────────────────────────────────────────────
  agent:
    build:
      context: ./agent
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - ./agent:/app
    environment:
      - PYTHONUNBUFFERED=1
      - DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@supabase-db:5432/postgres}
      - REDIS_URL=${REDIS_URL:-redis://redis:6379}
      - SUPABASE_URL=${SUPABASE_URL:-http://supabase-rest:3001}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - CLAUDE_MODEL=${CLAUDE_MODEL:-claude-sonnet-4-20250514}
      - WHATSAPP_API_URL=${WHATSAPP_API_URL:-http://whatsapp-mock:9090}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - AGENT_SECRET=${AGENT_SECRET}
    depends_on:
      supabase-db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - wcm-network

  # ── Supabase PostgreSQL ─────────────────────────────────
  supabase-db:
    image: supabase/postgres:15.8.1.060
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: postgres
    volumes:
      - supabase-data:/var/lib/postgresql/data
      - ./supabase/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - wcm-network

  # ── Supabase Auth (GoTrue) ─────────────────────────────
  supabase-auth:
    image: supabase/gotrue:v2.170.0
    ports:
      - "9999:9999"
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      API_EXTERNAL_URL: ${API_EXTERNAL_URL:-http://localhost:9999}
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-postgres}@supabase-db:5432/postgres?search_path=auth
      GOTRUE_SITE_URL: ${SITE_URL:-http://localhost:3000}
      GOTRUE_URI_ALLOW_LIST: ${ADDITIONAL_REDIRECT_URLS:-}
      GOTRUE_DISABLE_SIGNUP: "false"
      GOTRUE_JWT_ADMIN_ROLES: service_role
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_EXP: 3600
      GOTRUE_JWT_SECRET: ${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true"
      GOTRUE_MAILER_AUTOCONFIRM: "true"
      GOTRUE_SMTP_HOST: ${SMTP_HOST:-mailhog}
      GOTRUE_SMTP_PORT: ${SMTP_PORT:-1025}
      GOTRUE_SMTP_ADMIN_EMAIL: ${SMTP_ADMIN_EMAIL:-admin@wcm.local}
      GOTRUE_SMTP_MAX_FREQUENCY: 1s
      GOTRUE_EXTERNAL_GOOGLE_ENABLED: ${ENABLE_GOOGLE_AUTH:-false}
      GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOTRUE_EXTERNAL_GOOGLE_SECRET: ${GOOGLE_CLIENT_SECRET:-}
      GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: ${API_EXTERNAL_URL:-http://localhost:9999}/callback
    depends_on:
      supabase-db:
        condition: service_healthy
    networks:
      - wcm-network

  # ── Supabase REST (PostgREST) ───────────────────────────
  supabase-rest:
    image: postgrest/postgrest:v12.2.8
    ports:
      - "3001:3000"
    environment:
      PGRST_DB_URI: postgresql://postgres:${POSTGRES_PASSWORD:-postgres}@supabase-db:5432/postgres
      PGRST_DB_SCHEMAS: public,storage
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}
      PGRST_DB_USE_LEGACY_GUCS: "false"
    depends_on:
      supabase-db:
        condition: service_healthy
    networks:
      - wcm-network

  # ── Supabase Realtime ───────────────────────────────────
  supabase-realtime:
    image: supabase/realtime:v2.34.47
    ports:
      - "4000:4000"
    environment:
      PORT: 4000
      DB_HOST: supabase-db
      DB_PORT: 5432
      DB_USER: postgres
      DB_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      DB_NAME: postgres
      DB_AFTER_CONNECT_QUERY: "SET search_path TO _realtime"
      DB_ENC: "false"
      API_JWT_SECRET: ${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}
      SECRET_KEY_BASE: ${SECRET_KEY_BASE:-UpNVntn3cDxHJpq99YMc1T1AQgQpc8kfYTuRgBiYa15BLrx8etQoXz3gZv1/u2oq}
      ERL_AFLAGS: -proto_dist inet_tcp
      ENABLE_TAILSCALE: "false"
      DNS_NODES: "''"
    depends_on:
      supabase-db:
        condition: service_healthy
    profiles:
      - full
    networks:
      - wcm-network

  # ── Supabase Storage ────────────────────────────────────
  supabase-storage:
    image: supabase/storage-api:v1.14.7
    ports:
      - "5000:5000"
    environment:
      ANON_KEY: ${SUPABASE_ANON_KEY}
      SERVICE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      POSTGREST_URL: http://supabase-rest:3000
      PGRST_JWT_SECRET: ${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-postgres}@supabase-db:5432/postgres
      FILE_SIZE_LIMIT: 52428800
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      TENANT_ID: stub
      REGION: stub
      GLOBAL_S3_BUCKET: stub
    volumes:
      - storage-data:/var/lib/storage
    depends_on:
      supabase-db:
        condition: service_healthy
      supabase-rest:
        condition: service_started
    profiles:
      - full
    networks:
      - wcm-network

  # ── Redis ───────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - wcm-network

  # ── Redis Commander (dev UI) ────────────────────────────
  redis-commander:
    image: rediscommander/redis-commander:latest
    ports:
      - "8081:8081"
    environment:
      REDIS_HOSTS: local:redis:6379
    depends_on:
      redis:
        condition: service_healthy
    profiles:
      - full
    networks:
      - wcm-network

  # ── Mailhog (dev email) ────────────────────────────────
  mailhog:
    image: mailhog/mailhog:latest
    ports:
      - "1025:1025"
      - "8025:8025"
    profiles:
      - full
    networks:
      - wcm-network

  # ── Stripe CLI (webhook forwarding) ────────────────────
  stripe-cli:
    image: stripe/stripe-cli:latest
    command: listen --forward-to http://frontend:3000/api/billing/webhook --api-key ${STRIPE_SECRET_KEY}
    depends_on:
      - frontend
    profiles:
      - debug
    networks:
      - wcm-network

  # ── WhatsApp Mock Server ────────────────────────────────
  whatsapp-mock:
    build:
      context: ./mock/whatsapp-mock
      dockerfile: Dockerfile
    ports:
      - "9090:9090"
    profiles:
      - debug
    networks:
      - wcm-network

volumes:
  supabase-data:
  redis-data:
  storage-data:
  frontend_node_modules:

networks:
  wcm-network:
    driver: bridge
```

- [ ] **Step 2: Validate YAML syntax**

Run: `docker compose config --quiet 2>&1 || echo "YAML syntax error"`

Expected: no output (valid YAML) — note: will warn about missing .env vars, that's OK at this stage.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose.yml with all WCM services"
```

---

### Task 3: Create docker-compose.override.yml

**Files:**
- Create: `docker-compose.override.yml`

- [ ] **Step 1: Create docker-compose.override.yml**

```yaml
services:
  agent:
    ports:
      - "5678:5678"
    environment:
      - MOCK_LLM=true
      - DEBUGPY_PORT=5678
    command: >
      sh -c "pip install debugpy &&
             python -m debugpy --listen 0.0.0.0:5678 --wait-for-client -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload"
    depends_on:
      supabase-db:
        condition: service_healthy
      redis:
        condition: service_healthy
      jaeger:
        condition: service_started

  jaeger:
    image: jaegertracing/all-in-one:1.62
    ports:
      - "16686:16686"
      - "4317:4317"
    environment:
      - COLLECTOR_OTLP_ENABLED=true
    networks:
      - wcm-network
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.override.yml
git commit -m "feat: add docker-compose.override.yml with debugpy and jaeger"
```

---

### Task 4: Create .env.example

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create .env.example**

```env
# ── Supabase ──────────────────────────────────────────────
SUPABASE_URL=http://localhost:3001
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
DATABASE_URL=postgresql://postgres:postgres@supabase-db:5432/postgres
POSTGRES_PASSWORD=postgres

# ── Redis ─────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ── Agent ─────────────────────────────────────────────────
AGENT_URL=http://agent:8000
AGENT_SECRET=dev-agent-secret-change-in-production

# ── Claude / Anthropic ────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-xxxxx
CLAUDE_MODEL=claude-sonnet-4-20250514

# ── WhatsApp (Meta Cloud API v21.0) ──────────────────────
WHATSAPP_API_URL=http://whatsapp-mock:9090
WHATSAPP_PHONE_ID=123456789
WHATSAPP_TOKEN=mock-whatsapp-token

# ── Stripe ────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRICE_STARTER=price_starter_xxxxx
STRIPE_PRICE_PRO=price_pro_xxxxx
STRIPE_PRICE_ENTERPRISE=price_enterprise_xxxxx

# ── Encryption ────────────────────────────────────────────
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef

# ── Auth (optional) ──────────────────────────────────────
SITE_URL=http://localhost:3000
API_EXTERNAL_URL=http://localhost:9999
ENABLE_GOOGLE_AUTH=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ── Mail (dev) ────────────────────────────────────────────
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_ADMIN_EMAIL=admin@wcm.local
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "feat: add .env.example with all required environment variables"
```

---

### Task 5: Create Makefile

**Files:**
- Create: `Makefile`

- [ ] **Step 1: Create Makefile**

```makefile
.PHONY: up up-full up-debug down reset seed test test-e2e logs migrate stripe-listen db-studio agent-only

# ── Docker Compose ────────────────────────────────────────

up:
	docker compose up -d

up-full:
	docker compose --profile full up -d

up-debug:
	docker compose --profile debug up -d

down:
	docker compose down

reset:
	docker compose down -v
	docker compose up -d

agent-only:
	docker compose --profile agent-only up -d agent supabase-db redis

# ── Database ──────────────────────────────────────────────

seed:
	docker compose exec supabase-db psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/seed.sql

migrate:
	@for f in supabase/migrations/*.sql; do \
		echo "Running $$f..."; \
		docker compose exec -T supabase-db psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/$$(basename $$f); \
	done

db-studio:
	@echo "Supabase Studio is not included in self-hosted. Use pgAdmin or connect directly:"
	@echo "  psql postgresql://postgres:postgres@localhost:5432/postgres"

# ── Testing ───────────────────────────────────────────────

test:
	cd frontend && npm run test 2>/dev/null || true
	cd agent && python -m pytest tests/ -v 2>/dev/null || true

test-e2e:
	cd frontend && npx playwright test

# ── Logs ──────────────────────────────────────────────────

logs:
	docker compose logs -f

logs-agent:
	docker compose logs -f agent

logs-frontend:
	docker compose logs -f frontend

# ── Stripe ────────────────────────────────────────────────

stripe-listen:
	stripe listen --forward-to localhost:3000/api/billing/webhook

# ── Utilities ─────────────────────────────────────────────

env:
	@test -f .env || cp .env.example .env
	@echo ".env file ready"

clean:
	docker compose down -v --remove-orphans
	rm -rf frontend/node_modules frontend/.next agent/.venv agent/__pycache__
```

- [ ] **Step 2: Verify Makefile syntax**

Run: `make -n up 2>&1 | head -5`

Expected: prints the command that would run (`docker compose up -d`)

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "feat: add Makefile with dev workflow commands"
```

---

### Task 6: Create supabase/config.toml

**Files:**
- Create: `supabase/config.toml`

- [ ] **Step 1: Create supabase/config.toml**

```toml
[project]
id = "wcm-local"

[api]
port = 3001
schemas = ["public", "storage"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 5432
major_version = 15

[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/callback"]
jwt_expiry = 3600
enable_signup = true

[auth.email]
enable_signup = true
double_confirm_changes = false
enable_confirmations = false

[auth.external.google]
enabled = false
client_id = ""
secret = ""
redirect_uri = "http://localhost:9999/callback"
```

- [ ] **Step 2: Commit**

```bash
git add supabase/config.toml
git commit -m "feat: add supabase/config.toml for local development"
```

---

### Task 7: Create migration 001_initial_schema.sql

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 001_initial_schema.sql
-- Users, WhatsApp config, AI config

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- ── Enums ────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('user', 'admin');

-- ── Users ────────────────────────────────────────────────

CREATE TABLE users (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email      text        UNIQUE NOT NULL,
    role       user_role   DEFAULT 'user',
    full_name  text,
    avatar_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ── WhatsApp Configuration (per user) ────────────────────

CREATE TABLE whatsapp_config (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid        REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    phone_number_id      text,
    waba_id              text,
    encrypted_token      bytea,
    webhook_verify_token text        DEFAULT encode(gen_random_bytes(32), 'hex'),
    business_name        text,
    default_language     text        DEFAULT 'it',
    verified             boolean     DEFAULT false,
    created_at           timestamptz DEFAULT now(),
    updated_at           timestamptz DEFAULT now()
);

-- ── AI Configuration (per user) ──────────────────────────

CREATE TABLE ai_config (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid        REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    mode              text        DEFAULT 'shared' CHECK (mode IN ('shared', 'byok')),
    encrypted_api_key bytea,
    model             text        DEFAULT 'claude-haiku-4-5-20251001',
    temperature       numeric(3,2) DEFAULT 0.7,
    max_tokens        integer     DEFAULT 500,
    created_at        timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now()
);

-- ── Updated_at trigger ───────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_whatsapp_config_updated_at
    BEFORE UPDATE ON whatsapp_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ai_config_updated_at
    BEFORE UPDATE ON ai_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Validate SQL syntax**

Run: `docker compose exec -T supabase-db psql -U postgres -d postgres -c "\i /docker-entrypoint-initdb.d/001_initial_schema.sql"` (only works once DB is running — defer to integration test)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/001_initial_schema.sql
git commit -m "feat: add migration 001 — users, whatsapp_config, ai_config"
```

---

### Task 8: Create migration 002_contacts_templates.sql

**Files:**
- Create: `supabase/migrations/002_contacts_templates.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 002_contacts_templates.sql
-- Contacts and message templates

-- ── Contacts ─────────────────────────────────────────────

CREATE TABLE contacts (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    phone       text        NOT NULL,
    name        text,
    email       text,
    language    text        DEFAULT 'it',
    tags        text[]      DEFAULT '{}',
    opt_in      boolean     DEFAULT false,
    opt_in_date timestamptz,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now(),
    UNIQUE(user_id, phone)
);

CREATE INDEX idx_contacts_user_tags ON contacts USING GIN (tags);
CREATE INDEX idx_contacts_user_id ON contacts (user_id);

-- ── Template Category Enum ───────────────────────────────

CREATE TYPE template_category AS ENUM ('marketing', 'utility', 'authentication');

-- ── Templates ────────────────────────────────────────────

CREATE TABLE templates (
    id               uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid              REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    meta_template_id text,
    name             text              NOT NULL,
    language         text              DEFAULT 'it',
    category         template_category DEFAULT 'marketing',
    components       jsonb             DEFAULT '[]',
    status           text              DEFAULT 'approved',
    created_at       timestamptz       DEFAULT now(),
    updated_at       timestamptz       DEFAULT now()
);

CREATE INDEX idx_templates_user_id ON templates (user_id);

-- ── Triggers ─────────────────────────────────────────────

CREATE TRIGGER trg_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_templates_updated_at
    BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/002_contacts_templates.sql
git commit -m "feat: add migration 002 — contacts, templates"
```

---

### Task 9: Create migration 003_campaigns_messages.sql

**Files:**
- Create: `supabase/migrations/003_campaigns_messages.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 003_campaigns_messages.sql
-- Campaigns and individual messages

-- ── Campaign Status Enum ─────────────────────────────────

CREATE TYPE campaign_status AS ENUM (
    'draft', 'scheduled', 'running', 'paused', 'completed', 'failed'
);

-- ── Campaigns ────────────────────────────────────────────

CREATE TABLE campaigns (
    id            uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid            REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name          text            NOT NULL,
    template_id   uuid            REFERENCES templates(id),
    segment_query jsonb           DEFAULT '{}',
    status        campaign_status DEFAULT 'draft',
    scheduled_at  timestamptz,
    started_at    timestamptz,
    completed_at  timestamptz,
    stats         jsonb           DEFAULT '{"total":0,"sent":0,"delivered":0,"read":0,"failed":0}',
    created_at    timestamptz     DEFAULT now(),
    updated_at    timestamptz     DEFAULT now()
);

CREATE INDEX idx_campaigns_user_id ON campaigns (user_id);
CREATE INDEX idx_campaigns_status ON campaigns (status);

-- ── Message Status Enum ──────────────────────────────────

CREATE TYPE message_status AS ENUM (
    'pending', 'sent', 'delivered', 'read', 'failed'
);

-- ── Messages ─────────────────────────────────────────────

CREATE TABLE messages (
    id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id       uuid           REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
    contact_id        uuid           REFERENCES contacts(id) NOT NULL,
    wamid             text,
    status            message_status DEFAULT 'pending',
    personalized_text text,
    error             text,
    sent_at           timestamptz,
    delivered_at      timestamptz,
    read_at           timestamptz,
    created_at        timestamptz    DEFAULT now()
);

CREATE INDEX idx_messages_campaign_status ON messages (campaign_id, status);
CREATE INDEX idx_messages_wamid ON messages (wamid);

-- ── Triggers ─────────────────────────────────────────────

CREATE TRIGGER trg_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/003_campaigns_messages.sql
git commit -m "feat: add migration 003 — campaigns, messages"
```

---

### Task 10: Create migration 004_plans_subscriptions.sql

**Files:**
- Create: `supabase/migrations/004_plans_subscriptions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 004_plans_subscriptions.sql
-- Plans (with seed data), subscriptions, usage counters

-- ── Plans ────────────────────────────────────────────────

CREATE TABLE plans (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text        UNIQUE NOT NULL,
    slug                text        UNIQUE NOT NULL,
    price_cents         integer     NOT NULL,
    stripe_price_id     text,
    max_campaigns_month integer     NOT NULL,
    max_contacts        integer     NOT NULL,
    max_messages_month  integer     NOT NULL,
    max_templates       integer     NOT NULL,
    max_team_members    integer     DEFAULT 1,
    llm_model           text        DEFAULT 'claude-haiku-4-5-20251001',
    features            jsonb       DEFAULT '{}',
    active              boolean     DEFAULT true,
    created_at          timestamptz DEFAULT now()
);

-- Seed plan data (note: -1 = unlimited)
INSERT INTO plans (
    name, slug, price_cents,
    max_campaigns_month, max_contacts, max_messages_month, max_templates,
    max_team_members, llm_model, features
) VALUES
(
    'Starter', 'starter', 4900,
    5, 500, 2500, 5,
    1, 'claude-haiku-4-5-20251001',
    '{
        "ab_testing": false,
        "api_access": false,
        "byok_llm": false,
        "team_members": false,
        "approval_workflow": false,
        "analytics_advanced": false,
        "webhook_events": false,
        "white_label": false,
        "export_data": false,
        "custom_sender_name": false
    }'::jsonb
),
(
    'Professional', 'professional', 14900,
    20, 5000, 15000, 20,
    3, 'claude-sonnet-4-20250514',
    '{
        "ab_testing": true,
        "api_access": true,
        "byok_llm": false,
        "team_members": true,
        "approval_workflow": true,
        "analytics_advanced": true,
        "webhook_events": false,
        "white_label": false,
        "export_data": true,
        "custom_sender_name": true
    }'::jsonb
),
(
    'Enterprise', 'enterprise', 39900,
    -1, 50000, 100000, -1,
    10, 'claude-sonnet-4-20250514',
    '{
        "ab_testing": true,
        "api_access": true,
        "byok_llm": true,
        "team_members": true,
        "approval_workflow": true,
        "analytics_advanced": true,
        "webhook_events": true,
        "white_label": true,
        "export_data": true,
        "custom_sender_name": true
    }'::jsonb
);

-- ── Subscription Status Enum ─────────────────────────────

CREATE TYPE subscription_status AS ENUM (
    'trialing', 'active', 'past_due', 'canceled'
);

-- ── Subscriptions ────────────────────────────────────────

CREATE TABLE subscriptions (
    id                      uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid                REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    plan_id                 uuid                REFERENCES plans(id) NOT NULL,
    stripe_subscription_id  text,
    stripe_customer_id      text,
    status                  subscription_status DEFAULT 'active',
    current_period_start    timestamptz         DEFAULT now(),
    current_period_end      timestamptz         DEFAULT (now() + interval '30 days'),
    cancel_at_period_end    boolean             DEFAULT false,
    created_at              timestamptz         DEFAULT now(),
    updated_at              timestamptz         DEFAULT now()
);

-- ── Usage Counters ───────────────────────────────────────

CREATE TABLE usage_counters (
    id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid    REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    period_start    date    NOT NULL DEFAULT CURRENT_DATE,
    campaigns_used  integer DEFAULT 0,
    messages_used   integer DEFAULT 0,
    contacts_count  integer DEFAULT 0,
    UNIQUE(user_id, period_start)
);

CREATE INDEX idx_usage_counters_user_period ON usage_counters (user_id, period_start);

-- ── Triggers ─────────────────────────────────────────────

CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/004_plans_subscriptions.sql
git commit -m "feat: add migration 004 — plans (with seed), subscriptions, usage_counters"
```

---

### Task 11: Create placeholder directories and Dockerfiles

**Files:**
- Create: `frontend/package.json` (minimal, to be expanded in Phase 2)
- Create: `agent/Dockerfile`
- Create: `agent/pyproject.toml` (minimal, to be expanded in Phase 4)
- Create: `agent/src/__init__.py`
- Create: `agent/src/main.py` (minimal health endpoint)
- Create: `mock/whatsapp-mock/Dockerfile`
- Create: `mock/whatsapp-mock/server.js` (minimal mock)
- Create: `mock/whatsapp-mock/package.json`

- [ ] **Step 1: Create minimal frontend/package.json**

```json
{
  "name": "wcm-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest"
  },
  "dependencies": {
    "next": "^15.3.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create agent/Dockerfile**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml .
RUN uv pip install --system -e ".[dev]" 2>/dev/null || uv pip install --system -e .

COPY src/ src/

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

- [ ] **Step 3: Create minimal agent/pyproject.toml**

```toml
[project]
name = "wcm-agent"
version = "0.1.0"
description = "WhatsApp Campaign Manager - AI Agent"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "httpx>=0.28",
    "redis[hiredis]>=5.2",
    "pydantic-settings>=2.7",
    "python-dotenv>=1.0",
    "structlog>=24.4",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.25",
    "pytest-httpx>=0.35",
]

[build-system]
requires = ["setuptools>=75"]
build-backend = "setuptools.backends._legacy:_Backend"
```

- [ ] **Step 4: Create agent/src/__init__.py (empty) and agent/src/main.py**

`agent/src/__init__.py`: empty file

`agent/src/main.py`:
```python
from fastapi import FastAPI

app = FastAPI(title="WCM Agent", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 5: Create mock/whatsapp-mock/package.json**

```json
{
  "name": "whatsapp-mock",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^5.1.0"
  }
}
```

- [ ] **Step 6: Create mock/whatsapp-mock/server.js**

```javascript
const express = require("express");
const app = express();
const PORT = 9090;

app.use(express.json());

// Store sent messages for inspection
const sentMessages = [];

// WhatsApp Cloud API mock — send message
app.post("/v21.0/:phoneNumberId/messages", (req, res) => {
  const message = {
    id: `wamid.${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
    phoneNumberId: req.params.phoneNumberId,
    to: req.body.to,
    type: req.body.type,
    template: req.body.template,
    timestamp: new Date().toISOString(),
  };
  sentMessages.push(message);
  console.log(`[MOCK] Message sent to ${req.body.to}: ${message.id}`);
  res.json({
    messaging_product: "whatsapp",
    contacts: [{ input: req.body.to, wa_id: req.body.to }],
    messages: [{ id: message.id }],
  });
});

// Inspect sent messages
app.get("/mock/messages", (_req, res) => {
  res.json(sentMessages);
});

// Clear sent messages
app.delete("/mock/messages", (_req, res) => {
  sentMessages.length = 0;
  res.json({ cleared: true });
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`WhatsApp Mock Server running on port ${PORT}`);
});
```

- [ ] **Step 7: Create mock/whatsapp-mock/Dockerfile**

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY server.js .

EXPOSE 9090

CMD ["node", "server.js"]
```

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json agent/Dockerfile agent/pyproject.toml agent/src/ mock/
git commit -m "feat: add placeholder frontend, agent, and whatsapp-mock scaffolding"
```

---

### Task 12: Integration test — boot the stack

- [ ] **Step 1: Copy .env.example to .env**

```bash
cp .env.example .env
```

- [ ] **Step 2: Start core services**

Run: `make up`

Expected: All containers start. Check with `docker compose ps` — supabase-db, redis, frontend, agent should be running.

- [ ] **Step 3: Verify database migrations ran**

Run: `docker compose exec -T supabase-db psql -U postgres -d postgres -c "\dt"`

Expected: Tables listed: users, whatsapp_config, ai_config, contacts, templates, campaigns, messages, plans, subscriptions, usage_counters

- [ ] **Step 4: Verify plan seed data**

Run: `docker compose exec -T supabase-db psql -U postgres -d postgres -c "SELECT name, slug, price_cents FROM plans ORDER BY price_cents;"`

Expected:
```
    name     |     slug     | price_cents
-------------+--------------+-------------
 Starter     | starter      |        4900
 Professional| professional |       14900
 Enterprise  | enterprise   |       39900
```

- [ ] **Step 5: Verify Redis**

Run: `docker compose exec redis redis-cli ping`

Expected: `PONG`

- [ ] **Step 6: Verify Agent health**

Run: `curl -s http://localhost:8000/health`

Expected: `{"status":"ok"}`

- [ ] **Step 7: Commit .env to gitignore confirmation**

Run: `git status` — verify `.env` is NOT listed (covered by .gitignore)

- [ ] **Step 8: Tear down**

Run: `make down`

- [ ] **Step 9: Final commit — tag phase 1 complete**

```bash
git tag v0.1.0-phase1-infrastructure
```

---

## Phase Overview (remaining phases — detailed plans to be written per-phase)

### Phase 2 — Auth, Encryption, Middleware (files 9-22)
- Migrations 005 (agent_memory), 006 (audit_trail), 007 (RLS policies)
- Seed data (admin + 2 test users)
- Supabase client/server/admin libraries
- AES-256-GCM encryption utility
- Auth/plan-limits/admin middleware
- usePlan hook, FeatureGate, UpgradePrompt components

### Phase 3 — Settings & Configuration (files 23-30)
- WhatsApp settings API + form
- AI config API + form (Shared/BYOK toggle)
- Agent settings form
- Settings pages assembly

### Phase 4 — Agent MAF Python (files 31-42)
- Full pyproject.toml with MAF dependencies
- Config, encryption, rate limiter utilities
- Redis + Supabase memory stores
- 6 MAF tools (contacts, templates, history, whatsapp, personalize, status)
- 3 agents (campaign_planner, message_composer, dispatcher)
- Sequential workflow orchestrator

### Phase 5 — Integration & Admin (files 43-58)
- Queue consumer + FastAPI endpoints
- Campaign launch/webhook/plan APIs
- Admin panel (layout, dashboard, users, campaigns)
- WhatsApp mock enhancements
- Landing page + campaign realtime view
