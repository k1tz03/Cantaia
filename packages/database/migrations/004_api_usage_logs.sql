-- ============================================================
-- Migration 004: API Usage Logs — Cost tracking per user
-- ============================================================

CREATE TABLE api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,        -- 'email_classify', 'email_summary', 'email_reply', 'task_extract', 'pv_transcribe', 'pv_generate', 'reclassify'
    api_provider TEXT NOT NULL,       -- 'anthropic', 'openai_whisper', 'microsoft_graph'
    model TEXT,                       -- 'claude-sonnet-4-20250514', 'whisper-1'
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    audio_seconds INTEGER DEFAULT 0,  -- for Whisper
    estimated_cost_chf DECIMAL(10,6) NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',      -- email_id, meeting_id, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_usage_user ON api_usage_logs(user_id, created_at);
CREATE INDEX idx_api_usage_org ON api_usage_logs(organization_id, created_at);
CREATE INDEX idx_api_usage_action ON api_usage_logs(action_type, created_at);

-- RLS
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and superadmin can read api_usage_logs"
    ON api_usage_logs FOR SELECT
    USING (
        auth.uid() IN (
            SELECT id FROM users WHERE role IN ('admin', 'superadmin')
        )
    );

-- Service role (used by API routes) can insert without restriction
CREATE POLICY "Service role can insert api_usage_logs"
    ON api_usage_logs FOR INSERT
    WITH CHECK (true);
