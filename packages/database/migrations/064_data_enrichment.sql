-- ============================================================
-- Migration 064: Data Enrichment — Feedback Loops & Collective Intelligence
-- ============================================================
-- Phase 3: Close feedback loops (new columns for prospect tracking, intelligence metadata)
-- Phase 4: Materialized views for supplier metrics and labor productivity

-- ── Phase 3: Prospect conversion tracking on client_visits ──
ALTER TABLE client_visits ADD COLUMN IF NOT EXISTS prospect_converted BOOLEAN DEFAULT false;
ALTER TABLE client_visits ADD COLUMN IF NOT EXISTS converted_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_visits_prospect ON client_visits(is_prospect, prospect_converted);

-- ── Phase 3: Intelligence metadata JSONB on projects (stores CRON-aggregated site report data) ──
ALTER TABLE projects ADD COLUMN IF NOT EXISTS intelligence_metadata JSONB DEFAULT '{}'::jsonb;

-- ── Phase 4: Materialized view for supplier performance metrics ──
-- Aggregates response rates, average response times, and price positioning
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_supplier_daily_metrics AS
SELECT
  s.organization_id,
  s.id as supplier_id,
  s.company_name,
  COUNT(DISTINCT pr.id) as total_requests,
  COUNT(DISTINCT so.id) as total_responses,
  CASE WHEN COUNT(DISTINCT pr.id) > 0
    THEN ROUND(COUNT(DISTINCT so.id)::numeric / COUNT(DISTINCT pr.id) * 100, 1)
    ELSE 0 END as response_rate,
  AVG(EXTRACT(EPOCH FROM (so.created_at - pr.created_at)) / 86400)::numeric(10,1) as avg_response_days,
  COUNT(DISTINCT oli.id) as total_line_items,
  AVG(oli.vs_average_percent)::numeric(10,2) as avg_price_vs_market
FROM suppliers s
LEFT JOIN price_requests pr ON pr.supplier_id = s.id
LEFT JOIN supplier_offers so ON so.supplier_id = s.id AND so.price_request_id = pr.id
LEFT JOIN offer_line_items oli ON oli.offer_id = so.id
GROUP BY s.organization_id, s.id, s.company_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_supplier_daily_org_supplier
ON mv_supplier_daily_metrics (organization_id, supplier_id);

-- ── Phase 4: Materialized view for labor productivity by CFC code ──
-- Tracks hours per CFC discipline from site report entries
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_labor_productivity AS
SELECT
  p.organization_id,
  sre.data->>'cfc_code' as cfc_code,
  COUNT(*) as entry_count,
  AVG((sre.data->>'duration_hours')::numeric) as avg_hours_per_entry,
  SUM((sre.data->>'duration_hours')::numeric) as total_hours,
  p.city as region
FROM site_report_entries sre
JOIN site_reports sr ON sr.id = sre.report_id
JOIN projects p ON p.id = sr.project_id
WHERE sre.entry_type = 'labor'
AND sre.data->>'duration_hours' IS NOT NULL
GROUP BY p.organization_id, sre.data->>'cfc_code', p.city;

-- ── Phase 4: Submission corrections table (C1 learning data) ──
CREATE TABLE IF NOT EXISTS submission_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  submission_id UUID NOT NULL,
  item_id UUID,
  field_name TEXT NOT NULL,
  original_value TEXT,
  corrected_value TEXT,
  corrected_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submission_corrections_org
ON submission_corrections (organization_id, submission_id);

ALTER TABLE submission_corrections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "org_submission_corrections" ON submission_corrections
    FOR ALL USING (
      organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Phase 4: Trigger to queue aggregation when corrections happen ──
CREATE OR REPLACE FUNCTION notify_submission_correction() RETURNS trigger AS $$
BEGIN
  INSERT INTO aggregation_queue (source_table, source_id, organization_id, event_type)
  VALUES ('submission_corrections', NEW.id, NEW.organization_id, 'new_correction')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_submission_correction_notify ON submission_corrections;
CREATE TRIGGER trg_submission_correction_notify
AFTER INSERT ON submission_corrections
FOR EACH ROW EXECUTE FUNCTION notify_submission_correction();

-- ── Indexes for common intelligence queries ──
CREATE INDEX IF NOT EXISTS idx_price_calibrations_source ON price_calibrations (source);
CREATE INDEX IF NOT EXISTS idx_project_benchmarks_org ON project_benchmarks (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_benchmarks_type ON project_benchmarks (project_type, region);

-- Note: To refresh materialized views, run:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_supplier_daily_metrics;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_labor_productivity;
-- This is handled by the CRON route /api/cron/refresh-intelligence
