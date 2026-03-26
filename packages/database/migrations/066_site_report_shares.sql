-- Migration 066: Site Report Shares
-- Shareable links for site reports (assistantes access without Cantaia account)

CREATE TABLE IF NOT EXISTS site_report_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sr_shares_org ON site_report_shares(organization_id);
CREATE INDEX IF NOT EXISTS idx_sr_shares_token ON site_report_shares(token);
