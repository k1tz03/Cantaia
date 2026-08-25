// -----------------------------------------------------------------------------
// Planning / Gantt chart types
// Used by all components in apps/web/src/components/planning/
// -----------------------------------------------------------------------------

export interface PlanningPhase {
  id: string;
  name: string;
  cfc_codes: string[];
  color: string;
  sort_order: number;
  start_date: string;
  end_date: string;
  tasks: PlanningTask[];
  isExpanded: boolean;
}

export interface PlanningTask {
  id: string;
  phase_id: string;
  name: string;
  cfc_code: string | null;
  start_date: string;
  end_date: string;
  duration_days: number;
  quantity: number | null;
  unit: string | null;
  productivity_ratio: number | null;
  productivity_source: string | null;
  adjustment_factors: Record<string, number> | null;
  base_duration_days: number | null;
  /** Resolved company name (joined server-side) — display only. */
  supplier_name: string | null;
  /** FK actually persisted by PATCH { task_id, supplier_id }. */
  supplier_id?: string | null;
  team_size: number;
  progress: number;
  is_milestone: boolean;
  milestone_type: string | null;
  sort_order: number;
  /** Migration 094 — real execution dates, entered by the conductor. */
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  description?: string | null;
}

export interface PlanningDependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: "FS" | "SS" | "FF" | "SF";
  lag_days: number;
  source: "auto" | "manual";
}

export type ZoomLevel = "day" | "week" | "month";

/** Task dates frozen at baseline time, keyed by task id. */
export type BaselineSnapshot = Record<
  string,
  { start_date: string; end_date: string; duration_days: number }
>;

/**
 * `project_plannings.config` — free-form JSONB. Only the keys the UI reads
 * are typed; anything else the generator writes is preserved untouched.
 */
export interface PlanningConfigBlob {
  baseline?: BaselineSnapshot;
  constraints?: string | null;
  max_concurrent_crews?: number | null;
  [key: string]: unknown;
}

/** AI validation output (packages/core/src/planning — AIRisk). */
export interface PlanningAiRisk {
  title: string;
  probability: "high" | "medium" | "low";
  impact_days: number;
  mitigation: string;
}

/** AI validation output (AIRecommendation). */
export interface PlanningAiRecommendation {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
}

/** AI validation output (AIProcurementItem) — the order-by plan. */
export interface PlanningProcurementItem {
  cfc_code: string | null;
  lot: string;
  order_by: string;
  lead_time_weeks: number;
  reason: string;
}

/** Full planning object passed to the GanttChart */
export interface Planning {
  id: string;
  title: string;
  start_date: string;
  calculated_end_date: string;
  phases: PlanningPhase[];
  tasks: PlanningTask[];
  dependencies: PlanningDependency[];
  milestones: PlanningTask[];
  /** Carries `config.baseline` — without it the baseline evaporates on reload. */
  config?: PlanningConfigBlob | null;
  ai_summary?: string | null;
  ai_risks?: PlanningAiRisk[];
  ai_recommendations?: PlanningAiRecommendation[];
  ai_procurement_plan?: PlanningProcurementItem[];
}

/** Bounding rectangle of a task bar in the timeline (px) */
export interface TaskPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pixels per day for each zoom level */
export const PIXELS_PER_DAY: Record<ZoomLevel, number> = {
  day: 40,
  week: 17, // 120px / 7
  month: 6.67, // 200px / 30
};

/** Column widths for the timeline header */
export const COLUMN_WIDTH: Record<ZoomLevel, number> = {
  day: 40,
  week: 120,
  month: 200,
};

/** Height of a single row in the task list and timeline */
export const ROW_HEIGHT = 40;

/** Height of the timeline header */
export const HEADER_HEIGHT = 48;

/** Bar vertical padding within a row */
export const BAR_V_PADDING = 6;

/** Phase color palette (8 colors) */
export const PHASE_COLORS = [
  "#3B82F6", // blue-500
  "#10B981", // emerald-500
  "#F59E0B", // amber-500
  "#8B5CF6", // violet-500
  "#EC4899", // pink-500
  "#06B6D4", // cyan-500
  "#F97316", // orange-500
  "#6366F1", // indigo-500
] as const;

/**
 * Milestone accent colours, keyed by `planning_tasks.milestone_type` as
 * emitted by the generator (start / procurement / hors_eau / hors_air /
 * reception / phase_start). Unknown types fall back to amber.
 */
export const MILESTONE_COLORS: Record<string, string> = {
  start: "#3B82F6",
  phase_start: "#6366F1",
  procurement: "#8B5CF6",
  hors_eau: "#06B6D4",
  hors_air: "#10B981",
  // The generator emits `reception_provisoire` (planning-generator.ts); `reception`
  // is kept as an alias so both spellings resolve to the orange accent.
  reception_provisoire: "#F97316",
  reception: "#F97316",
};

export const DEFAULT_MILESTONE_COLOR = "#F59E0B";

export function milestoneColor(milestoneType: string | null | undefined): string {
  if (!milestoneType) return DEFAULT_MILESTONE_COLOR;
  return MILESTONE_COLORS[milestoneType] ?? DEFAULT_MILESTONE_COLOR;
}

/** Swiss cantons for config modal */
export const SWISS_CANTONS = [
  "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR",
  "JU", "LU", "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG",
  "TI", "UR", "VD", "VS", "ZG", "ZH",
] as const;

/** Project types for config modal */
export type ProjectType = "neuf" | "renovation" | "extension" | "amenagement";
