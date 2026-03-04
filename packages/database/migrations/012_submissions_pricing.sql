-- ============================================================
-- CANTAIA — Migration 012: Soumissions & Intelligence Tarifaire
-- ============================================================

-- ============================================================
-- FOURNISSEURS (annuaire central partagé par tous les projets)
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identité
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'CH',
  website TEXT,

  -- Classification
  specialties JSONB DEFAULT '[]',
  cfc_codes JSONB DEFAULT '[]',
  geo_zone TEXT,
  languages JSONB DEFAULT '["fr"]',
  certifications JSONB DEFAULT '[]',

  -- Scoring (calculé automatiquement)
  response_rate DECIMAL(5,2) DEFAULT 0,
  avg_response_days DECIMAL(5,1) DEFAULT 0,
  price_competitiveness DECIMAL(5,2) DEFAULT 0,
  reliability_score DECIMAL(5,2) DEFAULT 0,
  manual_rating INTEGER DEFAULT 0 CHECK (manual_rating BETWEEN 0 AND 5),
  overall_score DECIMAL(5,2) DEFAULT 0,

  -- Statut
  status TEXT DEFAULT 'active',
  tags JSONB DEFAULT '[]',
  notes TEXT,

  -- Stats
  total_requests_sent INTEGER DEFAULT 0,
  total_offers_received INTEGER DEFAULT 0,
  total_projects_involved INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- ============================================================
