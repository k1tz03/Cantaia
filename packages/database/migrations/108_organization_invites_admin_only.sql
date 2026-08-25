-- ============================================================
-- Migration 108: restrict organization_invites writes to org admins
-- ============================================================
-- 016 created the invites table with INSERT/UPDATE/DELETE policies gated only on
-- `organization_id = caller's org` — so ANY member of an org could create an
-- invitation, including one with role='admin', and self-escalate by accepting it.
-- Tighten write access to org admins/directors (ORG_ADMIN_ROLES) + superadmins,
-- matching requireOrgAdmin() on the application side. SELECT stays open to all
-- org members (they may need to see pending invites).
--
-- The invite-acceptance path (registerAction marking status='accepted') runs with
-- the service role, which bypasses RLS — unaffected by this tightening.
--
-- Idempotent: to_regclass guard + DROP POLICY IF EXISTS before each CREATE.

DO $$
BEGIN
  IF to_regclass('public.organization_invites') IS NULL THEN
    RAISE NOTICE 'organization_invites not found — skipping (migration 016 not applied)';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY';

  -- SELECT: any member of the org (+ superadmin) — unchanged intent, recreated.
  EXECUTE 'DROP POLICY IF EXISTS "org_invites_select" ON organization_invites';
  EXECUTE $pol$
    CREATE POLICY "org_invites_select" ON organization_invites FOR SELECT
      USING (
        organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
        OR (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
      )
  $pol$;

  -- INSERT: org admins/directors (+ superadmin) only.
  EXECUTE 'DROP POLICY IF EXISTS "org_invites_insert" ON organization_invites';
  EXECUTE $pol$
    CREATE POLICY "org_invites_insert" ON organization_invites FOR INSERT
      WITH CHECK (
        (
          organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
          AND (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'director')
        )
        OR (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
      )
  $pol$;

  -- UPDATE: org admins/directors (+ superadmin) only.
  EXECUTE 'DROP POLICY IF EXISTS "org_invites_update" ON organization_invites';
  EXECUTE $pol$
    CREATE POLICY "org_invites_update" ON organization_invites FOR UPDATE
      USING (
        (
          organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
          AND (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'director')
        )
        OR (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
      )
      WITH CHECK (
        (
          organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
          AND (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'director')
        )
        OR (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
      )
  $pol$;

  -- DELETE: org admins/directors (+ superadmin) only.
  EXECUTE 'DROP POLICY IF EXISTS "org_invites_delete" ON organization_invites';
  EXECUTE $pol$
    CREATE POLICY "org_invites_delete" ON organization_invites FOR DELETE
      USING (
        (
          organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
          AND (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'director')
        )
        OR (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
      )
  $pol$;
END $$;
