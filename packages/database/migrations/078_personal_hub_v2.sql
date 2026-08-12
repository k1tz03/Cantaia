-- ============================================================
-- Migration 078: Personal Hub V2
-- Verrou PIN, recherche plein texte, échéances/rappels,
-- archivage automatique, et suivi financier personnel.
-- Toutes les tables sont strictement user-scoped (auth.uid()).
-- Prérequis : migration 077 (personal_documents, personal_saved_emails).
-- ============================================================

-- ── personal_documents : plein texte + échéances + archivage auto ───────────

ALTER TABLE personal_documents ADD COLUMN IF NOT EXISTS extracted_text TEXT;
ALTER TABLE personal_documents ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE personal_documents ADD COLUMN IF NOT EXISTS reminder_days INTEGER DEFAULT 30;
ALTER TABLE personal_documents ADD COLUMN IF NOT EXISTS auto_archived BOOLEAN DEFAULT FALSE;

-- Colonne tsvector générée (titre + notes + texte extrait) pour la recherche plein texte
ALTER TABLE personal_documents ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('french',
      coalesce(title, '') || ' ' || coalesce(notes, '') || ' ' ||
      coalesce(file_name, '') || ' ' || coalesce(extracted_text, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_personal_documents_search
  ON personal_documents USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_personal_documents_expiry
  ON personal_documents (user_id, expiry_date) WHERE expiry_date IS NOT NULL;

-- ── personal_hub_settings : verrou PIN + config archivage auto ──────────────

CREATE TABLE IF NOT EXISTS personal_hub_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pin_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  pin_hash TEXT,
  pin_salt TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  auto_archive_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_auto_archive_scan TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Finances personnelles ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS personal_finance_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'courant'
    CHECK (account_type IN ('courant', 'epargne', 'troisieme_pilier', 'investissement', 'crypto', 'immobilier', 'autre')),
  institution TEXT,
  currency TEXT NOT NULL DEFAULT 'CHF',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_finance_accounts_user
  ON personal_finance_accounts (user_id);

-- Relevés de solde (saisie manuelle périodique par compte)
CREATE TABLE IF NOT EXISTS personal_finance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES personal_finance_accounts(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  balance DECIMAL(14, 2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_personal_finance_snapshots_user
  ON personal_finance_snapshots (user_id, snapshot_date DESC);

-- Analyses IA (allocation, épargne, propositions de placement)
CREATE TABLE IF NOT EXISTS personal_finance_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_finance_analyses_user
  ON personal_finance_analyses (user_id, generated_at DESC);

-- ── RLS : strictement user-scoped ────────────────────────────────────────────

ALTER TABLE personal_hub_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_finance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_finance_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personal_hub_settings_owner" ON personal_hub_settings;
CREATE POLICY "personal_hub_settings_owner" ON personal_hub_settings
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "personal_finance_accounts_owner" ON personal_finance_accounts;
CREATE POLICY "personal_finance_accounts_owner" ON personal_finance_accounts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "personal_finance_snapshots_owner" ON personal_finance_snapshots;
CREATE POLICY "personal_finance_snapshots_owner" ON personal_finance_snapshots
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "personal_finance_analyses_owner" ON personal_finance_analyses;
CREATE POLICY "personal_finance_analyses_owner" ON personal_finance_analyses
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Trigger updated_at sur personal_hub_settings ────────────────────────────

CREATE OR REPLACE FUNCTION set_personal_hub_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_personal_hub_settings_updated ON personal_hub_settings;
CREATE TRIGGER trg_personal_hub_settings_updated
  BEFORE UPDATE ON personal_hub_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_personal_hub_settings_updated_at();
