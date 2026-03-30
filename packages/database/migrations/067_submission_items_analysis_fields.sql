-- Migration 067: Add missing columns to submission_items for AI analysis pipeline
-- These columns were referenced in analyze/route.ts but never added via migration.

ALTER TABLE submission_items
  ADD COLUMN IF NOT EXISTS item_number TEXT,
  ADD COLUMN IF NOT EXISTS material_group TEXT DEFAULT 'Divers',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Index for grouping by material (used in comparison and display)
CREATE INDEX IF NOT EXISTS idx_submission_items_material_group
  ON submission_items (submission_id, material_group);

-- Index for status filtering (pending/extracted/error)
CREATE INDEX IF NOT EXISTS idx_submission_items_status
  ON submission_items (submission_id, status);

COMMENT ON COLUMN submission_items.item_number IS 'Numéro de poste extrait du document (ex: 1.1, 2.3.1, 401)';
COMMENT ON COLUMN submission_items.material_group IS 'Groupe matériau IA (ex: Béton armé, Menuiserie, Étanchéité)';
COMMENT ON COLUMN submission_items.status IS 'Statut extraction: pending | extracted | error';
COMMENT ON COLUMN submission_items.metadata IS 'Métadonnées IA: { ai_confidence, extraction_model, extracted_at }';
