-- ============================================================
-- Migration 015: Email Archiving System
-- Adds archive configuration to projects and tracking table.
-- ============================================================

-- Add archive configuration to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_path TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_enabled BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_structure TEXT DEFAULT 'by_category';
-- Values: 'by_category', 'by_date', 'by_sender', 'flat'
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_filename_format TEXT DEFAULT 'date_sender_subject';
-- Values: 'date_sender_subject', 'date_subject', 'original'
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archive_attachments_mode TEXT DEFAULT 'subfolder';
-- Values: 'subfolder', 'beside', 'thematic'

-- Email archives tracking table
CREATE TABLE IF NOT EXISTS email_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES email_records(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Local path info
  local_path TEXT NOT NULL,
  folder_name TEXT,
  file_name TEXT NOT NULL,

  -- Attachments saved
  attachments_saved JSONB DEFAULT '[]',

  -- Status
  status TEXT DEFAULT 'pending',
  -- Values: 'pending', 'saved', 'failed', 'skipped'
  error_message TEXT,

  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archives_email ON email_archives(email_id);
CREATE INDEX IF NOT EXISTS idx_archives_project ON email_archives(project_id);
CREATE INDEX IF NOT EXISTS idx_archives_status ON email_archives(status);

ALTER TABLE email_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_archives" ON email_archives FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
