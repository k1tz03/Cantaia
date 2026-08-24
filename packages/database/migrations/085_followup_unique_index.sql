-- ============================================================
-- Migration 085: followup_items — dedup index usable by ON CONFLICT
--
-- Problem (AGT.H3)
-- ----------------
-- Migration 074 created the dedup index as a PARTIAL unique index:
--
--   CREATE UNIQUE INDEX idx_followup_items_dedup
--     ON followup_items (source_id, followup_type)
--     WHERE status = 'pending' AND source_id IS NOT NULL;
--
-- PostgREST sends `on_conflict=source_id,followup_type`, which Postgres
-- translates to `ON CONFLICT (source_id, followup_type)`. Index inference
-- can only pick a PARTIAL index when the statement repeats its predicate —
-- something PostgREST cannot express. Every save_followup_items upsert
-- therefore failed with 42P10 ("there is no unique or exclusion constraint
-- matching the ON CONFLICT specification") and the Followup Engine agent
-- persisted nothing.
--
-- Fix
-- ---
-- Replace it with a NON-partial unique index on (source_id, followup_type),
-- which ON CONFLICT can infer. Rows with a NULL source_id stay unconstrained
-- (NULLs are distinct in a unique index), preserving the previous
-- `source_id IS NOT NULL` semantics.
--
-- Existing duplicates must be removed first, otherwise the CREATE fails.
-- ============================================================

-- ── 1. Collapse existing duplicates ─────────────────────────
-- Keep one row per (source_id, followup_type): a 'pending' row wins over an
-- already-handled one, then the most recent. Older non-kept rows are deleted.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY source_id, followup_type
      ORDER BY (status = 'pending') DESC, created_at DESC, id DESC
    ) AS rn
  FROM followup_items
  WHERE source_id IS NOT NULL
)
DELETE FROM followup_items f
USING ranked r
WHERE f.id = r.id
  AND r.rn > 1;

-- ── 2. Swap the index ───────────────────────────────────────

DROP INDEX IF EXISTS idx_followup_items_dedup;

CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_items_source_type_uniq
  ON followup_items (source_id, followup_type);

COMMENT ON INDEX idx_followup_items_source_type_uniq IS
  'Non-partial unique index so PostgREST upserts can use ON CONFLICT (source_id, followup_type). Do not add a WHERE clause: it would break ON CONFLICT inference (42P10).';
