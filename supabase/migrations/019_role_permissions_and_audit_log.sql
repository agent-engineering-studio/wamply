-- Permissions matrix: one row per (role, permission). Admin gets the wildcard.
CREATE TABLE role_permissions (
  role user_role NOT NULL,
  permission text NOT NULL,
  PRIMARY KEY (role, permission)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_permissions_read ON role_permissions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY role_permissions_admin_write ON role_permissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Audit log for admin-sensitive actions. Server-only writes (no public policy).
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_admin_read ON audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE INDEX audit_log_actor_created_idx ON audit_log (actor_id, created_at DESC);
CREATE INDEX audit_log_target_created_idx ON audit_log (target_id, created_at DESC);

-- Seed the permission matrix.
INSERT INTO role_permissions (role, permission) VALUES
  ('admin', '*'),
  ('collaborator', 'admin.overview.view'),
  ('collaborator', 'admin.users.view'),
  ('collaborator', 'admin.campaigns.view'),
  ('collaborator', 'admin.whatsapp.manage'),
  ('sales', 'admin.overview.view'),
  ('sales', 'admin.users.view'),
  ('sales', 'admin.campaigns.view'),
  ('sales', 'admin.whatsapp.manage'),
  ('sales', 'admin.ai_costs.view'),
  ('sales', 'admin.ai_revenue.view');
