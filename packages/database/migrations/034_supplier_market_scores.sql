-- Migration 034: Supplier market scores (C2 — Aggregated)
-- Anonymous cross-tenant supplier scores using hashed company names

CREATE TABLE IF NOT EXISTS supplier_market_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_company_hash TEXT NOT NULL, -- SHA-256(company_name + salt)
  specialty TEXT,
  region TEXT,
  avg_score NUMERIC,
  avg_response_rate NUMERIC, -- 0-1
  avg_response_days NUMERIC,
  competitiveness_quartile INTEGER CHECK (competitiveness_quartile BETWEEN 1 AND 4),
  contributor_count INTEGER NOT NULL DEFAULT 0,
  sample_offers INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (supplier_company_hash, specialty, region)
);

ALTER TABLE supplier_market_scores ADD CONSTRAINT chk_sms_min_contributors
  CHECK (contributor_count >= 3);

CREATE INDEX IF NOT EXISTS idx_supplier_market_scores_hash ON supplier_market_scores(supplier_company_hash);
CREATE INDEX IF NOT EXISTS idx_supplier_market_scores_specialty ON supplier_market_scores(specialty, region);
CREATE INDEX IF NOT EXISTS idx_supplier_market_scores_region ON supplier_market_scores(region);
