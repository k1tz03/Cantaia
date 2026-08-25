-- ============================================================
-- Migration 096: Calendar links (source_type / source_id)
--
-- The Calendar hub renders TWO kinds of rows:
--   1. real `calendar_events` (Cantaia / Outlook / agent)
--   2. VIRTUAL events derived on the fly from the other modules
--      (submission deadlines, meetings, tasks, planning milestones,
--       receptions & guarantees, reserves, client visits)
--
-- Virtual events are read-only and never stored: they carry a synthetic
-- id "virt:<type>:<uuid>" computed by the API. These two columns exist so
-- that a virtual event can later be PROMOTED to a real calendar_events row
-- (e.g. pushed to Outlook) without losing the link back to its origin, and
-- so the deduplication between the promoted row and the virtual one can be
-- done with a single index lookup.
--
-- Nothing writes them yet — GET /api/calendar/events derives the virtual
-- rows live. The columns are added now so the push path is a pure additive
-- change later.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'calendar_events'
  ) THEN

    ALTER TABLE calendar_events
      ADD COLUMN IF NOT EXISTS source_type TEXT,
      ADD COLUMN IF NOT EXISTS source_id   UUID;

    -- Allowed origins. NULL = a plain calendar event (Cantaia/Outlook/agent),
    -- which is the case for every existing row.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.constraint_column_usage
      WHERE table_schema = 'public'
        AND table_name = 'calendar_events'
        AND constraint_name = 'calendar_events_source_type_check'
    ) THEN
      ALTER TABLE calendar_events
        ADD CONSTRAINT calendar_events_source_type_check
        CHECK (
          source_type IS NULL OR source_type IN (
            'submission',
            'meeting',
            'task',
            'planning_task',
            'reception',
            'guarantee_2y',
            'guarantee_5y',
            'reserve',
            'client_visit'
          )
        );
    END IF;

    -- Lookup used when reconciling a derived (virtual) event with its
    -- promoted counterpart, and when a source row is deleted.
    CREATE INDEX IF NOT EXISTS idx_cal_events_source
      ON calendar_events (organization_id, source_type, source_id)
      WHERE source_type IS NOT NULL;

    -- One calendar row per origin, so a double promotion cannot create a
    -- duplicate entry in the agenda.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cal_events_source_uniq
      ON calendar_events (source_type, source_id)
      WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

    COMMENT ON COLUMN calendar_events.source_type IS
      'Origin module when this event was promoted from another table (submission deadline, meeting, task, planning milestone, reception, guarantee, reserve, client visit). NULL for plain calendar events.';
    COMMENT ON COLUMN calendar_events.source_id IS
      'Primary key of the origin row in the module named by source_type.';

  END IF;
END $$;
