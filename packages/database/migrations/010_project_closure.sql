-- ============================================================
-- CANTAIA — Migration 010: Project Closure & Reception
-- ============================================================
-- Tables for project closure workflow, reception PV, reserves tracking,
-- and closure documents. Based on SIA 118, art. 157-163.

-- Table des réceptions par projet
CREATE TABLE project_receptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  reception_type TEXT NOT NULL DEFAULT 'provisional', -- 'provisional' (provisoire), 'final' (définitive), 'partial' (partielle par lot)
  reception_date DATE,
  reception_location TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'scheduled', 'completed', 'signed'

  -- Participants
  participants JSONB DEFAULT '[]', -- [{name, role, company, present: bool, signed: bool}]

  -- Document
  pv_document_url TEXT, -- URL du PV généré (Word/PDF)
  pv_signed_url TEXT, -- URL du PV signé uploadé (scan/photo)
  pv_signed_at TIMESTAMPTZ,
  pv_signed_verified BOOLEAN DEFAULT false,

  -- Lots réceptionnés
  lots_reception JSONB DEFAULT '[]', -- [{lot_id, lot_name, cfc_code, company, contract_amount, final_amount, status: 'accepted'|'reserves'|'refused', notes}]

  -- Garantie
  guarantee_2y_end DATE,
  guarantee_5y_end DATE,
  guarantee_visit_2y_scheduled BOOLEAN DEFAULT false,
  guarantee_visit_5y_scheduled BOOLEAN DEFAULT false,

  -- Notes
  general_notes TEXT,
  legal_clause TEXT DEFAULT 'Le maître d''ouvrage déclare réceptionner les travaux sous les réserves ci-dessus. Le délai de garantie de 2 ans (SIA 118, art. 172) commence à courir à la date de signature du présent procès-verbal.',

  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des réserves (défauts constatés)
CREATE TABLE reception_reserves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reception_id UUID REFERENCES project_receptions(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  description TEXT NOT NULL,
  location TEXT,
  lot_id UUID REFERENCES lots(id),
  lot_name TEXT,
  cfc_code TEXT,
  responsible_company TEXT,

  severity TEXT NOT NULL DEFAULT 'minor', -- 'minor', 'major', 'blocking'
  deadline DATE,

  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'corrected', 'verified', 'disputed'
  corrected_at TIMESTAMPTZ,
  corrected_by TEXT,
  correction_notes TEXT,
  correction_photo_urls JSONB DEFAULT '[]',
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id),

  task_id UUID REFERENCES tasks(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des documents de clôture
CREATE TABLE closure_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  reception_id UUID REFERENCES project_receptions(id),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  document_type TEXT NOT NULL, -- 'pv_reception', 'pv_reserves_lifted', 'guarantee_certificate', 'final_invoice', 'as_built_plans', 'other'
  document_name TEXT NOT NULL,
  document_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Index
CREATE INDEX idx_receptions_project ON project_receptions(project_id);
CREATE INDEX idx_reserves_reception ON reception_reserves(reception_id);
CREATE INDEX idx_reserves_project ON reception_reserves(project_id);
CREATE INDEX idx_reserves_status ON reception_reserves(status);
CREATE INDEX idx_closure_docs_project ON closure_documents(project_id);

-- RLS
ALTER TABLE project_receptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reception_reserves ENABLE ROW LEVEL SECURITY;
ALTER TABLE closure_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage receptions in their org" ON project_receptions
  FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage reserves in their org" ON reception_reserves
  FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage closure docs in their org" ON closure_documents
  FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
