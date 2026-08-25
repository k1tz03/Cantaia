-- ============================================================
-- Migration 102: model_error_profiles — scope par organisation
-- ============================================================
--
-- CONSTAT (audit apprentissage 08/2026) : la table 043 avait DEUX écrivains
-- contradictoires (l'un écrivait |erreur| absolue, l'autre l'erreur signée),
-- pas de colonne org (agrégat cross-tenant lu sans filtre), et le lecteur des
-- poids du consensus mélangeait fraction (0.15) et pourcents. Résultat : un
-- provider SANS données pesait ~2,4× un provider mesuré.
--
-- REFONTE (cf. packages/core/src/learning/model-error-profiles.ts) :
--   * UN SEUL writer : recalcule le profil (médiane SIGNÉE en %, nb_corrections)
--     depuis les quantity_corrections de l'ORG au moment de chaque correction.
--   * Les lecteurs filtrent org_id = org courante → plus de fuite cross-tenant.
--   * Poids ÉGAUX dans le consensus tant que nb_corrections < 5.
--
-- Les lignes historiques (contaminées, unités mélangées) gardent org_id NULL :
-- elles sont naturellement EXCLUES par les nouveaux lecteurs (.eq('org_id', …))
-- et pourront être purgées manuellement plus tard.
--
-- Idempotent : safe to re-run.

ALTER TABLE model_error_profiles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

COMMENT ON COLUMN model_error_profiles.org_id IS
  'Migration 102. Organisation propriétaire du profil. NULL = ligne legacy pré-102 (agrégat cross-org contaminé, ignoré par les lecteurs).';

-- L'ancienne contrainte UNIQUE (provider, discipline, type_element_cfc)
-- empêcherait deux orgs d'avoir chacune leur profil pour le même triplet.
ALTER TABLE model_error_profiles
  DROP CONSTRAINT IF EXISTS model_error_profiles_provider_discipline_type_element_cfc_key;

-- Unicité par org (les lignes legacy org_id NULL restent hors contrainte —
-- un index unique ignore les NULL, ce qui est exactement ce qu'on veut).
CREATE UNIQUE INDEX IF NOT EXISTS idx_mep_org_provider_discipline_cfc
  ON model_error_profiles (org_id, provider, discipline, type_element_cfc)
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mep_org ON model_error_profiles (org_id);

-- ────────────────────────────────────────────────────────────
-- RLS — la 043 n'en avait pas du tout (table lisible par tous les rôles)
-- ────────────────────────────────────────────────────────────

ALTER TABLE model_error_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS model_error_profiles_select ON model_error_profiles;
CREATE POLICY model_error_profiles_select ON model_error_profiles
  FOR SELECT USING (
    org_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    OR (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
  );

-- Écritures : service role uniquement (bypass RLS) — pas de policy INSERT/UPDATE.
