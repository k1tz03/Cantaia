-- ============================================================
-- CANTAIA — Migration 019b — Mail module columns (sans rename)
-- Ajoute les colonnes de la migration 019 sur email_records
-- SANS renommer la table (on garde email_records)
-- ============================================================

-- ============================================================
-- 1. COLONNES ESSENTIELLES SUR email_records
-- ============================================================

-- Organisation link
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Provider identifiers
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS provider_thread_id TEXT;
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'graph';

-- Content fields (doublons sender_email/sender_name pour compat module Mail)
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS from_email TEXT;
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS from_name TEXT;
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS to_emails JSONB DEFAULT '[]';
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS cc_emails JSONB DEFAULT '[]';

-- Dates
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Triage (to-do list) — core du module Mail
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS triage_status TEXT DEFAULT 'unprocessed';
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS process_action TEXT;
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES users(id);
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMPTZ;

-- Updated at
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- 2. MIGRER LES DONNÉES EXISTANTES
-- ============================================================
UPDATE email_records SET from_email = sender_email WHERE from_email IS NULL AND sender_email IS NOT NULL;
UPDATE email_records SET from_name = sender_name WHERE from_name IS NULL AND sender_name IS NOT NULL;
UPDATE email_records SET provider_message_id = outlook_message_id WHERE provider_message_id IS NULL AND outlook_message_id IS NOT NULL;
-- Migrer is_processed → triage_status
UPDATE email_records SET triage_status = 'processed' WHERE is_processed = true AND triage_status = 'unprocessed';
-- Migrer organization_id depuis user
UPDATE email_records SET organization_id = u.organization_id
  FROM users u WHERE email_records.user_id = u.id AND email_records.organization_id IS NULL;

-- ============================================================
-- 3. INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_email_records_org_triage ON email_records(organization_id, triage_status) WHERE triage_status = 'unprocessed';
CREATE INDEX IF NOT EXISTS idx_email_records_thread ON email_records(provider_thread_id) WHERE provider_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_records_from ON email_records(from_email);
CREATE INDEX IF NOT EXISTS idx_email_records_snooze ON email_records(snooze_until) WHERE triage_status = 'snoozed';
CREATE INDEX IF NOT EXISTS idx_email_records_provider_msg ON email_records(provider_message_id);

-- ============================================================
-- 4. TABLE email_preferences (utilisée par /api/outlook/sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  auto_move_outlook BOOLEAN DEFAULT true,
  auto_dismiss_spam BOOLEAN DEFAULT true,
  auto_dismiss_newsletters BOOLEAN DEFAULT true,
  show_dismissed BOOLEAN DEFAULT false,

  default_snooze_hours INTEGER DEFAULT 4,
  archive_enabled BOOLEAN DEFAULT false,
  archive_path TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

-- Policy safe: skip if already exists
DO $$ BEGIN
  CREATE POLICY "user_email_prefs" ON email_preferences FOR ALL
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
