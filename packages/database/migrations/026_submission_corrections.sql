-- Migration 026: Submission corrections (C1 — Private)
-- Tracks manual corrections on AI-extracted submission data for private learning

CREATE TABLE IF NOT EXISTS submission_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL,
  item_index INTEGER NOT NULL,
  field TEXT NOT NULL CHECK (field IN (
    'description', 'quantity', 'unit', 'unit_price', 'total_price', 'cfc_code'
  )),
  old_value TEXT,
  new_value TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submission_corrections_org ON submission_corrections(organization_id);
CREATE INDEX IF NOT EXISTS idx_submission_corrections_sub ON submission_corrections(submission_id);

ALTER TABLE submission_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_submission_corrections" ON submission_corrections FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
