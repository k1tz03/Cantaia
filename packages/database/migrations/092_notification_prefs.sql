-- ============================================================
-- Migration 092: Notification preferences + task reminder idempotence
-- ============================================================
--
-- Part A — users.notification_prefs (JSONB)
--   Backs Settings > Notifications, which until now wrote four toggles into
--   localStorage and piloted strictly nothing.
--   Semantics are opt-OUT: `{}` (the default) means EVERY event is enabled, so
--   existing users start receiving notifications without any backfill. Only an
--   explicit `false` silences an event.
--   Known keys (packages/core/src/notifications/types.ts):
--     task_assigned, report_submitted, offer_received, support_reply,
--     deadline_soon, credits_low, pv_sent
--
-- Part B — tasks.reminder_sent_at (TIMESTAMPTZ)
--   /api/cron/task-reminders runs daily and must not re-send the same reminder
--   on every run. `tasks.reminder_sent` (migration 001, BOOLEAN) cannot express
--   "sent for the J-3 window, not yet for the J-0 one", so we store the last
--   send timestamp and skip anything already notified today.
--
-- Idempotent: safe to re-run.

-- ────────────────────────────────────────────────────────────
-- PART A — users.notification_prefs
-- ────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN users.notification_prefs IS
  'Migration 092. Opt-out map of notification event keys -> boolean. Absent key = enabled. Written by /api/user/notification-prefs, read by @cantaia/core/notifications.';

-- Rows created before the column existed can hold NULL if a prior migration
-- inserted explicitly — normalise so the merge helper never sees NULL.
UPDATE users SET notification_prefs = '{}'::jsonb WHERE notification_prefs IS NULL;

-- ────────────────────────────────────────────────────────────
-- PART B — tasks.reminder_sent_at
-- ────────────────────────────────────────────────────────────

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN tasks.reminder_sent_at IS
  'Migration 092. Last time /api/cron/task-reminders emailed about this task. Used for daily idempotence (one reminder per task per day).';

-- The reminder cron scans open tasks by due_date across the whole platform.
-- Partial index keeps that scan cheap (tasks without a deadline are ignored).
CREATE INDEX IF NOT EXISTS idx_tasks_due_date_open
  ON tasks (due_date)
  WHERE due_date IS NOT NULL AND status NOT IN ('done', 'cancelled');

-- "Mes taches" (?assigned_to=me) and team-health both filter on assigned_to.
-- 001 already created idx_tasks_assigned; this composite serves the common
-- "my open tasks, soonest first" access path.
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_due
  ON tasks (assigned_to, due_date)
  WHERE assigned_to IS NOT NULL;
