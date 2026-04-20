-- 016_fix_users_admin_recursion.sql
-- Fix infinite recursion in users_admin_all RLS policy.
-- The previous policy (in 007_rls_policies.sql) did EXISTS(SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'),
-- which re-triggers RLS on the same table → 42P17 infinite recursion.
--
-- Fix: use a SECURITY DEFINER function that bypasses RLS when checking the role.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, anon;

DROP POLICY IF EXISTS users_admin_all ON users;

CREATE POLICY users_admin_all ON users
  FOR ALL
  USING (is_admin());
