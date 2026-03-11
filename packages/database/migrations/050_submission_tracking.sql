-- ═══════════════════════════════════════════════════════════════
-- Migration 050: Submission price request tracking improvements
-- Adds deadline, relance tracking to submission_price_requests
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE submission_price_requests
  ADD COLUMN IF NOT EXISTS deadline DATE,
  ADD COLUMN IF NOT EXISTS relance_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_relance_at TIMESTAMPTZ;
