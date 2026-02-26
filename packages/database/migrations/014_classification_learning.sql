-- ============================================================
-- Migration 014: Email Classification Learning Rules
-- Stores learned rules from user confirmations/corrections
-- to classify emails without calling Claude when possible.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_classification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Rule definition
  rule_type TEXT NOT NULL, -- 'sender_domain', 'sender_email', 'subject_keyword', 'contact_match'
  rule_value TEXT NOT NULL, -- "bg-ingenieurs.ch", "pierre.favre@bg-ing.ch", "coffrage", etc.

  -- Action
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  classification TEXT, -- 'project', 'personal', 'spam', 'newsletter'

  -- Stats
  times_confirmed INTEGER DEFAULT 1,
  times_overridden INTEGER DEFAULT 0,
  confidence_boost DECIMAL(3,2) DEFAULT 0.10,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rules_org ON email_classification_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_rules_type_value ON email_classification_rules(rule_type, rule_value);
CREATE INDEX IF NOT EXISTS idx_rules_active ON email_classification_rules(organization_id, is_active) WHERE is_active = true;

ALTER TABLE email_classification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_rules" ON email_classification_rules FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
