-- ──────────────────────────────────────────────────────────
-- Migration 022: Business profile + Meta Business application tracking.
--
-- Introduces per-user business data (legal identity, brand info, contacts)
-- and a separate entity for tracking the WhatsApp Business Platform approval
-- process with Meta. Replaces the per-user `whatsapp_config` (kept for
-- backward compat, to be dropped in a future migration).
--
-- See docs/architecture-twilio-multitenant.md §3 for full rationale.
-- ──────────────────────────────────────────────────────────

-- ── Meta application status enum ──────────────────────────

CREATE TYPE meta_application_status AS ENUM (
    'draft',               -- created, mandatory fields incomplete
    'awaiting_docs',       -- waiting on documents from the customer
    'submitted_to_meta',   -- submitted to Meta Business Manager
    'in_review',           -- Meta is reviewing
    'approved',            -- Meta approved, sender activatable
    'rejected',            -- Meta rejected (with reason)
    'active',              -- sender operational, first send done
    'suspended'            -- Meta suspended after go-live
);

-- ── Businesses ───────────────────────────────────────────
-- Per-user legal + brand profile. One row per user (lazy creation:
-- created on first /settings/business POST, not at signup).

CREATE TABLE IF NOT EXISTS businesses (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Legal identity
    legal_name      text        NOT NULL,
    brand_name      text        NOT NULL,
    vat_number      text,
    tax_code        text,

    -- Registered address
    address_line1   text,
    address_line2   text,
    city            text,
    postal_code     text,
    region          text,
    country         text        NOT NULL DEFAULT 'IT',

    -- Business contacts
    business_phone  text,
    business_email  text,
    website_url     text,

    -- Brand assets
    logo_url        text,
    meta_category   text,

    -- Metadata
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid        REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_businesses_user ON businesses (user_id);

-- ── Meta applications ────────────────────────────────────
-- Tracks the WABA (WhatsApp Business Account) approval process and
-- the associated Twilio subaccount/number/sender. One row per business.

CREATE TABLE IF NOT EXISTS meta_applications (
    id                                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id                             uuid        UNIQUE NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    status                                  meta_application_status NOT NULL DEFAULT 'draft',

    -- Twilio (populated progressively by admin during onboarding)
    twilio_subaccount_sid                   text,
    twilio_subaccount_auth_token_encrypted  bytea,
    twilio_phone_number                     text,
    twilio_phone_number_sid                 text,
    twilio_whatsapp_sender_sid              text,
    twilio_messaging_service_sid            text,

    -- Meta identifiers (manually entered by admin after external Meta flow)
    meta_waba_id                            text,
    meta_display_name_approved              text,
    meta_rejection_reason                   text,

    -- Lifecycle timestamps
    submitted_at                            timestamptz,
    approved_at                             timestamptz,
    rejected_at                             timestamptz,
    activated_at                            timestamptz,
    suspended_at                            timestamptz,

    -- Internal (staff-only) notes
    admin_notes                             text,

    -- Metadata
    created_at                              timestamptz NOT NULL DEFAULT now(),
    updated_at                              timestamptz NOT NULL DEFAULT now(),
    updated_by                              uuid        REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_meta_applications_status   ON meta_applications (status);
CREATE INDEX idx_meta_applications_business ON meta_applications (business_id);

-- ── Audit log ────────────────────────────────────────────
-- Every mutation on businesses / meta_applications writes a row.
-- Visible to both customer (own history) and staff (all).

CREATE TABLE IF NOT EXISTS business_audit_log (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id  uuid        REFERENCES businesses(id) ON DELETE CASCADE,
    action       text        NOT NULL,
    actor_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
    changes      jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_business ON business_audit_log (business_id, created_at DESC);

-- ── Updated_at trigger (reuse existing pattern) ──────────

CREATE TRIGGER trg_businesses_updated_at
    BEFORE UPDATE ON businesses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_meta_applications_updated_at
    BEFORE UPDATE ON meta_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
