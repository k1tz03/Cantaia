-- ============================================================
-- CANTAIA — Migration 012: Plan Analyses (AI Vision)
-- ============================================================
-- Stores AI analysis results for construction plans.
-- Run after 011_plan_registry.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS plan_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plan_registry(id) ON DELETE CASCADE,
  plan_version_id UUID NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Analysis metadata
  plan_type_detected TEXT,
  discipline_detected TEXT,
  model_used TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  analysis_duration_ms INTEGER,

  -- Structured results
  analysis_result JSONB NOT NULL,
  summary TEXT,
  confidence DECIMAL(3,2),
  warnings TEXT[],

  -- Status
  status TEXT DEFAULT 'completed',
  error_message TEXT,

  analyzed_by UUID REFERENCES users(id),
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_analyses_version ON plan_analyses(plan_version_id);
CREATE INDEX IF NOT EXISTS idx_plan_analyses_plan ON plan_analyses(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_analyses_org ON plan_analyses(organization_id);

COMMENT ON TABLE plan_analyses IS 'AI-generated analysis of construction plan files (vision)';
COMMENT ON COLUMN plan_analyses.analysis_result IS 'JSON: plan_type, title_block, legend_items, quantities[], observations[]';
