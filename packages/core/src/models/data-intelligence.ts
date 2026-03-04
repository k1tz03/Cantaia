// ============================================================
// Cantaia — Data Intelligence Types
// 3-layer model: C1 (Private) → C2 (Aggregated) → C3 (Patterns)
// ============================================================

// ---------- Consent ----------

export type ConsentModule =
  | "prix"
  | "fournisseurs"
  | "plans"
  | "pv"
  | "visites"
  | "chat"
  | "mail"
  | "taches"
  | "briefing";

export interface AggregationConsent {
  id: string;
  organization_id: string;
  module: ConsentModule;
  opted_in: boolean;
  updated_at: string;
  created_at: string;
}

// ---------- C1 — Private Tables ----------

export interface EmailClassificationFeedback {
  id: string;
  organization_id: string;
  email_id: string;
  original_project_id: string | null;
  corrected_project_id: string | null;
  original_classification: string | null;
  corrected_classification: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EmailResponseTemplate {
  id: string;
  organization_id: string;
  project_type: string | null;
  tone: "professional" | "formal" | "friendly" | "technical";
  template_name: string;
  template_text: string;
  language: "fr" | "en" | "de";
  usage_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionCorrection {
  id: string;
  organization_id: string;
  submission_id: string;
  item_index: number;
  field: "description" | "quantity" | "unit" | "unit_price" | "total_price" | "cfc_code";
  old_value: string | null;
  new_value: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PlanAnalysisCorrection {
  id: string;
  organization_id: string;
  plan_id: string;
  quantity_index: number;
  old_qty: number | null;
  new_qty: number | null;
  old_unit: string | null;
  new_unit: string | null;
  field: string;
  created_by: string | null;
  created_at: string;
}

export interface PvCorrection {
  id: string;
  organization_id: string;
  meeting_id: string;
  section: string;
  old_text: string | null;
  new_text: string | null;
  created_by: string | null;
  created_at: string;
}

export interface VisitReportCorrection {
  id: string;
  organization_id: string;
  visit_id: string;
  section: string;
  old_value: string | null;
  new_value: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ChatFeedback {
  id: string;
  organization_id: string;
  conversation_id: string;
  message_index: number;
  rating: "up" | "down";
  comment: string | null;
  created_by: string | null;
  created_at: string;
}

export type SupplierPreferenceStatus = "preferred" | "blacklisted" | "neutral";

export interface SupplierPreference {
  id: string;
  organization_id: string;
  supplier_id: string;
  status: SupplierPreferenceStatus;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EstimateAccuracyLog {
  id: string;
  organization_id: string;
  plan_id: string | null;
  project_id: string | null;
  cfc_code: string | null;
  estimated_total: number;
  actual_total: number;
  delta_pct: number;
  created_by: string | null;
  created_at: string;
}

export interface TaskStatusLog {
  id: string;
  organization_id: string;
  task_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  created_at: string;
}

export interface OrgPricingConfig {
  id: string;
  organization_id: string;
  hourly_rate: number;
  margin_level: number;
  transport_base: number;
  transport_per_km: number;
  currency: string;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

export interface DailyBriefing {
  id: string;
  organization_id: string;
  user_id: string;
  date: string;
  content: Record<string, unknown>;
  mode: "ai" | "fallback";
  read_at: string | null;
  created_at: string;
}

// ---------- C2 — Aggregated Tables (no org_id) ----------

export interface NormalizationRule {
  id: string;
  raw_patterns: string[];
  canonical_description: string;
  cfc_code: string | null;
  standard_unit: string | null;
  confidence: number;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface AggregationQueueItem {
  id: string;
  source_table: string;
  source_id: string;
  org_id: string;
  event_type: "INSERT" | "UPDATE" | "DELETE";
  created_at: string;
  processed_at: string | null;
}

export interface MarketBenchmark {
  id: string;
  cfc_code: string;
  description_normalized: string;
  unit: string;
  region: string;
  quarter: string;
  price_median: number | null;
  price_p25: number | null;
  price_p75: number | null;
  std_dev: number | null;
  trend_pct: number | null;
  contributor_count: number;
  sample_size: number;
  updated_at: string;
}

export interface RegionalPriceIndex {
  id: string;
  region: string;
  quarter: string;
  index_value: number;
  basket_items_count: number;
  contributor_count: number;
  previous_index: number | null;
  change_pct: number | null;
  updated_at: string;
}

export interface MaterialCorrelation {
  id: string;
  material: string;
  affected_cfc_codes: string[];
  correlation_coefficient: number;
  lag_months: number;
  contributor_count: number;
  period: string | null;
  updated_at: string;
}

export interface SupplierMarketScore {
  id: string;
  supplier_company_hash: string;
  specialty: string | null;
  region: string | null;
  avg_score: number | null;
  avg_response_rate: number | null;
  avg_response_days: number | null;
  competitiveness_quartile: number | null;
  contributor_count: number;
  sample_offers: number;
  updated_at: string;
}

export interface ProjectBenchmark {
  id: string;
  project_type: string;
  region: string | null;
  avg_duration_days: number | null;
  budget_overrun_pct: number | null;
  avg_emails_per_phase: Record<string, number>;
  avg_tasks_per_phase: Record<string, number>;
  contributor_count: number;
  updated_at: string;
}

export interface PvQualityBenchmark {
  id: string;
  meeting_type: string;
  avg_decisions_count: number | null;
  avg_actions_count: number | null;
  correction_rate: number | null;
  avg_duration_minutes: number | null;
  contributor_count: number;
  updated_at: string;
}

export interface TaskBenchmark {
  id: string;
  task_category: string;
  avg_completion_days: number | null;
  overdue_rate: number | null;
  ai_suggestion_acceptance_rate: number | null;
  source_distribution: Record<string, number>;
  contributor_count: number;
  updated_at: string;
}

export interface VisitBenchmark {
  id: string;
  work_type_cfc: string;
  conversion_rate: number | null;
  avg_cycle_days: number | null;
  sentiment_distribution: Record<string, number>;
  top_demands: string[];
  contributor_count: number;
  updated_at: string;
}

export interface EmailBenchmark {
  id: string;
  project_type: string;
  l1_success_rate: number | null;
  avg_correction_rate: number | null;
  avg_volume_per_phase: Record<string, number>;
  contributor_count: number;
  updated_at: string;
}

export interface ChatAnalytics {
  id: string;
  topic_category: string;
  frequency: number;
  satisfaction_rate: number | null;
  top_sia_norms: string[];
  contributor_count: number;
  updated_at: string;
}

// ---------- C3 — Pattern Tables ----------

export type AIModule =
  | "mail"
  | "pv"
  | "plans"
  | "prix"
  | "chat"
  | "tasks"
  | "visits"
  | "briefing"
  | "soumissions";

export interface AIQualityMetric {
  id: string;
  module: AIModule;
  metric_type: string;
  value: number;
  period: string;
  scope: "global" | "per_org";
  org_id: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
}

export interface PromptOptimizationLog {
  id: string;
  module: string;
  prompt_version: string;
  metric_before: number | null;
  metric_after: number | null;
  improvement_pct: number;
  a_b_test_id: string | null;
  notes: string | null;
  deployed_at: string;
}

export interface PatternLibraryEntry {
  id: string;
  module: AIModule;
  pattern_type: string;
  pattern_data: Record<string, unknown>;
  confidence: number;
  usage_count: number;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}
