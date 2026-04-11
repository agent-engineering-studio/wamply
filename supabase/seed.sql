-- seed.sql
-- Development seed data: 1 admin + 2 test users with subscriptions, contacts, templates, campaigns
-- Run with: make seed
--
-- ╔═══════════════════════════════════════════════════════╗
-- ║  CREDENZIALI DI SVILUPPO                              ║
-- ║                                                       ║
-- ║  Admin:  admin@wcm.local     / Admin123!              ║
-- ║  User 1: user1@test.local    / User123!               ║
-- ║  User 2: user2@test.local    / User123!               ║
-- ╚═══════════════════════════════════════════════════════╝

-- ── Auth → Public user sync trigger ─────────────────────
-- This trigger auto-creates a public.users row when someone signs up via GoTrue.
-- Must run AFTER GoTrue has created auth.users (not during DB init).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
        NEW.raw_user_meta_data ->> 'avatar_url',
        'user'
    )
    ON CONFLICT (id) DO UPDATE SET
        email      = EXCLUDED.email,
        full_name  = COALESCE(EXCLUDED.full_name, public.users.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
        updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ── Auth users (Supabase GoTrue) ────────────────────────
-- Creates authenticable users in auth.users so you can actually log in.
-- Passwords are hashed with bcrypt (pgcrypto).

INSERT INTO auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, reauthentication_token,
    email_change, email_change_token_new, email_change_token_current,
    email_change_confirm_status, phone_change, phone_change_token,
    is_sso_user
)
VALUES
-- Admin: admin@wcm.local / Admin123!
(
    'a0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'admin@wcm.local',
    crypt('Admin123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Admin WCM"}'::jsonb,
    now(), now(),
    '', '', '',
    '', '', '',
    0, '', '',
    false
),
-- User 1: user1@test.local / User123!
(
    'b0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'user1@test.local',
    crypt('User123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Marco Rossi"}'::jsonb,
    now(), now(),
    '', '', '',
    '', '', '',
    0, '', '',
    false
),
-- User 2: user2@test.local / User123!
(
    'c0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'user2@test.local',
    crypt('User123!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Giulia Bianchi"}'::jsonb,
    now(), now(),
    '', '', '',
    '', '', '',
    0, '', '',
    false
)
ON CONFLICT (id) DO NOTHING;

-- Auth identities (required by GoTrue for email login)
INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
VALUES
(
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'admin@wcm.local', 'email',
    '{"sub":"a0000000-0000-0000-0000-000000000001","email":"admin@wcm.local"}'::jsonb,
    now(), now(), now()
),
(
    'b0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'user1@test.local', 'email',
    '{"sub":"b0000000-0000-0000-0000-000000000001","email":"user1@test.local"}'::jsonb,
    now(), now(), now()
),
(
    'c0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'user2@test.local', 'email',
    '{"sub":"c0000000-0000-0000-0000-000000000001","email":"user2@test.local"}'::jsonb,
    now(), now(), now()
)
ON CONFLICT DO NOTHING;

-- ── Public users ────────────────────────────────────────
-- Note: if trigger on_auth_user_created exists, these may already be created.
-- ON CONFLICT ensures idempotency.

INSERT INTO users (id, email, role, full_name)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'admin@wcm.local', 'admin', 'Admin WCM'),
    ('b0000000-0000-0000-0000-000000000001', 'user1@test.local', 'user', 'Marco Rossi'),
    ('c0000000-0000-0000-0000-000000000001', 'user2@test.local', 'user', 'Giulia Bianchi')
ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    full_name = EXCLUDED.full_name;

-- ── Subscriptions ────────────────────────────────────────
INSERT INTO subscriptions (user_id, plan_id)
SELECT 'a0000000-0000-0000-0000-000000000001', id FROM plans WHERE slug = 'enterprise'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO subscriptions (user_id, plan_id)
SELECT 'b0000000-0000-0000-0000-000000000001', id FROM plans WHERE slug = 'starter'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO subscriptions (user_id, plan_id)
SELECT 'c0000000-0000-0000-0000-000000000001', id FROM plans WHERE slug = 'professional'
ON CONFLICT (user_id) DO NOTHING;

-- ── Usage counters ───────────────────────────────────────
INSERT INTO usage_counters (user_id, period_start, campaigns_used, messages_used, contacts_count)
VALUES
  ('b0000000-0000-0000-0000-000000000001', CURRENT_DATE, 1, 45, 50),
  ('c0000000-0000-0000-0000-000000000001', CURRENT_DATE, 3, 580, 200)
ON CONFLICT (user_id, period_start) DO NOTHING;

-- ── Contacts for User 1 (50 contacts) ───────────────────
INSERT INTO contacts (user_id, phone, name, tags, opt_in, opt_in_date)
SELECT
  'b0000000-0000-0000-0000-000000000001',
  '+3933' || lpad(n::text, 7, '0'),
  'Contatto ' || n,
  CASE WHEN n % 3 = 0 THEN ARRAY['vip'] WHEN n % 2 = 0 THEN ARRAY['newsletter'] ELSE ARRAY['lead'] END,
  true,
  now() - (n || ' days')::interval
FROM generate_series(1, 50) AS n
ON CONFLICT (user_id, phone) DO NOTHING;

-- ── Contacts for User 2 (200 contacts) ──────────────────
INSERT INTO contacts (user_id, phone, name, tags, opt_in, opt_in_date)
SELECT
  'c0000000-0000-0000-0000-000000000001',
  '+3934' || lpad(n::text, 7, '0'),
  'Cliente ' || n,
  CASE WHEN n % 5 = 0 THEN ARRAY['vip','premium'] WHEN n % 3 = 0 THEN ARRAY['newsletter'] ELSE ARRAY['lead'] END,
  true,
  now() - (n || ' days')::interval
FROM generate_series(1, 200) AS n
ON CONFLICT (user_id, phone) DO NOTHING;

-- ── Templates for User 1 (3 templates) ──────────────────
INSERT INTO templates (id, user_id, name, category, components, status)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'Benvenuto', 'marketing',
   '[{"type":"header","parameters":[{"type":"text","text":"Ciao {{1}}!"}]},{"type":"body","parameters":[{"type":"text","text":"Benvenuto nel nostro servizio."}]}]'::jsonb,
   'approved'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
   'Promo Estiva', 'marketing',
   '[{"type":"body","parameters":[{"type":"text","text":"{{1}}, approfitta della nostra offerta estiva: {{2}}% di sconto!"}]}]'::jsonb,
   'approved'),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001',
   'Conferma Ordine', 'utility',
   '[{"type":"body","parameters":[{"type":"text","text":"Ordine #{{1}} confermato. Consegna prevista: {{2}}."}]}]'::jsonb,
   'approved')
