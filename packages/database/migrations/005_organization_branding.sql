-- 005_organization_branding.sql
-- Ajout du white-labeling / branding par organisation

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_dark_url TEXT DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#1E3A5F';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) DEFAULT '#3B82F6';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sidebar_color VARCHAR(7) DEFAULT '#F8FAFC';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS accent_color VARCHAR(7) DEFAULT '#F59E0B';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS custom_name TEXT DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS favicon_url TEXT DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS branding_enabled BOOLEAN DEFAULT FALSE;

-- Seul les plans Pro et Enterprise ont accès au branding
COMMENT ON COLUMN organizations.branding_enabled IS 'Active le white-labeling. Nécessite plan Pro ou Enterprise.';
COMMENT ON COLUMN organizations.primary_color IS 'Couleur principale (boutons, sidebar active). Défaut: #1E3A5F';
COMMENT ON COLUMN organizations.secondary_color IS 'Couleur secondaire (liens, accents). Défaut: #3B82F6';
COMMENT ON COLUMN organizations.sidebar_color IS 'Couleur de fond du sidebar. Défaut: #F8FAFC (slate-50)';
COMMENT ON COLUMN organizations.accent_color IS 'Couleur d''accentuation (badges, alertes). Défaut: #F59E0B';

-- Storage bucket pour les assets des organisations (logos, favicons)
-- À exécuter manuellement dans Supabase Dashboard > Storage :
-- CREATE BUCKET organization-assets (public: false, file size limit: 2MB, allowed MIME types: image/png, image/jpeg, image/svg+xml, image/x-icon)
