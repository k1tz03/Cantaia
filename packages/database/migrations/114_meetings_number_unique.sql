-- ============================================================
-- Migration 114: unique séance number per project (Agent PVV)
-- ============================================================
-- PV séance numbers are references quoted in the room, in e-mails and in the
-- next PV. POST /api/pv computed the next number with SELECT max + 1 then
-- INSERT, without any uniqueness guard: two concurrent creations on the same
-- project produced the same n°, silently colliding.
--
-- This adds a UNIQUE (project_id, meeting_number) index so the DB rejects the
-- collision (23505); the API now retries an auto-assigned number and 409s a
-- client-supplied duplicate.
--
-- Idempotent. If the table already holds duplicate (project_id, meeting_number)
-- rows (possible on a database that ran without this guard), the CREATE fails
-- with unique_violation — caught here so the migration still completes; the
-- app-level retry keeps working. Dedupe the offending rows, then re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'meetings_project_number_unique'
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX meetings_project_number_unique
        ON meetings (project_id, meeting_number)
        WHERE meeting_number IS NOT NULL;
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'Skipping meetings_project_number_unique: duplicate (project_id, meeting_number) rows exist. Dedupe first, then re-run migration 114.';
    END;
  END IF;
END $$;
