-- ──────────────────────────────────────────────────────────
-- Migration 021: AI credit top-up system.
--
-- Users on paid plans can purchase additional credit packs via
-- Stripe Checkout (mode=payment, one-shot). Credits accumulate in
-- ai_credit_balance.topup_credits and live 12 months from the most
-- recent purchase.
--
-- Consumption priority (enforced in code, not DB):
--   1. plan credits (usage_counters.ai_credits_used vs plan.ai_credits_month)
--   2. topup credits (ai_credit_balance.topup_credits)
--
-- See docs/ai-credits-plan.md §7 for pricing + business rules.
-- ──────────────────────────────────────────────────────────

-- ── Balance per user ────────────────────────────────────
-- One row per user who has ever purchased a top-up. Row created lazily
-- by the webhook handler on first completed purchase.

CREATE TABLE IF NOT EXISTS ai_credit_balance (
    user_id           uuid          PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    topup_credits     numeric(10,2) NOT NULL DEFAULT 0,
    topup_expires_at  timestamptz,  -- NULL if balance is zero
    updated_at        timestamptz   NOT NULL DEFAULT now()
);

-- ── Purchase audit ───────────────────────────────────────
-- One row per Checkout Session (including abandoned/failed ones).
-- Filled with Stripe IDs when webhook fires; status starts 'pending'.

CREATE TABLE IF NOT EXISTS ai_credit_purchases (
    id                          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_slug                   text         NOT NULL,            -- 'small' | 'medium' | 'large' | 'xl'
    credits_purchased           integer      NOT NULL,
    amount_cents                integer      NOT NULL,
    stripe_payment_intent_id    text,
    stripe_checkout_session_id  text         UNIQUE,              -- idempotency key for webhook
    status                      text         NOT NULL DEFAULT 'pending',
                                             -- 'pending' | 'completed' | 'failed' | 'refunded'
    created_at                  timestamptz  NOT NULL DEFAULT now(),
    completed_at                timestamptz
);

CREATE INDEX IF NOT EXISTS idx_purchases_user_created
    ON ai_credit_purchases (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchases_status
    ON ai_credit_purchases (status);
