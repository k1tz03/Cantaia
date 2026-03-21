-- Migration 058: Planning fixes
-- Adds missing ai_validation column and expands dependency source CHECK

-- 1. Add ai_validation JSONB column to project_plannings
ALTER TABLE project_plannings
  ADD COLUMN IF NOT EXISTS ai_validation JSONB;

-- 2. Expand source CHECK constraint on planning_dependencies to include 'rule'
ALTER TABLE planning_dependencies
  DROP CONSTRAINT IF EXISTS planning_dependencies_source_check;

ALTER TABLE planning_dependencies
  ADD CONSTRAINT planning_dependencies_source_check
  CHECK (source IN ('auto', 'manual', 'rule'));
