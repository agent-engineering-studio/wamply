-- ──────────────────────────────────────────────────────────
-- Migration 015: Link AI-translated templates to their source.
--
-- Quando l'utente traduce un template "Benvenuto" in EN/ES, i
-- nuovi record puntano al template originale tramite
-- source_template_id. Utile per:
--   - raggruppare versioni multi-lingua nella UI
--   - propagare modifiche (futuro)
--   - tracciare la lingua di partenza per il compliance check
-- ──────────────────────────────────────────────────────────

ALTER TABLE templates
    ADD COLUMN source_template_id uuid
        REFERENCES templates(id) ON DELETE SET NULL;

CREATE INDEX idx_templates_source_template_id
    ON templates (source_template_id)
    WHERE source_template_id IS NOT NULL;
