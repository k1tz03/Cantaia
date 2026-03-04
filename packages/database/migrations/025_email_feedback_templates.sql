-- Migration 025: Email classification feedback + response templates (C1 — Private)

-- Corrections on email classification for private learning
CREATE TABLE IF NOT EXISTS email_classification_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES email_records(id) ON DELETE CASCADE,
  original_project_id UUID REFERENCES projects(id),
  corrected_project_id UUID REFERENCES projects(id),
  original_classification TEXT,
  corrected_classification TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_class_feedback_org ON email_classification_feedback(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_class_feedback_email ON email_classification_feedback(email_id);

ALTER TABLE email_classification_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_email_class_feedback" ON email_classification_feedback FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Validated response templates per tenant
CREATE TABLE IF NOT EXISTS email_response_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_type TEXT,
  tone TEXT DEFAULT 'professional' CHECK (tone IN ('professional', 'formal', 'friendly', 'technical')),
  template_name TEXT NOT NULL,
  template_text TEXT NOT NULL,
  language TEXT DEFAULT 'fr' CHECK (language IN ('fr', 'en', 'de')),
  usage_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_response_templates_org ON email_response_templates(organization_id);

ALTER TABLE email_response_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_email_response_templates" ON email_response_templates FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
