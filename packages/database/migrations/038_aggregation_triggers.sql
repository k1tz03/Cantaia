-- Migration 038: Aggregation triggers on C1 source tables
-- These triggers feed the aggregation_queue for the CRON pipeline

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
    WHERE org_id = p_org_id
      AND module = p_module
      AND opted_in = true
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Apply triggers on all C1 source tables

-- Pricing / offers
CREATE TRIGGER trg_offer_line_items_agg
  AFTER INSERT OR UPDATE ON offer_line_items
  FOR EACH ROW EXECUTE FUNCTION notify_aggregation();

CREATE TRIGGER trg_supplier_offers_agg
  AFTER INSERT OR UPDATE ON supplier_offers
  FOR EACH ROW EXECUTE FUNCTION notify_aggregation();

-- Tasks
CREATE TRIGGER trg_tasks_agg
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_aggregation();

-- Feedback and corrections
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
