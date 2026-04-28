-- 030_topup_packs.sql
-- Move top-up credit pack catalog from in-memory dict + ENV vars to DB.
--
-- Until now, top-up packs lived in src/services/credit_topup.py PACKS{} and
-- their Stripe price IDs in STRIPE_PRICE_TOPUP_* env vars. This made changing
-- prices/credits/labels require a redeploy.
--
-- Now: editable from /admin?tab=payments, with optional pull-sync from Stripe
-- (matching products tagged metadata.wamply_type=topup).

BEGIN;

CREATE TABLE topup_packs (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                text        UNIQUE NOT NULL,
    name                text        NOT NULL,
    credits             integer     NOT NULL CHECK (credits > 0),
    amount_cents        integer     NOT NULL CHECK (amount_cents > 0),
    currency            text        NOT NULL DEFAULT 'eur',
    badge               text,                              -- "Più venduto", "Miglior prezzo", null
    stripe_product_id   text,                              -- prod_xxx (filled by Sync)
    stripe_price_id     text,                              -- price_xxx (filled by Sync or manually)
    active              boolean     NOT NULL DEFAULT true,
    sort_order          integer     NOT NULL DEFAULT 0,    -- ascending = listed first
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_topup_packs_active_order ON topup_packs (active, sort_order);

CREATE TRIGGER trg_topup_packs_updated_at
    BEFORE UPDATE ON topup_packs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed: keep slugs/credits/amounts identical to the legacy PACKS dict so
-- existing checkout sessions and webhook events keep matching.
INSERT INTO topup_packs (slug, name, credits, amount_cents, badge, sort_order) VALUES
    ('small',  '100 crediti',     100,   1500, NULL,              10),
    ('medium', '500 crediti',     500,   5900, 'Più venduto',     20),
    ('large',  '2.000 crediti',  2000,  19900, 'Miglior prezzo',  30),
    ('xl',     '10.000 crediti', 10000, 79900, NULL,              40);

-- RLS: same pattern as `plans` — service role bypasses, authenticated users
-- can read the active catalog (used by /settings/credits page).
ALTER TABLE topup_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY topup_packs_read_active ON topup_packs
    FOR SELECT USING (active = true);

COMMIT;
