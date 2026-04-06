-- Migration 069: Email folder rules for AI group suggestions
-- Stores learned associations between email patterns (sender, domain, keywords) and Outlook folders.
-- Used by POST /api/email/suggest-folder (read) and POST /api/email/folder-learn (write).

CREATE TABLE IF NOT EXISTS email_folder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Rule matching
  rule_type TEXT NOT NULL CHECK (rule_type IN ('sender_email', 'sender_domain', 'subject_keyword', 'body_keyword')),
  rule_value TEXT NOT NULL,          -- e.g. "bob@acme.com", "acme.com", "béton"
  folder_id TEXT NOT NULL,           -- Outlook folder ID

  -- Confidence tracking
  times_confirmed INTEGER NOT NULL DEFAULT 1,
  times_overridden INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one rule per org + type + value + folder
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_folder_rules_unique
  ON email_folder_rules (organization_id, rule_type, rule_value, folder_id);

-- Fast lookups by org
CREATE INDEX IF NOT EXISTS idx_email_folder_rules_org
  ON email_folder_rules (organization_id, is_active);

-- RLS
ALTER TABLE email_folder_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read folder rules for their org"
  ON email_folder_rules FOR SELECT
  USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert folder rules for their org"
  ON email_folder_rules FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update folder rules for their org"
  ON email_folder_rules FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Service role bypass
CREATE POLICY "Service role full access to folder rules"
  ON email_folder_rules FOR ALL
  USING (auth.role() = 'service_role');
