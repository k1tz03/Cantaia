-- Migration 028: PV corrections + Visit report corrections (C1 — Private)

-- Corrections on AI-generated PV content
CREATE TABLE IF NOT EXISTS pv_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL,
  section TEXT NOT NULL,
  old_text TEXT,
  new_text TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pv_corrections_org ON pv_corrections(organization_id);
CREATE INDEX IF NOT EXISTS idx_pv_corrections_meeting ON pv_corrections(meeting_id);

ALTER TABLE pv_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_pv_corrections" ON pv_corrections FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Corrections on AI-generated visit reports
CREATE TABLE IF NOT EXISTS visit_report_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  visit_id UUID NOT NULL,
  section TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visit_report_corrections_org ON visit_report_corrections(organization_id);
CREATE INDEX IF NOT EXISTS idx_visit_report_corrections_visit ON visit_report_corrections(visit_id);

ALTER TABLE visit_report_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_visit_report_corrections" ON visit_report_corrections FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
