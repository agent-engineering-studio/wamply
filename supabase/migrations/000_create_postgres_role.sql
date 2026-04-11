-- 000_create_postgres_role.sql
-- Create roles required by Supabase self-hosted stack:
--   postgres       - required by GoTrue migrations (GRANT statements)
--   anon           - used by PostgREST for unauthenticated requests
--   authenticated  - used by PostgREST for authenticated requests (JWT role)
--   service_role   - used by service_role JWT (admin operations)

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
        CREATE ROLE postgres LOGIN SUPERUSER;
    END IF;

    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;

    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;

    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;

    -- Allow supabase_admin to switch to these roles
    GRANT anon TO supabase_admin;
    GRANT authenticated TO supabase_admin;
    GRANT service_role TO supabase_admin;

    -- Grant schema usage
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

    -- Default privileges for future tables
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
END
$$;
