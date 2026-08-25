-- ============================================================
-- Migration 095: PV circulation (Agent O)
-- ============================================================
-- A procès-verbal that is written but never circulated is a Word document with
-- extra steps. This migration adds the two columns the circulation loop needs:
--
--   organizations.pv_template          → the org's own PV outline (trame)
--   meetings.opposition_deadline_days  → the délai d'opposition printed on the PV
--
-- NOT added here, because migration 001 already created them on `meetings`:
--   sent_to TEXT[] DEFAULT '{}'   (recipients of the last send)
--   sent_at TIMESTAMPTZ           (when the PV was circulated)
-- and `meeting_status` already carries the 'sent' value.
--
-- Participant e-mails live inside the existing `meetings.participants` JSONB
-- ({name, company, role, present} → + optional {email}). A JSONB array needs no
-- DDL, so no column is added for them.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS only — safe to re-run.

------------------------------------------------------------
-- 1. Org-level PV outline (trame paramétrable)
------------------------------------------------------------
-- Shape (NULL = "use the built-in default outline"):
--   {
--     "sections": [
--       { "titre": "Tour de table",     "ordre": 1, "obligatoire": true  },
--       { "titre": "Avancement",        "ordre": 2, "obligatoire": true  },
--       { "titre": "Points financiers", "ordre": 3, "obligatoire": false }
--     ]
--   }
-- Consumed by POST /api/ai/generate-pv (prompt) and the PV editor.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS pv_template JSONB DEFAULT NULL;

COMMENT ON COLUMN organizations.pv_template IS
  'Trame de PV propre à l''organisation : {"sections":[{"titre","ordre","obligatoire"}]}. NULL = trame Cantaia par défaut.';

------------------------------------------------------------
-- 2. Délai d'opposition (per meeting, org practice varies)
------------------------------------------------------------
-- Swiss site-meeting practice: the PV is deemed approved unless a participant
-- opposes within N days of circulation. 10 days is the common default; the
-- value is stored per meeting so a change of practice never rewrites history.

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS opposition_deadline_days INTEGER DEFAULT 10;

COMMENT ON COLUMN meetings.opposition_deadline_days IS
  'Délai d''opposition en jours imprimé sur le PV et rappelé dans l''e-mail d''envoi. Défaut 10.';

-- Guard against a nonsense value coming from the API (0 = no opposition period,
-- which is legitimate; negative or absurd values are not).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meetings_opposition_deadline_days_check'
  ) THEN
    ALTER TABLE meetings
      ADD CONSTRAINT meetings_opposition_deadline_days_check
      CHECK (opposition_deadline_days IS NULL OR (opposition_deadline_days >= 0 AND opposition_deadline_days <= 365));
  END IF;
END $$;

------------------------------------------------------------
-- 3. Index for the "previous meeting" lookup
------------------------------------------------------------
-- Creating a PV loads the last finalized/sent meeting of the project to carry
-- its open points forward. Without this index that is a seq-scan per creation.

CREATE INDEX IF NOT EXISTS idx_meetings_project_number
  ON meetings (project_id, meeting_number DESC);
