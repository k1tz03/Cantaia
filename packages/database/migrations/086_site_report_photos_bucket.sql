-- Migration 086: Configure the `site-report-photos` Supabase Storage bucket
-- Used by POST /api/portal/[projectId]/reports/[reportId]/upload (delivery-note photos
-- captured from the field portal).
--
-- Safe to run multiple times (idempotent via ON CONFLICT + DROP POLICY IF EXISTS).
--
-- Access model: the portal is PIN-authenticated, not Supabase-authenticated. Every
-- storage operation therefore goes through createAdminClient() (service_role) on the
-- server, and the browser only ever receives a signed URL. No anon/authenticated
-- policy is granted on this bucket.

-- ── Step 1: Bucket (private) ────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-report-photos',
  'site-report-photos',
  false,             -- PRIVATE — access via signed URLs only
  10485760,          -- 10 MB (matches MAX_SIZE in the upload route)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = false,
  file_size_limit    = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- ── Step 2: Clean up any stale / conflicting policies ───────────────────────

DROP POLICY IF EXISTS "site_report_photos_service_role_all"     ON storage.objects;
DROP POLICY IF EXISTS "site_report_photos_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "site_report_photos_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "site_report_photos_insert_anon"          ON storage.objects;
DROP POLICY IF EXISTS "site_report_photos_select_anon"          ON storage.objects;

-- ── Step 3: Service-role-only policy ────────────────────────────────────────
--
-- service_role bypasses RLS anyway; this policy is the explicit statement of
-- intent (and satisfies Supabase's requirement that a private bucket with RLS
-- enabled has at least one policy).

CREATE POLICY "site_report_photos_service_role_all" ON storage.objects
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING     (bucket_id = 'site-report-photos')
  WITH CHECK (bucket_id = 'site-report-photos');
