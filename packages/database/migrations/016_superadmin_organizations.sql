-- ============================================================
-- Migration 016: Super-admin & Organizations Enhanced
-- ============================================================
-- Adds: is_super_admin on users, enhanced organization columns,
-- organization_invites table, indexes, RLS policies
-- ============================================================

-- 1. Super-admin flag on users (already exists as is_superadmin, keep consistent)
-- is_superadmin already exists from initial schema — no change needed

-- 2. Enhanced organization columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subdomain TEXT UNIQUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
-- status: 'setup', 'trial', 'active', 'suspended'

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'trial';
-- plan: 'trial', 'starter', 'pro', 'enterprise'
-- Note: subscription_plan already exists, 'plan' is the simplified operational field

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS display_name TEXT;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}';
-- {
--   "logo_url": "https://...",
--   "favicon_url": "https://...",
--   "login_bg_url": "https://...",
--   "login_message": "Bienvenue sur l'espace projet HRS",
--   "color_primary": "#1E40AF",
--   "color_secondary": "#3B82F6",
--   "color_sidebar_bg": "#0F172A",
--   "color_sidebar_text": "#F8FAFC",
--   "theme": "light"
-- }

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_organizations_subdomain ON organizations(subdomain);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_plan ON organizations(plan);

-- 4. Subdomain constraints
ALTER TABLE organizations ADD CONSTRAINT organizations_subdomain_format
  CHECK (subdomain IS NULL OR (subdomain ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'));

-- 5. Organization invites table
CREATE TABLE IF NOT EXISTS organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT DEFAULT 'member', -- 'admin', 'member'
  job_title TEXT,

  token TEXT UNIQUE NOT NULL,
  message TEXT,

  invited_by UUID REFERENCES users(id),

  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'expired', 'cancelled'
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invites_org ON organization_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_invites_token ON organization_invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_email ON organization_invites(email);
CREATE INDEX IF NOT EXISTS idx_invites_status ON organization_invites(status);

-- 6. RLS
ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_invites_select" ON organization_invites FOR SELECT USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  OR (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
);

CREATE POLICY "org_invites_insert" ON organization_invites FOR INSERT WITH CHECK (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  OR (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
);

CREATE POLICY "org_invites_update" ON organization_invites FOR UPDATE USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  OR (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
);

CREATE POLICY "org_invites_delete" ON organization_invites FOR DELETE USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  OR (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
);
