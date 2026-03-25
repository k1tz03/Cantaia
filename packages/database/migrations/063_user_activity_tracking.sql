-- ============================================================
-- Migration 063: User Activity Tracking
-- ============================================================
-- Extends usage_events with session/page/feature columns,
-- adds pre-aggregated daily stats table for analytics.

-- Add columns to existing usage_events table
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS page TEXT;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS feature TEXT;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS referrer_page TEXT;

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_usage_events_session ON usage_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_feature ON usage_events(feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_org_created ON usage_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_feature_user ON usage_events(feature, user_id, created_at DESC);

-- RLS policy for authenticated insert
DO $$ BEGIN
  CREATE POLICY "Users can insert own events" ON usage_events FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Pre-aggregated daily stats
CREATE TABLE IF NOT EXISTS user_activity_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stat_date DATE NOT NULL,
    organization_id UUID,
    user_id UUID,
    feature TEXT NOT NULL,
    page_views INTEGER DEFAULT 0,
    feature_uses INTEGER DEFAULT 0,
    total_duration_ms BIGINT DEFAULT 0,
    unique_pages INTEGER DEFAULT 0,
    session_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(stat_date, user_id, feature)
);
CREATE INDEX IF NOT EXISTS idx_uad_date ON user_activity_daily(stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_uad_org_date ON user_activity_daily(organization_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_uad_feature ON user_activity_daily(feature, stat_date DESC);
ALTER TABLE user_activity_daily ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role manages daily" ON user_activity_daily FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
