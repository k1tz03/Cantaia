-- ============================================================
-- Migration 098: Explicit ON DELETE on every projects(id) FK
-- ============================================================
-- Problem
-- -------
-- DELETE /api/projects/[id] fails (23503 foreign_key_violation) as soon as the
-- project has ever been touched by one of the modules below. Eight FKs point at
-- projects(id) with NO explicit ON DELETE clause, so PostgreSQL defaults to
-- NO ACTION: the delete is refused and the user sees "Failed to delete project"
-- with no explanation. The tables created later (tasks, meetings, plans, …)
-- already carry ON DELETE CASCADE — these eight were simply forgotten.
--
-- Semantics — why CASCADE for some and SET NULL for others
-- --------------------------------------------------------
-- SET NULL  = the row has standalone value and must outlive the project.
-- CASCADE   = the row is a pure artifact of the project and is meaningless
--             (or actively misleading) once the project is gone.
--
--   client_visits.project_id                    → SET NULL
--       A visit is a *client* record (prospect history, transcription, photos,
--       report). Deleting a project must never destroy commercial history — the
--       visit simply goes back to being an unlinked / prospect visit. This also
--       matches the conversion flow (§ POST /api/projects/create source_visit_id),
--       which is what sets project_id in the first place.
--
--   pricing_alerts.project_id                   → CASCADE
--       "Ce prix est 18% au-dessus du marché sur le projet X." Without X the
--       alert cannot be acted on, and it would keep firing in the alert list.
--
--   price_extraction_jobs.project_id            → CASCADE
--       Transient job rows (queue + progress) scoped to one project's files.
--
--   estimate_accuracy_log.project_id            → CASCADE
--       Deliberate trade-off, documented: this is the one row type that carries
--       residual learning value (estimated vs actual price per CFC), so an
--       argument exists for SET NULL. CASCADE is kept because the log is also
--       the audit trail of a specific estimate — an orphaned "we were 12% off"
--       row that can no longer be traced back to its plan/estimate would be
--       unfalsifiable input to the calibration engine. The durable signal lives
--       in price_calibrations / quantity_corrections, which are org-scoped and
--       untouched by this migration.
--
--   cross_plan_verifications.project_id         → CASCADE
--       Column is NOT NULL (migration 043) so SET NULL is not even possible.
--       The row is a coherence check *between plans of that project*.
--
--   submission_price_requests.project_id        → CASCADE
--       A price request belongs to a submission of that project; the submission
--       itself already cascades.
--
--   email_classification_feedback.
--       original_project_id / corrected_project_id → SET NULL
--       Pure learning signal ("this email was misclassified"). It must survive:
--       destroying it would silently degrade the classifier for the whole org.
--       Both columns are nullable, so the feedback row stays, minus provenance.
--
--   emails.ai_suggested_project_id              → SET NULL
--       A *suggestion*, not a link. The email itself is never deleted with the
--       project (the DELETE route declassifies emails explicitly), so the
--       suggestion pointer just has to stop dangling.
--
-- Implementation notes
-- --------------------
-- Idempotent and defensive: each FK is looked up by (table, column) in
-- pg_constraint rather than by a hard-coded name, because several of these
-- tables were created with `CREATE TABLE IF NOT EXISTS` across different
-- migrations and may carry a non-default constraint name. Tables that do not
-- exist yet (migrations not applied) are skipped silently.

-- ------------------------------------------------------------
-- Helper: re-point one FK column at projects(id) with an action
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.retarget_project_fk(
  p_table   TEXT,
  p_column  TEXT,
  p_action  TEXT  -- 'CASCADE' | 'SET NULL'
) RETURNS VOID AS $fn$
DECLARE
  v_conname TEXT;
BEGIN
  -- Table absent (migration not applied on this database) → nothing to do.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) THEN
    RAISE NOTICE '[098] skip %.% — table does not exist', p_table, p_column;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column
  ) THEN
    RAISE NOTICE '[098] skip %.% — column does not exist', p_table, p_column;
    RETURN;
  END IF;

  -- Find the existing FK on that single column pointing at projects.
  SELECT con.conname INTO v_conname
  FROM pg_constraint con
  JOIN pg_class      src ON src.oid = con.conrelid
  JOIN pg_class      tgt ON tgt.oid = con.confrelid
  JOIN pg_attribute  att ON att.attrelid = con.conrelid
                        AND att.attnum   = con.conkey[1]
  WHERE con.contype = 'f'
    AND src.relname = p_table
    AND tgt.relname = 'projects'
    AND att.attname = p_column
    AND array_length(con.conkey, 1) = 1
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', p_table, v_conname);
  END IF;

  EXECUTE format(
    'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.projects(id) ON DELETE %s',
    p_table,
    p_table || '_' || p_column || '_fkey',
    p_column,
    p_action
  );

  RAISE NOTICE '[098] %.% → ON DELETE %', p_table, p_column, p_action;
