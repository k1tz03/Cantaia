-- ============================================================
-- Migration 074: Autonomous Agents Tables
--
-- Creates tables for:
--   1. email_drafts      — AI-generated draft replies (Email Drafter agent)
--   2. followup_items    — Detected followup opportunities (Followup Engine)
--   3. supplier_alerts   — Supplier monitoring alerts (Supplier Monitor)
--
-- Also adds helper columns to email_records and suppliers.
-- ============================================================

-- ── 1. email_drafts ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_drafts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_record_id UUID NOT NULL REFERENCES email_records(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
  subject       TEXT NOT NULL,
  draft_body    TEXT NOT NULL,
  draft_tone    TEXT NOT NULL DEFAULT 'professional',
  confidence    DECIMAL(3,2) DEFAULT 0.80,
  context_used  JSONB DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','edited','sent','dismissed')),
  reviewed_at   TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  agent_session_id UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_drafts_org         ON email_drafts (organization_id);
CREATE INDEX idx_email_drafts_user_status ON email_drafts (user_id, status);
CREATE INDEX idx_email_drafts_email       ON email_drafts (email_record_id);
CREATE INDEX idx_email_drafts_created     ON email_drafts (created_at DESC);

-- RLS
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_drafts_select ON email_drafts FOR SELECT USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);
CREATE POLICY email_drafts_insert ON email_drafts FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY email_drafts_update ON email_drafts FOR UPDATE USING (
  user_id = auth.uid()
);

-- Trigger updated_at
CREATE TRIGGER trg_email_drafts_updated
  BEFORE UPDATE ON email_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. followup_items ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS followup_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followup_type   TEXT NOT NULL
                  CHECK (followup_type IN (
                    'price_request_no_response',
                    'overdue_task',
                    'missing_document',
                    'reserve_no_deadline',
                    'submission_deadline'
                  )),
  source_type     TEXT NOT NULL,   -- 'submission','task','document','reserve'
  source_id       UUID,            -- FK to the source row
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  urgency         TEXT NOT NULL DEFAULT 'medium'
                  CHECK (urgency IN ('low','medium','high','critical')),
  suggested_action TEXT,
  draft_email_subject TEXT,
  draft_email_body    TEXT,
  recipient_email     TEXT,
  recipient_name      TEXT,
  days_overdue        INTEGER,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','sent','dismissed','snoozed')),
  snoozed_until   TIMESTAMPTZ,
  agent_session_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_followup_items_org_status   ON followup_items (organization_id, status);
CREATE INDEX idx_followup_items_user_status  ON followup_items (user_id, status);
CREATE INDEX idx_followup_items_project      ON followup_items (project_id);
CREATE INDEX idx_followup_items_supplier     ON followup_items (supplier_id);
CREATE INDEX idx_followup_items_type         ON followup_items (followup_type);
CREATE INDEX idx_followup_items_created      ON followup_items (created_at DESC);

-- Dedup: prevent duplicate pending items for same source
CREATE UNIQUE INDEX idx_followup_items_dedup
  ON followup_items (source_id, followup_type)
  WHERE status = 'pending' AND source_id IS NOT NULL;

ALTER TABLE followup_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY followup_items_select ON followup_items FOR SELECT USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);
CREATE POLICY followup_items_insert ON followup_items FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY followup_items_update ON followup_items FOR UPDATE USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);

CREATE TRIGGER trg_followup_items_updated
  BEFORE UPDATE ON followup_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 3. supplier_alerts ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  alert_type      TEXT NOT NULL
                  CHECK (alert_type IN ('critical','warning','info','opportunity')),
  category        TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  data            JSONB DEFAULT '{}'::jsonb,
  recommended_action TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','acknowledged','resolved','dismissed')),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  agent_session_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplier_alerts_org_status  ON supplier_alerts (organization_id, status);
CREATE INDEX idx_supplier_alerts_supplier    ON supplier_alerts (supplier_id, alert_type);
CREATE INDEX idx_supplier_alerts_created     ON supplier_alerts (created_at DESC);

ALTER TABLE supplier_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_alerts_select ON supplier_alerts FOR SELECT USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);
CREATE POLICY supplier_alerts_update ON supplier_alerts FOR UPDATE USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);

CREATE TRIGGER trg_supplier_alerts_updated
  BEFORE UPDATE ON supplier_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 4. Helper columns ──────────────────────────────────────

-- email_records: flag emails that need a response (set by classification pipeline)
ALTER TABLE email_records
  ADD COLUMN IF NOT EXISTS needs_response BOOLEAN DEFAULT FALSE;

ALTER TABLE email_records
  ADD COLUMN IF NOT EXISTS response_drafted_at TIMESTAMPTZ;

-- suppliers: track last monitoring run
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS last_monitored_at TIMESTAMPTZ;

-- ── 5. Notifications table (aggregated) ────────────────────

CREATE TABLE IF NOT EXISTS agent_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_type      TEXT NOT NULL,           -- 'email-drafter','followup-engine','supplier-monitor','system'
  title           TEXT NOT NULL,
  description     TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb, -- counts, links, etc.
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_notifications_user  ON agent_notifications (user_id, read_at, created_at DESC);
CREATE INDEX idx_agent_notifications_org   ON agent_notifications (organization_id, created_at DESC);

ALTER TABLE agent_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_notifications_select ON agent_notifications FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY agent_notifications_update ON agent_notifications FOR UPDATE USING (
  user_id = auth.uid()
);
