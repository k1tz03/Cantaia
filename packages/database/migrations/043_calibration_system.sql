-- ═══════════════════════════════════════════════════
-- Système de calibration et apprentissage
-- Migration 043 — Mars 2026
-- ═══════════════════════════════════════════════════

-- Table des corrections de quantités (Couche 1 — privée)
CREATE TABLE IF NOT EXISTS quantity_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  plan_id UUID NOT NULL REFERENCES plan_registry(id),
  estimation_id UUID NOT NULL,
  cfc_code TEXT NOT NULL,
  description TEXT NOT NULL,
  -- Contexte de l'erreur
  discipline TEXT NOT NULL,
  type_plan TEXT NOT NULL,
  bureau_auteur TEXT,
  echelle TEXT,
  qualite_image TEXT CHECK (qualite_image IN ('haute', 'moyenne', 'basse')),
  -- La correction
  quantite_estimee NUMERIC NOT NULL,
  quantite_corrigee NUMERIC NOT NULL,
  unite TEXT NOT NULL,
  ecart_pct NUMERIC GENERATED ALWAYS AS (
    CASE WHEN quantite_estimee != 0
      THEN ((quantite_corrigee - quantite_estimee) / quantite_estimee * 100)
      ELSE 0
    END
  ) STORED,
  methode_mesure_originale TEXT,
  -- Modèles
  modele_plus_proche TEXT,
  modele_plus_eloigne TEXT,
  valeurs_par_modele JSONB DEFAULT '{}',
  -- Raison
  raison TEXT NOT NULL CHECK (raison IN (
    'erreur_lecture', 'mauvaise_echelle', 'double_comptage',
    'element_manque', 'element_en_trop', 'mauvaise_unite', 'autre'
  )),
  commentaire TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_qty_corrections_org ON quantity_corrections(org_id);
CREATE INDEX idx_qty_corrections_cfc ON quantity_corrections(cfc_code);
CREATE INDEX idx_qty_corrections_discipline ON quantity_corrections(discipline);
CREATE INDEX idx_qty_corrections_bureau ON quantity_corrections(bureau_auteur);

ALTER TABLE quantity_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quantity_corrections_org_isolation" ON quantity_corrections
  USING (org_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────

-- Table de calibration prix (Couche 1 — privée)
CREATE TABLE IF NOT EXISTS price_calibrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  cfc_code TEXT NOT NULL,
  description_normalized TEXT NOT NULL,
  unite TEXT NOT NULL,
  region TEXT NOT NULL,
  -- Estimation originale
  estimation_id UUID NOT NULL,
  prix_estime_median NUMERIC NOT NULL,
  source_estimation TEXT NOT NULL,
  -- Prix réel
  prix_reel NUMERIC NOT NULL,
  source_prix_reel TEXT NOT NULL CHECK (source_prix_reel IN (
    'offre_fournisseur', 'decompte_final', 'correction_manuelle'
  )),
  fournisseur_hash TEXT,
  -- Calibration
  coefficient NUMERIC GENERATED ALWAYS AS (
    CASE WHEN prix_estime_median != 0
      THEN prix_reel / prix_estime_median
      ELSE 1
    END
  ) STORED,
  ecart_pct NUMERIC GENERATED ALWAYS AS (
    CASE WHEN prix_estime_median != 0
      THEN ((prix_reel - prix_estime_median) / prix_estime_median * 100)
      ELSE 0
    END
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_cal_org ON price_calibrations(org_id);
CREATE INDEX idx_price_cal_cfc_region ON price_calibrations(cfc_code, region);

ALTER TABLE price_calibrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price_calibrations_org_isolation" ON price_calibrations
  USING (org_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────

-- Table des profils de bureau d'études (Couche 1 — privée)
CREATE TABLE IF NOT EXISTS bureau_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  bureau_nom TEXT NOT NULL,
  bureau_nom_hash TEXT NOT NULL,
  nb_plans_analyses INTEGER DEFAULT 0,
  conventions JSONB DEFAULT '{}',
  erreurs_frequentes JSONB DEFAULT '[]',
  performance_par_discipline JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, bureau_nom_hash)
);

ALTER TABLE bureau_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bureau_profiles_org_isolation" ON bureau_profiles
  USING (org_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────

-- Table des profils d'erreur par modèle (Couche 2 — agrégée)
CREATE TABLE IF NOT EXISTS model_error_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('claude', 'gpt4o', 'gemini')),
  discipline TEXT NOT NULL,
  type_element_cfc TEXT NOT NULL,
  nb_corrections INTEGER NOT NULL,
  contributor_count INTEGER NOT NULL,
  ecart_moyen_pct NUMERIC NOT NULL,
  ecart_median_pct NUMERIC NOT NULL,
  ecart_stddev_pct NUMERIC NOT NULL,
  tendance TEXT CHECK (tendance IN ('surestime', 'sous_estime', 'neutre')),
  coefficient_correction NUMERIC NOT NULL DEFAULT 1.0,
  fiabilite NUMERIC NOT NULL DEFAULT 0.5,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, discipline, type_element_cfc)
);

-- ─────────────────────────────────────────────────

-- Table des vérifications croisées inter-plans (Couche 1)
CREATE TABLE IF NOT EXISTS cross_plan_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  plans_compares JSONB NOT NULL,
  verifications JSONB NOT NULL,
  score_coherence_projet NUMERIC NOT NULL,
  alertes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cross_plan_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cross_plan_org_isolation" ON cross_plan_verifications
  USING (org_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────

-- Vue matérialisée : coefficients de calibration prix
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_calibration_coefficients AS
SELECT
  org_id,
  cfc_code,
  region,
  COUNT(*) AS nb_calibrations,
  AVG(coefficient) AS coefficient_moyen,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY coefficient) AS coefficient_median,
  STDDEV(coefficient) AS coefficient_stddev,
  MIN(created_at) AS premiere_calibration,
  MAX(created_at) AS derniere_calibration
FROM price_calibrations
WHERE created_at > NOW() - INTERVAL '12 months'
GROUP BY org_id, cfc_code, region
HAVING COUNT(*) >= 2;

CREATE UNIQUE INDEX idx_mv_cal_coeff ON mv_calibration_coefficients(org_id, cfc_code, region);

-- ─────────────────────────────────────────────────

-- Vue matérialisée : coefficients de calibration quantités
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_qty_calibration AS
SELECT
  org_id,
  cfc_code,
  discipline,
  bureau_auteur,
  COUNT(*) AS nb_corrections,
  AVG(ecart_pct) AS ecart_moyen_pct,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ecart_pct) AS ecart_median_pct,
  STDDEV(ecart_pct) AS ecart_stddev_pct,
  CASE
    WHEN AVG(ecart_pct) != 0 THEN 1 + (AVG(ecart_pct) / 100)
    ELSE 1.0
  END AS coefficient_correction,
  MAX(created_at) AS derniere_correction
FROM quantity_corrections
WHERE created_at > NOW() - INTERVAL '12 months'
GROUP BY org_id, cfc_code, discipline, bureau_auteur
HAVING COUNT(*) >= 3;

CREATE UNIQUE INDEX idx_mv_qty_cal ON mv_qty_calibration(org_id, cfc_code, discipline, bureau_auteur);

-- ─────────────────────────────────────────────────

-- Fonction pour rafraîchir les vues matérialisées
CREATE OR REPLACE FUNCTION refresh_calibration_views()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_calibration_coefficients;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_qty_calibration;
END;
$$ LANGUAGE plpgsql;
