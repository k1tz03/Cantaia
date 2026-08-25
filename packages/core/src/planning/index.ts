export {
  generatePlanning,
  generatePlanningFromItems,
  rescheduleCPM,
  dampenCalibrationFactor,
  OrphanTaskError,
} from "./planning-generator";
export type {
  PlanningConfig,
  GeneratedPlanning,
  GeneratedPhase,
  GeneratedTask,
  GeneratedDependency,
  AIValidationResult,
  AIMissingDependency,
  AIRisk,
  AIRecommendation,
  AIProcurementItem,
  RescheduleOptions,
  RescheduleResult,
} from "./planning-generator";

export {
  calculateDuration,
  addWorkingDays,
  countWorkingDays,
  clampCalibrationFactor,
  CALIBRATION_FACTOR_BOUNDS,
} from "./duration-calculator";
export type { DurationParams, DurationResult, OrgCorrection } from "./duration-calculator";

export { calculateCriticalPath, analyzeCriticalPath } from "./critical-path";
export type {
  CriticalPathAnalysis,
  TaskSchedule,
  PlanningTask as CpmPlanningTask,
  PlanningDependency as CpmPlanningDependency,
} from "./critical-path";

export {
  findProductivityRatio,
  getSeasonalFactor,
  getSeasonalFactorForCfc,
  seasonOfMonth,
  PRODUCTIVITY_RATIOS,
  EXPOSURE_SEASONAL_DEFAULTS,
} from "./productivity-ratios";
export type { ProductivityRatio, Season } from "./productivity-ratios";

export {
  DEPENDENCY_RULES,
  findDependencyBetween,
  findDependenciesFrom,
  findDependenciesTo,
  ruleLagInWorkingDays,
  findRuleCycle,
  assertNoRuleCycles,
  DependencyCycleError,
  getMajorCfcGroup,
} from "./dependency-rules";
export type { DependencyRule } from "./dependency-rules";

// ── CFC registry — the single source of truth for trade codes ──────────────
export {
  CFC_REGISTRY,
  CFC_ALIASES,
  SIA_PHASE_DEFS,
  resolveCfc,
  canonicalCfc,
  getCfcEntry,
  cfcFamily,
  isUnderCfc,
  getPhaseDef,
  getPhaseOrder,
  buildCfcPromptTable,
  listMaterialGroups,
  getUnresolvedCfcCount,
  resetUnresolvedCfcCount,
} from "./cfc-registry";
export type {
  CfcEntry,
  CfcResolution,
  CfcMatchKind,
  CfcExposure,
  SiaPhaseKey,
  SiaPhaseDefinition,
} from "./cfc-registry";

// ── Lags: curing times and procurement lead times ─────────────────────────
export {
  CURING_LAGS,
  PROCUREMENT_LEAD_TIMES,
  calendarToWorkingDays,
  workingToCalendarDays,
  getProcurementLeadWeeks,
  getProcurementLeadWorkingDays,
} from "./lags";
export type { LagUnit, CuringLagKey } from "./lags";

// ── Swiss working calendar ────────────────────────────────────────────────
export {
  buildSwissCalendar,
  weekendOnlyCalendar,
  defaultBuildingClosures,
  normalizeCantonCode,
  isWorkingDay,
  nextWorkingDay,
  nonWorkingReason,
  easterSunday,
  toIsoDate,
} from "./swiss-calendar";
export type { WorkingCalendar, CalendarClosure, BuildCalendarOptions } from "./swiss-calendar";
