-- ============================================================
-- Migration 075: Calendar Hub IA + Agent Project Memory + Agent Meeting Prep
--
-- Creates tables for:
--   1. calendar_events          — Calendar events (sync Outlook, Cantaia, agents)
--   2. calendar_invitations     — Event attendees/invitations
--   3. external_calendars       — Imported calendars from non-Cantaia members
--   4. calendar_sync_state      — Microsoft Graph delta sync state
--   5. project_memory           — AI-aggregated project intelligence (Agent)
--   6. meeting_preparations     — Auto-generated meeting prep (Agent)
-- ============================================================

-- ── 1. calendar_events ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS calendar_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id        UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Core fields
  title             TEXT NOT NULL,
  description       TEXT,
  location          TEXT,
  event_type        TEXT NOT NULL DEFAULT 'meeting'
                    CHECK (event_type IN ('meeting','site_visit','call','deadline','construction','milestone','other')),

  -- Timing
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ NOT NULL,
  all_day           BOOLEAN DEFAULT FALSE,
  timezone          TEXT DEFAULT 'Europe/Zurich',

  -- Recurrence (RFC 5545 RRULE)
  recurrence_rule   TEXT,
  recurrence_end    TIMESTAMPTZ,
  parent_event_id   UUID REFERENCES calendar_events(id) ON DELETE CASCADE,

  -- Microsoft Graph sync
  outlook_event_id  TEXT,
  outlook_change_key TEXT,
  sync_source       TEXT DEFAULT 'cantaia'
                    CHECK (sync_source IN ('cantaia','outlook','external','agent')),
  last_synced_at    TIMESTAMPTZ,

  -- Visual
  color             TEXT,

  -- AI metadata
  ai_suggested      BOOLEAN DEFAULT FALSE,
  ai_prep_status    TEXT DEFAULT 'none'
                    CHECK (ai_prep_status IN ('none','pending','ready','delivered')),
  ai_prep_data      JSONB,

  -- Status
  status            TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('tentative','confirmed','cancelled')),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cal_events_user_date    ON calendar_events (user_id, start_at, end_at);
CREATE INDEX idx_cal_events_org_date     ON calendar_events (organization_id, start_at);
CREATE INDEX idx_cal_events_project      ON calendar_events (project_id);
CREATE INDEX idx_cal_events_outlook      ON calendar_events (outlook_event_id) WHERE outlook_event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_cal_events_outlook_uniq ON calendar_events (user_id, outlook_event_id) WHERE outlook_event_id IS NOT NULL;
CREATE INDEX idx_cal_events_prep         ON calendar_events (ai_prep_status, start_at) WHERE ai_prep_status != 'none';

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY cal_events_select ON calendar_events FOR SELECT USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);
CREATE POLICY cal_events_insert ON calendar_events FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY cal_events_update ON calendar_events FOR UPDATE USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);
CREATE POLICY cal_events_delete ON calendar_events FOR DELETE USING (
  user_id = auth.uid()
);

CREATE TRIGGER trg_cal_events_updated
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 2. calendar_invitations ────────────────────────────────

CREATE TABLE IF NOT EXISTS calendar_invitations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  attendee_email    TEXT NOT NULL,
  attendee_name     TEXT,
  attendee_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  response_status   TEXT NOT NULL DEFAULT 'pending'
                    CHECK (response_status IN ('pending','accepted','declined','tentative')),
  is_organizer      BOOLEAN DEFAULT FALSE,
  notified_at       TIMESTAMPTZ,
  responded_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cal_invitations_event ON calendar_invitations (event_id);
CREATE INDEX idx_cal_invitations_user  ON calendar_invitations (attendee_user_id) WHERE attendee_user_id IS NOT NULL;
CREATE INDEX idx_cal_invitations_email ON calendar_invitations (attendee_email);

ALTER TABLE calendar_invitations ENABLE ROW LEVEL SECURITY;

-- Users can see invitations for events in their org
CREATE POLICY cal_invitations_select ON calendar_invitations FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM calendar_events ce
    WHERE ce.id = calendar_invitations.event_id
    AND ce.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  )
);
CREATE POLICY cal_invitations_insert ON calendar_invitations FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM calendar_events ce
    WHERE ce.id = calendar_invitations.event_id
    AND ce.user_id = auth.uid()
  )
);
CREATE POLICY cal_invitations_update ON calendar_invitations FOR UPDATE USING (
  attendee_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM calendar_events ce
    WHERE ce.id = calendar_invitations.event_id
    AND ce.user_id = auth.uid()
  )
);


-- ── 3. external_calendars ──────────────────────────────────

