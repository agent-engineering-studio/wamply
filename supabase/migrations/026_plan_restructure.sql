-- 026_plan_restructure.sql
-- Restructure plans table for β+ v2 listino (spec: 2026-04-24-plan-tiers-and-positioning-design).
--
-- Changes:
--   1. Add columns: ai_features, msg_included, overage_rates, active_segments, display_name
--   2. Insert new "avvio" plan as entry-level (€19/mese, 0 msg inclusi)
--   3. Backfill ai_features + msg_included + overage_rates on existing paid plans
--      (starter/professional/enterprise). The 'free' plan (trial) is left untouched.
--   4. Populate display_name for UI rename (Avvio/Essenziale/Plus/Premium) without
--      renaming slugs (preserves API compat and Stripe price ids).
--   5. GIN index on active_segments for landing page filtering.

BEGIN;

-- 1. Add new columns
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS ai_features    jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS msg_included   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overage_rates  jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS active_segments text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS display_name   text;

COMMENT ON COLUMN plans.ai_features IS
  'Feature flags AI abilitate. Chiavi note: compliance_check, generate, improve, translate, analytics_standard, analytics_advanced.';
COMMENT ON COLUMN plans.msg_included IS
  'Messaggi WhatsApp inclusi nel canone mensile. Overage addebitato a consumo.';
COMMENT ON COLUMN plans.overage_rates IS
  'Tariffe overage EUR/msg. Chiavi: marketing, utility, free_form.';
COMMENT ON COLUMN plans.active_segments IS
  'Segmenti SME target per suggerimento piano nelle landing /soluzioni/[segmento].';
COMMENT ON COLUMN plans.display_name IS
  'Nome pubblico user-facing. Lo slug resta stabile per compat (es. starter → Essenziale).';

-- 2. Insert Avvio piano (entry-level)
INSERT INTO plans (
  slug, name, price_cents,
  max_campaigns_month, max_contacts, max_messages_month, max_templates, max_team_members,
  ai_credits_month, features,
  ai_features, msg_included, overage_rates, active_segments,
  display_name, active
)
VALUES (
  'avvio', 'Avvio', 1900,
  1, 500, 200, 3, 1,
  0,
  '{"byok_llm": false, "trial_days": 14}'::jsonb,
  '{"compliance_check": true}'::jsonb,
  0,
  '{"marketing": 0.09, "utility": 0.05, "free_form": 0.01}'::jsonb,
  ARRAY['parrucchieri','ristoranti','palestre','studi_medici','avvocati','immobiliari','autofficine','retail','scuole','hotel','autosaloni'],
  'Avvio', true
)
ON CONFLICT (slug) DO NOTHING;

-- 3. Backfill existing paid plans (leave 'free' trial plan alone)
UPDATE plans SET
  msg_included = 300,
  overage_rates = '{"marketing": 0.09, "utility": 0.05, "free_form": 0.01}'::jsonb,
  ai_features = '{"compliance_check": true, "generate": true, "improve": true}'::jsonb,
  active_segments = ARRAY['parrucchieri','ristoranti','palestre','studi_medici','avvocati','immobiliari','autofficine','retail','scuole','hotel','autosaloni'],
  display_name = 'Essenziale'
WHERE slug = 'starter';

UPDATE plans SET
  msg_included = 1500,
  overage_rates = '{"marketing": 0.08, "utility": 0.045, "free_form": 0.01}'::jsonb,
  ai_features = '{"compliance_check": true, "generate": true, "improve": true, "translate": true, "analytics_standard": true}'::jsonb,
  active_segments = ARRAY['parrucchieri','ristoranti','palestre','studi_medici','avvocati','immobiliari','autofficine','retail','scuole','hotel','autosaloni'],
  display_name = 'Plus'
WHERE slug = 'professional';

UPDATE plans SET
  msg_included = 5000,
  overage_rates = '{"marketing": 0.07, "utility": 0.04, "free_form": 0.01}'::jsonb,
  ai_features = '{"compliance_check": true, "generate": true, "improve": true, "translate": true, "analytics_standard": true, "analytics_advanced": true}'::jsonb,
  active_segments = ARRAY['parrucchieri','ristoranti','palestre','studi_medici','avvocati','immobiliari','autofficine','retail','scuole','hotel','autosaloni'],
  display_name = 'Premium'
WHERE slug = 'enterprise';

-- 4. GIN index for segment filtering
CREATE INDEX IF NOT EXISTS idx_plans_active_segments ON plans USING gin (active_segments);

COMMIT;
