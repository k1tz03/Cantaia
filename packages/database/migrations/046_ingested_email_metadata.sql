-- Migration 046: Table de métadonnées d'emails ingérés
-- Pour enrichir le système de classification L1 à partir d'emails historiques .msg

CREATE TABLE IF NOT EXISTS ingested_email_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  source_file TEXT NOT NULL,
  from_email TEXT,
  from_name TEXT,
  from_domain TEXT,
  to_emails TEXT[],
  date_sent TIMESTAMPTZ,
  subject TEXT,
  subject_keywords TEXT[],
  has_attachments BOOLEAN DEFAULT false,
  attachment_types TEXT[],
  body_length INTEGER,
  language TEXT DEFAULT 'fr',
  -- Classification (remplie en passe 2 par Claude)
  detected_project TEXT,
  detected_category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_meta_domain ON ingested_email_metadata(from_domain);
CREATE INDEX idx_email_meta_project ON ingested_email_metadata(detected_project);
CREATE INDEX idx_email_meta_org ON ingested_email_metadata(org_id);
CREATE INDEX idx_email_meta_date ON ingested_email_metadata(date_sent);

-- Vue matérialisée : règles de classification par domaine
-- "les emails de schaller-sarl.ch sont à 85% sur le projet Cèdres"
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_email_classification_rules AS
SELECT
  from_domain,
  detected_project,
  COUNT(*) AS frequency,
  ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER (PARTITION BY from_domain) * 100, 1) AS confidence_pct
FROM ingested_email_metadata
WHERE detected_project IS NOT NULL
GROUP BY from_domain, detected_project
HAVING COUNT(*) >= 3
ORDER BY from_domain, frequency DESC;

-- Index sur la vue matérialisée
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_classif_rules_domain_project
  ON mv_email_classification_rules(from_domain, detected_project);

-- Fonction pour rafraîchir la vue (appelée par le pipeline)
CREATE OR REPLACE FUNCTION refresh_email_classification_rules()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_email_classification_rules;
END;
$$ LANGUAGE plpgsql;

-- Contrainte d'unicité sur source_file par org (éviter les doublons)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_meta_unique_file
  ON ingested_email_metadata(org_id, source_file);
