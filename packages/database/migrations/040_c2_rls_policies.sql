-- Migration 040: RLS policies on C2 tables
-- C2 tables are readable by any authenticated user (no org_id filter)
-- C2 tables are only writable by the aggregation pipeline (service role)

-- Market benchmarks: read by all, write by service role only
ALTER TABLE market_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_benchmarks_read" ON market_benchmarks
  FOR SELECT TO authenticated USING (true);

-- Regional price index
ALTER TABLE regional_price_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regional_price_index_read" ON regional_price_index
  FOR SELECT TO authenticated USING (true);

-- Material correlations
ALTER TABLE material_correlations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_correlations_read" ON material_correlations
  FOR SELECT TO authenticated USING (true);

-- Supplier market scores
ALTER TABLE supplier_market_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supplier_market_scores_read" ON supplier_market_scores
  FOR SELECT TO authenticated USING (true);

-- Project benchmarks
ALTER TABLE project_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_benchmarks_read" ON project_benchmarks
  FOR SELECT TO authenticated USING (true);

-- PV quality benchmarks
ALTER TABLE pv_quality_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pv_quality_benchmarks_read" ON pv_quality_benchmarks
  FOR SELECT TO authenticated USING (true);

-- Task benchmarks
ALTER TABLE task_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_benchmarks_read" ON task_benchmarks
  FOR SELECT TO authenticated USING (true);

-- Visit benchmarks
ALTER TABLE visit_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visit_benchmarks_read" ON visit_benchmarks
  FOR SELECT TO authenticated USING (true);

-- Email benchmarks
ALTER TABLE email_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_benchmarks_read" ON email_benchmarks
  FOR SELECT TO authenticated USING (true);

-- Chat analytics
ALTER TABLE chat_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_analytics_read" ON chat_analytics
  FOR SELECT TO authenticated USING (true);

-- Normalization rules: readable by all, useful for client-side normalization
ALTER TABLE normalization_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "normalization_rules_read" ON normalization_rules
  FOR SELECT TO authenticated USING (true);

-- Aggregation queue: no public access (service role only)
ALTER TABLE aggregation_queue ENABLE ROW LEVEL SECURITY;

-- C3 tables: readable by service role for AI system
ALTER TABLE ai_quality_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_quality_metrics_read" ON ai_quality_metrics
  FOR SELECT TO authenticated USING (true);

ALTER TABLE prompt_optimization_log ENABLE ROW LEVEL SECURITY;
-- No public read policy — service role only

ALTER TABLE pattern_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pattern_library_read" ON pattern_library
  FOR SELECT TO authenticated USING (true);
