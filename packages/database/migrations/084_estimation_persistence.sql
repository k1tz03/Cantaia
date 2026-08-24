-- ============================================================
-- CANTAIA — Migration 084: Estimation persistence realignment
-- ============================================================
-- Context (audit B1/B3/B7/B8/B9/B10/B13):
--   The 4-pass estimation pipeline (Passe 1-4, `packages/core/src/plans/
--   estimation/pipeline.ts`) used to write its result into `plan_analyses`
--   with columns that DO NOT EXIST there (`analysis_type`, `result`,
--   `confidence_score`) while omitting several NOT NULL columns
--   (`plan_version_id`, `project_id`, `model_used`, `analysis_result`).
--   Every write failed silently → no estimation was ever persisted, and
--   the six readers that expected `plan_analyses.analysis_type =
--   'estimation_v2'` were permanently empty (Scene3D extraction, quantity
--   corrections, price calibration, cross-plan verification, bureau
--   enrichment, auto-calibration).
--
-- Architectural decision (imposed):
--   `plan_estimates` (migration 022) is THE persistence table for the V2
--   pipeline result. `plan_analyses` (migration 012) stays reserved for
--   Vision analyses (`analysis_result`).
--
-- `plan_estimates` as created in 022 assumes the estimate always descends
-- from a persisted Vision analysis row (`plan_analysis_id` NOT NULL). The
-- V2 pipeline does not create such a row — passes 1-3 live inside the
-- pipeline result itself. This migration relaxes exactly that constraint
-- and adds safety defaults so a partial insert cannot 23502 the whole run.
--
-- Also fixes `bureau_profiles` (migration 043): `calibration-engine.ts`
-- writes `avg_quality_score`, a column that was never created — every
-- bureau profile update failed (swallowed by a non-fatal try/catch).
--
-- Idempotent. Safe to re-run. No data migration needed (the affected
-- tables were never successfully written to through these paths).
-- ============================================================

-- ------------------------------------------------------------
-- 1) plan_estimates — allow standalone V2 pipeline estimates
-- ------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'plan_estimates') THEN

    -- The V2 pipeline has no parent plan_analyses row.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'plan_estimates'
        AND column_name = 'plan_analysis_id' AND is_nullable = 'NO'
    ) THEN
      ALTER TABLE plan_estimates ALTER COLUMN plan_analysis_id DROP NOT NULL;
    END IF;

    -- Defaults so a caller that omits these cannot violate NOT NULL.
    ALTER TABLE plan_estimates ALTER COLUMN config          SET DEFAULT '{}'::jsonb;
    ALTER TABLE plan_estimates ALTER COLUMN estimate_result SET DEFAULT '{}'::jsonb;

    -- "latest estimate for this plan" is now a hot path (Scene3D extraction,
    -- corrections, calibration, cross-plan verification all read it).
    CREATE INDEX IF NOT EXISTS idx_plan_estimates_plan_created
      ON plan_estimates (plan_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_plan_estimates_org_project_created
      ON plan_estimates (organization_id, project_id, created_at DESC);

    COMMENT ON TABLE plan_estimates IS
      'Persisted result of the 4-pass estimation pipeline (V2). estimate_result holds the full EstimationPipelineResult JSON (passe1, consensus_metrage, passe3, passe4, pipeline_stats). plan_analysis_id is NULL for standalone V2 runs.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2) bureau_profiles — column written by calibration-engine.ts
-- ------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'bureau_profiles') THEN

    ALTER TABLE bureau_profiles
      ADD COLUMN IF NOT EXISTS avg_quality_score NUMERIC;

    COMMENT ON COLUMN bureau_profiles.bureau_nom_hash IS
      'SHA-256 of the lowercased/trimmed bureau name. Single source of truth for lookups — see bureauNomHash() in packages/core/src/plans/estimation/calibration-engine.ts. Both the estimation pipeline and the quantity-correction route must use it.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3) model_error_profiles — relax NOT NULLs the writers cannot fill
-- ------------------------------------------------------------
-- The C2 aggregate is built incrementally, one correction at a time. The
-- first write for a (provider, discipline, cfc) triple only knows the
-- running mean; median and stddev need >= 2 samples. The API layer now
-- supplies explicit 0 defaults, but keeping server-side defaults means a
-- future writer cannot break the loop again.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'model_error_profiles') THEN

    ALTER TABLE model_error_profiles ALTER COLUMN nb_corrections     SET DEFAULT 0;
    ALTER TABLE model_error_profiles ALTER COLUMN contributor_count  SET DEFAULT 1;
    ALTER TABLE model_error_profiles ALTER COLUMN ecart_moyen_pct    SET DEFAULT 0;
    ALTER TABLE model_error_profiles ALTER COLUMN ecart_median_pct   SET DEFAULT 0;
    ALTER TABLE model_error_profiles ALTER COLUMN ecart_stddev_pct   SET DEFAULT 0;
  END IF;
END $$;
