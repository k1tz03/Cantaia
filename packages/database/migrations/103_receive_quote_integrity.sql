-- ═══════════════════════════════════════════════════════════════
-- Migration 103: receive-quote integrity (audit demande de prix 08/2026)
--
-- 1. `submission_price_requests.responded_email_id` — persistent link between
--    a price request and the email_records row that answered it. Written by
--    the L0b auto-reception (classification pipeline) and by the receive-quote
--    extraction. Lets `runQuoteExtraction` find the source email directly
--    instead of re-searching the whole mailbox by tracking-code ilike.
--    Soft reference on purpose (no FK): email_records rows can be purged /
--    re-synced independently and a dangling id must never block anything —
--    readers fall back to the tracking-code search when the row is gone.
--
-- 2. Dedup of `submission_quotes` per (request_id, item_id): before this
--    migration BOTH quote writers (receive-quote route + sync pipeline L0b)
--    blindly APPENDED rows, so every re-extraction — and, pre-fix, every
--    subsequent email of the same thread re-matching the tracking code —
--    duplicated the supplier's prices in the comparison table.
--    Keep the most recent row (created_at, then id) per pair, delete the rest,
--    then lock the invariant with a UNIQUE index.
--
--    NOTE — the unique index is intentionally NOT partial:
--    * Postgres treats NULLs as distinct in a unique index (default
--      NULLS DISTINCT), so rows with item_id IS NULL (global/total quotes)
--      or request_id IS NULL remain UNCONSTRAINED exactly as a
--      `WHERE item_id IS NOT NULL` partial index would leave them.
--    * PostgREST/supabase-js `.upsert(..., { onConflict: "request_id,item_id" })`
--      needs a NON-partial arbiter index — `ON CONFLICT (cols)` cannot infer a
--      partial unique index without its WHERE clause, which PostgREST cannot
--      emit. The application's idempotent write path depends on this.
--
-- Idempotent — safe to replay.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. Email ↔ request link
-- ───────────────────────────────────────────────────────────────

ALTER TABLE submission_price_requests
  ADD COLUMN IF NOT EXISTS responded_email_id UUID;

COMMENT ON COLUMN submission_price_requests.responded_email_id IS
  'Migration 103. email_records.id of the supplier response that flipped this request to ''responded''. Soft reference (no FK) — may dangle after an email purge; readers must fall back to the tracking-code search.';

-- ───────────────────────────────────────────────────────────────
-- 2. submission_quotes — dedup then unique index
-- ───────────────────────────────────────────────────────────────

-- 2a. Delete duplicates, keeping the most recent row per (request_id, item_id).
--     Rows with a NULL request_id or NULL item_id are left untouched: they are
--     not addressable by the (request_id, item_id) identity.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY request_id, item_id
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM submission_quotes
  WHERE request_id IS NOT NULL
    AND item_id IS NOT NULL
)
DELETE FROM submission_quotes
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2b. One current price per item per request. NULL item_id / request_id rows
--     never conflict (NULLS DISTINCT) — see the header for why this index is
--     deliberately non-partial.
CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_quotes_request_item
  ON submission_quotes (request_id, item_id);

COMMENT ON INDEX idx_submission_quotes_request_item IS
  'Migration 103. Idempotence of quote reception: one row per (request_id, item_id). Arbiter of the application upsert (onConflict request_id,item_id). NULLs stay unconstrained.';
