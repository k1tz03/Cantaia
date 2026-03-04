-- Migration 033: Market benchmarks + Regional price index + Material correlations (C2 — Aggregated)
-- These tables have NO org_id — they are anonymous, aggregated data

-- Price benchmarks by CFC code / region / quarter
CREATE TABLE IF NOT EXISTS market_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cfc_code TEXT NOT NULL,
  description_normalized TEXT NOT NULL,
  unit TEXT NOT NULL,
  region TEXT NOT NULL,
  quarter TEXT NOT NULL, -- e.g. '2026-Q1'
  price_median NUMERIC,
  price_p25 NUMERIC,
  price_p75 NUMERIC,
  std_dev NUMERIC,
  trend_pct NUMERIC, -- vs previous quarter
  contributor_count INTEGER NOT NULL DEFAULT 0,
  sample_size INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (cfc_code, unit, region, quarter)
);

-- Enforce minimum contributor threshold
ALTER TABLE market_benchmarks ADD CONSTRAINT chk_market_min_contributors
  CHECK (contributor_count >= 3);

CREATE INDEX IF NOT EXISTS idx_market_benchmarks_cfc ON market_benchmarks(cfc_code);
CREATE INDEX IF NOT EXISTS idx_market_benchmarks_region ON market_benchmarks(region, quarter);
CREATE INDEX IF NOT EXISTS idx_market_benchmarks_quarter ON market_benchmarks(quarter);

-- Regional construction price index (basket of 50 common CFC items)
CREATE TABLE IF NOT EXISTS regional_price_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL,
  quarter TEXT NOT NULL,
  index_value NUMERIC NOT NULL DEFAULT 100.0,
  basket_items_count INTEGER DEFAULT 0,
  contributor_count INTEGER NOT NULL DEFAULT 0,
  previous_index NUMERIC,
  change_pct NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (region, quarter)
);

ALTER TABLE regional_price_index ADD CONSTRAINT chk_rpi_min_contributors
  CHECK (contributor_count >= 3);

CREATE INDEX IF NOT EXISTS idx_regional_price_index_region ON regional_price_index(region);

-- Material / CFC price correlations (e.g. copper price → HVAC costs)
CREATE TABLE IF NOT EXISTS material_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material TEXT NOT NULL,
  affected_cfc_codes TEXT[] NOT NULL DEFAULT '{}',
  correlation_coefficient NUMERIC NOT NULL,
  lag_months INTEGER DEFAULT 0,
  contributor_count INTEGER NOT NULL DEFAULT 0,
  period TEXT, -- e.g. '2025-H2' or '2026-Q1'
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (material, period)
);

ALTER TABLE material_correlations ADD CONSTRAINT chk_matcorr_min_contributors
  CHECK (contributor_count >= 3);

CREATE INDEX IF NOT EXISTS idx_material_correlations_material ON material_correlations(material);
