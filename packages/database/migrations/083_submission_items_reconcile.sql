-- ═══════════════════════════════════════════════════════════════
-- Migration 083: reconcile `submissions` / `submission_items` with the code
--
-- Fixes C2. Two incompatible `CREATE TABLE IF NOT EXISTS` definitions exist:
--
--   012_submissions_pricing.sql  → submissions(title NOT NULL, source_file_url, …)
--                                   submission_items(code, cfc_subcode,
--                                                    description NOT NULL,
--                                                    unit NOT NULL, organization_id)
--   049_submissions_enhanced.sql → submissions(file_url, file_name, file_type,
--                                              analysis_status, analysis_error, user_id)
--                                   submission_items(item_number, cfc_code,
--                                                    material_group, status, project_id)
--
-- On a virgin database 012 wins and 049 becomes a no-op, so the whole
-- Submissions module writes to columns that do not exist. Migration 067 is
-- the historical trace of the same problem being patched by hand in prod.
--
-- This migration is IDEMPOTENT and variant-agnostic: it adds every column the
-- application actually reads/writes (whichever variant created the table),
-- relaxes the NOT NULL constraints the pipeline cannot satisfy, and keeps the
-- two CFC column names (`cfc_code` written by the editor/UI, `cfc_subcode`
-- written by the analyze pipeline) in sync via a trigger.
--
-- Goal: the 001→083 set is replayable on an empty database and the resulting
-- schema matches the code.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. submissions — columns used by the API routes
-- ───────────────────────────────────────────────────────────────

-- Written by POST /api/submissions and read everywhere (049 variant)
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_type TEXT,
  ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS analysis_error TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Read as fallbacks by analyze/route.ts and DELETE /api/submissions/[id]
-- (012 variant)
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS source_file_url TEXT,
  ADD COLUMN IF NOT EXISTS source_file_name TEXT,
  ADD COLUMN IF NOT EXISTS deadline DATE;

-- Budget estimation payload (052 — re-declared here so 083 is self-sufficient)
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS budget_estimate JSONB,
  ADD COLUMN IF NOT EXISTS budget_estimated_at TIMESTAMPTZ;

-- M6: cached result of POST /api/submissions/[id]/filter-items so the AI call
-- is not re-issued on every mount of the "Demandes de prix" tab.
-- Shape: { "hash": "<sha of sorted item ids>", "excluded": [{id, reason}],
--          "computed_at": "<iso>" }
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS item_filter_cache JSONB;

COMMENT ON COLUMN submissions.item_filter_cache IS
  'Cached AI item-exclusion result: { hash, excluded: [{id, reason}], computed_at }';

-- 012 declared `title NOT NULL`; the upload pipeline only sets file_name.
ALTER TABLE submissions ALTER COLUMN title DROP NOT NULL;

-- Backfill title from the uploaded file name so legacy consumers still work.
UPDATE submissions
   SET title = COALESCE(title, file_name, source_file_name, 'Soumission')
 WHERE title IS NULL;

-- ───────────────────────────────────────────────────────────────
-- 2. submission_items — union of both variants
-- ───────────────────────────────────────────────────────────────

ALTER TABLE submission_items
  -- 049 variant columns (missing when 012 created the table)
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS item_number TEXT,
  ADD COLUMN IF NOT EXISTS cfc_code TEXT,
  ADD COLUMN IF NOT EXISTS material_group TEXT DEFAULT 'Divers',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  -- 012 variant columns (missing when 049 created the table)
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS cfc_subcode TEXT,
  ADD COLUMN IF NOT EXISTS normalized_description TEXT,
  -- 052 / 067
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- The AI pipeline can legitimately produce an item with no unit and, on a
-- truncated row, no description. 012 declared both NOT NULL → insert failure.
ALTER TABLE submission_items ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE submission_items ALTER COLUMN description DROP NOT NULL;
ALTER TABLE submission_items ALTER COLUMN material_group SET DEFAULT 'Divers';
ALTER TABLE submission_items ALTER COLUMN status SET DEFAULT 'pending';

-- Foreign keys, only when the column was created blank by this migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'submission_items_project_id_fkey'
      AND conrelid = 'submission_items'::regclass
  ) THEN
    ALTER TABLE submission_items
      ADD CONSTRAINT submission_items_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'submission_items_organization_id_fkey'
      AND conrelid = 'submission_items'::regclass
  ) THEN
    ALTER TABLE submission_items
      ADD CONSTRAINT submission_items_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 049 declared CHECK (status IN ('pending','quoted','awarded')) but 067
-- documents 'extracted' / 'error' as valid extraction states.
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'submission_items'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE submission_items DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE submission_items
  ADD CONSTRAINT submission_items_status_check
  CHECK (status IN ('pending', 'extracted', 'quoted', 'awarded', 'error'));

-- ───────────────────────────────────────────────────────────────
-- 3. Keep cfc_code and cfc_subcode in sync
--
-- The analyze pipeline (saveItems) writes `cfc_subcode`; the editor PATCH,
-- the detail UI, estimate-budget and price-alerts read `cfc_code`.
-- Rather than force one name on a live database, mirror the two.
-- ───────────────────────────────────────────────────────────────

UPDATE submission_items SET cfc_code = cfc_subcode
 WHERE cfc_code IS NULL AND cfc_subcode IS NOT NULL;
UPDATE submission_items SET cfc_subcode = cfc_code
 WHERE cfc_subcode IS NULL AND cfc_code IS NOT NULL;

CREATE OR REPLACE FUNCTION submission_items_sync_cfc()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cfc_code IS NULL AND NEW.cfc_subcode IS NOT NULL THEN
    NEW.cfc_code := NEW.cfc_subcode;
  ELSIF NEW.cfc_subcode IS NULL AND NEW.cfc_code IS NOT NULL THEN
    NEW.cfc_subcode := NEW.cfc_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_submission_items_sync_cfc ON submission_items;
CREATE TRIGGER trg_submission_items_sync_cfc
  BEFORE INSERT OR UPDATE ON submission_items
  FOR EACH ROW EXECUTE FUNCTION submission_items_sync_cfc();

-- ───────────────────────────────────────────────────────────────
-- 4. Backfill scoping columns from the parent submission
-- ───────────────────────────────────────────────────────────────

UPDATE submission_items si
   SET project_id = s.project_id
  FROM submissions s
 WHERE si.submission_id = s.id
   AND si.project_id IS NULL
   AND s.project_id IS NOT NULL;

UPDATE submission_items si
   SET organization_id = s.organization_id
  FROM submissions s
 WHERE si.submission_id = s.id
   AND si.organization_id IS NULL
   AND s.organization_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────
-- 5. Indexes used by the module (idempotent)
-- ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_submission_items_submission
  ON submission_items (submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_items_cfc_code
  ON submission_items (cfc_code);
CREATE INDEX IF NOT EXISTS idx_submission_items_material_group
  ON submission_items (submission_id, material_group);
CREATE INDEX IF NOT EXISTS idx_submission_items_status
  ON submission_items (submission_id, status);
