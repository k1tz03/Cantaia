-- ============================================================
-- Migration 107: close FOR ALL USING(true) policies
-- ============================================================
-- 007 ("Service role can manage briefings") and 009 (admin_activity_logs,
-- admin_daily_metrics, admin_config) each created a `FOR ALL USING(true)
-- WITH CHECK(true)` policy with NO `TO service_role` clause. The service role
-- bypasses RLS anyway, so those policies only ever served to open the tables to
-- the `authenticated` AND `anon` roles — anyone with the anon key could read and
-- write them.
--
-- Fix (pattern of 081 block 6): drop the four open policies. All writes to these
-- tables happen through createAdminClient() (service role), so they become
-- service-role-only.
--   - daily_briefings keeps its legitimate access: the user SELECT policy (007)
--     and the org-scoped policy (031).
--   - admin_activity_logs / admin_daily_metrics / admin_config keep NO policy →
--     service-role only (super-admin dashboards read them via the service role).
--
-- RLS is (re)enabled defensively so dropping the catch-all cannot leave a table
-- silently world-open. Idempotent: to_regclass guards + DROP POLICY IF EXISTS.

DO $$
BEGIN
  -- daily_briefings — drop the USING(true) catch-all only
  IF to_regclass('public.daily_briefings') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Service role can manage briefings" ON daily_briefings';
  ELSE
    RAISE NOTICE 'daily_briefings not found — skipping (migration 007 not applied)';
  END IF;

  -- admin_activity_logs — drop the USING(true) catch-all → service-role only
  IF to_regclass('public.admin_activity_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE admin_activity_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Service role can manage activity logs" ON admin_activity_logs';
  ELSE
    RAISE NOTICE 'admin_activity_logs not found — skipping (migration 009 not applied)';
  END IF;

  -- admin_daily_metrics — drop the USING(true) catch-all → service-role only
  IF to_regclass('public.admin_daily_metrics') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE admin_daily_metrics ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Service role can manage daily metrics" ON admin_daily_metrics';
  ELSE
    RAISE NOTICE 'admin_daily_metrics not found — skipping (migration 009 not applied)';
  END IF;

  -- admin_config — drop the USING(true) catch-all → service-role only
  IF to_regclass('public.admin_config') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Service role can manage admin config" ON admin_config';
  ELSE
    RAISE NOTICE 'admin_config not found — skipping (migration 009 not applied)';
  END IF;
END $$;
