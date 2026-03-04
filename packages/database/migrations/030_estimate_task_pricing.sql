-- Migration 030: Estimate accuracy log + Task status log + Org pricing config (C1 — Private)

-- Track estimation accuracy vs actual prices
CREATE TABLE IF NOT EXISTS estimate_accuracy_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID,
  project_id UUID REFERENCES projects(id),
  cfc_code TEXT,
  estimated_total NUMERIC NOT NULL,
  actual_total NUMERIC NOT NULL,
  delta_pct NUMERIC GENERATED ALWAYS AS (
    CASE WHEN estimated_total > 0
      THEN ((actual_total - estimated_total) / estimated_total * 100)
      ELSE 0
    END
  ) STORED,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimate_accuracy_org ON estimate_accuracy_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_estimate_accuracy_project ON estimate_accuracy_log(project_id);

ALTER TABLE estimate_accuracy_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_estimate_accuracy" ON estimate_accuracy_log FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Task status change log for productivity analysis
CREATE TABLE IF NOT EXISTS task_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id UUID NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_status_log_org ON task_status_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_task_status_log_task ON task_status_log(task_id);

ALTER TABLE task_status_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_task_status_log" ON task_status_log FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Organization pricing configuration
CREATE TABLE IF NOT EXISTS org_pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hourly_rate NUMERIC DEFAULT 85.00,
  margin_level NUMERIC DEFAULT 15.0,
  transport_base NUMERIC DEFAULT 50.00,
  transport_per_km NUMERIC DEFAULT 1.20,
  currency TEXT DEFAULT 'CHF',
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (organization_id)
);

ALTER TABLE org_pricing_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_pricing_config_policy" ON org_pricing_config FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
