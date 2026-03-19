-- Migration 057: Learning Engine fields
-- Depends on: 055 (planning_tables), 056 (stripe_plan_columns)

-- Organizations: intelligence tracking
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS intelligence_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inflation_rate decimal(5,4) DEFAULT 0.028;

-- Planning tasks: AI enrichment
ALTER TABLE planning_tasks
  ADD COLUMN IF NOT EXISTS ai_risks jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_duration_correction integer;

-- Project plannings: AI summary
ALTER TABLE project_plannings
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_recommendations jsonb DEFAULT '[]'::jsonb;

-- Index for faster calibration lookups
CREATE INDEX IF NOT EXISTS idx_price_calibrations_org_cfc
  ON price_calibrations (org_id, cfc_code);

CREATE INDEX IF NOT EXISTS idx_quantity_corrections_org
  ON quantity_corrections (org_id);

CREATE INDEX IF NOT EXISTS idx_email_classification_rules_org
  ON email_classification_rules (organization_id, rule_type);
