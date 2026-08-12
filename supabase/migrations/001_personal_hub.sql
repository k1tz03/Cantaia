-- ============================================================
-- Migration 077: Personal Hub (coffre-fort privé du propriétaire)
-- Page /hub réservée au superadmin : derniers emails, emails
-- conservés, et coffre-fort de documents personnels (fiches de
-- paie, contrats, etc.) stockés dans le bucket privé `personal-vault`.
-- Toutes les données sont strictement user-scoped (user_id = auth.uid()).
-- ============================================================

-- ── Table: personal_documents ───────────────────────────────────────────────
-- Documents personnels sauvegardés à part (fiches de paie, contrats, ...)

CREATE TABLE IF NOT EXISTS personal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Classement
  category TEXT NOT NULL DEFAULT 'autre'
    CHECK (category IN ('fiche_paie', 'contrat', 'facture', 'impots', 'sante', 'identite', 'autre')),
  title TEXT NOT NULL,
  notes TEXT,
  document_date DATE,                          -- Date du document (ex: mois de la fiche de paie)

  -- Fichier (bucket privé `personal-vault`, accès via signed URLs uniquement)
  storage_bucket TEXT NOT NULL DEFAULT 'personal-vault',
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  file_type TEXT,

  -- Provenance optionnelle (document sauvegardé depuis un email)
  source_email_id UUID REFERENCES email_records(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_documents_user ON personal_documents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_documents_category ON personal_documents (user_id, category);

-- ── Table: personal_saved_emails ────────────────────────────────────────────
-- Emails importants conservés dans le hub (référence vers email_records)

CREATE TABLE IF NOT EXISTS personal_saved_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_record_id UUID NOT NULL REFERENCES email_records(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, email_record_id)
);

CREATE INDEX IF NOT EXISTS idx_personal_saved_emails_user ON personal_saved_emails (user_id, created_at DESC);

-- ── RLS: strictement user-scoped (pas de bypass superadmin — données privées) ─

ALTER TABLE personal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_saved_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personal_documents_owner" ON personal_documents;
CREATE POLICY "personal_documents_owner" ON personal_documents
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "personal_saved_emails_owner" ON personal_saved_emails;
CREATE POLICY "personal_saved_emails_owner" ON personal_saved_emails
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Trigger updated_at ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_personal_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_personal_documents_updated ON personal_documents;
CREATE TRIGGER trg_personal_documents_updated
  BEFORE UPDATE ON personal_documents
  FOR EACH ROW
  EXECUTE FUNCTION set_personal_documents_updated_at();

-- ── Bucket Storage: personal-vault (PRIVÉ, 25 MB) ───────────────────────────
-- Même pattern que la migration 068 (submissions). L'API utilise toujours
-- createAdminClient() (service_role) + signed URLs pour le download.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'personal-vault',
  'personal-vault',
  false,              -- PRIVÉ — accès via signed URLs uniquement
  26214400,           -- 25 MB
  null                -- tous types MIME (validation applicative côté API)
)
ON CONFLICT (id) DO UPDATE SET
  public             = false,
  file_size_limit    = 26214400,
  allowed_mime_types = null;

DROP POLICY IF EXISTS "personal_vault_service_role_all" ON storage.objects;
CREATE POLICY "personal_vault_service_role_all" ON storage.objects
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING     (bucket_id = 'personal-vault')
  WITH CHECK (bucket_id = 'personal-vault');

-- Les fichiers sont rangés sous {user_id}/... — un utilisateur authentifié
-- ne peut lire/supprimer que son propre dossier.
DROP POLICY IF EXISTS "personal_vault_owner_select" ON storage.objects;
CREATE POLICY "personal_vault_owner_select" ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'personal-vault' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "personal_vault_owner_insert" ON storage.objects;
CREATE POLICY "personal_vault_owner_insert" ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'personal-vault' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "personal_vault_owner_delete" ON storage.objects;
CREATE POLICY "personal_vault_owner_delete" ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'personal-vault' AND (storage.foldername(name))[1] = auth.uid()::text);
