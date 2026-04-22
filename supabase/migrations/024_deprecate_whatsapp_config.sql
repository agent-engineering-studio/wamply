-- ──────────────────────────────────────────────────────────
-- Migration 024: deprecate legacy `whatsapp_config` table
--
-- WhatsApp sender configuration has been superseded by the
-- multi-tenant tables introduced in migration 022:
--   • businesses          — company profile & owner
--   • meta_applications   — Meta approval lifecycle, Twilio subaccount,
--                            phone number, status machine.
--
-- The `whatsapp_config` table is kept (read-only) until all existing
-- users are migrated and the legacy code paths in `launch_campaign`
-- and agent dispatcher are removed. DO NOT write to it from new code.
--
-- When the migration is complete (planned: after Sprint 6 cleanup),
-- a follow-up migration will DROP TABLE whatsapp_config CASCADE.
-- ──────────────────────────────────────────────────────────

COMMENT ON TABLE whatsapp_config IS
    'DEPRECATED (2026-04): replaced by businesses + meta_applications. '
    'Read-only; do not insert new rows. Will be dropped after legacy users '
    'are migrated to the multi-tenant sender flow.';
