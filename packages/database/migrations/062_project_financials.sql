-- Migration 062: Project financials for direction statistics

-- Add financial fields to projects for closure
ALTER TABLE projects ADD COLUMN IF NOT EXISTS invoiced_amount DECIMAL(12,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS purchase_costs DECIMAL(12,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Index for stats queries
CREATE INDEX IF NOT EXISTS idx_site_reports_project ON site_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_site_report_entries_report ON site_report_entries(report_id);
CREATE INDEX IF NOT EXISTS idx_site_report_entries_type ON site_report_entries(entry_type);
