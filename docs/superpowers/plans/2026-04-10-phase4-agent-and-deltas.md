# Phase 4 — Agent MAF Python + Architecture Deltas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the complete AI agent (MAF Python 1.0 + FastAPI) with 3-stage Sequential Workflow, plus fix architecture deltas from updated documentation (missing DB tables, UI theme update).

**Architecture:** Sequential Workflow: CampaignPlanner (Claude Sonnet) → MessageComposer (Claude Haiku/Sonnet) → Dispatcher (no LLM, Meta API). Redis for job queue + operational memory (TTL 24h), Supabase for long-term memory. Rate limiting 50 msg/sec, exponential backoff retry.

**Tech Stack:** Python 3.12, FastAPI, Microsoft Agent Framework (agent-framework) 1.0, agent-framework-anthropic, Redis (hiredis), asyncpg, httpx, structlog, OpenTelemetry

---

## Part A: Architecture Deltas (DB + UI Theme)

### Task A1: Delta migration 008 — contact_groups + schema updates

**Files:**
- Create: `supabase/migrations/008_contact_groups.sql`

```sql
-- 008_contact_groups.sql
-- Contact groups for campaign segmentation + schema updates from doc v2

-- ── Contact Groups ───────────────────────────────────────
CREATE TABLE contact_groups (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name        text        NOT NULL,
    description text,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_contact_groups_user_id ON contact_groups (user_id);

CREATE TRIGGER trg_contact_groups_updated_at
    BEFORE UPDATE ON contact_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Contact-Group membership (many-to-many) ──────────────
CREATE TABLE contact_group_members (
    contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
    group_id   uuid REFERENCES contact_groups(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (contact_id, group_id)
);

-- ── Add variables column to contacts ─────────────────────
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS variables jsonb DEFAULT '{}';

-- ── Add group_id to campaigns ────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES contact_groups(id);

-- ── RLS on new tables ────────────────────────────────────
ALTER TABLE contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_groups_own ON contact_groups
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY contact_group_members_own ON contact_group_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM contact_groups g
            WHERE g.id = contact_group_members.group_id AND g.user_id = auth.uid()
        )
    );
```

Commit: `git commit -m "feat: add migration 008 — contact_groups, contact variables, campaign group_id"`

### Task A2: Update UI theme from navy/teal to WhatsApp green

**Files:**
- Modify: `frontend/tailwind.config.ts`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/(dashboard)/layout.tsx`

Update tailwind.config.ts colors:
```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          green: { DEFAULT: "#25D366", dark: "#128C7E", light: "#E8F5E9", pale: "#F0FBF2" },
          ink: { DEFAULT: "#0F1923", 60: "#667788", 30: "#B8C4CC", 10: "#EEF2F5", "05": "#F7FAFB" },
        },
      },
      borderRadius: { card: "12px", sm: "8px", pill: "20px" },
      fontFamily: { sans: ['"DM Sans"', "system-ui", "sans-serif"], mono: ['"DM Mono"', "monospace"] },
      boxShadow: { card: "0 1px 3px rgba(0,0,0,.07), 0 1px 2px rgba(0,0,0,.05)", md: "0 4px 16px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.06)" },
    },
  },
  plugins: [],
};
export default config;
```

Redesign Sidebar to match mockup (white bg, green active, tenant card, usage bars, user footer).

Commit: `git commit -m "feat: update UI theme to WhatsApp green, DM Sans font, redesign sidebar"`

---

## Part B: Agent MAF Python (Core)

### Task B1: Full pyproject.toml with MAF dependencies

**Files:**
- Modify: `agent/pyproject.toml`

```toml
[project]
name = "wcm-agent"
version = "0.1.0"
description = "WhatsApp Campaign Manager - AI Agent"
requires-python = ">=3.12"
dependencies = [
    "agent-framework>=1.0.0",
    "agent-framework-anthropic>=1.0.0",
    "agent-framework-redis>=1.0.0",
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "httpx>=0.28",
    "asyncpg>=0.30",
    "redis[hiredis]>=5.2",
    "cryptography>=44.0",
    "structlog>=24.4",
    "opentelemetry-sdk>=1.29",
    "opentelemetry-exporter-otlp-proto-grpc>=1.29",
    "pydantic-settings>=2.7",
    "python-dotenv>=1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.25",
    "pytest-httpx>=0.35",
    "debugpy>=1.8",
]

