-- ──────────────────────────────────────────────────────────
-- Migration 013: AI template operations quota.
--
-- Adds per-user monthly counter for AI-assisted template ops
-- (generate, improve, compliance, translate) and a per-plan
-- limit. Convention: -1 = illimitato.
--
-- Limits (Phase 1 — solo Generate per ora):
--   starter       →  0  (feature gated, upgrade richiesto)
--   professional  → 50
--   enterprise    → -1  (illimitato)
-- ──────────────────────────────────────────────────────────

ALTER TABLE usage_counters
    ADD COLUMN ai_template_ops_used INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE plans
    ADD COLUMN max_ai_template_ops_month INTEGER DEFAULT 0 NOT NULL;

UPDATE plans SET max_ai_template_ops_month = 0  WHERE slug = 'starter';
UPDATE plans SET max_ai_template_ops_month = 50 WHERE slug = 'professional';
UPDATE plans SET max_ai_template_ops_month = -1 WHERE slug = 'enterprise';
