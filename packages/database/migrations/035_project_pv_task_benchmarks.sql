-- Migration 035: Project benchmarks + PV quality benchmarks + Task benchmarks (C2 — Aggregated)

-- Project benchmarks by type and region
CREATE TABLE IF NOT EXISTS project_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_type TEXT NOT NULL,
  region TEXT,
  avg_duration_days NUMERIC,
  budget_overrun_pct NUMERIC,
  avg_emails_per_phase JSONB DEFAULT '{}', -- {"planning": 45, "active": 120, ...}
  avg_tasks_per_phase JSONB DEFAULT '{}',
  contributor_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (project_type, region)
);

ALTER TABLE project_benchmarks ADD CONSTRAINT chk_pb_min_contributors
  CHECK (contributor_count >= 3);

CREATE INDEX IF NOT EXISTS idx_project_benchmarks_type ON project_benchmarks(project_type);

-- PV (meeting minutes) quality benchmarks
CREATE TABLE IF NOT EXISTS pv_quality_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_type TEXT NOT NULL DEFAULT 'chantier',
  avg_decisions_count NUMERIC,
  avg_actions_count NUMERIC,
  correction_rate NUMERIC, -- % of PV corrected after generation
  avg_duration_minutes NUMERIC,
  contributor_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (meeting_type)
);

ALTER TABLE pv_quality_benchmarks ADD CONSTRAINT chk_pvqb_min_contributors
  CHECK (contributor_count >= 3);

-- Task benchmarks by category
CREATE TABLE IF NOT EXISTS task_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_category TEXT NOT NULL,
  avg_completion_days NUMERIC,
  overdue_rate NUMERIC, -- 0-1
  ai_suggestion_acceptance_rate NUMERIC, -- 0-1
  source_distribution JSONB DEFAULT '{}', -- {"email": 0.4, "pv": 0.3, "manual": 0.2, "ai": 0.1}
  contributor_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (task_category)
);

ALTER TABLE task_benchmarks ADD CONSTRAINT chk_tb_min_contributors
  CHECK (contributor_count >= 3);

CREATE INDEX IF NOT EXISTS idx_task_benchmarks_category ON task_benchmarks(task_category);
