-- ============================================================
-- Migration 020: Add sync_delta_link to email_connections
-- Stores the Microsoft Graph delta link for incremental sync
-- ============================================================

ALTER TABLE email_connections
  ADD COLUMN IF NOT EXISTS sync_delta_link TEXT DEFAULT NULL;

-- Add index on emails.triage_status for filtering
CREATE INDEX IF NOT EXISTS idx_emails_triage_status ON emails(user_id, triage_status);

-- Add index on emails.snooze_until for expired snooze checks
CREATE INDEX IF NOT EXISTS idx_emails_snooze_until ON emails(snooze_until)
  WHERE snooze_until IS NOT NULL;
