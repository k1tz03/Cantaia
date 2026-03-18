-- ============================================================
-- CANTAIA — Migration 055: Planning / Gantt Tables
-- Adds project planning with tasks, dependencies, sharing,
-- and duration correction learning.
-- ============================================================

-- ============================================================
-- 1. PROJECT PLANNINGS (1 per project, optionally linked to a submission)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_plannings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),

  start_date DATE NOT NULL,
  target_end_date DATE,
  calculated_end_date DATE,

  project_type TEXT CHECK (project_type IN ('new', 'renovation', 'extension', 'interior')),
  location_canton TEXT,

  config JSONB DEFAULT '{}',
  ai_generation_log JSONB,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. PLANNING PHASES (= lots CFC grouping)
-- ============================================================
CREATE TABLE IF NOT EXISTS planning_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_id UUID NOT NULL REFERENCES project_plannings(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  cfc_codes TEXT[] DEFAULT '{}',
  color TEXT,
  sort_order INTEGER DEFAULT 0,

  start_date DATE,
  end_date DATE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. PLANNING TASKS (individual Gantt bars)
-- ============================================================
CREATE TABLE IF NOT EXISTS planning_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_id UUID NOT NULL REFERENCES project_plannings(id) ON DELETE CASCADE,
  phase_id UUID NOT NULL REFERENCES planning_phases(id) ON DELETE CASCADE,
  submission_item_id UUID REFERENCES submission_items(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  description TEXT,
  cfc_code TEXT,

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days >= 0),

  -- Duration calculation inputs (stored for re-calculation / audit)
  quantity NUMERIC,
  unit TEXT,
  productivity_ratio NUMERIC,
  productivity_source TEXT,
  adjustment_factors JSONB,
  base_duration_days NUMERIC,

  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  team_size INTEGER DEFAULT 1 CHECK (team_size >= 1),

  progress NUMERIC DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  is_milestone BOOLEAN DEFAULT false,
  milestone_type TEXT,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. PLANNING DEPENDENCIES (predecessor/successor links)
-- ============================================================
CREATE TABLE IF NOT EXISTS planning_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_id UUID NOT NULL REFERENCES project_plannings(id) ON DELETE CASCADE,
  predecessor_id UUID NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
  successor_id UUID NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,

  dependency_type TEXT NOT NULL DEFAULT 'FS' CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF')),
  lag_days INTEGER DEFAULT 0,
  source TEXT DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate dependencies
  CONSTRAINT uq_dependency UNIQUE (predecessor_id, successor_id)
);

-- ============================================================
-- 5. PLANNING SHARES (shareable read-only links)
-- ============================================================
CREATE TABLE IF NOT EXISTS planning_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_id UUID NOT NULL REFERENCES project_plannings(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id),

  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. PLANNING DURATION CORRECTIONS (learning from user edits)
-- ============================================================
CREATE TABLE IF NOT EXISTS planning_duration_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  cfc_code TEXT NOT NULL,
  unit TEXT,
  original_ratio NUMERIC NOT NULL,
  corrected_ratio NUMERIC NOT NULL,

  project_type TEXT CHECK (project_type IN ('new', 'renovation', 'extension', 'interior')),
  canton TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- project_plannings
CREATE INDEX IF NOT EXISTS idx_plannings_project ON project_plannings(project_id);
CREATE INDEX IF NOT EXISTS idx_plannings_org ON project_plannings(organization_id);
CREATE INDEX IF NOT EXISTS idx_plannings_submission ON project_plannings(submission_id);
CREATE INDEX IF NOT EXISTS idx_plannings_status ON project_plannings(status);

-- planning_phases
CREATE INDEX IF NOT EXISTS idx_phases_planning ON planning_phases(planning_id);

-- planning_tasks
CREATE INDEX IF NOT EXISTS idx_ptasks_planning ON planning_tasks(planning_id);
CREATE INDEX IF NOT EXISTS idx_ptasks_phase ON planning_tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_ptasks_cfc ON planning_tasks(cfc_code);
CREATE INDEX IF NOT EXISTS idx_ptasks_dates ON planning_tasks(start_date, end_date);

