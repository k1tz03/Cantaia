-- ============================================================
-- Migration 097: learning_events — métrique d'efficacité de l'apprentissage
-- ============================================================
--
-- CONSTAT (audit apprentissage 08/2026) : le produit ÉCRIT beaucoup de signal
-- d'apprentissage (règles, calibrations, corrections) mais ne MESURE rien :
-- aucun moyen de savoir si une suggestion est acceptée, si une écriture
-- d'apprentissage a échoué en silence (catch {} nus), ni quel module apprend
-- réellement.
--
-- Cette table est le journal d'événements transverse qui rend l'apprentissage
-- MESURABLE :
--   * suggestion_shown / suggestion_accepted / suggestion_rejected
--       → accept-rate par module (ex. suggestion de dossier d'archivage mail)
--   * correction
--       → volume de corrections humaines par module
--   * write_failed
--       → échecs d'écriture des chemins d'apprentissage, jusqu'ici avalés
--         par des catch vides (voir packages/core/src/learning/log.ts)
--
-- Écrivains : backend uniquement (service role), via le helper
-- `logLearningEvent` / `logLearningFailure` de @cantaia/core/learning.
-- Lecteurs : /api/intelligence/stats (à terme), super-admin analytics.
--
-- Idempotent : safe to re-run.

CREATE TABLE IF NOT EXISTS learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Module produit : 'mail', 'mail_folders', 'plans', 'pricing', 'planning',
  -- 'suppliers', ... (texte libre, pas d'enum : les modules évoluent)
  module TEXT NOT NULL,
  -- suggestion_shown | suggestion_accepted | suggestion_rejected |
  -- correction | write_failed
  event_type TEXT NOT NULL,
  -- Qui/quoi a produit la décision : 'learned_rule', 'project_match',
  -- 'keyword_scorer', 'ai', 'auto_calibration', ... (libre)
  decision_source TEXT,
  -- true quand l'événement matérialise une correction humaine d'une décision IA
  was_corrected BOOLEAN,
  -- Contexte libre (folder_id, cfc_code, score, message d'erreur...).
  -- Ne JAMAIS y mettre de contenu d'email ni de données personnelles.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE learning_events IS
  'Migration 097. Journal transverse des événements d''apprentissage — rend mesurables l''accept-rate des suggestions et les échecs d''écriture (write_failed). Écrit par le backend via @cantaia/core/learning.';

CREATE INDEX IF NOT EXISTS idx_learning_events_org_module_date
  ON learning_events (organization_id, module, created_at);

-- ────────────────────────────────────────────────────────────
-- RLS — pattern org standard + superadmin (cf. migration 090)
-- ────────────────────────────────────────────────────────────

ALTER TABLE learning_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_events_select ON learning_events;
CREATE POLICY learning_events_select ON learning_events
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    OR (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
  );

-- Pas de policy INSERT/UPDATE/DELETE volontairement : seules les routes
-- serveur (service role, bypass RLS) écrivent dans ce journal.
