-- ──────────────────────────────────────────────────────────
-- Migration 020: AI credits system (schema).
--
-- Introduces the unified credits system that replaces the legacy
-- `ai_template_ops_used` / `max_ai_template_ops_month` columns
-- (kept in place for backward-compat, to be dropped in a future
-- migration once the credit service is live everywhere).
--
-- Budget per plan (ai_credits_month):
--   free          →  0
--   starter       →  0   (AI only via BYOK)
--   professional  →  200
--   enterprise    →  1500
--
-- See docs/ai-credits-plan.md §6 for rationale.
-- ──────────────────────────────────────────────────────────

-- ── Per-plan monthly credit budget ───────────────────────

ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS ai_credits_month integer NOT NULL DEFAULT 0;

UPDATE plans SET ai_credits_month = 0    WHERE slug = 'free';
UPDATE plans SET ai_credits_month = 0    WHERE slug = 'starter';
UPDATE plans SET ai_credits_month = 200  WHERE slug = 'professional';
UPDATE plans SET ai_credits_month = 1500 WHERE slug = 'enterprise';

-- ── Per-user monthly counter ─────────────────────────────
-- Shares the existing row-per-month pattern of usage_counters.
-- numeric(10,2) supports decimal credits (e.g. 0.5 per personalize).

ALTER TABLE usage_counters
    ADD COLUMN IF NOT EXISTS ai_credits_used numeric(10,2) NOT NULL DEFAULT 0;

-- ── Audit ledger ─────────────────────────────────────────
-- One row per AI call (system_key OR byok). Powers user dashboard
-- breakdown + admin AI costs dashboard. Independent from the monthly
-- aggregate on usage_counters, but both are kept in sync by the
-- credit service (Task 2).

CREATE TABLE IF NOT EXISTS ai_usage_ledger (
    id                   uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    operation            text           NOT NULL,
    model                text           NOT NULL,                   -- 'haiku' | 'sonnet' | 'opus'
    source               text           NOT NULL,                   -- 'system_key' | 'byok'
    credits              numeric(6,2)   NOT NULL,
    estimated_cost_usd   numeric(8,4)   NOT NULL DEFAULT 0,
    tokens_in            integer        NOT NULL DEFAULT 0,
    tokens_out           integer        NOT NULL DEFAULT 0,
    created_at           timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_user_created
    ON ai_usage_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_created
    ON ai_usage_ledger (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_source
    ON ai_usage_ledger (source);

-- ── Warning idempotence on subscriptions ─────────────────
-- Prevent double-sending the 80% threshold or 100% exhaustion
-- notifications. Reset to NULL at month rollover (handled in code).

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS ai_credits_80_warning_sent_at  timestamptz,
    ADD COLUMN IF NOT EXISTS ai_credits_100_reached_at      timestamptz;
