-- Migration 038: Aggregation triggers on C1 source tables
-- These triggers feed the aggregation_queue for the CRON pipeline
-- Idempotent: DROP IF EXISTS before each CREATE

-- Enable pgcrypto for SHA-256 hashing (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Generic trigger function to feed the aggregation queue
CREATE OR REPLACE FUNCTION notify_aggregation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO aggregation_queue (source_table, source_id, org_id, event_type, created_at)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.organization_id, OLD.organization_id),
    TG_OP,
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Consent check function used by aggregation functions
CREATE OR REPLACE FUNCTION is_org_opted_in(p_org_id UUID, p_module TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM aggregation_consent
    WHERE organization_id = p_org_id
      AND module = p_module
      AND opted_in = true
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Clean up old triggers (including removed ones)
DROP TRIGGER IF EXISTS trg_offer_line_items_agg ON offer_line_items;
DROP TRIGGER IF EXISTS trg_tasks_agg ON tasks;
DROP TRIGGER IF EXISTS trg_supplier_offers_agg ON supplier_offers;
DROP TRIGGER IF EXISTS trg_email_classification_feedback_agg ON email_classification_feedback;
DROP TRIGGER IF EXISTS trg_pv_corrections_agg ON pv_corrections;
DROP TRIGGER IF EXISTS trg_chat_feedback_agg ON chat_feedback;
DROP TRIGGER IF EXISTS trg_submission_corrections_agg ON submission_corrections;
DROP TRIGGER IF EXISTS trg_plan_analysis_corrections_agg ON plan_analysis_corrections;
DROP TRIGGER IF EXISTS trg_visit_report_corrections_agg ON visit_report_corrections;
DROP TRIGGER IF EXISTS trg_estimate_accuracy_agg ON estimate_accuracy_log;
DROP TRIGGER IF EXISTS trg_task_status_log_agg ON task_status_log;

-- Apply triggers on C1 source tables
-- NOTE: offer_line_items and tasks excluded — no organization_id column.
-- Coverage via supplier_offers and task_status_log respectively.

CREATE TRIGGER trg_supplier_offers_agg
  AFTER INSERT OR UPDATE ON supplier_offers
  FOR EACH ROW EXECUTE FUNCTION notify_aggregation();

CREATE TRIGGER trg_email_classification_feedback_agg
  AFTER INSERT ON email_classification_feedback
  FOR EACH ROW EXECUTE FUNCTION notify_aggregation();

CREATE TRIGGER trg_pv_corrections_agg
  AFTER INSERT ON pv_corrections
  FOR EACH ROW EXECUTE FUNCTION notify_aggregation();

CREATE TRIGGER trg_chat_feedback_agg
  AFTER INSERT ON chat_feedback
  FOR EACH ROW EXECUTE FUNCTION notify_aggregation();

CREATE TRIGGER trg_submission_corrections_agg
  AFTER INSERT ON submission_corrections
  FOR EACH ROW EXECUTE FUNCTION notify_aggregation();

CREATE TRIGGER trg_plan_analysis_corrections_agg
  AFTER INSERT ON plan_analysis_corrections
  FOR EACH ROW EXECUTE FUNCTION notify_aggregation();

CREATE TRIGGER trg_visit_report_corrections_agg
  AFTER INSERT ON visit_report_corrections
  FOR EACH ROW EXECUTE FUNCTION notify_aggregation();

CREATE TRIGGER trg_estimate_accuracy_agg
  AFTER INSERT ON estimate_accuracy_log
  FOR EACH ROW EXECUTE FUNCTION notify_aggregation();

CREATE TRIGGER trg_task_status_log_agg
  AFTER INSERT ON task_status_log
  FOR EACH ROW EXECUTE FUNCTION notify_aggregation();
