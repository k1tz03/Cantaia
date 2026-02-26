-- ============================================================
-- CANTAIA — Initial Database Schema
-- ============================================================
-- Supabase (PostgreSQL) — Supports Phase 1, 2 & 3

------------------------------------------------------------
-- EXTENSIONS
------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Fuzzy text search

------------------------------------------------------------
-- ENUM TYPES
------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('project_manager', 'site_manager', 'foreman', 'admin', 'superadmin');
CREATE TYPE subscription_plan AS ENUM ('trial', 'starter', 'pro', 'enterprise');
CREATE TYPE project_status AS ENUM ('planning', 'active', 'paused', 'completed', 'archived');
CREATE TYPE task_status AS ENUM ('open', 'in_progress', 'waiting', 'completed', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE task_source AS ENUM ('email', 'meeting_pv', 'manual', 'ai_suggestion');
CREATE TYPE meeting_status AS ENUM ('scheduled', 'recording', 'transcribing', 'generating_pv', 'review', 'finalized', 'sent');
CREATE TYPE email_classification AS ENUM ('action_required', 'info_only', 'urgent', 'waiting_response', 'archived');
CREATE TYPE log_level AS ENUM ('info', 'warning', 'error', 'critical');

------------------------------------------------------------
-- TABLES — CORE (Phase 1+2+3)
------------------------------------------------------------

-- Organizations (client companies)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    address TEXT,
    city TEXT DEFAULT 'Lausanne',
    country TEXT DEFAULT 'CH',
    industry TEXT DEFAULT 'construction',
    subscription_plan subscription_plan DEFAULT 'trial',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    max_users INTEGER DEFAULT 3,
    max_projects INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),
    email TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role user_role DEFAULT 'project_manager',
    avatar_url TEXT,
    phone TEXT,
    preferred_language TEXT DEFAULT 'fr' CHECK (preferred_language IN ('fr', 'en', 'de')),
    microsoft_access_token TEXT,
    microsoft_refresh_token TEXT,
    microsoft_token_expires_at TIMESTAMPTZ,
    outlook_sync_enabled BOOLEAN DEFAULT FALSE,
    last_sync_at TIMESTAMPTZ,
    notification_preferences JSONB DEFAULT '{"email": true, "push": true, "desktop": true}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects / Construction sites
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    created_by UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    code TEXT,
    description TEXT,
    client_name TEXT,
    address TEXT,
    city TEXT DEFAULT 'Lausanne',
    status project_status DEFAULT 'active',
    email_keywords TEXT[] DEFAULT '{}',
    email_senders TEXT[] DEFAULT '{}',
    start_date DATE,
    end_date DATE,
    budget_total DECIMAL(12,2),
    currency TEXT DEFAULT 'CHF',
    color TEXT DEFAULT '#6366F1',
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project members
CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

------------------------------------------------------------
-- TABLES — EMAILS (Phase 1)
------------------------------------------------------------

CREATE TABLE email_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id),
    outlook_message_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    sender_name TEXT,
    recipients TEXT[] DEFAULT '{}',
    received_at TIMESTAMPTZ NOT NULL,
    body_preview TEXT,
    has_attachments BOOLEAN DEFAULT FALSE,
    classification email_classification,
    ai_classification_confidence DECIMAL(4,2),
    ai_project_match_confidence DECIMAL(4,2),
    ai_summary TEXT,
    is_processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_emails_user ON email_records(user_id);
CREATE INDEX idx_emails_project ON email_records(project_id);
CREATE INDEX idx_emails_received ON email_records(received_at DESC);
CREATE INDEX idx_emails_outlook_id ON email_records(outlook_message_id);

------------------------------------------------------------
-- TABLES — TASKS (Phase 1)
------------------------------------------------------------

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    assigned_to UUID REFERENCES users(id),
    assigned_to_name TEXT,
    assigned_to_company TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status task_status DEFAULT 'open',
    priority task_priority DEFAULT 'medium',
    source task_source DEFAULT 'manual',
    source_id UUID,
    source_reference TEXT,
    due_date DATE,
    completed_at TIMESTAMPTZ,
    reminder_sent BOOLEAN DEFAULT FALSE,
    lot_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due ON tasks(due_date);

------------------------------------------------------------
-- TABLES — MEETINGS & PV (Phase 1)
------------------------------------------------------------

CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    meeting_number INTEGER,
    meeting_date TIMESTAMPTZ NOT NULL,
    location TEXT,
    status meeting_status DEFAULT 'scheduled',
    audio_url TEXT,
    audio_duration_seconds INTEGER,
    transcription_raw TEXT,
    transcription_language TEXT DEFAULT 'fr',
    pv_content JSONB,
    pv_document_url TEXT,
    pv_version INTEGER DEFAULT 1,
    participants JSONB DEFAULT '[]',
    sent_to TEXT[] DEFAULT '{}',
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meetings_project ON meetings(project_id);
CREATE INDEX idx_meetings_date ON meetings(meeting_date DESC);

------------------------------------------------------------
-- TABLES — DAILY BRIEFINGS (Phase 1)
------------------------------------------------------------

CREATE TABLE daily_briefings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    briefing_date DATE NOT NULL DEFAULT CURRENT_DATE,
    content JSONB NOT NULL,
    is_sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, briefing_date)
);

------------------------------------------------------------
-- TABLES — NOTIFICATIONS
------------------------------------------------------------

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifs_user ON notifications(user_id, is_read, created_at DESC);

------------------------------------------------------------
-- TABLES — ADMIN & LOGS
------------------------------------------------------------

CREATE TABLE app_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id),
    level log_level DEFAULT 'info',
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    client_type TEXT,
    client_version TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_logs_org ON app_logs(organization_id, created_at DESC);
CREATE INDEX idx_logs_level ON app_logs(level, created_at DESC);
CREATE INDEX idx_logs_source ON app_logs(source, created_at DESC);

CREATE TABLE usage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id),
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    client_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_org ON usage_events(organization_id, created_at DESC);
CREATE INDEX idx_usage_type ON usage_events(event_type, created_at DESC);

------------------------------------------------------------
-- TABLES — PHASE 2 (Prepared, empty at launch)
------------------------------------------------------------

CREATE TABLE lots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cfc_code TEXT NOT NULL,
    name TEXT NOT NULL,
    contractor_name TEXT,
    contractor_email TEXT,
    budget_soumission DECIMAL(12,2),
    budget_avenant DECIMAL(12,2) DEFAULT 0,
    amount_invoiced DECIMAL(12,2) DEFAULT 0,
    advancement_percent DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase 3: Chat messages (prepared)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    reply_to UUID REFERENCES messages(id),
    attachments JSONB DEFAULT '[]',
    is_edited BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
