-- Migration 061: Portail Chef d'Équipe

-- Colonnes portail sur projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS portal_pin_hash TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS portal_pin_salt TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS portal_description TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS portal_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL;

-- Table: portal_crew_members (liste ouvriers persistante)
CREATE TABLE IF NOT EXISTS portal_crew_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_members_project ON portal_crew_members(project_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_active ON portal_crew_members(project_id, is_active);

-- Table: site_reports (rapport journalier)
CREATE TABLE IF NOT EXISTS site_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  submitted_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'locked')),
  remarks TEXT,
  weather TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, report_date, submitted_by_name)
);

CREATE INDEX IF NOT EXISTS idx_site_reports_project ON site_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_site_reports_date ON site_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_site_reports_status ON site_reports(status);

-- Table: site_report_entries (lignes du rapport)
CREATE TABLE IF NOT EXISTS site_report_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES site_reports(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('labor', 'machine', 'delivery_note')),
  -- labor fields
  crew_member_id UUID REFERENCES portal_crew_members(id) ON DELETE SET NULL,
  work_description TEXT,
  duration_hours DECIMAL(5,2),
  is_driver BOOLEAN DEFAULT false,
  -- machine fields
  machine_description TEXT,
  is_rented BOOLEAN DEFAULT false,
  -- delivery_note fields
  note_number TEXT,
  supplier_name TEXT,
  photo_url TEXT,
  -- common
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_entries_report ON site_report_entries(report_id);
CREATE INDEX IF NOT EXISTS idx_report_entries_type ON site_report_entries(entry_type);

-- Updated_at trigger for site_reports
CREATE OR REPLACE FUNCTION update_site_report_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_site_report_updated
  BEFORE UPDATE ON site_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_site_report_updated_at();
