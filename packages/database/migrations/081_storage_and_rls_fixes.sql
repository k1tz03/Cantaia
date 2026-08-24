-- Migration 081: Storage + RLS hardening
--
-- Fixes six independent findings from the infra/security audit:
--   1. storage.objects policies for the `submissions` bucket (068) granted
--      SELECT/INSERT/DELETE to EVERY authenticated user with no org scoping
--      → cross-tenant read/delete of confidential submission documents.
--   2. site_report_shares (066) was created WITHOUT RLS → every public share
--      token was listable by any PostgREST session.
--   3. plan_scenes_latest (076) is a plain view → runs with the view owner's
--      rights, bypassing plan_scenes RLS. Needs security_invoker.
--   4. Policies from 045/047 reference a non-existent column `users.org_id`
--      (the real column is `users.organization_id`) → those CREATE POLICY
--      statements abort, leaving the ingestion tables RLS-enabled but
--      policy-less (or the migration half-applied).
--   5. agent_configs SELECT was `USING (true)` (073) → any authenticated user
--      could read the Anthropic agent/environment ids and full agent config.
--   6. user_activity_daily had a single `FOR ALL USING(true) WITH CHECK(true)`
--      policy (063) → any authenticated user could read AND write the whole
--      platform-wide activity table.
--
-- Every block is guarded by an existence check, so this is safe to run on a
-- database where some of migrations 045/047/063/066/073/076 were never applied.
-- Idempotent: safe to re-run.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Storage bucket `submissions` — scope authenticated access to the org
-- ════════════════════════════════════════════════════════════════════════════
--
-- Real path layout written by the app (verified in
-- apps/web/src/app/api/submissions/route.ts:227 and
-- apps/web/src/app/api/submissions/upload-url/route.ts:59):
--
--     {organization_id}/{project_id | "no-project"}/{timestamp}_{filename}
--
-- → the FIRST path segment is always the organization id, so
--   (storage.foldername(name))[1] can be matched against the caller's org.
--
-- One exception: the chunked-PDF analysis pipeline writes
--     chunks/{submission_id}/chunk_{n}.pdf
-- but those objects are created, read and deleted exclusively by
-- createAdminClient() (service role), which is covered by the
-- submissions_service_role_all policy below and bypasses RLS anyway.
--
-- CHOICE: the three `*_authenticated` policies are RE-CREATED org-scoped rather
-- than deleted outright. Removing them entirely would also have been defensible
-- (the API only ever talks to storage through the service role), but 068
-- documents the INSERT policy as required for the browser-direct signed-upload
-- PUT, and dropping it risks breaking large-file uploads. Re-scoping keeps that
-- path working while closing the cross-tenant read/delete hole.
--
-- The org sub-select is the canonical pattern used by migrations 073-076; it
-- resolves because the `users` SELECT policy (054) lets a user read their own row.

DROP POLICY IF EXISTS "submissions_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "submissions_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "submissions_delete_authenticated" ON storage.objects;

-- Service role: unrestricted (re-created here so this migration is self-contained)
DROP POLICY IF EXISTS "submissions_service_role_all" ON storage.objects;
CREATE POLICY "submissions_service_role_all" ON storage.objects
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING     (bucket_id = 'submissions')
  WITH CHECK (bucket_id = 'submissions');

CREATE POLICY "submissions_insert_authenticated" ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "submissions_select_authenticated" ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "submissions_delete_authenticated" ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[1] IN (
      SELECT organization_id::text FROM public.users WHERE id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 2. site_report_shares — enable RLS (was missing entirely in 066)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Columns (066): id, organization_id, token, created_by, expires_at, is_active, created_at.
-- All app access (create / list / revoke / public token resolution) goes through
-- createAdminClient() in /api/site-reports/share and /api/site-reports/public/[token],
-- so writes are intentionally service-role only.

DO $$
BEGIN
  IF to_regclass('public.site_report_shares') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE site_report_shares ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS site_report_shares_superadmin_all ON site_report_shares';
    EXECUTE $pol$
      CREATE POLICY site_report_shares_superadmin_all ON site_report_shares
        FOR ALL
        USING (
          EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true)
        )
        WITH CHECK (
          EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true)
        )
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS site_report_shares_org_select ON site_report_shares';
    EXECUTE $pol$
      CREATE POLICY site_report_shares_org_select ON site_report_shares
        FOR SELECT
        TO authenticated
        USING (
          organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
        )
    $pol$;
  ELSE
    RAISE NOTICE 'site_report_shares not found — skipping (migration 066 not applied)';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. plan_scenes_latest — run the view with the CALLER's rights
