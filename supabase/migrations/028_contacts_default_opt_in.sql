-- Migration 028: contacts.opt_in defaults to true
--
-- Rationale: Wamply is a B2B SME platform where users add contacts they have
-- an existing business relationship with (clients, qualified leads). The
-- previous default (false) caused silent campaign failures: contacts created
-- via the chat assistant or seed scripts had no opt-in flag and were filtered
-- out by the planner, leaving users with permanently-failed campaigns and no
-- feedback. The legal opt-in obligation remains the user's responsibility;
-- this migration removes the technical friction without removing the field.
--
-- Backfill: only rows that look "implicit" (no opt_in_date, opt_in=false) get
-- promoted to true. Rows that were explicitly set false (with opt_in_date set
-- — e.g., via reset, or future opt-out webhook) are left alone.

ALTER TABLE contacts ALTER COLUMN opt_in SET DEFAULT true;

UPDATE contacts
   SET opt_in = true,
       opt_in_date = COALESCE(opt_in_date, created_at, now())
 WHERE opt_in = false
   AND opt_in_date IS NULL;
