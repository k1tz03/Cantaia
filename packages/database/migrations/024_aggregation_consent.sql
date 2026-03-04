-- Migration 024: Aggregation consent — opt-in per module for data intelligence
-- Part of the 3-layer data intelligence architecture (C1 — Private)

CREATE TABLE IF NOT EXISTS aggregation_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN (
    'prix', 'fournisseurs', 'plans', 'pv', 'visites', 'chat', 'mail', 'taches', 'briefing'
  )),
  opted_in BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (organization_id, module)
);

CREATE INDEX IF NOT EXISTS idx_aggregation_consent_org ON aggregation_consent(organization_id);
CREATE INDEX IF NOT EXISTS idx_aggregation_consent_module ON aggregation_consent(module, opted_in);

ALTER TABLE aggregation_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_aggregation_consent" ON aggregation_consent FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
