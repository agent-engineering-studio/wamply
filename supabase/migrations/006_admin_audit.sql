-- 006_admin_audit.sql
-- Audit trail for admin actions

CREATE TABLE audit_trail (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id   uuid        REFERENCES users(id) ON DELETE SET NULL,
    action          text        NOT NULL,
    target_user_id  uuid        REFERENCES users(id) ON DELETE SET NULL,
    details         jsonb       DEFAULT '{}',
    ip_address      inet,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_trail_admin ON audit_trail (admin_user_id);
CREATE INDEX idx_audit_trail_target ON audit_trail (target_user_id);
CREATE INDEX idx_audit_trail_created ON audit_trail (created_at DESC);
