-- 010_system_config_agent.sql
-- System-wide configuration table + agent_ai feature flag on plans

-- ── System config (admin-only key-value store) ──────────
CREATE TABLE IF NOT EXISTS system_config (
    key        text        PRIMARY KEY,
    value      text        NOT NULL,
    updated_at timestamptz DEFAULT now()
);

GRANT ALL ON system_config TO anon, authenticated, service_role;

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_config_admin ON system_config
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
    );

-- ── Add agent_ai feature flag to plans ──────────────────
-- Update existing plan features to include agent_ai
UPDATE plans SET features = features || '{"agent_ai": false}'::jsonb
WHERE slug = 'starter' AND NOT (features ? 'agent_ai');

UPDATE plans SET features = features || '{"agent_ai": true}'::jsonb
WHERE slug = 'professional' AND NOT (features ? 'agent_ai');

UPDATE plans SET features = features || '{"agent_ai": true}'::jsonb
WHERE slug = 'enterprise' AND NOT (features ? 'agent_ai');
