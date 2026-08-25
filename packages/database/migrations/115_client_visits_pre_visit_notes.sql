-- ============================================================
-- Migration 115: pre-visit notes on client_visits (Agent PVV)
-- ============================================================
-- The "Notes pré-visite" textarea on /visits/new fed `form.notes`, but the row
-- insert never persisted it and the table had no column for it — everything the
-- user typed before a visit was silently discarded.
--
-- This adds the column so the note is stored and can be folded into the report
-- generation prompt (the generate-report route prepends it to the transcription).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE client_visits
  ADD COLUMN IF NOT EXISTS pre_visit_notes TEXT;
