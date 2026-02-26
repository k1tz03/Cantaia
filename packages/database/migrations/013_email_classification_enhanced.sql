-- ============================================================
-- Migration 013: Enhanced Email Classification
-- Adds classification_status, suggested_project_data, email_category
-- for intelligent AI classification with 3 cases:
--   A) existing project match
--   B) new project suggested
--   C) personal/spam/newsletter
-- ============================================================

-- New columns on email_records
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS classification_status TEXT DEFAULT 'unprocessed';
-- Values: 'unprocessed', 'auto_classified', 'suggested', 'new_project_suggested', 'classified_no_project', 'confirmed', 'rejected'

ALTER TABLE email_records ADD COLUMN IF NOT EXISTS email_category TEXT;
-- Values: 'project', 'personal', 'administrative', 'spam', 'newsletter', NULL

ALTER TABLE email_records ADD COLUMN IF NOT EXISTS suggested_project_data JSONB;
-- For new_project_suggested: { name, reference, client, location, type, extracted_contacts: [{name, company, email, role}] }

ALTER TABLE email_records ADD COLUMN IF NOT EXISTS ai_reasoning TEXT;
-- AI explanation of why it classified the email this way

-- Index for quick filtering of emails needing user attention
CREATE INDEX IF NOT EXISTS idx_email_classification_status ON email_records(classification_status) WHERE classification_status IN ('suggested', 'new_project_suggested');
CREATE INDEX IF NOT EXISTS idx_email_category ON email_records(email_category);
