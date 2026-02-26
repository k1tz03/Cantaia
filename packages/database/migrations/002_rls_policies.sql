-- ============================================================
-- CANTAIA — Row Level Security Policies
-- ============================================================

------------------------------------------------------------
-- ENABLE RLS
------------------------------------------------------------

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------
-- POLICIES
------------------------------------------------------------

-- Users see their own organization
CREATE POLICY "Users see own org" ON organizations FOR SELECT
    USING (id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Users see members of their org
CREATE POLICY "Users see org members" ON users FOR SELECT
    USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Users update own profile" ON users FOR UPDATE
    USING (id = auth.uid());

-- Projects: project members only
CREATE POLICY "Project members see projects" ON projects FOR SELECT
    USING (id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Users create projects in own org" ON projects FOR INSERT
    WITH CHECK (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Emails: own only
CREATE POLICY "Users see own emails" ON email_records FOR SELECT
    USING (user_id = auth.uid());

-- Tasks: project members
CREATE POLICY "Project members see tasks" ON tasks FOR SELECT
    USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
CREATE POLICY "Project members create tasks" ON tasks FOR INSERT
    WITH CHECK (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

-- Meetings: project members
CREATE POLICY "Project members see meetings" ON meetings FOR SELECT
    USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));

-- Notifications: own only
CREATE POLICY "Users see own notifs" ON notifications FOR SELECT
    USING (user_id = auth.uid());

-- Briefings: own only
CREATE POLICY "Users see own briefings" ON daily_briefings FOR SELECT
    USING (user_id = auth.uid());

-- Logs and usage: superadmin only
CREATE POLICY "Superadmin sees logs" ON app_logs FOR SELECT
    USING (auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin'));
CREATE POLICY "Superadmin sees usage" ON usage_events FOR SELECT
    USING (auth.uid() IN (SELECT id FROM users WHERE role = 'superadmin'));