ON CONFLICT DO NOTHING;

-- ── Templates for User 2 (5 templates) ──────────────────
INSERT INTO templates (id, user_id, name, category, components, status)
VALUES
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'Newsletter Mensile', 'marketing',
   '[{"type":"body","parameters":[{"type":"text","text":"{{1}}, ecco le novita del mese!"}]}]'::jsonb,
   'approved'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
   'Offerta Flash', 'marketing',
   '[{"type":"body","parameters":[{"type":"text","text":"{{1}}, solo per oggi: {{2}}!"}]}]'::jsonb,
   'approved'),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
   'Reminder Appuntamento', 'utility',
   '[{"type":"body","parameters":[{"type":"text","text":"Promemoria: appuntamento il {{1}} alle {{2}}."}]}]'::jsonb,
   'approved'),
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001',
   'Feedback Richiesta', 'utility',
   '[{"type":"body","parameters":[{"type":"text","text":"{{1}}, come e stata la tua esperienza? Rispondi con un voto da 1 a 5."}]}]'::jsonb,
   'approved'),
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001',
   'Auguri Compleanno', 'marketing',
   '[{"type":"body","parameters":[{"type":"text","text":"Buon compleanno {{1}}! Un regalo speciale ti aspetta."}]}]'::jsonb,
   'approved')
ON CONFLICT DO NOTHING;

-- ── Campaign for User 1 (1 completed) ───────────────────
INSERT INTO campaigns (id, user_id, name, template_id, status, started_at, completed_at, stats)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'Campagna Benvenuto Maggio', 'd0000000-0000-0000-0000-000000000001',
   'completed', now() - interval '5 days', now() - interval '5 days',
   '{"total":45,"sent":45,"delivered":42,"read":38,"failed":3}'::jsonb)
ON CONFLICT DO NOTHING;

-- ── Campaigns for User 2 (3 campaigns) ──────────────────
INSERT INTO campaigns (id, user_id, name, template_id, status, started_at, completed_at, stats)
VALUES
  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
   'Newsletter Marzo', 'e0000000-0000-0000-0000-000000000001',
   'completed', now() - interval '30 days', now() - interval '30 days',
   '{"total":180,"sent":180,"delivered":170,"read":145,"failed":10}'::jsonb),
  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
   'Flash Sale Aprile', 'e0000000-0000-0000-0000-000000000002',
   'completed', now() - interval '10 days', now() - interval '10 days',
   '{"total":200,"sent":200,"delivered":195,"read":160,"failed":5}'::jsonb),
  ('f0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001',
   'Reminder Settimanale', 'e0000000-0000-0000-0000-000000000003',
   'running', now() - interval '1 hour', NULL,
   '{"total":200,"sent":120,"delivered":110,"read":80,"failed":2}'::jsonb)
ON CONFLICT DO NOTHING;
