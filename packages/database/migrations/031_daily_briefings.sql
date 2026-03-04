-- Migration 031: Daily briefings — Add C1 columns for data intelligence
-- Table already exists from 001_initial_schema.sql, so we ALTER it

-- Add missing columns
ALTER TABLE daily_briefings
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'ai' CHECK (mode IN ('ai', 'fallback')),
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Backfill organization_id from user's org
UPDATE daily_briefings db
SET organization_id = u.organization_id
FROM users u
WHERE db.user_id = u.id
  AND db.organization_id IS NULL;

-- Now make it NOT NULL (after backfill)
ALTER TABLE daily_briefings
  ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_daily_briefings_org ON daily_briefings(organization_id);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_user_date ON daily_briefings(user_id, briefing_date DESC);

ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;

-- Drop policy if it exists (idempotent)
DROP POLICY IF EXISTS "org_daily_briefings" ON daily_briefings;
CREATE POLICY "org_daily_briefings" ON daily_briefings FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
