-- ============================================================
-- Migration 088: Stripe webhook idempotence
-- ============================================================
-- Registry of processed Stripe webhook events. The webhook route inserts
-- event.id before processing; a conflict means the event was already
-- handled (Stripe retries deliveries) and the handler returns 200 early.

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  received_at TIMESTAMPTZ DEFAULT now()
);

-- RLS enabled with NO policies: only the service role (webhook route,
-- which bypasses RLS) reads/writes this table.
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