-- SOUMISSIONS (un descriptif/appel d'offres par projet)
-- ============================================================
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identité
  title TEXT NOT NULL,
  description TEXT,
  reference TEXT,

  -- Source
  source_type TEXT DEFAULT 'upload',
  source_file_url TEXT,
  source_file_name TEXT,
  source_email_id UUID REFERENCES email_records(id),

  -- Métadonnées projet extraites par l'IA
  client_name TEXT,
  architect_name TEXT,
  engineer_name TEXT,
  project_location TEXT,

  -- Statut workflow Kanban
  status TEXT DEFAULT 'draft',

  -- Délais
  deadline DATE,
  award_date DATE,

  -- Parsing IA
  ai_parsed BOOLEAN DEFAULT false,
  ai_confidence DECIMAL(3,2),
  ai_parsed_at TIMESTAMPTZ,

  -- Totaux (calculés)
  estimated_total DECIMAL(15,2) DEFAULT 0,
  best_offer_total DECIMAL(15,2),
  awarded_total DECIMAL(15,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- ============================================================
-- LOTS (chapitres CFC d'une soumission)
-- ============================================================
CREATE TABLE IF NOT EXISTS submission_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  cfc_code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,

  -- Statut
  status TEXT DEFAULT 'open',
  awarded_supplier_id UUID REFERENCES suppliers(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CHAPITRES (sous-division d'un lot)
-- ============================================================
CREATE TABLE IF NOT EXISTS submission_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES submission_lots(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  code TEXT,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- POSTES (lignes unitaires à chiffrer)
-- ============================================================
CREATE TABLE IF NOT EXISTS submission_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES submission_chapters(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES submission_lots(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  code TEXT,
  description TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity DECIMAL(15,3),
  remarks TEXT,
  sort_order INTEGER DEFAULT 0,

  -- Prix estimé (pré-rempli par l'intelligence tarifaire cross-chantiers)
  estimated_unit_price DECIMAL(15,2),
  estimated_confidence DECIMAL(3,2),
  estimation_source TEXT,

  -- Résultat
  best_unit_price DECIMAL(15,2),
  best_supplier_id UUID REFERENCES suppliers(id),
  awarded_unit_price DECIMAL(15,2),
  awarded_supplier_id UUID REFERENCES suppliers(id),

  -- Normalisation pour cross-chantiers
  normalized_description TEXT,
  cfc_subcode TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DEMANDES DE PRIX (envoyées aux fournisseurs)
-- ============================================================
CREATE TABLE IF NOT EXISTS price_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- Lots concernés
  lot_ids JSONB DEFAULT '[]',

  -- Email
  email_subject TEXT,
  email_body TEXT,
  email_language TEXT DEFAULT 'fr',
  template_used TEXT,
  attachment_url TEXT,

  -- Envoi
  sent_at TIMESTAMPTZ,
  sent_via TEXT,
  outlook_message_id TEXT,

  -- Tracking
  opened_at TIMESTAMPTZ,
  status TEXT DEFAULT 'draft',

  -- Relances
  reminder_count INTEGER DEFAULT 0,
  last_reminder_at TIMESTAMPTZ,
  next_reminder_at TIMESTAMPTZ,
  reminder_enabled BOOLEAN DEFAULT true,

  -- Deadline
  deadline DATE,

  -- Portail fournisseur
  portal_token TEXT UNIQUE,
  portal_token_expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- ============================================================
-- OFFRES REÇUES (réponses des fournisseurs)
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_request_id UUID REFERENCES price_requests(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Réception
  received_at TIMESTAMPTZ DEFAULT NOW(),
  source_type TEXT DEFAULT 'manual',
  source_file_url TEXT,
  source_file_name TEXT,
  source_email_id UUID REFERENCES email_records(id),

  -- Totaux
  total_amount DECIMAL(15,2),
  currency TEXT DEFAULT 'CHF',
  vat_included BOOLEAN DEFAULT false,
  vat_rate DECIMAL(5,2) DEFAULT 8.1,

  -- Conditions
  validity_days INTEGER DEFAULT 90,
  validity_date DATE,
  payment_terms TEXT,
  delivery_included BOOLEAN,
  discount_percent DECIMAL(5,2),
  conditions_text TEXT,

  -- Négociation
  negotiation_round INTEGER DEFAULT 1,
  is_final BOOLEAN DEFAULT false,

  -- Parsing IA
  ai_parsed BOOLEAN DEFAULT false,
  ai_confidence DECIMAL(3,2),

  -- Statut
  status TEXT DEFAULT 'received',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRIX UNITAIRES PAR POSTE (cœur de l'intelligence tarifaire)
-- ============================================================
CREATE TABLE IF NOT EXISTS offer_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES supplier_offers(id) ON DELETE CASCADE,
  submission_item_id UUID REFERENCES submission_items(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Prix
  unit_price DECIMAL(15,2) NOT NULL,
  total_price DECIMAL(15,2),
  currency TEXT DEFAULT 'CHF',

  -- Matching IA
  match_confidence DECIMAL(3,2),
  supplier_description TEXT,
  supplier_quantity DECIMAL(15,3),
  supplier_unit TEXT,

  -- Normalisation cross-chantiers
  normalized_description TEXT,
  cfc_subcode TEXT,
  unit_normalized TEXT,

  -- Analyse
  vs_average_percent DECIMAL(5,2),
  vs_best_percent DECIMAL(5,2),
  is_cheapest BOOLEAN DEFAULT false,
  is_anomaly BOOLEAN DEFAULT false,
  anomaly_reason TEXT,

  -- Statut
  status TEXT DEFAULT 'proposed',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ALERTES INTELLIGENCE TARIFAIRE
-- ============================================================
CREATE TABLE IF NOT EXISTS pricing_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  submission_id UUID REFERENCES submissions(id),
  supplier_id UUID REFERENCES suppliers(id),

  -- Alerte
  alert_type TEXT NOT NULL,
  severity TEXT DEFAULT 'info',

  -- Contenu
  title TEXT NOT NULL,
  message TEXT NOT NULL,

  -- Données de comparaison
  item_description TEXT,
  cfc_code TEXT,
  current_price DECIMAL(15,2),
  reference_price DECIMAL(15,2),
  difference_percent DECIMAL(5,2),
  reference_project_name TEXT,
  reference_date DATE,
  financial_impact DECIMAL(15,2),

  -- Action suggérée
  suggested_action TEXT,
  action_url TEXT,

  -- Statut
  status TEXT DEFAULT 'active',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- HISTORIQUE NÉGOCIATION
-- ============================================================
CREATE TABLE IF NOT EXISTS negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES supplier_offers(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  round INTEGER NOT NULL,

  -- Prix
  previous_total DECIMAL(15,2),
  new_total DECIMAL(15,2),
  reduction_percent DECIMAL(5,2),

  -- Communication
  email_sent BOOLEAN DEFAULT false,
  email_subject TEXT,
  email_body TEXT,
  sent_at TIMESTAMPTZ,

  -- Réponse
  response_received BOOLEAN DEFAULT false,
  response_at TIMESTAMPTZ,
  response_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- ============================================================
-- TEMPLATES D'EMAILS
-- ============================================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  type TEXT NOT NULL,
  language TEXT DEFAULT 'fr',

  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,

  tone TEXT DEFAULT 'standard',
  is_default BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- ============================================================
-- INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_suppliers_org ON suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_specialties ON suppliers USING GIN (specialties);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);

CREATE INDEX IF NOT EXISTS idx_submissions_project ON submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_org ON submissions(organization_id);

CREATE INDEX IF NOT EXISTS idx_submission_lots_submission ON submission_lots(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_items_lot ON submission_items(lot_id);
CREATE INDEX IF NOT EXISTS idx_submission_items_chapter ON submission_items(chapter_id);
CREATE INDEX IF NOT EXISTS idx_submission_items_normalized ON submission_items(normalized_description, unit);
CREATE INDEX IF NOT EXISTS idx_submission_items_cfc ON submission_items(cfc_subcode);

CREATE INDEX IF NOT EXISTS idx_price_requests_submission ON price_requests(submission_id);
CREATE INDEX IF NOT EXISTS idx_price_requests_supplier ON price_requests(supplier_id);
CREATE INDEX IF NOT EXISTS idx_price_requests_status ON price_requests(status);
CREATE INDEX IF NOT EXISTS idx_price_requests_token ON price_requests(portal_token);

CREATE INDEX IF NOT EXISTS idx_offers_submission ON supplier_offers(submission_id);
CREATE INDEX IF NOT EXISTS idx_offers_supplier ON supplier_offers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON supplier_offers(status);

CREATE INDEX IF NOT EXISTS idx_line_items_offer ON offer_line_items(offer_id);
CREATE INDEX IF NOT EXISTS idx_line_items_item ON offer_line_items(submission_item_id);
CREATE INDEX IF NOT EXISTS idx_line_items_supplier ON offer_line_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_line_items_cfc ON offer_line_items(cfc_subcode);
CREATE INDEX IF NOT EXISTS idx_line_items_normalized ON offer_line_items(normalized_description, unit_normalized);
CREATE INDEX IF NOT EXISTS idx_line_items_project_cfc ON offer_line_items(project_id, cfc_subcode);

CREATE INDEX IF NOT EXISTS idx_pricing_alerts_org ON pricing_alerts(organization_id);
CREATE INDEX IF NOT EXISTS idx_pricing_alerts_project ON pricing_alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_pricing_alerts_status ON pricing_alerts(status);
CREATE INDEX IF NOT EXISTS idx_pricing_alerts_type ON pricing_alerts(alert_type);

CREATE INDEX IF NOT EXISTS idx_negotiations_offer ON negotiations(offer_id);

CREATE INDEX IF NOT EXISTS idx_templates_org ON email_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_templates_type ON email_templates(type, language);

-- ============================================================
-- RLS (même pattern que les autres tables)
-- ============================================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_suppliers" ON suppliers;
CREATE POLICY "org_suppliers" ON suppliers FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "org_submissions" ON submissions;
CREATE POLICY "org_submissions" ON submissions FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "org_lots" ON submission_lots;
CREATE POLICY "org_lots" ON submission_lots FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "org_chapters" ON submission_chapters;
CREATE POLICY "org_chapters" ON submission_chapters FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "org_items" ON submission_items;
CREATE POLICY "org_items" ON submission_items FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "org_requests" ON price_requests;
CREATE POLICY "org_requests" ON price_requests FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "org_offers" ON supplier_offers;
CREATE POLICY "org_offers" ON supplier_offers FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "org_lines" ON offer_line_items;
CREATE POLICY "org_lines" ON offer_line_items FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "org_alerts" ON pricing_alerts;
CREATE POLICY "org_alerts" ON pricing_alerts FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "org_nego" ON negotiations;
CREATE POLICY "org_nego" ON negotiations FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
DROP POLICY IF EXISTS "org_templates" ON email_templates;
CREATE POLICY "org_templates" ON email_templates FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
