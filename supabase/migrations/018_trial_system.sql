-- 018_trial_system.sql
-- Trial support: reminder idempotency flags + auto-create trial subscription on signup.

-- ── Reminder flags on subscriptions ──────────────────────

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS trial_reminder_3d_sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS trial_reminder_1d_sent_at timestamptz;

-- ── Trial-aware handle_new_user ──────────────────────────
-- Replaces the trigger function to also insert a 14-day trial subscription
-- on the Professional plan. Idempotent: skips if the user already has a sub.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    pro_plan_id uuid;
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

    SELECT id INTO pro_plan_id FROM public.plans WHERE slug = 'professional' LIMIT 1;
    IF pro_plan_id IS NOT NULL THEN
        INSERT INTO public.subscriptions (
            user_id, plan_id, status,
            current_period_start, current_period_end
        )
        VALUES (
            NEW.id, pro_plan_id, 'trialing',
            now(), now() + interval '14 days'
        )
        ON CONFLICT (user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
