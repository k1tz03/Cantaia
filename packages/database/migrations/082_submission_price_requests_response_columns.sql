-- ═══════════════════════════════════════════════════════════════
-- Migration 082: submission_price_requests — response tracking columns
--
-- Fixes C3: `response_received_at` / `response_time_days` were written by
--   - apps/web/src/app/api/submissions/receive-quote/route.ts
--   - apps/web/src/app/api/outlook/sync/route.ts (L0b auto-reception)
-- but were never created by any migration. PostgREST rejected the whole
-- UPDATE payload, so `status = 'responded'` and `conditions_text` were
-- silently lost too.
--
-- Also widens the `status` CHECK so the send pipeline can record a request
-- that failed to leave the mailbox (H2: `sent` is now written only AFTER
-- Microsoft Graph confirms delivery).
-- Idempotent — safe to replay.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE submission_price_requests
  ADD COLUMN IF NOT EXISTS response_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS response_time_days NUMERIC;

COMMENT ON COLUMN submission_price_requests.response_received_at IS
  'Timestamp of the supplier response (set by receive-quote / outlook sync L0b)';
COMMENT ON COLUMN submission_price_requests.response_time_days IS
  'Delay in days between sent_at and response_received_at (supplier scoring input)';

-- ── Status values ────────────────────────────────────────────────
-- 049 created: CHECK (status IN ('sent','responded','expired'))
-- We need 'pending' (record created, email not yet confirmed sent) and
-- 'failed' (Graph send failed / no Microsoft connection).
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'submission_price_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE submission_price_requests DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE submission_price_requests
  ADD CONSTRAINT submission_price_requests_status_check
  CHECK (status IN ('pending', 'sent', 'responded', 'expired', 'failed'));

-- Error detail for a request whose email could not be delivered
ALTER TABLE submission_price_requests
  ADD COLUMN IF NOT EXISTS send_error TEXT;

COMMENT ON COLUMN submission_price_requests.send_error IS
  'Delivery error message when status = ''failed''';

-- Supplier scoring reads (supplier_id, status, sent_at, response_received_at)
CREATE INDEX IF NOT EXISTS idx_spr_supplier_status
  ON submission_price_requests (supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_spr_response_received
  ON submission_price_requests (response_received_at);
