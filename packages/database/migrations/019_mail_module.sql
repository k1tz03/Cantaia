-- ============================================================
-- CANTAIA — Module Mail : Gestion intelligente des emails
-- Migration 019 — Data model for email triage, categories,
--   outlook folders, classification rules, and preferences.
-- ============================================================

-- ============================================================
-- 1. RENAME email_records → emails
-- ============================================================
ALTER TABLE IF EXISTS email_records RENAME TO emails;

-- Rename old indexes (they still reference email_records)
ALTER INDEX IF EXISTS idx_emails_user RENAME TO idx_emails_user_id;
ALTER INDEX IF EXISTS idx_emails_project RENAME TO idx_emails_project_id;
-- idx_emails_received and idx_emails_outlook_id keep their names
ALTER INDEX IF EXISTS idx_email_classification_status RENAME TO idx_emails_classification_status;

-- ============================================================
-- 2. CREATE email_categories TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS email_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  name_en TEXT,
  name_de TEXT,

  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#6B7280',
  sort_order INTEGER DEFAULT 0,

  is_project BOOLEAN DEFAULT false,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  unprocessed_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,

  is_system BOOLEAN DEFAULT false,
  auto_dismiss BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_categories_org ON email_categories(organization_id);
CREATE INDEX idx_email_categories_project ON email_categories(project_id) WHERE project_id IS NOT NULL;

ALTER TABLE email_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_email_categories" ON email_categories FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- ============================================================
-- 3. ADD NEW COLUMNS TO emails TABLE
-- ============================================================

-- Organization link
ALTER TABLE emails ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Provider identifiers (rename outlook_message_id → keep as-is, add new)
ALTER TABLE emails ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS provider_thread_id TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'graph';

-- Content fields
ALTER TABLE emails ADD COLUMN IF NOT EXISTS from_email TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS from_name TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS to_emails JSONB DEFAULT '[]';
ALTER TABLE emails ADD COLUMN IF NOT EXISTS cc_emails JSONB DEFAULT '[]';
ALTER TABLE emails ADD COLUMN IF NOT EXISTS bcc_emails JSONB DEFAULT '[]';
ALTER TABLE emails ADD COLUMN IF NOT EXISTS body_text TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS body_html TEXT;

-- Attachments
ALTER TABLE emails ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Dates
ALTER TABLE emails ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Provider status
ALTER TABLE emails ADD COLUMN IF NOT EXISTS is_read_provider BOOLEAN DEFAULT false;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS importance TEXT DEFAULT 'normal';

-- Classification IA (new fields alongside existing ones)
ALTER TABLE emails ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES email_categories(id);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(3,2) DEFAULT 0;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_suggested_project_id UUID REFERENCES projects(id);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_suggested_category TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_suggested_new_project JSONB;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_detected_content JSONB;

-- Triage (to-do list) — the core of the new mail module
ALTER TABLE emails ADD COLUMN IF NOT EXISTS triage_status TEXT DEFAULT 'unprocessed';
ALTER TABLE emails ADD COLUMN IF NOT EXISTS process_action TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES users(id);
ALTER TABLE emails ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMPTZ;

-- Archiving
ALTER TABLE emails ADD COLUMN IF NOT EXISTS archived_path TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS outlook_folder_moved TEXT;

-- Search
ALTER TABLE emails ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Updated at (email_records didn't have it)
ALTER TABLE emails ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- 4. MIGRATE DATA: copy sender_email/sender_name → from_email/from_name
--    and outlook_message_id → provider_message_id
-- ============================================================
UPDATE emails SET from_email = sender_email WHERE from_email IS NULL AND sender_email IS NOT NULL;
UPDATE emails SET from_name = sender_name WHERE from_name IS NULL AND sender_name IS NOT NULL;
UPDATE emails SET provider_message_id = outlook_message_id WHERE provider_message_id IS NULL AND outlook_message_id IS NOT NULL;
-- Migrate is_processed → triage_status
UPDATE emails SET triage_status = 'processed' WHERE is_processed = true AND triage_status = 'unprocessed';
-- Migrate organization_id from user
UPDATE emails SET organization_id = u.organization_id
  FROM users u WHERE emails.user_id = u.id AND emails.organization_id IS NULL;

-- ============================================================
-- 5. NEW INDEXES on emails
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_emails_org_triage ON emails(organization_id, triage_status) WHERE triage_status = 'unprocessed';
CREATE INDEX IF NOT EXISTS idx_emails_category ON emails(category_id);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(provider_thread_id) WHERE provider_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_from ON emails(from_email);
CREATE INDEX IF NOT EXISTS idx_emails_search ON emails USING gin(search_vector) WHERE search_vector IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_snooze ON emails(snooze_until) WHERE triage_status = 'snoozed';
CREATE INDEX IF NOT EXISTS idx_emails_provider_msg ON emails(provider_message_id);

-- ============================================================
-- 6. SEARCH TRIGGER (French full-text)
-- ============================================================
CREATE OR REPLACE FUNCTION emails_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('french', coalesce(NEW.subject, '')), 'A')
    || setweight(to_tsvector('french', coalesce(NEW.from_name, '')), 'B')
    || setweight(to_tsvector('french', coalesce(NEW.from_email, '')), 'B')
    || setweight(to_tsvector('french', coalesce(NEW.body_text, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS emails_search_update ON emails;
CREATE TRIGGER emails_search_update BEFORE INSERT OR UPDATE
  ON emails FOR EACH ROW EXECUTE FUNCTION emails_search_trigger();

-- ============================================================
-- 7. UPDATE RLS on emails (was on email_records)
-- ============================================================
-- Drop old policies if they exist (they referenced email_records)
DROP POLICY IF EXISTS "Users can view their own emails" ON emails;
DROP POLICY IF EXISTS "Users can view own email records" ON emails;

-- New RLS: org-scoped
CREATE POLICY "org_emails" ON emails FOR ALL
  USING (
    organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())
    OR user_id = auth.uid()
  );

-- ============================================================
-- 8. ALTER email_classification_rules — add category_id
-- ============================================================
ALTER TABLE email_classification_rules ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES email_categories(id) ON DELETE CASCADE;

-- ============================================================
-- 9. CREATE outlook_folders TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS outlook_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES email_categories(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  outlook_folder_id TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  parent_folder_id TEXT,

  email_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_outlook_folders_org ON outlook_folders(organization_id);
CREATE INDEX idx_outlook_folders_category ON outlook_folders(category_id);

ALTER TABLE outlook_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_outlook_folders" ON outlook_folders FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- ============================================================
-- 10. CREATE email_preferences TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  auto_move_outlook BOOLEAN DEFAULT true,
  auto_dismiss_spam BOOLEAN DEFAULT true,
  auto_dismiss_newsletters BOOLEAN DEFAULT true,
  show_dismissed BOOLEAN DEFAULT false,

  outlook_root_folder_name TEXT DEFAULT 'CANTAIA',
  outlook_root_folder_id TEXT,

  default_snooze_hours INTEGER DEFAULT 4,
  archive_enabled BOOLEAN DEFAULT false,
  archive_path TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_email_prefs" ON email_preferences FOR ALL
  USING (user_id = auth.uid());

-- ============================================================
-- 11. UNIQUE CONSTRAINT on emails (org + provider_message_id)
-- ============================================================
-- Can't add UNIQUE directly if there are NULLs in org, so use a partial index
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_org_provider_msg
  ON emails(organization_id, provider_message_id)
  WHERE organization_id IS NOT NULL AND provider_message_id IS NOT NULL;
