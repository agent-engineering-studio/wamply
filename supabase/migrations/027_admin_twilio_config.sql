-- 027_admin_twilio_config.sql
-- Sub-project C (plan-tiers-positioning): admin Twilio management.
--
-- Riuso la tabella system_config già esistente (key/value) — chiavi:
--   * twilio_master_auth_token_encrypted : ciphertext del token master (AES-GCM,
--     formato iv:tag:ct come in src/services/encryption.py)
--   * twilio_master_account_sid          : SID master in chiaro (non è un segreto)
--   * twilio_master_messaging_service_sid: MSS default (non è un segreto)
--   * twilio_provisioning_policy         : JSON con {auto_create_subaccount_on_signup: bool,
--                                           default_region: text, number_pool: text[]}
--
-- Seeda anche la permission 'admin.twilio.manage' — coperta dal wildcard '*'
-- di admin, ma la inserisce esplicitamente come riga per:
--   1. Documentare in DB che esiste
--   2. Permettere query di introspezione (GET /admin/me/permissions la restituirà
--      se l'admin è chiamante, via il wildcard)
--   3. Facilitare test automatici che enumerano le permission attese.

BEGIN;

-- 1. Provisioning policy default (solo se non presente)
INSERT INTO system_config (key, value, updated_at)
VALUES (
  'twilio_provisioning_policy',
  '{"auto_create_subaccount_on_signup": true, "default_region": "IT", "number_pool": []}',
  now()
)
ON CONFLICT (key) DO NOTHING;

-- 2. NB: twilio_master_auth_token_encrypted NON viene seedato qui.
--    Il backend lo popola al primo POST /admin/twilio/rotate-master.
--    Fino ad allora, il valore ENV TWILIO_AUTH_TOKEN resta l'unico usato
--    (retro-compat con src/services/twilio_provisioning.py::_master_credentials).

-- 3. Permission row (per introspection — admin coperto comunque da wildcard '*')
INSERT INTO role_permissions (role, permission) VALUES
  ('admin', 'admin.twilio.manage')
ON CONFLICT (role, permission) DO NOTHING;

-- 4. Indice opzionale: audit_log query filtered by 'twilio_*' action prefix
CREATE INDEX IF NOT EXISTS audit_log_twilio_action_idx
  ON audit_log (created_at DESC)
  WHERE action LIKE 'twilio_%';

COMMIT;