-- ════════════════════════════════════════════════════════════════════════════
--
-- Without security_invoker the view executes as its owner and silently bypasses
-- the org-scoped RLS on plan_scenes. Definition copied verbatim from 076.

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
        CASE extraction_status WHEN 'completed' THEN 0 ELSE 1 END,
        created_at DESC
    $view$;
  ELSE
    RAISE NOTICE 'plan_scenes not found — skipping (migration 076 not applied)';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Ingestion tables (045 / 047) — fix `users.org_id` → `users.organization_id`
-- ════════════════════════════════════════════════════════════════════════════
--
-- NOTE: the tables themselves carry a column literally named `org_id`; only the
-- sub-select against `users` was wrong.

DO $$
BEGIN
  IF to_regclass('public.ingested_offer_lines') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "ingested_offers_org_isolation" ON ingested_offer_lines';
    EXECUTE $pol$
      CREATE POLICY "ingested_offers_org_isolation" ON ingested_offer_lines
        FOR ALL
        USING     (org_id = (SELECT organization_id FROM users WHERE id = auth.uid()))
        WITH CHECK (org_id = (SELECT organization_id FROM users WHERE id = auth.uid()))
    $pol$;
  ELSE
    RAISE NOTICE 'ingested_offer_lines not found — skipping (migration 045 not applied)';
  END IF;

  IF to_regclass('public.ingested_plan_quantities') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "ingested_plans_org_isolation" ON ingested_plan_quantities';
    EXECUTE $pol$
      CREATE POLICY "ingested_plans_org_isolation" ON ingested_plan_quantities
        FOR ALL
        USING     (org_id = (SELECT organization_id FROM users WHERE id = auth.uid()))
        WITH CHECK (org_id = (SELECT organization_id FROM users WHERE id = auth.uid()))
    $pol$;
  ELSE
    RAISE NOTICE 'ingested_plan_quantities not found — skipping (migration 045 not applied)';
  END IF;

  IF to_regclass('public.ingested_plan_ratios') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "plan_ratios_org_isolation" ON ingested_plan_ratios';
    EXECUTE $pol$
      CREATE POLICY "plan_ratios_org_isolation" ON ingested_plan_ratios
        FOR ALL
        USING     (org_id = (SELECT organization_id FROM users WHERE id = auth.uid()))
        WITH CHECK (org_id = (SELECT organization_id FROM users WHERE id = auth.uid()))
    $pol$;
  ELSE
    RAISE NOTICE 'ingested_plan_ratios not found — skipping (migration 047 not applied)';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. agent_configs — SELECT restricted to superadmins
-- ════════════════════════════════════════════════════════════════════════════
--
-- The table holds Anthropic agent_id / environment_id and the full agent config
-- (tools, prompt hashes). No application code reads it with an anon/authenticated
-- client — every access is via createAdminClient() — so superadmin-only SELECT is
-- safe. INSERT/UPDATE/DELETE policies from 073 already require is_superadmin.

DO $$
BEGIN
  IF to_regclass('public.agent_configs') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS agent_configs_read ON agent_configs';
    EXECUTE $pol$
      CREATE POLICY agent_configs_read ON agent_configs
        FOR SELECT
        USING (
          EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true)
        )
    $pol$;
  ELSE
    RAISE NOTICE 'agent_configs not found — skipping (migration 073 not applied)';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. user_activity_daily — replace `FOR ALL USING(true)` with scoped SELECT
-- ════════════════════════════════════════════════════════════════════════════
--
-- Writes are performed exclusively by the /api/cron/aggregate-activity job with
-- the service role (which bypasses RLS), so no INSERT/UPDATE/DELETE policy is
-- created: authenticated sessions become read-only, and only on their own rows.
-- Superadmins keep full read access for /super-admin/user-analytics.

DO $$
BEGIN
  IF to_regclass('public.user_activity_daily') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE user_activity_daily ENABLE ROW LEVEL SECURITY';

    -- Remove the permissive catch-all from 063
    EXECUTE 'DROP POLICY IF EXISTS "Service role manages daily" ON user_activity_daily';

    EXECUTE 'DROP POLICY IF EXISTS user_activity_daily_select ON user_activity_daily';
    EXECUTE $pol$
      CREATE POLICY user_activity_daily_select ON user_activity_daily
        FOR SELECT
        TO authenticated
        USING (
          user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true)
        )
    $pol$;
  ELSE
    RAISE NOTICE 'user_activity_daily not found — skipping (migration 063 not applied)';
  END IF;
END $$;
