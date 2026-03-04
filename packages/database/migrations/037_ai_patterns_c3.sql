-- Migration 037: AI quality metrics + Prompt optimization log + Pattern library (C3 — Patterns IA)

-- AI quality metrics for calibration across all modules
CREATE TABLE IF NOT EXISTS ai_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL CHECK (module IN (
    'mail', 'pv', 'plans', 'prix', 'chat', 'tasks', 'visits', 'briefing', 'soumissions'
  )),
  metric_type TEXT NOT NULL, -- e.g. 'accuracy', 'correction_rate', 'satisfaction'
  value NUMERIC NOT NULL,
  period TEXT NOT NULL, -- e.g. '2026-W10', '2026-Q1'
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'per_org')),
  org_id UUID REFERENCES organizations(id), -- nullable, only for per_org scope
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_quality_metrics_module ON ai_quality_metrics(module, metric_type);
CREATE INDEX IF NOT EXISTS idx_ai_quality_metrics_period ON ai_quality_metrics(period);
CREATE INDEX IF NOT EXISTS idx_ai_quality_metrics_org ON ai_quality_metrics(org_id) WHERE org_id IS NOT NULL;

-- Prompt optimization history (A/B testing)
CREATE TABLE IF NOT EXISTS prompt_optimization_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  metric_before NUMERIC,
  metric_after NUMERIC,
  improvement_pct NUMERIC GENERATED ALWAYS AS (
    CASE WHEN metric_before > 0
      THEN ((metric_after - metric_before) / metric_before * 100)
      ELSE 0
    END
  ) STORED,
  a_b_test_id TEXT,
  notes TEXT,
  deployed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_opt_module ON prompt_optimization_log(module);
CREATE INDEX IF NOT EXISTS idx_prompt_opt_deployed ON prompt_optimization_log(deployed_at DESC);

-- Pattern library — learned structural patterns from corrections and feedback
CREATE TABLE IF NOT EXISTS pattern_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL CHECK (module IN (
    'mail', 'pv', 'plans', 'prix', 'chat', 'tasks', 'visits', 'briefing', 'soumissions'
  )),
  pattern_type TEXT NOT NULL, -- e.g. 'email_urgency', 'pv_structure', 'price_seasonality'
  pattern_data JSONB NOT NULL DEFAULT '{}',
  confidence NUMERIC DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  usage_count INTEGER DEFAULT 0,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pattern_library_module ON pattern_library(module);
CREATE INDEX IF NOT EXISTS idx_pattern_library_type ON pattern_library(pattern_type);
CREATE INDEX IF NOT EXISTS idx_pattern_library_confidence ON pattern_library(confidence DESC);
