-- Migration 113: `plan_scenes_latest` must surface a re-extraction in progress
--
-- Bug (076 + 081 ordering):
--   ORDER BY plan_id, CASE extraction_status WHEN 'completed' THEN 0 ELSE 1 END,
--            created_at DESC
--   As long as ANY completed scene existed, the view pinned it — so a fresh
--   re-extraction (a new `processing` row) was NEVER returned by
--   GET /api/plans/:id/scene. The client debited 40 credits, showed
--   "extracting…", then polled the OLD completed scene forever: the new run was
--   invisible until (if ever) it also reached completed.
--
-- Fix: prefer the most RECENT non-failed row.
--   * A new `processing` re-extraction is the newest non-failed row → shown
--     immediately, so polling tracks the run the user just launched.
--   * When it completes, the completed row is newest → shown.
--   * When it FAILS, the failed row is de-prioritised and the previous
--     `completed` scene resurfaces — the user keeps a usable scene instead of
--     being stranded on an error. The failed row is still reachable directly by
--     id for retry/diagnostics.
--
-- security_invoker is preserved (081) so the view honours plan_scenes RLS.
-- Idempotent: CREATE OR REPLACE VIEW.

DO $$
BEGIN
  IF to_regclass('public.plan_scenes') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW plan_scenes_latest
      WITH (security_invoker = true) AS
      SELECT DISTINCT ON (plan_id)
        id,
        plan_id,
        organization_id,
        parent_scene_id,
        schema_version,
        scene_data,
        extraction_status,
        error_message,
        confidence_score,
        model_divergence,
        extracted_by,
        extracted_at,
        tokens_used,
        cost_chf,
        created_at,
        updated_at
      FROM plan_scenes
      ORDER BY
        plan_id,
        -- Failed runs sink below anything still usable (processing/pending/completed)
        CASE extraction_status WHEN 'failed' THEN 1 ELSE 0 END,
        created_at DESC
    $view$;
  ELSE
    RAISE NOTICE 'plan_scenes not found — skipping (migration 076 not applied)';
  END IF;
END $$;
