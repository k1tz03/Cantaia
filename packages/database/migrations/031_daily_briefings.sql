-- Migration 031: Daily briefings (C1 — Private)
-- Stores generated daily briefings per user

CREATE TABLE IF NOT EXISTS daily_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  mode TEXT DEFAULT 'ai' CHECK (mode IN ('ai', 'fallback')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_briefings_org ON daily_briefings(organization_id);
CREATE INDEX IF NOT EXISTS idx_daily_briefings_user_date ON daily_briefings(user_id, date DESC);

ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_daily_briefings" ON daily_briefings FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
