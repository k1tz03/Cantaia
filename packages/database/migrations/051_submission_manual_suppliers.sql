-- ═══════════════════════════════════════════════════════════════
-- Migration 051: Support manual (non-saved) suppliers in price requests
-- Adds supplier_name_manual and supplier_email_manual columns
-- Makes supplier_id nullable for manual suppliers
-- ═══════════════════════════════════════════════════════════════

-- Allow NULL supplier_id for manual suppliers
ALTER TABLE submission_price_requests
  ALTER COLUMN supplier_id DROP NOT NULL;

-- Add manual supplier fields
ALTER TABLE submission_price_requests
  ADD COLUMN IF NOT EXISTS supplier_name_manual TEXT,
  ADD COLUMN IF NOT EXISTS supplier_email_manual TEXT;
