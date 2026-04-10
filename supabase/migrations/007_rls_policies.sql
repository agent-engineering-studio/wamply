-- 007_rls_policies.sql
-- Row Level Security on all tables

-- Create auth schema and uid() stub if not exists (Supabase GoTrue creates these normally)
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$ LANGUAGE sql STABLE;

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

-- ── Users ────────────────────────────────────────────────
CREATE POLICY users_select_own ON users
    FOR SELECT USING (id = auth.uid());
CREATE POLICY users_update_own ON users
    FOR UPDATE USING (id = auth.uid());
CREATE POLICY users_admin_all ON users
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
    );

-- ── WhatsApp Config ──────────────────────────────────────
CREATE POLICY whatsapp_config_own ON whatsapp_config
    FOR ALL USING (user_id = auth.uid());

-- ── AI Config ────────────────────────────────────────────
CREATE POLICY ai_config_own ON ai_config
    FOR ALL USING (user_id = auth.uid());

-- ── Contacts ─────────────────────────────────────────────
CREATE POLICY contacts_own ON contacts
    FOR ALL USING (user_id = auth.uid());

-- ── Templates ────────────────────────────────────────────
CREATE POLICY templates_own ON templates
    FOR ALL USING (user_id = auth.uid());

-- ── Campaigns ────────────────────────────────────────────
CREATE POLICY campaigns_own ON campaigns
    FOR ALL USING (user_id = auth.uid());

-- ── Messages (via campaign ownership) ────────────────────
CREATE POLICY messages_own ON messages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM campaigns c
            WHERE c.id = messages.campaign_id AND c.user_id = auth.uid()
        )
    );

-- ── Plans (readable by all authenticated) ────────────────
CREATE POLICY plans_select_all ON plans
    FOR SELECT USING (true);

-- ── Subscriptions ────────────────────────────────────────
CREATE POLICY subscriptions_own ON subscriptions
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY subscriptions_admin ON subscriptions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
    );

-- ── Usage Counters ───────────────────────────────────────
CREATE POLICY usage_counters_own ON usage_counters
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY usage_counters_admin ON usage_counters
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
    );

-- ── Agent Memory ─────────────────────────────────────────
CREATE POLICY agent_memory_own ON agent_memory
    FOR ALL USING (user_id = auth.uid());

-- ── Audit Trail (admin only) ─────────────────────────────
CREATE POLICY audit_trail_admin ON audit_trail
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
    );
