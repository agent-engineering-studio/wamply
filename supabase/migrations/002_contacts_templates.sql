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
