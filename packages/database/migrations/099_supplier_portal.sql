-- ═══════════════════════════════════════════════════════════════
-- Migration 099: Supplier portal (token-based offer submission)
--
-- Closes the Submissions loop: a supplier can answer a price request
-- through a public tokenised page instead of replying by email, which
-- removes the whole "parse the answer out of an email" step.
--
--   /offre/<portal_token>            (public page)
--   /api/supplier-portal/<token>     (public API — GET items, POST offer)
--
-- Also records where a response came from (email vs portal) so supplier
-- scoring and the comparison table can tell them apart, and adds the
-- `sent_at` column the followups "send" action needs.
--
-- Idempotent — safe to replay.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. submission_price_requests — portal columns
-- ───────────────────────────────────────────────────────────────

ALTER TABLE submission_price_requests
  ADD COLUMN IF NOT EXISTS portal_token         TEXT,
  ADD COLUMN IF NOT EXISTS portal_opened_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_submitted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS response_source      TEXT,
  ADD COLUMN IF NOT EXISTS language             TEXT DEFAULT 'fr';

COMMENT ON COLUMN submission_price_requests.portal_token IS
  'Opaque, unguessable token used by /offre/<token>. One per price request.';
COMMENT ON COLUMN submission_price_requests.portal_opened_at IS
  'First time the supplier opened the portal page.';
COMMENT ON COLUMN submission_price_requests.portal_submitted_at IS
  'Last time the supplier submitted an offer through the portal.';
COMMENT ON COLUMN submission_price_requests.response_source IS
  'How the response arrived: ''portal'' or ''email''.';
COMMENT ON COLUMN submission_price_requests.language IS
  'Language of the supplier-facing emails and portal (fr | de | en).';

-- Backfill a token for every existing request so old links can be issued
-- through a relance without re-sending the original request.
-- Two uuids stripped of dashes = 64 hex chars (~256 bits), no pgcrypto needed.
UPDATE submission_price_requests
   SET portal_token = replace(gen_random_uuid()::text, '-', '')
                   || replace(gen_random_uuid()::text, '-', '')
 WHERE portal_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_spr_portal_token
  ON submission_price_requests (portal_token)
  WHERE portal_token IS NOT NULL;

-- ───────────────────────────────────────────────────────────────
-- 2. submission_quotes — provenance of a price line
-- ───────────────────────────────────────────────────────────────

ALTER TABLE submission_quotes
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'email';

COMMENT ON COLUMN submission_quotes.source IS
  'Where the price came from: ''portal'' (typed by the supplier, confidence 1.0) or ''email'' (AI extraction).';

-- A portal submission replaces the previous portal answer for the same
-- request, so lookups by (request_id, source) must be fast.
CREATE INDEX IF NOT EXISTS idx_submission_quotes_request_source
  ON submission_quotes (request_id, source);

-- ───────────────────────────────────────────────────────────────
-- 3. Award notification bookkeeping
-- ───────────────────────────────────────────────────────────────

ALTER TABLE submission_price_requests
  ADD COLUMN IF NOT EXISTS award_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS award_outcome     TEXT;

COMMENT ON COLUMN submission_price_requests.award_outcome IS
  'Set at award time: ''awarded'' for the retained supplier, ''rejected'' for the others.';

-- ───────────────────────────────────────────────────────────────
-- 4. followup_items.sent_at — written by PATCH /api/agents/followups
--    with action = "send" (contract consumed by the followups UI).
-- ───────────────────────────────────────────────────────────────

ALTER TABLE followup_items
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_error TEXT;

COMMENT ON COLUMN followup_items.sent_at IS
  'Timestamp at which the followup email actually left the mailbox.';

-- ───────────────────────────────────────────────────────────────
-- 5. RLS — the portal writes exclusively through the service role.
--    No anon/authenticated policy is added on purpose: the public API
--    route validates the token itself and uses createAdminClient().
-- ───────────────────────────────────────────────────────────────
