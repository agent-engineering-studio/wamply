-- ─── Stripe webhook events log ──────────────────────────────
-- Append-only audit trail for Stripe webhook deliveries. Powers the admin
-- "Pagamenti" tab so operators can verify webhooks are arriving and
-- diagnose sync issues without leaving Wamply for the Stripe Dashboard.

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id text          NOT NULL UNIQUE,
    event_type      text          NOT NULL,
    status          text          NOT NULL CHECK (status IN ('received', 'processed', 'error')),
    error_message   text,
    payload_summary jsonb,         -- compact snapshot: object id, customer, status, etc.
    received_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_received_at
    ON stripe_webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type
    ON stripe_webhook_events (event_type);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Admin-only read access; writes happen via service role (webhook handler).
CREATE POLICY stripe_webhook_events_admin_read ON stripe_webhook_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
              AND users.role IN ('admin', 'collaborator')
        )
    );
