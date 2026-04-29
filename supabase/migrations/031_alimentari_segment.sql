-- 031_alimentari_segment.sql
-- Adds the new "alimentari" (caseifici / botteghe alimentari di paese) target
-- segment to plans.active_segments. Idempotent: only appends if missing.

BEGIN;

UPDATE plans
SET active_segments = active_segments || ARRAY['alimentari']
WHERE active = true
  AND NOT 'alimentari' = ANY(active_segments);

COMMIT;
