-- ============================================================
-- Migration 022: Plan Estimates + Tracking Code + Pricing Config
-- ============================================================

-- 1. Plan estimates table (stores chiffrage results from plan analysis)
CREATE TABLE IF NOT EXISTS plan_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plan_registry(id) ON DELETE CASCADE,
  plan_analysis_id UUID NOT NULL REFERENCES plan_analyses(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Config used for this estimate
  config JSONB NOT NULL,

  -- Full results
  estimate_result JSONB NOT NULL,

  -- Summary fields for quick queries
  subtotal DECIMAL(15,2),
  margin_total DECIMAL(15,2),
  transport_cost DECIMAL(15,2),
  grand_total DECIMAL(15,2),
  currency TEXT DEFAULT 'CHF',

  -- Quality metrics
  db_coverage_percent DECIMAL(5,2),
  confidence_summary JSONB,
  items_count INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'draft', 'error')),

  -- Audit
  estimated_by UUID REFERENCES users(id),
  estimated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_estimates_plan ON plan_estimates(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_estimates_analysis ON plan_estimates(plan_analysis_id);
CREATE INDEX IF NOT EXISTS idx_plan_estimates_project ON plan_estimates(project_id);
CREATE INDEX IF NOT EXISTS idx_plan_estimates_org ON plan_estimates(organization_id);

ALTER TABLE plan_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_plan_estimates" ON plan_estimates FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- 2. Pricing config on organizations (default chiffrage parameters)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pricing_config JSONB DEFAULT '{
  "hourly_rate": 95,
  "site_location": "",
  "departure_location": "",
  "margin_level": "standard",
  "default_exclusions": [],
  "default_scope": "line_by_line"
}'::jsonb;

-- 3. Tracking code on price_requests (for linking email responses)
ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS tracking_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_requests_tracking_code
  ON price_requests(tracking_code) WHERE tracking_code IS NOT NULL;

-- 4. Link email responses to price requests
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS linked_price_request_id UUID REFERENCES price_requests(id);
CREATE INDEX IF NOT EXISTS idx_email_records_price_request
  ON email_records(linked_price_request_id) WHERE linked_price_request_id IS NOT NULL;
