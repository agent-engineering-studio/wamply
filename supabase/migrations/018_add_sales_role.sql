-- Add 'sales' to user_role enum. Must be in its own migration so Postgres
-- commits the new label before later migrations reference it in INSERTs.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales';
