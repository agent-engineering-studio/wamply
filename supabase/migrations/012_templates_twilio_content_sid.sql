-- ──────────────────────────────────────────────────────────
-- Migration 012: Add Twilio Content Template SID to templates.
--
-- Twilio WhatsApp requires referencing pre-approved templates
-- by ContentSid (HXxxxxxxxx). The existing `components` column
-- is preserved as LLM context for personalization; `name`,
-- `language`, `category` remain useful metadata.
-- ──────────────────────────────────────────────────────────

ALTER TABLE templates ADD COLUMN twilio_content_sid text;

CREATE INDEX idx_templates_twilio_content_sid
    ON templates (twilio_content_sid)
    WHERE twilio_content_sid IS NOT NULL;
