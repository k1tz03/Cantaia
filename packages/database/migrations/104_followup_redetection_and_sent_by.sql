-- ═══════════════════════════════════════════════════════════════
-- Migration 104: followup re-detection + price request sender
--
-- 1. followup_items — dedup index becomes PARTIAL again, on
--    (organization_id, followup_type, source_id) WHERE status IN
--    ('pending','snoozed').
--
--    History: 074 created a partial index that broke PostgREST upserts
--    (42P10 — ON CONFLICT cannot infer a partial index), 085 replaced it
--    with a NON-partial one so ON CONFLICT worked… which permanently
--    blocked re-detection: once an item was 'sent' or 'dismissed', the
--    unique key was occupied forever and the Followup Engine could never
--    flag the same source again.
--
--    Fix: partial unique index restricted to the "open" statuses. Only
--    one open item per (org, type, source) can exist, while any number of
--    handled ones ('sent', 'dismissed', 'approved') keep the history.
--    save_followup_items (tool-handlers.ts) no longer uses ON CONFLICT:
--    it pre-checks existing rows and inserts plainly, treating 23505 as
--    a concurrent-run skip.
--
-- 2. submission_price_requests.sent_by — who sent the request, i.e. who
--    the supplier-portal "offre reçue" notification goes to.
--
-- Idempotent — safe to replay.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1a. Collapse duplicates inside the future index's scope
--     (open items sharing the same org + type + source).
-- ───────────────────────────────────────────────────────────────

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, followup_type, source_id
      ORDER BY (status = 'pending') DESC, created_at DESC, id DESC
    ) AS rn
  FROM followup_items
  WHERE source_id IS NOT NULL
    AND status IN ('pending', 'snoozed')
)
DELETE FROM followup_items f
USING ranked r
WHERE f.id = r.id
  AND r.rn > 1;

-- ───────────────────────────────────────────────────────────────
-- 1b. Swap the indexes
-- ───────────────────────────────────────────────────────────────

-- 085's non-partial index (blocks re-detection).
DROP INDEX IF EXISTS idx_followup_items_source_type_uniq;
-- 074's original partial index, in case 085 was never applied.
DROP INDEX IF EXISTS idx_followup_items_dedup;

CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_items_open_uniq
  ON followup_items (organization_id, followup_type, source_id)
  WHERE status IN ('pending', 'snoozed');

COMMENT ON INDEX idx_followup_items_open_uniq IS
  'At most one OPEN (pending/snoozed) followup per (org, type, source). Handled items (sent/dismissed/approved) fall outside the predicate, so the engine can re-detect a source after its previous item was dealt with. Do NOT use ON CONFLICT against this index (partial ⇒ 42P10): save_followup_items pre-checks and treats 23505 as a concurrent-run skip.';

-- ───────────────────────────────────────────────────────────────
-- 2. submission_price_requests.sent_by
-- ───────────────────────────────────────────────────────────────

ALTER TABLE submission_price_requests
  ADD COLUMN IF NOT EXISTS sent_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN submission_price_requests.sent_by IS
  'User who sent the price request. Recipient of the supplier-portal ''offre reçue'' notification (fallbacks: submissions.user_id, then projects.created_by).';

CREATE INDEX IF NOT EXISTS idx_spr_sent_by
  ON submission_price_requests (sent_by)
  WHERE sent_by IS NOT NULL;
