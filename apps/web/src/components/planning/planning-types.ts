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
  supplier_name: string | null;
  team_size: number;
  progress: number;
  is_milestone: boolean;
  milestone_type: string | null;
  sort_order: number;
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

/** Swiss cantons for config modal */
export const SWISS_CANTONS = [
  "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR",
  "JU", "LU", "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG",
  "TI", "UR", "VD", "VS", "ZG", "ZH",
] as const;

/** Project types for config modal */
export type ProjectType = "neuf" | "renovation" | "extension" | "amenagement";
