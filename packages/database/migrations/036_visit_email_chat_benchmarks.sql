-- Migration 036: Visit benchmarks + Email benchmarks + Chat analytics (C2 — Aggregated)

-- Visit / commercial benchmarks
CREATE TABLE IF NOT EXISTS visit_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_type_cfc TEXT NOT NULL,
  conversion_rate NUMERIC, -- 0-1, visits → mandates
  avg_cycle_days NUMERIC, -- visit → contract signature
  sentiment_distribution JSONB DEFAULT '{}', -- {"positive": 0.6, "neutral": 0.3, "negative": 0.1}
  top_demands JSONB DEFAULT '[]', -- ["rénovation façade", "agrandissement", ...]
  contributor_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (work_type_cfc)
);

ALTER TABLE visit_benchmarks ADD CONSTRAINT chk_vb_min_contributors
  CHECK (contributor_count >= 3);

-- Email classification benchmarks
CREATE TABLE IF NOT EXISTS email_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_type TEXT NOT NULL,
  l1_success_rate NUMERIC, -- % classified at L1 (local rules)
  avg_correction_rate NUMERIC, -- % corrected post-classification
  avg_volume_per_phase JSONB DEFAULT '{}', -- {"planning": 30, "active": 80, ...}
  contributor_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (project_type)
);

ALTER TABLE email_benchmarks ADD CONSTRAINT chk_eb_min_contributors
  CHECK (contributor_count >= 3);

-- Chat JM aggregated analytics
CREATE TABLE IF NOT EXISTS chat_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_category TEXT NOT NULL,
  frequency INTEGER DEFAULT 0, -- total questions in this category
  satisfaction_rate NUMERIC, -- 0-1
  top_sia_norms TEXT[] DEFAULT '{}',
  contributor_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (topic_category)
);

ALTER TABLE chat_analytics ADD CONSTRAINT chk_ca_min_contributors
  CHECK (contributor_count >= 3);

CREATE INDEX IF NOT EXISTS idx_chat_analytics_topic ON chat_analytics(topic_category);
