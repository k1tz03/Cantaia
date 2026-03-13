-- ═══════════════════════════════════════════════════════════════
-- Migration 052: Submission enhancements
-- - product_name column on submission_items (AI-extracted brand/product)
-- - budget_estimate JSONB on submissions (AI price estimation)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE submission_items ADD COLUMN IF NOT EXISTS product_name TEXT;

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS budget_estimate JSONB;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS budget_estimated_at TIMESTAMPTZ;
