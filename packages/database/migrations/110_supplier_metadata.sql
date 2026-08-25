-- ============================================================
-- Migration 110 — Supplier enrichment metadata
-- ============================================================
-- The AI enrichment route (POST /api/suppliers/[id]/enrich) merges a
-- `last_enrichment` record (date, model, confidence, fields enriched) into a
-- JSONB `metadata` column on suppliers. The column never existed, so every
-- enrichment write failed silently (supabase-js does not throw) and the
-- confidence/history was lost. Add it idempotently.
-- ============================================================

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
