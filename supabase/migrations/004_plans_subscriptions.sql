-- 004_plans_subscriptions.sql
-- Plans (with seed data), subscriptions, usage counters

-- ── Plans ────────────────────────────────────────────────

CREATE TABLE plans (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text        UNIQUE NOT NULL,
    slug                text        UNIQUE NOT NULL,
    price_cents         integer     NOT NULL,
    stripe_price_id     text,
    max_campaigns_month integer     NOT NULL,
    max_contacts        integer     NOT NULL,
    max_messages_month  integer     NOT NULL,
    max_templates       integer     NOT NULL,
    max_team_members    integer     DEFAULT 1,
    llm_model           text        DEFAULT 'claude-haiku-4-5-20251001',
    features            jsonb       DEFAULT '{}',
    active              boolean     DEFAULT true,
    created_at          timestamptz DEFAULT now()
);

-- Seed plan data (note: -1 = unlimited)
INSERT INTO plans (
    name, slug, price_cents,
    max_campaigns_month, max_contacts, max_messages_month, max_templates,
    max_team_members, llm_model, features
) VALUES
(
    'Starter', 'starter', 4900,
    5, 500, 2500, 5,
    1, 'claude-haiku-4-5-20251001',
    '{
        "ab_testing": false,
        "api_access": false,
        "byok_llm": false,
        "team_members": false,
        "approval_workflow": false,
        "analytics_advanced": false,
        "webhook_events": false,
        "white_label": false,
        "export_data": false,
        "custom_sender_name": false
    }'::jsonb
),
(
    'Professional', 'professional', 14900,
    20, 5000, 15000, 20,
    3, 'claude-sonnet-4-20250514',
    '{
        "ab_testing": true,
        "api_access": true,
        "byok_llm": false,
        "team_members": true,
        "approval_workflow": true,
        "analytics_advanced": true,
        "webhook_events": false,
        "white_label": false,
        "export_data": true,
        "custom_sender_name": true
    }'::jsonb
),
(
    'Enterprise', 'enterprise', 39900,
    -1, 50000, 100000, -1,
    10, 'claude-sonnet-4-20250514',
    '{
        "ab_testing": true,
        "api_access": true,
        "byok_llm": true,
        "team_members": true,
        "approval_workflow": true,
        "analytics_advanced": true,
        "webhook_events": true,
        "white_label": true,
        "export_data": true,
        "custom_sender_name": true
    }'::jsonb
);

-- ── Subscription Status Enum ─────────────────────────────

CREATE TYPE subscription_status AS ENUM (
    'trialing', 'active', 'past_due', 'canceled'
);

-- ── Subscriptions ────────────────────────────────────────

CREATE TABLE subscriptions (
    id                      uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid                REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    plan_id                 uuid                REFERENCES plans(id) NOT NULL,
    stripe_subscription_id  text,
    stripe_customer_id      text,
    status                  subscription_status DEFAULT 'active',
    current_period_start    timestamptz         DEFAULT now(),
    current_period_end      timestamptz         DEFAULT (now() + interval '30 days'),
    cancel_at_period_end    boolean             DEFAULT false,
    created_at              timestamptz         DEFAULT now(),
    updated_at              timestamptz         DEFAULT now()
);

-- ── Usage Counters ───────────────────────────────────────

CREATE TABLE usage_counters (
    id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid    REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    period_start    date    NOT NULL DEFAULT CURRENT_DATE,
    campaigns_used  integer DEFAULT 0,
    messages_used   integer DEFAULT 0,
    contacts_count  integer DEFAULT 0,
    UNIQUE(user_id, period_start)
);

CREATE INDEX idx_usage_counters_user_period ON usage_counters (user_id, period_start);

-- ── Triggers ─────────────────────────────────────────────

CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
