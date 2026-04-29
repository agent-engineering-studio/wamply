-- 032_caseifici_segment.sql
-- Splits the original "alimentari & caseifici" target segment into two distinct
-- ones: alimentari (general village grocery) and caseifici (dairy producers).
-- Adds the new "caseifici" segment to plans.active_segments. Idempotent.

BEGIN;

UPDATE plans
SET active_segments = active_segments || ARRAY['caseifici']
WHERE active = true
  AND NOT 'caseifici' = ANY(active_segments);

COMMIT;
