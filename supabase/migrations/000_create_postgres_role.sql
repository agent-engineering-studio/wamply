-- 000_create_postgres_role.sql
-- The supabase/postgres image uses supabase_admin as superuser.
-- GoTrue migrations expect a "postgres" role to exist for GRANT statements.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
        CREATE ROLE postgres LOGIN SUPERUSER;
    END IF;
END
$$;
