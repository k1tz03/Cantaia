-- ============================================================
-- CANTAIA — Migration 006: Enriched Tasks
-- ============================================================
-- Adds new columns, updates enum values, adds reminder type
-- Run after 005_organization_branding.sql
-- ============================================================

-- 1. Update task_status enum: rename open→todo, completed→done
ALTER TYPE task_status RENAME VALUE 'open' TO 'todo';
ALTER TYPE task_status RENAME VALUE 'completed' TO 'done';

-- 2. Update task_source enum: rename meeting_pv→meeting, ai_suggestion→reserve
ALTER TYPE task_source RENAME VALUE 'meeting_pv' TO 'meeting';
ALTER TYPE task_source RENAME VALUE 'ai_suggestion' TO 'reserve';

-- 3. Create reminder enum
CREATE TYPE task_reminder AS ENUM ('none', '1_day', '3_days', '1_week');

-- 4. Add new columns to tasks table
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS reminder task_reminder DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS lot_id UUID,
    ADD COLUMN IF NOT EXISTS lot_name TEXT,
    ADD COLUMN IF NOT EXISTS cfc_code TEXT,
    ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- 5. Set default status to 'todo' (was 'open')
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'todo';

-- 6. Index on new columns
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user ON tasks(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_cfc ON tasks(cfc_code);
CREATE INDEX IF NOT EXISTS idx_tasks_reminder ON tasks(reminder) WHERE reminder != 'none';

-- 7. Comment
COMMENT ON COLUMN tasks.comments IS 'JSON array of {user_id, user_name, text, created_at}';
COMMENT ON COLUMN tasks.history IS 'JSON array of {action, user_name, field?, old_value?, new_value?, created_at}';
COMMENT ON COLUMN tasks.attachments IS 'JSON array of {name, url, size, type}';
