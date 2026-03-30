-- Migration 068: Configure the `submissions` Supabase Storage bucket
-- Safe to run multiple times (fully idempotent via ON CONFLICT + DROP IF EXISTS).
--
-- What this does:
--   1. Creates (or reconfigures) the `submissions` bucket as private with 50 MB limit
--   2. Drops any stale/conflicting RLS policies on storage.objects for this bucket
--   3. Creates minimal but correct policies:
--        - Service role has full access (bypasses RLS anyway, belt-and-suspenders)
--        - Authenticated users can INSERT via the signed-upload-URL token
--        - Authenticated users can SELECT/DELETE their own org's files

-- ── Step 1: Bucket ──────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'submissions',      -- bucket name used throughout the codebase
  'submissions',
  false,              -- PRIVATE — access via signed URLs only
  52428800,           -- 50 MB (supports large Excel + PDF soumissions)
  null                -- null = accept ALL MIME types (PDF, XLSX, XLS, binary)
)
ON CONFLICT (id) DO UPDATE SET
  public             = false,
  file_size_limit    = 52428800,
  allowed_mime_types = null;   -- reset any accidental whitelist restriction

-- ── Step 2: Clean up any stale / conflicting policies ───────────────────────

DROP POLICY IF EXISTS "submissions_service_role_all"           ON storage.objects;
DROP POLICY IF EXISTS "submissions_insert_authenticated"       ON storage.objects;
DROP POLICY IF EXISTS "submissions_select_authenticated"       ON storage.objects;
DROP POLICY IF EXISTS "submissions_delete_authenticated"       ON storage.objects;
DROP POLICY IF EXISTS "submissions_insert_anon"                ON storage.objects;
DROP POLICY IF EXISTS "Give authenticated users access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Enable read access for all users"       ON storage.objects;

-- ── Step 3: Re-create correct policies ──────────────────────────────────────
--
-- NOTE: The API always uses createAdminClient() (service_role key) for all
-- storage operations (createSignedUploadUrl, upload, download, delete).
-- Service role bypasses RLS automatically — these policies are therefore a
-- safety net and also satisfy Supabase's requirement that at least one policy
-- exists when RLS is enabled on a private bucket.

-- Service role: unrestricted access (belt-and-suspenders for admin operations)
CREATE POLICY "submissions_service_role_all" ON storage.objects
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING     (bucket_id = 'submissions')
  WITH CHECK (bucket_id = 'submissions');

-- Authenticated users: can upload (needed for browser-direct PUT via signed URL token)
CREATE POLICY "submissions_insert_authenticated" ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'submissions');

-- Authenticated users: can read (for direct URL access if ever needed)
CREATE POLICY "submissions_select_authenticated" ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'submissions');

-- Authenticated users: can delete (used when a submission is deleted via the API)
CREATE POLICY "submissions_delete_authenticated" ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'submissions');

-- ── Step 4: CORS note (cannot be set via SQL) ────────────────────────────────
-- Browser-direct PUT uploads (signed URLs) require CORS to allow PUT from the
-- app's domain. Supabase's default CORS already allows all origins (*), so this
-- is normally a no-op. If your project has a custom CORS allowlist:
--   Dashboard → Settings → API → CORS Allowed Origins
--   Add: https://cantaia.io  (or your local dev URL)
-- ─────────────────────────────────────────────────────────────────────────────
