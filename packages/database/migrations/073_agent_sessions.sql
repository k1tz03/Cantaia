-- ============================================================
-- Migration 073: Agent Sessions (Managed Agents infrastructure)
-- Tracks all Managed Agent sessions: creation, status, cost, results
-- ============================================================

-- Table: agent_sessions
-- Stores every MA session with its lifecycle, cost, and result
CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Agent configuration
  agent_type TEXT NOT NULL,                    -- submission-analyzer, plan-estimator, email-classifier, price-extractor, briefing-generator
  agent_id TEXT,                               -- Anthropic agent_id (created via API)
  environment_id TEXT,                         -- Anthropic environment_id
  session_id TEXT,                             -- Anthropic session_id (unique per run)

  -- Context
  title TEXT,                                  -- Human-readable session title
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,  -- What was sent to the agent (submission_id, plan_id, etc.)

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'tool_pending', 'idle', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,                         -- Total wall-clock duration

  -- Result
  result_payload JSONB,                        -- Structured result from the agent
  error_message TEXT,                          -- Error if failed

  -- Cost tracking
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  estimated_cost_chf DECIMAL(10, 4) DEFAULT 0,
  session_hours DECIMAL(10, 6) DEFAULT 0,      -- Billed at $0.08/session-hour
  tool_calls_count INTEGER DEFAULT 0,
  custom_tool_calls_count INTEGER DEFAULT 0,

  -- Event log (denormalized for quick access)
  events_count INTEGER DEFAULT 0,
  last_event_type TEXT,
  last_event_at TIMESTAMPTZ,

  -- Metadata
  model TEXT,                                  -- claude-sonnet-4-6, etc.
  tools_used TEXT[] DEFAULT '{}',              -- List of tool names actually used

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agent_sessions_org ON agent_sessions (organization_id);
CREATE INDEX idx_agent_sessions_user ON agent_sessions (user_id);
CREATE INDEX idx_agent_sessions_type ON agent_sessions (agent_type);
CREATE INDEX idx_agent_sessions_status ON agent_sessions (status);
CREATE INDEX idx_agent_sessions_session_id ON agent_sessions (session_id);
CREATE INDEX idx_agent_sessions_created ON agent_sessions (created_at DESC);

-- Composite index for dashboard queries (org + type + date range)
CREATE INDEX idx_agent_sessions_org_type_created ON agent_sessions (organization_id, agent_type, created_at DESC);

-- RLS
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

-- Users can see their own org's sessions
CREATE POLICY agent_sessions_select ON agent_sessions
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );

-- Users can insert sessions for their own org
CREATE POLICY agent_sessions_insert ON agent_sessions
  FOR INSERT WITH CHECK (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

-- Users can update their own sessions
CREATE POLICY agent_sessions_update ON agent_sessions
  FOR UPDATE USING (
    user_id = auth.uid()
  );

-- Superadmin full access
CREATE POLICY agent_sessions_superadmin ON agent_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_superadmin = true)
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_agent_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_sessions_updated
  BEFORE UPDATE ON agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_sessions_updated_at();

-- ============================================================
-- Table: agent_configs
-- Stores reusable agent + environment IDs (created once, reused)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL UNIQUE,             -- submission-analyzer, etc.
  agent_id TEXT NOT NULL,                      -- Anthropic agent_id
  environment_id TEXT NOT NULL,                -- Anthropic environment_id
  config JSONB NOT NULL DEFAULT '{}'::jsonb,   -- Full agent config (tools, system prompt hash, etc.)
  version INTEGER NOT NULL DEFAULT 1,          -- Bumped on config changes
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: only superadmin can manage agent configs
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_configs_read ON agent_configs
  FOR SELECT USING (true);  -- All authenticated users can read configs

CREATE POLICY agent_configs_insert ON agent_configs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_superadmin = true)
  );

CREATE POLICY agent_configs_update ON agent_configs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_superadmin = true)
  );

CREATE POLICY agent_configs_delete ON agent_configs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_superadmin = true)
  );
