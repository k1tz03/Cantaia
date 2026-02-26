-- ============================================================
-- 007_briefings.sql — Daily briefings table + user preferences
-- ============================================================

-- Create daily_briefings table
CREATE TABLE IF NOT EXISTS daily_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  briefing_date DATE NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  is_sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One briefing per user per day
  UNIQUE(user_id, briefing_date)
);

COMMENT ON TABLE daily_briefings IS 'AI-generated daily briefings for each user';
COMMENT ON COLUMN daily_briefings.content IS 'JSON: greeting, priority_alerts, projects[], meetings_today[], stats, global_summary';
COMMENT ON COLUMN daily_briefings.is_sent IS 'Whether the briefing was also sent by email';

-- Indexes
CREATE INDEX idx_briefings_user_date ON daily_briefings(user_id, briefing_date DESC);
CREATE INDEX idx_briefings_date ON daily_briefings(briefing_date);

-- RLS
ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own briefings"
  ON daily_briefings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage briefings"
  ON daily_briefings FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- User preference columns for briefings
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS briefing_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS briefing_time TIME NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS briefing_email BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS briefing_projects UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN users.briefing_enabled IS 'Whether daily briefings are enabled for this user';
COMMENT ON COLUMN users.briefing_time IS 'Preferred time for the daily briefing (HH:MM)';
COMMENT ON COLUMN users.briefing_email IS 'Whether to also send the briefing by email';
COMMENT ON COLUMN users.briefing_projects IS 'Project IDs to include in briefing (empty array = all projects)';
