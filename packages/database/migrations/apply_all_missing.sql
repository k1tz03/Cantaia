-- ============================================================
-- CANTAIA — Apply all missing migrations in one go
-- Combines: 014, 015, 018, 019b columns, 020
-- Safe: all IF NOT EXISTS / IF EXISTS checks
-- ============================================================

-- ============================================================
-- MIGRATION 014: Email Classification Learning Rules
-- ============================================================
CREATE TABLE IF NOT EXISTS email_classification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  rule_value TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  classification TEXT,
  times_confirmed INTEGER DEFAULT 1,
  times_overridden INTEGER DEFAULT 0,
  confidence_boost DECIMAL(3,2) DEFAULT 0.10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rules_org ON email_classification_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_rules_type_value ON email_classification_rules(rule_type, rule_value);
CREATE INDEX IF NOT EXISTS idx_rules_active ON email_classification_rules(organization_id, is_active) WHERE is_active = true;

ALTER TABLE email_classification_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "org_rules" ON email_classification_rules FOR ALL
    USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- MIGRATION 015: Email Archiving
-- ============================================================

-- Archive columns on projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_path TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_enabled BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_structure TEXT DEFAULT 'by_category';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_filename_format TEXT DEFAULT 'date_sender_subject';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_attachments_mode TEXT DEFAULT 'subfolder';

-- Email archives tracking
CREATE TABLE IF NOT EXISTS email_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES email_records(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  local_path TEXT NOT NULL,
  folder_name TEXT,
  file_name TEXT NOT NULL,
  attachments_saved JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archives_email ON email_archives(email_id);
CREATE INDEX IF NOT EXISTS idx_archives_project ON email_archives(project_id);
CREATE INDEX IF NOT EXISTS idx_archives_status ON email_archives(status);

ALTER TABLE email_archives ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "org_archives" ON email_archives FOR ALL
    USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- MIGRATION 018: Email Connections (Multi-provider)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_token_expires_at TIMESTAMPTZ,
  oauth_scopes TEXT,
  imap_host TEXT,
  imap_port INTEGER DEFAULT 993,
  imap_security TEXT DEFAULT 'ssl',
  imap_username TEXT,
  imap_password_encrypted TEXT,
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_security TEXT DEFAULT 'tls',
  smtp_username TEXT,
  smtp_password_encrypted TEXT,
  email_address TEXT NOT NULL,
  display_name TEXT,
  status TEXT DEFAULT 'active',
  last_error TEXT,
  last_sync_at TIMESTAMPTZ,
  total_emails_synced INTEGER DEFAULT 0,
  sync_enabled BOOLEAN DEFAULT true,
  sync_interval_minutes INTEGER DEFAULT 5,
  sync_folder TEXT DEFAULT 'INBOX',
  sync_since DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_conn_user ON email_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_email_conn_org ON email_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_conn_provider ON email_connections(provider);
CREATE INDEX IF NOT EXISTS idx_email_conn_status ON email_connections(status);

ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "user_email_connections" ON email_connections FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users auth columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email';
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider_id TEXT;

-- ============================================================
-- MIGRATION 020: Sync Delta Link
-- ============================================================
ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS sync_delta_link TEXT DEFAULT NULL;
