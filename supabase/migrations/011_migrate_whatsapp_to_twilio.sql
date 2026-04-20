-- ──────────────────────────────────────────────────────────
-- Migration 011: Switch WhatsApp provider from Meta Cloud API
-- to Twilio WhatsApp API.
--
-- whatsapp_config:
--   - drop Meta-specific columns (phone_number_id, waba_id,
--     webhook_verify_token) — Twilio uses X-Twilio-Signature
--     (HMAC-SHA1) instead of a shared verify token
--   - rename encrypted_token → twilio_auth_token_encrypted
--   - add twilio_account_sid, twilio_from,
--     twilio_messaging_service_sid
--
-- messages:
--   - rename wamid → provider_message_id (provider-agnostic)
--   - rebuild index
-- ──────────────────────────────────────────────────────────

ALTER TABLE whatsapp_config
    DROP COLUMN IF EXISTS phone_number_id,
    DROP COLUMN IF EXISTS waba_id,
    DROP COLUMN IF EXISTS webhook_verify_token;

ALTER TABLE whatsapp_config
    RENAME COLUMN encrypted_token TO twilio_auth_token_encrypted;

ALTER TABLE whatsapp_config
    ADD COLUMN twilio_account_sid           text,
    ADD COLUMN twilio_from                  text,
    ADD COLUMN twilio_messaging_service_sid text;

ALTER TABLE messages RENAME COLUMN wamid TO provider_message_id;

DROP INDEX IF EXISTS idx_messages_wamid;
CREATE INDEX idx_messages_provider_message_id
    ON messages (provider_message_id);
