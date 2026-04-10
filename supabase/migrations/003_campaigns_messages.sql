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
