-- ============================================================
-- CANTAIA — Migration 011: Plan Registry
-- Registre de plans, versions et alertes de versions obsolètes
-- ============================================================

-- Registre des plans par projet
CREATE TABLE IF NOT EXISTS plan_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identification du plan
  plan_number TEXT NOT NULL,
  plan_title TEXT NOT NULL,
  plan_type TEXT DEFAULT 'execution',

  -- Classification
  discipline TEXT,
  lot_id UUID REFERENCES lots(id),
  lot_name TEXT,
  cfc_code TEXT,
  zone TEXT,
  scale TEXT,
  format TEXT,

  -- Auteur
  author_company TEXT,
  author_name TEXT,
  author_email TEXT,

  -- Statut
  status TEXT DEFAULT 'active',
  is_current_version BOOLEAN DEFAULT true,

  -- Métadonnées
  tags JSONB DEFAULT '[]',
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Versions de chaque plan
CREATE TABLE IF NOT EXISTS plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES plan_registry(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Version
  version_code TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  version_date DATE NOT NULL,

  -- Fichier
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  thumbnail_url TEXT,

  -- Source
  source TEXT DEFAULT 'email',
  source_email_id UUID REFERENCES email_records(id),
  received_at TIMESTAMPTZ DEFAULT NOW(),

  -- Analyse IA
  ai_detected BOOLEAN DEFAULT false,
  ai_confidence DECIMAL(3,2),
  ai_changes_detected TEXT,

  -- Validation
  validated_by UUID REFERENCES users(id),
  validated_at TIMESTAMPTZ,
  validation_status TEXT DEFAULT 'pending',
  validation_notes TEXT,

  -- Distribution
  distributed_to JSONB DEFAULT '[]',
  distribution_date TIMESTAMPTZ,

  is_current BOOLEAN DEFAULT true,
  superseded_by UUID REFERENCES plan_versions(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des alertes de version obsolète
CREATE TABLE IF NOT EXISTS plan_version_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES plan_registry(id) ON DELETE CASCADE,
  plan_version_id UUID REFERENCES plan_versions(id),
  current_version_id UUID REFERENCES plan_versions(id),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  alert_type TEXT NOT NULL,
  severity TEXT DEFAULT 'warning',

  detected_in TEXT,
  detected_in_id UUID,
  detected_context TEXT,

  who_used_outdated TEXT,

  status TEXT DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolution_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_plan_registry_project ON plan_registry(project_id);
CREATE INDEX IF NOT EXISTS idx_plan_registry_number ON plan_registry(plan_number);
CREATE INDEX IF NOT EXISTS idx_plan_versions_plan ON plan_versions(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_versions_current ON plan_versions(is_current);
CREATE INDEX IF NOT EXISTS idx_plan_alerts_project ON plan_version_alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_plan_alerts_status ON plan_version_alerts(status);

-- RLS
ALTER TABLE plan_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_version_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage plans in their org" ON plan_registry;
CREATE POLICY "Users can manage plans in their org" ON plan_registry
  FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "Users can manage plan versions in their org" ON plan_versions;
CREATE POLICY "Users can manage plan versions in their org" ON plan_versions
  FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "Users can manage plan alerts in their org" ON plan_version_alerts;
CREATE POLICY "Users can manage plan alerts in their org" ON plan_version_alerts
  FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