-- planning_dependencies
CREATE INDEX IF NOT EXISTS idx_pdeps_planning ON planning_dependencies(planning_id);
CREATE INDEX IF NOT EXISTS idx_pdeps_predecessor ON planning_dependencies(predecessor_id);
CREATE INDEX IF NOT EXISTS idx_pdeps_successor ON planning_dependencies(successor_id);

-- planning_shares
CREATE INDEX IF NOT EXISTS idx_pshares_planning ON planning_shares(planning_id);
CREATE INDEX IF NOT EXISTS idx_pshares_token ON planning_shares(token);

-- planning_duration_corrections
CREATE INDEX IF NOT EXISTS idx_pdcorr_org ON planning_duration_corrections(organization_id);
CREATE INDEX IF NOT EXISTS idx_pdcorr_cfc ON planning_duration_corrections(cfc_code);

-- ============================================================
-- RLS (standard org-based access pattern)
-- ============================================================

ALTER TABLE project_plannings ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_duration_corrections ENABLE ROW LEVEL SECURITY;

-- project_plannings
DROP POLICY IF EXISTS "org_plannings" ON project_plannings;
CREATE POLICY "org_plannings" ON project_plannings
  FOR ALL
  USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "plannings_service_role" ON project_plannings;
CREATE POLICY "plannings_service_role" ON project_plannings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- planning_phases (access via planning → org)
DROP POLICY IF EXISTS "org_phases" ON planning_phases;
CREATE POLICY "org_phases" ON planning_phases
  FOR ALL
  USING (planning_id IN (
    SELECT id FROM project_plannings
    WHERE organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  ));

DROP POLICY IF EXISTS "phases_service_role" ON planning_phases;
CREATE POLICY "phases_service_role" ON planning_phases
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- planning_tasks (access via planning → org)
DROP POLICY IF EXISTS "org_ptasks" ON planning_tasks;
CREATE POLICY "org_ptasks" ON planning_tasks
  FOR ALL
  USING (planning_id IN (
    SELECT id FROM project_plannings
    WHERE organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  ));

DROP POLICY IF EXISTS "ptasks_service_role" ON planning_tasks;
CREATE POLICY "ptasks_service_role" ON planning_tasks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- planning_dependencies (access via planning → org)
DROP POLICY IF EXISTS "org_pdeps" ON planning_dependencies;
CREATE POLICY "org_pdeps" ON planning_dependencies
  FOR ALL
  USING (planning_id IN (
    SELECT id FROM project_plannings
    WHERE organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  ));

DROP POLICY IF EXISTS "pdeps_service_role" ON planning_dependencies;
CREATE POLICY "pdeps_service_role" ON planning_dependencies
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- planning_shares (access via planning → org)
DROP POLICY IF EXISTS "org_pshares" ON planning_shares;
CREATE POLICY "org_pshares" ON planning_shares
  FOR ALL
  USING (planning_id IN (
    SELECT id FROM project_plannings
    WHERE organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  ));

DROP POLICY IF EXISTS "pshares_service_role" ON planning_shares;
CREATE POLICY "pshares_service_role" ON planning_shares
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- planning_duration_corrections
DROP POLICY IF EXISTS "org_pdcorr" ON planning_duration_corrections;
CREATE POLICY "org_pdcorr" ON planning_duration_corrections
  FOR ALL
  USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "pdcorr_service_role" ON planning_duration_corrections;
CREATE POLICY "pdcorr_service_role" ON planning_duration_corrections
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- UPDATED_AT TRIGGER (auto-update timestamp)
-- ============================================================

CREATE OR REPLACE FUNCTION update_planning_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_planning_updated_at
  BEFORE UPDATE ON project_plannings
  FOR EACH ROW
  EXECUTE FUNCTION update_planning_updated_at();

CREATE TRIGGER trg_ptask_updated_at
  BEFORE UPDATE ON planning_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_planning_updated_at();