CREATE TABLE IF NOT EXISTS external_calendars (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  added_by          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  member_email      TEXT NOT NULL,
  member_name       TEXT,
  source            TEXT NOT NULL DEFAULT 'microsoft'
                    CHECK (source IN ('microsoft','ics','manual')),

  -- Microsoft Graph specific
  graph_user_id     TEXT,

  -- ICS specific
  ics_url           TEXT,

  -- Settings
  color             TEXT DEFAULT '#71717A',
  is_active         BOOLEAN DEFAULT TRUE,
  last_synced_at    TIMESTAMPTZ,
  sync_error        TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ext_cal_uniq ON external_calendars (organization_id, member_email, added_by);
CREATE INDEX idx_ext_cal_org ON external_calendars (organization_id);

ALTER TABLE external_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY ext_cal_select ON external_calendars FOR SELECT USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);
CREATE POLICY ext_cal_insert ON external_calendars FOR INSERT WITH CHECK (
  added_by = auth.uid()
);
CREATE POLICY ext_cal_update ON external_calendars FOR UPDATE USING (
  added_by = auth.uid()
);
CREATE POLICY ext_cal_delete ON external_calendars FOR DELETE USING (
  added_by = auth.uid()
);

CREATE TRIGGER trg_ext_cal_updated
  BEFORE UPDATE ON external_calendars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 4. calendar_sync_state ─────────────────────────────────

CREATE TABLE IF NOT EXISTS calendar_sync_state (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta_link        TEXT,
  last_sync_at      TIMESTAMPTZ,
  sync_status       TEXT DEFAULT 'idle'
                    CHECK (sync_status IN ('idle','syncing','error')),
  error_message     TEXT,
  events_imported   INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_cal_sync_user ON calendar_sync_state (user_id);

ALTER TABLE calendar_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY cal_sync_select ON calendar_sync_state FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY cal_sync_upsert ON calendar_sync_state FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY cal_sync_update ON calendar_sync_state FOR UPDATE USING (
  user_id = auth.uid()
);

CREATE TRIGGER trg_cal_sync_updated
  BEFORE UPDATE ON calendar_sync_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 5. project_memory ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_memory (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- AI-aggregated intelligence
  summary           TEXT,
  key_facts         JSONB DEFAULT '[]'::jsonb,
  active_risks      JSONB DEFAULT '[]'::jsonb,
  pending_decisions JSONB DEFAULT '[]'::jsonb,
  open_items        JSONB DEFAULT '[]'::jsonb,
  supplier_status   JSONB DEFAULT '{}'::jsonb,
  timeline_events   JSONB DEFAULT '[]'::jsonb,

  -- Cross-module scan timestamps
  last_emails_scan      TIMESTAMPTZ,
  last_tasks_scan       TIMESTAMPTZ,
  last_submissions_scan TIMESTAMPTZ,
  last_meetings_scan    TIMESTAMPTZ,
  last_plans_scan       TIMESTAMPTZ,
  last_reports_scan     TIMESTAMPTZ,

  -- Metadata
  version           INTEGER DEFAULT 1,
  agent_session_id  UUID,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_project_memory_project ON project_memory (project_id);
CREATE INDEX idx_project_memory_org ON project_memory (organization_id);
CREATE INDEX idx_project_memory_expires ON project_memory (expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE project_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY pm_select ON project_memory FOR SELECT USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);
CREATE POLICY pm_insert ON project_memory FOR INSERT WITH CHECK (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);
CREATE POLICY pm_update ON project_memory FOR UPDATE USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);

CREATE TRIGGER trg_project_memory_updated
  BEFORE UPDATE ON project_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── 6. meeting_preparations ────────────────────────────────

CREATE TABLE IF NOT EXISTS meeting_preparations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id          UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  project_id        UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Generated content
  project_summary       TEXT,
  unread_emails         JSONB DEFAULT '[]'::jsonb,
  overdue_tasks         JSONB DEFAULT '[]'::jsonb,
  open_reserves         JSONB DEFAULT '[]'::jsonb,
  pending_submissions   JSONB DEFAULT '[]'::jsonb,
  key_points            JSONB DEFAULT '[]'::jsonb,
  suggested_agenda      JSONB DEFAULT '[]'::jsonb,
  attendee_context      JSONB DEFAULT '[]'::jsonb,

  -- Status
  status            TEXT NOT NULL DEFAULT 'generating'
                    CHECK (status IN ('generating','ready','delivered','viewed')),
  delivered_at      TIMESTAMPTZ,
  viewed_at         TIMESTAMPTZ,

  -- Agent metadata
  agent_session_id  UUID,
  tokens_used       INTEGER DEFAULT 0,
  generation_time_ms INTEGER,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_meeting_prep_event ON meeting_preparations (event_id, user_id);
CREATE INDEX idx_meeting_prep_user_status ON meeting_preparations (user_id, status);
CREATE INDEX idx_meeting_prep_status ON meeting_preparations (status) WHERE status = 'generating';

ALTER TABLE meeting_preparations ENABLE ROW LEVEL SECURITY;

CREATE POLICY mp_select ON meeting_preparations FOR SELECT USING (
  organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
);
CREATE POLICY mp_insert ON meeting_preparations FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY mp_update ON meeting_preparations FOR UPDATE USING (
  user_id = auth.uid()
);

CREATE TRIGGER trg_meeting_prep_updated
  BEFORE UPDATE ON meeting_preparations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
