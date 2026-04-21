-- 019_free_plan_and_stripe.sql
-- Introduces a 'free' plan (zero limits) for users whose trial expired without
-- adding a payment method. Also ensures stripe_product_id column exists on plans
-- so we can store Stripe linkage alongside price IDs.

-- ── Add stripe_product_id if missing ─────────────────────

ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS stripe_product_id text;

-- ── Insert 'free' plan (price 0, limits 0, no features) ──

INSERT INTO plans (
    name, slug, price_cents,
    max_campaigns_month, max_contacts, max_messages_month, max_templates,
    max_team_members, llm_model, features, active
) VALUES (
    'Free', 'free', 0,
    0, 0, 0, 0,
    1, 'claude-haiku-4-5-20251001',
    '{
        "ab_testing": false,
        "api_access": false,
        "byok_llm": false,
        "team_members": false,
        "approval_workflow": false,
        "analytics_advanced": false,
        "webhook_events": false,
        "white_label": false,
        "export_data": false,
        "custom_sender_name": false,
        "agent_ai": false
    }'::jsonb,
    true
)
ON CONFLICT (slug) DO NOTHING;
