-- ============================================================
-- 009_admin_system.sql — Superadmin system, activity logs, daily metrics
-- ============================================================

-- Add superadmin flag to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT false;

COMMENT ON COLUMN users.is_superadmin IS 'Whether this user has superadmin access to the CANTAIA admin dashboard';

-- ============================================================
-- Admin activity logs — tracks all user actions across the platform
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE admin_activity_logs IS 'Global activity log for superadmin dashboard — tracks all user actions';
COMMENT ON COLUMN admin_activity_logs.action IS 'Action type: login, sync_emails, classify_email, generate_reply, generate_pv, transcribe_audio, export_pv, send_pv, finalize_pv, create_task, complete_task, update_task, create_project, update_project, archive_project, generate_briefing, view_briefing, admin_login, change_plan, suspend_org';

CREATE INDEX idx_admin_logs_date ON admin_activity_logs(created_at);
CREATE INDEX idx_admin_logs_user ON admin_activity_logs(user_id, created_at);
CREATE INDEX idx_admin_logs_action ON admin_activity_logs(action, created_at);
CREATE INDEX idx_admin_logs_org ON admin_activity_logs(organization_id, created_at);

-- RLS: only service role (admin API routes) can read/write
ALTER TABLE admin_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage activity logs"
  ON admin_activity_logs FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Admin daily metrics — pre-computed daily stats for performance
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL,

  -- Users
  total_users INTEGER DEFAULT 0,
  active_users_today INTEGER DEFAULT 0,
  new_users_today INTEGER DEFAULT 0,

  -- Organizations
  total_organizations INTEGER DEFAULT 0,
  active_organizations_today INTEGER DEFAULT 0,

  -- Usage
  emails_synced INTEGER DEFAULT 0,
  emails_classified INTEGER DEFAULT 0,
  replies_generated INTEGER DEFAULT 0,
  tasks_created INTEGER DEFAULT 0,
  pv_generated INTEGER DEFAULT 0,
  pv_transcribed INTEGER DEFAULT 0,
  briefings_generated INTEGER DEFAULT 0,

  -- Costs
  total_api_cost_chf DECIMAL(10,4) DEFAULT 0,
  anthropic_cost_chf DECIMAL(10,4) DEFAULT 0,
  openai_cost_chf DECIMAL(10,4) DEFAULT 0,

  -- Revenue (future, when Stripe is integrated)
  total_revenue_chf DECIMAL(10,4) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(metric_date)
);

COMMENT ON TABLE admin_daily_metrics IS 'Pre-computed daily metrics for the superadmin dashboard';

CREATE INDEX idx_daily_metrics_date ON admin_daily_metrics(metric_date);

-- RLS: only service role
ALTER TABLE admin_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage daily metrics"
  ON admin_daily_metrics FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- Admin config — configurable settings for the admin dashboard
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE admin_config IS 'Key-value configuration store for admin dashboard settings';

ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage admin config"
  ON admin_config FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert default config values
INSERT INTO admin_config (key, value) VALUES
  ('api_pricing', '{"anthropic_input_per_1k_usd": 0.003, "anthropic_output_per_1k_usd": 0.015, "whisper_per_minute_usd": 0.006, "usd_to_chf": 0.89}'),
  ('plan_pricing', '{"trial_days": 14, "starter_chf": 149, "pro_chf": 349, "enterprise_chf": 990}'),
  ('alert_thresholds', '{"low_margin_percent": 80, "inactivity_days": 7, "trial_expiry_days": 3, "cost_spike_percent": 200}')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Mark superadmin (run manually after account creation)
-- ============================================================
-- UPDATE users SET is_superadmin = true WHERE email = 'julien.ray@menetrey-sa.ch';
