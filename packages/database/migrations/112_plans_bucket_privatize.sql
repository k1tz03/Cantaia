-- Migration 112: Privatize the `plans` Supabase Storage bucket
--
-- Fixes the long-standing "bucket public" debt for construction plans:
--   * The `plans` bucket had NO migration creating it and NO storage.objects
--     policy in the repo — its prod state was manual and unverifiable from code.
--   * Every plan file was served through a PERMANENT public URL
--     (getPublicUrl) — a leaked/guessed URL exposed a tenant's plans forever,
--     with no expiry and no org scoping.
--
-- New model (mirrors `submissions` 081 and `site-report-photos` 086):
--   * Bucket is PRIVATE. The browser only ever receives short-lived signed URLs
--     minted server-side (packages/core/src/plans/plan-storage.ts →
--     createSignedPlanUrl, and the GET /api/plans routes).
--   * All storage operations go through createAdminClient() (service_role),
--     which bypasses RLS anyway; the explicit service-role policy satisfies
--     Supabase's requirement that a private RLS bucket carry at least one policy.
--
-- MIME allow-list: intentionally left NULL. Plan files arrive as PDF, DWG, DXF
-- and images; CAD files are frequently uploaded as application/octet-stream by
-- browsers, so a bucket-level allow-list would reject legitimate uploads. The
-- allow-list (and the explicit SVG/executable refusal) is enforced at the
-- application layer instead (upload route + upload page + plan-storage).
--
-- Idempotent: safe to re-run (ON CONFLICT + DROP POLICY IF EXISTS).

-- ── Step 1: Bucket (private) ────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'plans',
  'plans',
  false,       -- PRIVATE — access via signed URLs only
  52428800     -- 50 MB (execution plans can be large multi-page PDFs)
)
ON CONFLICT (id) DO UPDATE SET
  public          = false,
  file_size_limit = 52428800;

-- ── Step 2: Clean up any stale / manually-created policies ──────────────────

DROP POLICY IF EXISTS "plans_service_role_all"      ON storage.objects;
DROP POLICY IF EXISTS "plans_insert_authenticated"  ON storage.objects;
DROP POLICY IF EXISTS "plans_select_authenticated"  ON storage.objects;
DROP POLICY IF EXISTS "plans_delete_authenticated"  ON storage.objects;
DROP POLICY IF EXISTS "plans_select_anon"           ON storage.objects;
DROP POLICY IF EXISTS "plans_public_read"           ON storage.objects;

-- ── Step 3: Service-role policy (backend uploads: email pipeline) ───────────

CREATE POLICY "plans_service_role_all" ON storage.objects
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING     (bucket_id = 'plans')
  WITH CHECK (bucket_id = 'plans');

-- ── Step 4: Authenticated INSERT — browser-direct upload only ───────────────
--
-- The upload page (apps/web/.../plans/upload/page.tsx) uploads directly from the
-- browser to `plans/{user_id}/{project_id}/{ts}_{name}` (to bypass the Vercel
-- body limit). On a private bucket the service-role policy alone would block
-- that PUT. We grant INSERT scoped to the caller's OWN folder — the first path
-- segment must be their auth.uid() — so a user can only write under their own
-- prefix. SELECT is intentionally NOT granted: browser reads go through
-- server-minted signed URLs, never a direct authenticated read.

CREATE POLICY "plans_insert_authenticated" ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'plans'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
