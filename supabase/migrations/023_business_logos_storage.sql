-- ──────────────────────────────────────────────────────────
-- Migration 023: placeholder — storage is handled via backend filesystem
-- (volume mount /app/storage/business-logos/) served by FastAPI. No DB
-- changes needed. See backend/src/api/business.py upload endpoint.
-- ──────────────────────────────────────────────────────────
SELECT 1;
