-- ============================================================
-- Migration 094: Planning actuals & per-task traceability
-- ============================================================
-- The planning calibration loop was measuring the wrong thing entirely.
--
-- On project completion it computed ONE global ratio
--   (project.end_date - project.start_date) in CALENDAR days
--   ÷ SUM(planning_tasks.duration_days) in WORKING days
-- and copied that single number onto every CFC line. Two unit systems
-- divided by each other, then multiplied across ~21 unrelated trades: the
-- resulting "learning" was noise, and one badly-closed project could poison
-- every future estimate.
--
-- Fixing it needs the actual dates PER TASK, which never existed.
--
-- Consumers:
--   apps/web/src/app/api/projects/[id]/route.ts  → extractPlanningCorrections()
--   packages/core/src/planning/planning-generator.ts → fetchOrgCorrections()

-- ------------------------------------------------------------
-- 1. Actual execution dates, per task
-- ------------------------------------------------------------

ALTER TABLE planning_tasks
  ADD COLUMN IF NOT EXISTS actual_start_date DATE,
  ADD COLUMN IF NOT EXISTS actual_end_date   DATE;

COMMENT ON COLUMN planning_tasks.actual_start_date IS
  'Date reelle de demarrage du lot (saisie conducteur ou deduite des rapports de chantier). NULL = non renseigne, la tache est alors ignoree par la calibration.';
COMMENT ON COLUMN planning_tasks.actual_end_date IS
  'Date reelle de fin du lot. La calibration compare (actual_end - actual_start) en jours OUVRES a duration_days, tache par tache.';

-- Guard: an end date without a start date cannot be measured.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planning_tasks_actual_dates_order'
  ) THEN
    ALTER TABLE planning_tasks
      ADD CONSTRAINT planning_tasks_actual_dates_order
      CHECK (
        actual_end_date IS NULL
        OR actual_start_date IS NULL
        OR actual_end_date >= actual_start_date
      );
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Source items behind an aggregated task
-- ------------------------------------------------------------
-- A generated task now aggregates every submission item of one (phase, CFC)
-- pair. `submission_item_id` only ever held the first one, so the link back to
-- the quantities was lost for all the others.

ALTER TABLE planning_tasks
  ADD COLUMN IF NOT EXISTS source_item_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN planning_tasks.source_item_ids IS
  'Tous les submission_items agreges dans cette tache. submission_item_id garde le premier pour compatibilite.';

-- ------------------------------------------------------------
-- 3. Indexes
-- ------------------------------------------------------------

-- Calibration groups tasks by CFC within one planning.
CREATE INDEX IF NOT EXISTS idx_planning_tasks_planning_cfc
  ON planning_tasks (planning_id, cfc_code)
  WHERE cfc_code IS NOT NULL;

-- Only the tasks that carry actuals are worth scanning at closure time.
CREATE INDEX IF NOT EXISTS idx_planning_tasks_actuals
  ON planning_tasks (planning_id)
  WHERE actual_start_date IS NOT NULL AND actual_end_date IS NOT NULL;

-- fetchOrgCorrections() reads the most recent rows per org.
CREATE INDEX IF NOT EXISTS idx_planning_duration_corrections_org_created
  ON planning_duration_corrections (organization_id, created_at DESC);

-- ------------------------------------------------------------
-- 4. Calibration provenance
-- ------------------------------------------------------------
-- Distinguish a correction learnt from a real closed task from one typed by
-- hand in the Gantt, and record how many observations back it.

ALTER TABLE planning_duration_corrections
  ADD COLUMN IF NOT EXISTS source          TEXT NOT NULL DEFAULT 'manual_edit',
  ADD COLUMN IF NOT EXISTS sample_count    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS planning_task_id UUID REFERENCES planning_tasks(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planning_duration_corrections_source_check'
  ) THEN
    ALTER TABLE planning_duration_corrections
      ADD CONSTRAINT planning_duration_corrections_source_check
      CHECK (source IN ('manual_edit', 'project_closure', 'site_reports'));
  END IF;
END $$;

COMMENT ON COLUMN planning_duration_corrections.source IS
  'manual_edit = duree corrigee a la main dans le Gantt ; project_closure = mesuree a la cloture sur les dates reelles ; site_reports = deduite des heures terrain.';
COMMENT ON COLUMN planning_duration_corrections.sample_count IS
  'Nombre de taches derriere cette correction. fetchOrgCorrections() pondere le coefficient par ce compte.';
