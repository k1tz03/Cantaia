-- 017: Client Visits — Voice recording, AI report, automatic quote task
-- Step 21.1

CREATE TABLE IF NOT EXISTS client_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),

  -- Client / Prospect
  client_name TEXT NOT NULL,
  client_company TEXT,
  client_email TEXT,
  client_phone TEXT,
  client_address TEXT,
  client_city TEXT,
  client_postal_code TEXT,
  is_prospect BOOLEAN DEFAULT true,

  -- Visit
  title TEXT,
  visit_date DATE DEFAULT CURRENT_DATE,
  visit_time TIME,
  duration_minutes INTEGER,

  -- Audio recording
  audio_url TEXT,
  audio_duration_seconds INTEGER,
  audio_file_name TEXT,
  audio_file_size INTEGER,

  -- Transcription
  transcription TEXT,
  transcription_status TEXT DEFAULT 'pending',
  transcription_provider TEXT,
  transcription_language TEXT DEFAULT 'fr',

  -- AI Report
  report_status TEXT DEFAULT 'pending',
  report_generated_at TIMESTAMPTZ,
  report JSONB DEFAULT '{}',

  -- Generated tasks
  quote_task_id UUID REFERENCES tasks(id),
  followup_task_id UUID REFERENCES tasks(id),

  -- Global status
  status TEXT DEFAULT 'recording',

  -- Export
  report_pdf_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_visits_org ON client_visits(organization_id);
CREATE INDEX IF NOT EXISTS idx_visits_project ON client_visits(project_id);
CREATE INDEX IF NOT EXISTS idx_visits_status ON client_visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_date ON client_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_visits_client ON client_visits(client_name);

ALTER TABLE client_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_visits" ON client_visits
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );
