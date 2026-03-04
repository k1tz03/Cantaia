-- Migration 027: Plan analysis corrections (C1 — Private)
-- Tracks manual corrections on AI-extracted plan quantities for private learning

CREATE TABLE IF NOT EXISTS plan_analysis_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL,
  quantity_index INTEGER NOT NULL,
  old_qty NUMERIC,
  new_qty NUMERIC,
  old_unit TEXT,
  new_unit TEXT,
  field TEXT DEFAULT 'quantity',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_analysis_corrections_org ON plan_analysis_corrections(organization_id);
CREATE INDEX IF NOT EXISTS idx_plan_analysis_corrections_plan ON plan_analysis_corrections(plan_id);

ALTER TABLE plan_analysis_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_plan_analysis_corrections" ON plan_analysis_corrections FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
