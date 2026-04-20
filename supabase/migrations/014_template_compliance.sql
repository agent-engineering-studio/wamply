-- ──────────────────────────────────────────────────────────
-- Migration 014: Persist AI compliance check per template.
--
-- Struttura JSON:
--   {
--     "risk_level": "low" | "medium" | "high",
--     "score": 0.0 - 1.0 (prob. di passare la review),
--     "issues": [{"text": "...", "reason": "...", "suggestion": "..."}],
--     "checked_at": "ISO-8601"
--   }
-- ──────────────────────────────────────────────────────────

ALTER TABLE templates ADD COLUMN compliance_report jsonb;
