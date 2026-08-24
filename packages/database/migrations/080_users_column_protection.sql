-- Migration 080: Privilege-escalation guard on `users` + transactional user data migration
--
-- Part A — BEFORE UPDATE trigger on public.users that rejects any change to the
--          privileged columns (role, is_superadmin, organization_id) coming from a
--          regular PostgREST session (role = 'authenticated' / 'anon').
--
--          Why a trigger and not RLS: the service role BYPASSES RLS, but it does NOT
--          bypass triggers. So the trigger must explicitly let the backend through.
--          Detection is done on the JWT `role` claim:
--            - ''             → no JWT at all (psql, migrations, direct connection) → ALLOW
--            - 'service_role' → backend admin client (createAdminClient)            → ALLOW
--            - anything else  → 'authenticated' / 'anon' PostgREST session          → BLOCK
--
--          All legitimate writes to these columns in the app already go through
--          createAdminClient() (auth/callback, invites, admin members tab, super-admin),
--          so this is transparent to the product. No client-side (browser Supabase
--          client) code path updates users.role / is_superadmin / organization_id.
--
-- Part B — migrate_user_data(p_old_user_id, p_new_user_id): SQL replacement for the
--          JS helper migrateUserData() in apps/web/src/app/api/auth/callback/route.ts.
--          The JS version fired 6 UPDATEs + 1 DELETE as independent PostgREST calls:
--          an interruption in the middle left the account half-migrated (SEC2.NC5).
--          A single plpgsql function runs inside one implicit transaction: all of it
--          commits, or none of it does.
--
-- Idempotent: safe to re-run.

-- ════════════════════════════════════════════════════════════════════════════
-- PART A — Privileged column protection on public.users
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION protect_users_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role TEXT;
BEGIN
  -- Read the PostgREST JWT role claim without depending on auth.role()
  -- (both claim shapes are supported: legacy flat claim and the JSON blob).
  v_jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    ''
  );

  -- No JWT (direct DB / migrations) or backend service role → unrestricted.
  IF v_jwt_role = '' OR v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION
      'users.role cannot be changed from a client session (privilege escalation blocked)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.is_superadmin IS DISTINCT FROM OLD.is_superadmin THEN
    RAISE EXCEPTION
      'users.is_superadmin cannot be changed from a client session (privilege escalation blocked)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION
      'users.organization_id cannot be changed from a client session (cross-tenant move blocked)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION protect_users_privileged_columns() IS
  'Migration 080. Blocks client-session (authenticated/anon) updates to users.role, users.is_superadmin and users.organization_id. Service role and direct DB connections pass through.';

DROP TRIGGER IF EXISTS trg_protect_users_privileged_columns ON users;

CREATE TRIGGER trg_protect_users_privileged_columns
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION protect_users_privileged_columns();

-- ════════════════════════════════════════════════════════════════════════════
-- PART B — Transactional user data migration (replaces migrateUserData() in JS)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION migrate_user_data(p_old_user_id UUID, p_new_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_old_user_id IS NULL OR p_new_user_id IS NULL THEN
    RAISE EXCEPTION 'migrate_user_data: both user ids are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- No-op when both ids are the same (mirrors the .neq("id", toUserId) guard).
  IF p_old_user_id = p_new_user_id THEN
    RETURN;
  END IF;

  -- project_members has UNIQUE(project_id, user_id): a straight UPDATE would raise
  -- 23505 whenever both accounts are already members of the same project and abort
  -- the WHOLE transaction. The JS version silently swallowed that error and carried
  -- on; here we drop the redundant old-account rows first so the transaction can
  -- complete. (Deviation from a literal 1:1 port, required for transactional safety.)
  DELETE FROM project_members pm_old
  WHERE pm_old.user_id = p_old_user_id
    AND EXISTS (
      SELECT 1 FROM project_members pm_new
      WHERE pm_new.user_id = p_new_user_id
        AND pm_new.project_id = pm_old.project_id
    );

  -- 1/6
  UPDATE project_members   SET user_id     = p_new_user_id WHERE user_id     = p_old_user_id;
  -- 2/6
  UPDATE tasks             SET assigned_to = p_new_user_id WHERE assigned_to = p_old_user_id;
  -- 3/6
  UPDATE tasks             SET created_by  = p_new_user_id WHERE created_by  = p_old_user_id;
  -- 4/6
  UPDATE email_records     SET user_id     = p_new_user_id WHERE user_id     = p_old_user_id;
  -- 5/6
  UPDATE meetings          SET created_by  = p_new_user_id WHERE created_by  = p_old_user_id;
  -- 6/6
  UPDATE email_connections SET user_id     = p_new_user_id WHERE user_id     = p_old_user_id;

  -- Finally, remove the orphaned profile row.
  DELETE FROM users WHERE id = p_old_user_id AND id <> p_new_user_id;
END;
$$;

COMMENT ON FUNCTION migrate_user_data(UUID, UUID) IS
  'Migration 080. Moves all data references from one user id to another in a single transaction (6 UPDATEs + 1 DELETE). Replaces the non-atomic migrateUserData() helper in /api/auth/callback. Service role only.';

-- Backend-only: never callable from a browser session.
REVOKE ALL ON FUNCTION migrate_user_data(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION migrate_user_data(UUID, UUID) TO service_role;
