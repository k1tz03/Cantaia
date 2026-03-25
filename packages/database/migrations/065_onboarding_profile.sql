-- Onboarding wizard state persistence
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_current_step INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS company_size TEXT,
  ADD COLUMN IF NOT EXISTS project_types TEXT[] DEFAULT '{}';

-- Project type classification
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_type TEXT;
