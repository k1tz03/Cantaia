-- ═══════════════════════════════════════
-- Tables pour l'ingestion de données historiques
-- Migration 045
-- ═══════════════════════════════════════

-- Table brute des lignes d'offre ingérées
-- C'est la table de staging — les données sont ensuite
-- transférées dans offer_line_items après validation
CREATE TABLE IF NOT EXISTS ingested_offer_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  source_file TEXT NOT NULL,
  source_type TEXT DEFAULT 'ingestion_historique',
  -- Fournisseur
  fournisseur_nom TEXT, -- En clair (C1 privé)
  fournisseur_hash TEXT, -- SHA-256 pour C2
  -- Contexte
  date_offre DATE,
  quarter TEXT, -- ex: 2024-Q3
  region TEXT DEFAULT 'vaud',
  -- Poste
  cfc_code TEXT,
  description TEXT NOT NULL,
  quantite NUMERIC,
  unite TEXT,
  prix_unitaire_ht NUMERIC,
  prix_total_ht NUMERIC,
  rabais_pct NUMERIC,
  -- Qualité
  confiance TEXT DEFAULT 'medium',
  -- Statut de validation
  validated BOOLEAN DEFAULT false,
  validated_by UUID,
  validated_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ingested_offers_org ON ingested_offer_lines(org_id);
CREATE INDEX idx_ingested_offers_cfc ON ingested_offer_lines(cfc_code);
CREATE INDEX idx_ingested_offers_region_quarter ON ingested_offer_lines(region, quarter);
CREATE INDEX idx_ingested_offers_validated ON ingested_offer_lines(validated);

ALTER TABLE ingested_offer_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingested_offers_org_isolation" ON ingested_offer_lines
  USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────

-- Table brute des quantités extraites des plans
CREATE TABLE IF NOT EXISTS ingested_plan_quantities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  source_file TEXT NOT NULL,
  -- Classification du plan
  discipline TEXT,
  type_plan TEXT,
  echelle TEXT,
  bureau_auteur TEXT,
  -- Quantités
  cfc_code TEXT,
  description TEXT,
  quantite NUMERIC,
  unite TEXT,
  methode_mesure TEXT,
  confiance TEXT DEFAULT 'medium',
  -- Surfaces de référence
  surface_brute_plancher NUMERIC,
  type_batiment TEXT,
  region TEXT DEFAULT 'vaud',
  -- Validation
  validated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ingested_plans_org ON ingested_plan_quantities(org_id);
CREATE INDEX idx_ingested_plans_cfc ON ingested_plan_quantities(cfc_code);

ALTER TABLE ingested_plan_quantities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingested_plans_org_isolation" ON ingested_plan_quantities
  USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────

-- Vue matérialisée : prix de référence calculés depuis les offres ingérées
-- C'est cette vue que le price-resolver consulte
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_reference_prices AS
SELECT
  cfc_code,
  region,
  quarter,
  unite,
  COUNT(*) AS nb_datapoints,
  COUNT(DISTINCT fournisseur_hash) AS nb_fournisseurs,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY prix_unitaire_ht) AS prix_p25,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY prix_unitaire_ht) AS prix_median,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY prix_unitaire_ht) AS prix_p75,
  MIN(prix_unitaire_ht) AS prix_min,
  MAX(prix_unitaire_ht) AS prix_max,
  STDDEV(prix_unitaire_ht) AS prix_stddev,
  MAX(date_offre) AS derniere_offre
FROM ingested_offer_lines
WHERE prix_unitaire_ht IS NOT NULL
  AND prix_unitaire_ht > 0
  AND cfc_code IS NOT NULL
GROUP BY cfc_code, region, quarter, unite
HAVING COUNT(*) >= 2; -- Au moins 2 datapoints

CREATE UNIQUE INDEX idx_mv_ref_prices
  ON mv_reference_prices(cfc_code, region, quarter, unite);

-- ─────────────────────────────────────

-- Fonction pour rafraîchir après ingestion
CREATE OR REPLACE FUNCTION refresh_reference_prices()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reference_prices;
END;
$$ LANGUAGE plpgsql;