[build-system]
requires = ["setuptools>=75"]
build-backend = "setuptools.build_meta"
```

Commit: `git commit -m "feat: update pyproject.toml with full MAF + telemetry dependencies"`

### Task B2: Agent config and utilities

**Files:**
- Create: `agent/src/config.py`
- Create: `agent/src/utils/encryption.py`
- Create: `agent/src/utils/rate_limiter.py`
- Create: `agent/src/utils/telemetry.py`

**config.py** — Pydantic Settings with all env vars.
**encryption.py** — AES-256-GCM decrypt (mirror of frontend, to read encrypted tokens from DB).
**rate_limiter.py** — Async token bucket for WhatsApp API (configurable, default 50 msg/sec).
**telemetry.py** — OpenTelemetry setup with OTLP gRPC exporter to Jaeger.

Commit: `git commit -m "feat: add agent config, encryption, rate limiter, telemetry utils"`

### Task B3: Memory stores (Redis + Supabase)

**Files:**
- Create: `agent/src/memory/redis_memory.py`
- Create: `agent/src/memory/supabase_memory.py`

**redis_memory.py** — Campaign session memory with TTL 24h. Keys: `campaign:{id}:state`, `campaign:{id}:progress`. Methods: `get_state()`, `set_state()`, `increment_progress()`.
**supabase_memory.py** — Long-term agent memory (agent_memory table). Methods: `get(user_id, key)`, `set(user_id, key, value)`, `get_campaign_history(user_id)`.

Commit: `git commit -m "feat: add Redis (TTL 24h) and Supabase agent memory stores"`

### Task B4: MAF Tools (6 tools)

**Files:**
- Create: `agent/src/tools/contacts_tool.py`
- Create: `agent/src/tools/templates_tool.py`
- Create: `agent/src/tools/history_tool.py`
- Create: `agent/src/tools/whatsapp_tool.py`
- Create: `agent/src/tools/personalize_tool.py`
- Create: `agent/src/tools/status_tool.py`

Each tool is a MAF FunctionTool:
- **contacts_tool**: Query contacts by group, tags, language. Returns contact list with variables.
- **templates_tool**: Fetch approved templates for user. Returns template components.
- **history_tool**: Get campaign history and performance metrics for user.
- **whatsapp_tool**: Send message via Meta Cloud API v21.0 with rate limiting.
- **personalize_tool**: Generate personalized message text using LLM for a specific contact.
- **status_tool**: Update message/campaign status in Supabase + Redis.

Commit: `git commit -m "feat: add 6 MAF tools — contacts, templates, history, whatsapp, personalize, status"`

### Task B5: MAF Agents (3 agents)

**Files:**
- Create: `agent/src/agents/campaign_planner.py`
- Create: `agent/src/agents/message_composer.py`
- Create: `agent/src/agents/dispatcher.py`

**campaign_planner.py** — Stage 1. Uses Claude Sonnet 4. Tools: contacts, templates, history. Analyzes campaign, segments contacts, selects template, plans timing.
**message_composer.py** — Stage 2. Uses Claude Haiku 4.5 (Starter/Pro) or Sonnet 4 (Enterprise). Tool: personalize. Generates unique message per contact with semaphore (max 10 concurrent).
**dispatcher.py** — Stage 3. No LLM. Tools: whatsapp, status. Sends messages with rate limiting (50 msg/sec), exponential backoff retry (2s → 4s → 8s), pause/resume support.

Commit: `git commit -m "feat: add 3 MAF agents — CampaignPlanner, MessageComposer, Dispatcher"`

### Task B6: Sequential Workflow orchestrator

**Files:**
- Create: `agent/src/agents/workflow.py`

MAF Sequential workflow: planner → composer → dispatcher. Handles campaign state transitions (draft → running → completed/failed). Reports progress to Redis in realtime.

Commit: `git commit -m "feat: add MAF Sequential Workflow orchestrator"`

### Task B7: Queue consumer + FastAPI endpoints

**Files:**
- Create: `agent/src/worker/queue_consumer.py`
- Create: `agent/src/api/router.py`
- Create: `agent/src/api/endpoints/campaigns.py`
- Create: `agent/src/api/endpoints/health.py`
- Create: `agent/src/api/dependencies.py`
- Modify: `agent/src/main.py`

**queue_consumer.py** — Redis BRPOP consumer that dequeues campaign jobs and triggers the workflow.
**campaigns.py** — POST /campaigns/launch (validate + enqueue), GET /campaigns/{id}/status.
**health.py** — GET /health with Redis + DB connectivity check.
**dependencies.py** — FastAPI Depends for auth (AGENT_SECRET header), DB pool, Redis.
**main.py** — Full FastAPI app with lifespan (startup: DB pool, Redis, queue consumer; shutdown: cleanup).

Commit: `git commit -m "feat: add queue consumer, FastAPI endpoints, and full agent main.py"`

### Task B8: Agent Dockerfile update + integration test

- Modify: `agent/Dockerfile` (ensure all deps install)
- Test: `docker compose -f docker-compose.yml build agent`
- Test: `docker compose -f docker-compose.yml up -d agent supabase-db redis`
- Verify: `curl http://localhost:8000/health`

Commit + tag: `git tag v0.4.0-phase4-agent`
