-- ═══════════════════════════════════════
-- Table des ratios extraits des plans
-- Migration 047
-- ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS ingested_plan_ratios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  source_file TEXT NOT NULL,
  discipline TEXT,
  type_plan TEXT,
  bureau_auteur TEXT,
  projet TEXT,
  surface_brute_plancher_m2 NUMERIC,
  beton_m3_par_m2_sbp NUMERIC,
  coffrage_m2_par_m2_sbp NUMERIC,
  facade_m2_par_m2_sbp NUMERIC,
  ouvertures_par_m2_sbp NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plan_ratios_discipline ON ingested_plan_ratios(discipline);
CREATE INDEX idx_plan_ratios_org ON ingested_plan_ratios(org_id);

ALTER TABLE ingested_plan_ratios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_ratios_org_isolation" ON ingested_plan_ratios
  USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────

-- Vue matérialisée des ratios moyens par discipline
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_plan_ratios AS
SELECT
  discipline,
  COUNT(*) AS nb_plans,
  ROUND(AVG(surface_brute_plancher_m2)::numeric, 1) AS avg_sbp_m2,
  ROUND(AVG(beton_m3_par_m2_sbp)::numeric, 3) AS avg_beton_ratio,
  ROUND(AVG(coffrage_m2_par_m2_sbp)::numeric, 3) AS avg_coffrage_ratio,
  ROUND(AVG(facade_m2_par_m2_sbp)::numeric, 3) AS avg_facade_ratio,
  ROUND(STDDEV(beton_m3_par_m2_sbp)::numeric, 3) AS stddev_beton_ratio
FROM ingested_plan_ratios
WHERE beton_m3_par_m2_sbp IS NOT NULL
  AND surface_brute_plancher_m2 > 0
GROUP BY discipline
HAVING COUNT(*) >= 3;

CREATE UNIQUE INDEX idx_mv_plan_ratios ON mv_plan_ratios(discipline);

-- ─────────────────────────────────────

-- Fonction pour rafraîchir après ingestion des plans
CREATE OR REPLACE FUNCTION refresh_plan_ratios()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_plan_ratios;
END;
$$ LANGUAGE plpgsql;
