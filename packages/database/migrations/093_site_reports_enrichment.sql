-- ============================================================
-- Migration 093: Site reports enrichment (Portail chef d'équipe)
-- ============================================================
-- Closes "la boucle des heures": every hour logged on site can now be imputed
-- to a CFC position / planning task, carries the labour rate it was worth on
-- the day it was declared, and the daily report can be signed on the device
-- (bon de régie opposable).
--
--   site_report_entries  → cfc_code, planning_task_id, supplier_id, hourly_rate_chf
--   site_reports         → signature_data / signed_by / signed_at
--                          conductor_signature_data / conductor_signed_at
--   portal_crew_members  → hourly_rate_chf
--
-- The org-wide default rate is NOT duplicated here: it already lives in
-- organizations.pricing_config->>'hourly_rate' (default 95, migration 022).
-- hourly_rate_chf on an entry is a SNAPSHOT taken at save time so that a later
-- rate change never rewrites the margin of a report already signed.
--
-- Idempotent: safe to run several times (ADD COLUMN IF NOT EXISTS +
-- guarded FK creation). The two FK targets (planning_tasks, suppliers) are
-- added only when those tables exist, so this migration also applies cleanly
-- to a database where migration 055 (planning) has not been run yet.

-- ------------------------------------------------------------
-- 1. site_report_entries — imputation & valorisation
-- ------------------------------------------------------------

ALTER TABLE site_report_entries ADD COLUMN IF NOT EXISTS cfc_code        TEXT;
ALTER TABLE site_report_entries ADD COLUMN IF NOT EXISTS planning_task_id UUID;
ALTER TABLE site_report_entries ADD COLUMN IF NOT EXISTS supplier_id      UUID;
ALTER TABLE site_report_entries ADD COLUMN IF NOT EXISTS hourly_rate_chf  NUMERIC(8,2);

COMMENT ON COLUMN site_report_entries.cfc_code IS
  'Migration 093. CFC position the hours (labor/machine) are charged to. Filled from the linked submission item or planning task in the field portal. NULL = not imputed.';
COMMENT ON COLUMN site_report_entries.planning_task_id IS
  'Migration 093. Planning task the hours belong to — feeds planning actuals vs planned.';
COMMENT ON COLUMN site_report_entries.supplier_id IS
  'Migration 093. Real supplier FK for a delivery note (supplier_name stays as the free-text fallback typed on site).';
COMMENT ON COLUMN site_report_entries.hourly_rate_chf IS
  'Migration 093. Labour rate snapshot (CHF/h) resolved server-side at save time: portal_crew_members.hourly_rate_chf, else organizations.pricing_config->>hourly_rate. Never sent by the field device.';

-- Foreign keys: added only when the target table exists, and only once.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'planning_tasks')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conname = 'site_report_entries_planning_task_id_fkey')
  THEN
    ALTER TABLE site_report_entries
      ADD CONSTRAINT site_report_entries_planning_task_id_fkey
      FOREIGN KEY (planning_task_id) REFERENCES planning_tasks(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'suppliers')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conname = 'site_report_entries_supplier_id_fkey')
  THEN
    ALTER TABLE site_report_entries
      ADD CONSTRAINT site_report_entries_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Aggregations the assistant / direction views run: "hours by CFC", "hours by
-- planning task", "delivery notes by supplier".
CREATE INDEX IF NOT EXISTS idx_report_entries_cfc
  ON site_report_entries(cfc_code) WHERE cfc_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_entries_planning_task
  ON site_report_entries(planning_task_id) WHERE planning_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_entries_supplier
  ON site_report_entries(supplier_id) WHERE supplier_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. site_reports — signatures (bon de régie)
-- ------------------------------------------------------------

ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS signature_data            TEXT;
ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS signed_by                 TEXT;
ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS signed_at                 TIMESTAMPTZ;
ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS conductor_signature_data  TEXT;
ALTER TABLE site_reports ADD COLUMN IF NOT EXISTS conductor_signed_at       TIMESTAMPTZ;

COMMENT ON COLUMN site_reports.signature_data IS
  'Migration 093. Foreman signature captured on the touch device, stored as a PNG data URL. Optional — a report can be submitted unsigned.';
COMMENT ON COLUMN site_reports.signed_by IS
  'Migration 093. Name typed under the foreman signature (defaults to the portal session name).';
COMMENT ON COLUMN site_reports.signed_at IS
  'Migration 093. When the foreman signature was captured (server time at PATCH).';
COMMENT ON COLUMN site_reports.conductor_signature_data IS
  'Migration 093. Counter-signature by the conducteur de travaux, captured app-side when validating/locking the report.';
COMMENT ON COLUMN site_reports.conductor_signed_at IS
  'Migration 093. When the conductor counter-signature was captured.';

-- ------------------------------------------------------------
-- 3. portal_crew_members — per-worker rate
-- ------------------------------------------------------------

ALTER TABLE portal_crew_members ADD COLUMN IF NOT EXISTS hourly_rate_chf NUMERIC(8,2);

COMMENT ON COLUMN portal_crew_members.hourly_rate_chf IS
  'Migration 093. Per-worker labour rate (CHF/h). Managed by the conductor app-side; NEVER returned to the field portal. NULL falls back to organizations.pricing_config->>hourly_rate.';
