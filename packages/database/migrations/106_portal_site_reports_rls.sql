-- ============================================================
-- Migration 106: RLS on site_reports / site_report_entries / portal_crew_members
-- ============================================================
-- The three tables created by 061 (portail chef d'équipe) never had RLS. 093
-- later added sensitive data: hourly_rate_chf (per-worker hourly rate — a value
-- the crew endpoint explicitly refuses to expose to the portal) and signatures
-- (signature_data / conductor_signature_data, the evidential value of a
-- delivery-note report). Without RLS these are readable/writable cross-tenant
-- with the anon key.
--
-- App access model:
--   - Conductor (app) : org-scoped via projects.organization_id.
--   - Portal (public) : goes through createAdminClient() (service role, PIN/JWT
--                        gated in the route), which bypasses RLS — so NO anon
--                        policy is created. Service-role-only by design.
--
-- Idempotent: to_regclass guards + DROP POLICY IF EXISTS. Safe to re-run.

-- ── site_reports : org via projects ─────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.site_reports') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE site_reports ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS site_reports_org_all ON site_reports';
    EXECUTE $pol$
      CREATE POLICY site_reports_org_all ON site_reports
        FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = site_reports.project_id
              AND p.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = site_reports.project_id
              AND p.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
          )
        )
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS site_reports_superadmin_all ON site_reports';
    EXECUTE $pol$
      CREATE POLICY site_reports_superadmin_all ON site_reports
        FOR ALL
        USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true))
        WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true))
    $pol$;
  ELSE
    RAISE NOTICE 'site_reports not found — skipping (migration 061 not applied)';
  END IF;
END $$;

-- ── site_report_entries : org via report → project ──────────────────────────
DO $$
BEGIN
  IF to_regclass('public.site_report_entries') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE site_report_entries ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS site_report_entries_org_all ON site_report_entries';
    EXECUTE $pol$
      CREATE POLICY site_report_entries_org_all ON site_report_entries
        FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM site_reports sr
            JOIN projects p ON p.id = sr.project_id
            WHERE sr.id = site_report_entries.report_id
              AND p.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM site_reports sr
            JOIN projects p ON p.id = sr.project_id
            WHERE sr.id = site_report_entries.report_id
              AND p.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
          )
        )
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS site_report_entries_superadmin_all ON site_report_entries';
    EXECUTE $pol$
      CREATE POLICY site_report_entries_superadmin_all ON site_report_entries
        FOR ALL
        USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true))
        WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true))
    $pol$;
  ELSE
    RAISE NOTICE 'site_report_entries not found — skipping (migration 061 not applied)';
  END IF;
END $$;

-- ── portal_crew_members : org via project ───────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.portal_crew_members') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE portal_crew_members ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS portal_crew_members_org_all ON portal_crew_members';
    EXECUTE $pol$
      CREATE POLICY portal_crew_members_org_all ON portal_crew_members
        FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = portal_crew_members.project_id
              AND p.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = portal_crew_members.project_id
              AND p.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
          )
        )
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS portal_crew_members_superadmin_all ON portal_crew_members';
    EXECUTE $pol$
      CREATE POLICY portal_crew_members_superadmin_all ON portal_crew_members
        FOR ALL
        USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true))
        WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true))
    $pol$;
  ELSE
    RAISE NOTICE 'portal_crew_members not found — skipping (migration 061 not applied)';
  END IF;
END $$;
