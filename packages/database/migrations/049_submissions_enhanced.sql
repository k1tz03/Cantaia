-- ═══════════════════════════════════════════════════════════════
-- Migration 049: Submissions module (full from scratch)
-- Tables: submissions, submission_items, submission_price_requests, submission_quotes
-- ═══════════════════════════════════════════════════════════════

-- Table submissions
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES auth.users(id),
  file_url TEXT,
  file_name TEXT,
  file_type TEXT, -- 'pdf' or 'excel'
  analysis_status TEXT DEFAULT 'pending'
    CHECK (analysis_status IN ('pending', 'analyzing', 'done', 'error')),
  analysis_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table submission_items
CREATE TABLE IF NOT EXISTS submission_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  item_number TEXT,
  description TEXT,
  unit TEXT,
  quantity NUMERIC,
  cfc_code TEXT,
  material_group TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'quoted', 'awarded')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table submission_price_requests
CREATE TABLE IF NOT EXISTS submission_price_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  supplier_id UUID REFERENCES suppliers(id),
  tracking_code TEXT UNIQUE NOT NULL,
  material_group TEXT,
  items_requested JSONB DEFAULT '[]',
  attachments JSONB DEFAULT '[]',
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'sent'
    CHECK (status IN ('sent', 'responded', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table submission_quotes
CREATE TABLE IF NOT EXISTS submission_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES submission_price_requests(id),
  submission_id UUID REFERENCES submissions(id),
  item_id UUID REFERENCES submission_items(id),
  unit_price_ht NUMERIC,
  total_ht NUMERIC,
  currency TEXT DEFAULT 'CHF',
  raw_email_id UUID REFERENCES email_records(id),
  confidence NUMERIC,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ Indexes ═══
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_code
  ON submission_price_requests(tracking_code);
CREATE INDEX IF NOT EXISTS idx_submission_items_submission
  ON submission_items(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_items_cfc
  ON submission_items(cfc_code);
CREATE INDEX IF NOT EXISTS idx_submission_quotes_item
  ON submission_quotes(item_id);
CREATE INDEX IF NOT EXISTS idx_submission_quotes_date
  ON submission_quotes(extracted_at);
CREATE INDEX IF NOT EXISTS idx_submissions_project
  ON submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_submissions_org
  ON submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_submission_price_requests_submission
  ON submission_price_requests(submission_id);

-- ═══ RLS ═══
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_price_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_quotes ENABLE ROW LEVEL SECURITY;

-- Organization isolation policies
CREATE POLICY "org_isolation_submissions" ON submissions
  USING (organization_id = (
    SELECT organization_id FROM users WHERE id = auth.uid()
  ));

CREATE POLICY "org_isolation_submission_items" ON submission_items
  USING (submission_id IN (
    SELECT id FROM submissions WHERE organization_id = (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "org_isolation_submission_price_requests" ON submission_price_requests
  USING (submission_id IN (
    SELECT id FROM submissions WHERE organization_id = (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "org_isolation_submission_quotes" ON submission_quotes
  USING (submission_id IN (
    SELECT id FROM submissions WHERE organization_id = (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  ));

-- Service role bypass for API routes
CREATE POLICY "service_role_submissions" ON submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_submission_items" ON submission_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_submission_price_requests" ON submission_price_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_submission_quotes" ON submission_quotes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