END;
$fn$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Apply
-- ------------------------------------------------------------
DO $$
BEGIN
  -- Survive the project
  PERFORM pg_temp.retarget_project_fk('client_visits',                 'project_id',           'SET NULL');
  PERFORM pg_temp.retarget_project_fk('email_classification_feedback', 'original_project_id',  'SET NULL');
  PERFORM pg_temp.retarget_project_fk('email_classification_feedback', 'corrected_project_id', 'SET NULL');
  PERFORM pg_temp.retarget_project_fk('emails',                        'ai_suggested_project_id', 'SET NULL');
  -- `emails` was renamed from `email_records` by migration 019; on a database
  -- where 019 has not run, the column lives on email_records instead.
  PERFORM pg_temp.retarget_project_fk('email_records',                 'ai_suggested_project_id', 'SET NULL');

  -- Die with the project
  PERFORM pg_temp.retarget_project_fk('pricing_alerts',            'project_id', 'CASCADE');
  PERFORM pg_temp.retarget_project_fk('price_extraction_jobs',     'project_id', 'CASCADE');
  PERFORM pg_temp.retarget_project_fk('estimate_accuracy_log',     'project_id', 'CASCADE');
  PERFORM pg_temp.retarget_project_fk('cross_plan_verifications',  'project_id', 'CASCADE');
  PERFORM pg_temp.retarget_project_fk('submission_price_requests', 'project_id', 'CASCADE');
END $$;

-- ------------------------------------------------------------
-- reception_reserves.task_id — the reserve → task link (module Clôture)
-- ------------------------------------------------------------
-- Migration 010 declared `task_id UUID REFERENCES tasks(id)` with no action.
-- Since reserves now auto-create a task, deleting that task from the Tâches
-- module would block on the FK. The reserve must survive its task.
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'reception_reserves'
  ) THEN
    RETURN;
  END IF;

  SELECT con.conname INTO v_conname
  FROM pg_constraint con
  JOIN pg_class      src ON src.oid = con.conrelid
  JOIN pg_class      tgt ON tgt.oid = con.confrelid
  JOIN pg_attribute  att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
  WHERE con.contype = 'f'
    AND src.relname = 'reception_reserves'
    AND tgt.relname = 'tasks'
    AND att.attname = 'task_id'
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.reception_reserves DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE public.reception_reserves
    ADD CONSTRAINT reception_reserves_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;
END $$;

-- ------------------------------------------------------------
-- client_visits.converted_project_id (migration 064)
-- ------------------------------------------------------------
-- Added as a plain UUID by 064 (no FK). Give it a real FK now that the
-- prospect → project conversion writes it deterministically, with SET NULL so
-- deleting the converted project does not delete the visit that produced it.
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'client_visits'
          AND column_name = 'converted_project_id')
     AND NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'client_visits_converted_project_id_fkey')
  THEN
    ALTER TABLE public.client_visits
      ADD CONSTRAINT client_visits_converted_project_id_fkey
      FOREIGN KEY (converted_project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Indexes the DELETE cascade / SET NULL passes need
-- ------------------------------------------------------------
-- Without an index on the referencing column, PostgreSQL full-scans the child
-- table for every parent row deleted. Guarded: several of these tables only
-- exist once their own migration has been applied.
DO $$
DECLARE
  spec  TEXT[];
  specs TEXT[][] := ARRAY[
    ARRAY['idx_client_visits_project',         'client_visits',            'project_id'],
    ARRAY['idx_pricing_alerts_project',        'pricing_alerts',           'project_id'],
    ARRAY['idx_price_extraction_jobs_project', 'price_extraction_jobs',    'project_id'],
    ARRAY['idx_cross_plan_verif_project',      'cross_plan_verifications', 'project_id'],
    ARRAY['idx_subm_price_requests_project',   'submission_price_requests','project_id'],
    ARRAY['idx_reception_reserves_task',       'reception_reserves',       'task_id']
  ];
BEGIN
  FOREACH spec SLICE 1 IN ARRAY specs LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = spec[2] AND column_name = spec[3]
    ) THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(%I)', spec[1], spec[2], spec[3]);
    END IF;
  END LOOP;
END $$;
