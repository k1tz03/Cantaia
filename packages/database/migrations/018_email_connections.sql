-- ============================================================
-- 018 — Email Connections (Multi-provider support)
-- Replaces Microsoft-only token storage on users table.
-- Supports: Microsoft 365, Google/Gmail, IMAP/SMTP generic
-- ============================================================

-- Email connections table
CREATE TABLE IF NOT EXISTS email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Provider: 'microsoft', 'google', 'imap'
  provider TEXT NOT NULL,

  -- OAuth tokens (Microsoft & Google)
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_token_expires_at TIMESTAMPTZ,
  oauth_scopes TEXT,

  -- IMAP/SMTP credentials (generic providers)
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

  -- State
  email_address TEXT NOT NULL,
  display_name TEXT,
  status TEXT DEFAULT 'active',
  last_error TEXT,
  last_sync_at TIMESTAMPTZ,
  total_emails_synced INTEGER DEFAULT 0,

  -- Sync configuration
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
DROP POLICY IF EXISTS "user_email_connections" ON email_connections;
CREATE POLICY "user_email_connections" ON email_connections FOR ALL USING (user_id = auth.uid());

-- Add auth_provider columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email';
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider_id TEXT;
