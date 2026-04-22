-- ──────────────────────────────────────────────────────────
-- Migration 025: agent persona on ai_config
--
-- Adds per-user "agent tone" + "custom instructions" that get
-- injected into the Claude system prompt for chat and
-- message personalization. Replaces the stubbed
-- frontend/src/components/settings/AgentSettingsForm.tsx
-- that wrote nowhere — now there's a real persisted target.
-- ──────────────────────────────────────────────────────────

ALTER TABLE ai_config
    ADD COLUMN IF NOT EXISTS agent_tone text,
    ADD COLUMN IF NOT EXISTS agent_instructions text;

COMMENT ON COLUMN ai_config.agent_tone IS
    'Optional tone used when composing/personalizing messages: '
    'professionale | amichevole | informale | formale. Null = default.';

COMMENT ON COLUMN ai_config.agent_instructions IS
    'Free-text custom instructions appended to the agent system prompt. '
    'Max ~1000 chars enforced at API layer, not DB.';
