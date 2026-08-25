-- Migration 100: Site report share scope
--
-- A share link created for one client / one site exposed the WHOLE organisation's
-- hours and delivery notes for 90 days (site_report_shares had no scope at all).
-- `project_id` makes the link restrictable to a single project; NULL keeps the
-- historical org-wide behaviour, so existing links are unaffected.
--
-- NOTE: the contract left 099 as the free reserve, but another agent claimed it
-- (099_supplier_portal.sql). Renumbered to 100 to avoid a second "three files
-- numbered 070" situation.
-- Owner: Agent B (financials chain).

ALTER TABLE site_report_shares
  ADD COLUMN IF NOT EXISTS project_id UUID NULL REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sr_shares_project ON site_report_shares(project_id);

COMMENT ON COLUMN site_report_shares.project_id IS
  'Optional scope: when set, the public link only exposes this project. NULL = whole organisation (legacy).';
