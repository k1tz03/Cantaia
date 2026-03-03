-- Migration 023: Price extraction jobs for batch email price extraction
-- Tracks long-running extraction jobs and deduplication

-- Job tracking table
CREATE TABLE IF NOT EXISTS price_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),

  -- Scope filters
  project_id UUID REFERENCES projects(id),
  email_filter JSONB DEFAULT '{}',

  -- Progress
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','scanning','extracting','preview_ready','importing','completed','failed','cancelled')),
  total_emails INTEGER DEFAULT 0,
  scanned_emails INTEGER DEFAULT 0,
  emails_with_prices INTEGER DEFAULT 0,
  extracted_items INTEGER DEFAULT 0,
  imported_items INTEGER DEFAULT 0,

  -- Results (JSONB for Phase 1 preview before import)
  extraction_results JSONB DEFAULT '[]',

  -- Errors
  errors JSONB DEFAULT '[]',

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_extraction_jobs_org ON price_extraction_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_price_extraction_jobs_status ON price_extraction_jobs(status);

ALTER TABLE price_extraction_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_price_extraction_jobs" ON price_extraction_jobs FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Deduplication flag on email_records
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS price_extracted BOOLEAN DEFAULT false;
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS price_extraction_job_id UUID REFERENCES price_extraction_jobs(id);
