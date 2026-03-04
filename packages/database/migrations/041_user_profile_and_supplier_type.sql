-- Migration 041: User profile fields + Supplier type
-- Required for: Settings personal info, Supplier material/service distinction

-- User profile additional fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS age_range TEXT CHECK (age_range IN ('18-25','26-35','36-45','46-55','56+')),
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('homme','femme','autre','non_specifie'));

-- Supplier type distinction (fournisseur = materials, prestataire = services)
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS supplier_type TEXT NOT NULL DEFAULT 'fournisseur'
  CHECK (supplier_type IN ('fournisseur', 'prestataire'));

-- Index for supplier type filtering
CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(supplier_type);
