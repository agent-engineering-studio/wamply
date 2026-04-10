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
