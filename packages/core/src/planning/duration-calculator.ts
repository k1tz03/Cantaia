// ═══════════════════════════════════════════════════════════════
// Cantaia — Duration calculator
// Turns quantities + CFC codes into working-day durations, with
// productivity ratios, seasonality, project type and regional effects.
//
// Fixes applied (audit D4):
//   - seasonality now applies on ALL three ratio sources, not only CRB
//   - the seasonal month is the TASK's real start month (the generator
//     iterates calculate → CPM → recalculate), not the project's
//   - working-day arithmetic honours a Swiss calendar (holidays +
//     vacances du bâtiment) instead of week-ends only
//   - org calibrations apply as a DAMPED multiplier on the CRB ratio
//     instead of replacing it outright
// ═══════════════════════════════════════════════════════════════

import {
  findProductivityRatio,
  getSeasonalFactorForCfc,
} from './productivity-ratios';
import { REGIONAL_COEFFICIENTS } from '../plans/estimation/reference-data/regional-coefficients';
import { isWorkingDay, type WorkingCalendar } from './swiss-calendar';

// ============================================================================
// Types
// ============================================================================

/**
 * A calibration learnt from a closed project.
 *
 * `correction_factor` is the preferred form: it multiplies the CRB ratio
 * (0.8 = the org is 20 % slower than CRB). `corrected_ratio` is the legacy
 * absolute form, kept for rows written before migration 094.
 */
export interface OrgCorrection {
  cfc_code: string;
  corrected_ratio: number;
  original_ratio?: number;
  /** Damped multiplier applied to the reference ratio (preferred) */
  correction_factor?: number;
  /** Number of observations behind the factor */
  samples?: number;
}

export interface DurationParams {
  quantity: number;
  unit: string;
  cfc_code: string;
  team_size: number;
  /** Date the task actually starts — drives seasonality */
  start_date: Date;
  project_type: 'new' | 'renovation' | 'extension' | 'interior';
  canton?: string;
  /** Organization calibrations from planning_duration_corrections */
  org_corrections?: OrgCorrection[];
}

export interface DurationResult {
  /** Final calculated duration in working days */
  duration_days: number;
  /** Duration before adjustments (quantity / productivity / team_size) */
  base_duration_days: number;
  /** Productivity ratio used (units per day per default team) */
  productivity_ratio: number;
  /** Source of the productivity ratio */
  productivity_source: 'org_calibrated' | 'crb_2025' | 'ai_estimate';
  /** Breakdown of all adjustment factors applied */
  adjustment_factors: Record<string, number>;
}

// ============================================================================
// Project type complexity multipliers
// ============================================================================

const PROJECT_TYPE_FACTORS: Record<string, number> = {
  'new': 1.00,
  'renovation': 1.35,   // demolition, surprises, access constraints
  'extension': 1.20,    // interface with the existing building
  'interior': 1.10,     // occupied building
};

/** Calibration multipliers are never allowed outside this band. */
export const CALIBRATION_FACTOR_BOUNDS = { min: 0.5, max: 2.0 } as const;

export function clampCalibrationFactor(factor: number): number {
  if (!Number.isFinite(factor) || factor <= 0) return 1;
  return Math.min(CALIBRATION_FACTOR_BOUNDS.max, Math.max(CALIBRATION_FACTOR_BOUNDS.min, factor));
}

// ============================================================================
// Main calculator
// ============================================================================

export function calculateDuration(params: DurationParams): DurationResult {
  const {
    quantity,
    unit,
    cfc_code,
    team_size,
    start_date,
    project_type,
    canton,
    org_corrections,
  } = params;

  const adjustmentFactors: Record<string, number> = {};

  // ── Step 1: reference productivity ratio (CRB) ────────────────────────────
  const ratioEntry = findProductivityRatio(cfc_code, unit);

  let productivityRatio: number;
  let productivitySource: DurationResult['productivity_source'];
  let defaultTeamSize: number;

  if (ratioEntry) {
    productivityRatio = ratioEntry.productivity_per_day;
    productivitySource = 'crb_2025';
    defaultTeamSize = ratioEntry.team_size_default;
  } else {
    productivityRatio = estimateFallbackProductivity(unit);
    productivitySource = 'ai_estimate';
    defaultTeamSize = 2;
  }

  // ── Step 2: organization calibration (damped multiplier) ──────────────────
  const orgCorrection = org_corrections?.find(
    (c) => c.cfc_code === cfc_code || cfc_code.startsWith(c.cfc_code + '.'),
  );

  if (orgCorrection) {
    let factor: number | null = null;

    if (orgCorrection.correction_factor != null) {
      factor = clampCalibrationFactor(orgCorrection.correction_factor);
    } else if (orgCorrection.original_ratio) {
      factor = clampCalibrationFactor(orgCorrection.corrected_ratio / orgCorrection.original_ratio);
    }

    if (factor != null && factor !== 1) {
      productivityRatio = productivityRatio * factor;
      productivitySource = 'org_calibrated';
      adjustmentFactors['org_calibration'] = Math.round(factor * 1000) / 1000;
    } else if (factor == null && orgCorrection.corrected_ratio > 0) {
      // Legacy absolute row without original_ratio: use as-is.
      productivityRatio = orgCorrection.corrected_ratio;
      productivitySource = 'org_calibrated';
    }
  }

  // ── Step 3: seasonality — applies on EVERY source ─────────────────────────
  const seasonalFactor = getSeasonalFactorForCfc(cfc_code, start_date.getMonth());

  if (seasonalFactor !== 1.0) {
    adjustmentFactors['seasonal'] = Math.round(seasonalFactor * 1000) / 1000;
  }

  // ── Step 4: team size (Brooks' law lite) ──────────────────────────────────
  const teamRatio = team_size / defaultTeamSize;
  const effectiveTeamMultiplier = teamRatio <= 1
    ? teamRatio
    : 1 + (teamRatio - 1) * 0.75;

  const effectiveProductivity = productivityRatio * effectiveTeamMultiplier;
  const baseDurationDays = effectiveProductivity > 0
    ? quantity / effectiveProductivity
    : quantity;

  if (teamRatio !== 1.0) {
    adjustmentFactors['team_size'] = Math.round(effectiveTeamMultiplier * 1000) / 1000;
  }

  // Seasonal factor lowers productivity → raises duration
  let adjustedDays = baseDurationDays / (seasonalFactor || 1);

  // ── Step 5: project type ──────────────────────────────────────────────────
  const projectTypeFactor = PROJECT_TYPE_FACTORS[project_type] ?? 1.0;
  if (projectTypeFactor !== 1.0) {
    adjustmentFactors['project_type'] = projectTypeFactor;
    adjustedDays = adjustedDays * projectTypeFactor;
  }

  // ── Step 6: regional coefficient ──────────────────────────────────────────
  if (canton) {
    const cantonKey = normalizeCantonName(canton);
    const regionalCoeff = REGIONAL_COEFFICIENTS[cantonKey];
    if (regionalCoeff && regionalCoeff !== 1.0) {
      // Duration is far less regionally sensitive than cost: damp the effect.
      const durationRegionalFactor = 1 + (regionalCoeff - 1) * 0.3;
      adjustmentFactors['regional'] = Math.round(durationRegionalFactor * 1000) / 1000;
      adjustedDays = adjustedDays * durationRegionalFactor;
    }
  }

  return {
    duration_days: Math.max(1, Math.ceil(adjustedDays)),
    base_duration_days: Math.round(baseDurationDays * 100) / 100,
    productivity_ratio: Math.round(productivityRatio * 1000) / 1000,
    productivity_source: productivitySource,
    adjustment_factors: adjustmentFactors,
  };
}

// ============================================================================
// Working-day arithmetic (calendar-aware)
// ============================================================================

/**
 * Add working days to a date.
 *
 * Skips week-ends always, and — when a calendar is supplied — Swiss public
 * holidays and company closure periods (vacances du bâtiment). The calendar
 * argument is optional so every existing call site keeps working.
 */
export function addWorkingDays(
  start: Date,
  workingDays: number,
  calendar?: WorkingCalendar | null,
): Date {
  const result = new Date(start);
  let remaining = Math.max(0, Math.round(workingDays));
  // Hard stop: 20 years of calendar days. Protects against a pathological
  // calendar that marks every day non-working.
  let guard = 7300;

  while (remaining > 0 && guard-- > 0) {
    result.setDate(result.getDate() + 1);
    if (isWorkingDay(result, calendar)) remaining--;
  }

  return result;
}

/** Count working days between two dates (exclusive of the start date). */
export function countWorkingDays(
  start: Date,
  end: Date,
  calendar?: WorkingCalendar | null,
): number {
  let count = 0;
  const current = new Date(start);
  let guard = 7300;

  while (current < end && guard-- > 0) {
    current.setDate(current.getDate() + 1);
    if (current <= end && isWorkingDay(current, calendar)) count++;
  }

  return count;
}

// ============================================================================
// Helpers
// ============================================================================

/** Fallback productivity when no CRB reference matches the code/unit. */
function estimateFallbackProductivity(unit: string): number {
  const u = (unit || '').toLowerCase().replace(/²/g, '2').replace(/³/g, '3').trim();
  switch (u) {
    case 'm2':  return 15;
    case 'm3':  return 20;
    case 'ml':
    case 'm':   return 25;
    case 'pce':
    case 'st':
    case 'u':   return 5;
    case 'kg':  return 200;
    case 't':   return 0.2;
    case 'h':   return 8;
    case 'f':
    case 'fft': return 0.2;
    case 'postes':
    case 'poste': return 0.5;
    default:    return 8;
  }
}

/** Normalize canton name to a REGIONAL_COEFFICIENTS key. */
function normalizeCantonName(canton: string): string {
  const normalized = canton.toLowerCase().trim()
    .replace(/[àâ]/g, 'a')
    .replace(/[éèê]/g, 'e')
    .replace(/[ùû]/g, 'u')
    .replace(/[ôö]/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ä/g, 'a');

  const CANTON_MAP: Record<string, string> = {
    'zh': 'zurich', 'zurich': 'zurich',
    'be': 'berne', 'bern': 'berne', 'berne': 'berne',
    'bs': 'bale', 'bl': 'bale', 'basel': 'bale', 'bale': 'bale',
    'ge': 'geneve', 'geneve': 'geneve', 'genf': 'geneve',
    'vd': 'vaud', 'vaud': 'vaud',
    'lausanne': 'lausanne',
    'vs': 'valais', 'valais': 'valais', 'wallis': 'valais',
    'fr': 'fribourg', 'fribourg': 'fribourg', 'freiburg': 'fribourg',
    'ne': 'neuchatel', 'neuchatel': 'neuchatel', 'neuenburg': 'neuchatel',
    'ti': 'tessin', 'tessin': 'tessin', 'ticino': 'tessin',
    'lu': 'lucerne', 'lucerne': 'lucerne', 'luzern': 'lucerne',
    'zg': 'zoug', 'zoug': 'zoug', 'zug': 'zoug',
    'sg': 'st-gall', 'st-gall': 'st-gall', 'saint-gall': 'st-gall',
    'tg': 'thurgovie', 'thurgovie': 'thurgovie', 'thurgau': 'thurgovie',
    'gr': 'grisons', 'grisons': 'grisons', 'graubunden': 'grisons',
    'ju': 'jura', 'jura': 'jura',
    'ag': 'argovie', 'argovie': 'argovie', 'aargau': 'argovie',
    'so': 'soleure', 'soleure': 'soleure', 'solothurn': 'soleure',
    'sh': 'schaffhouse', 'schaffhouse': 'schaffhouse',
    'ai': 'appenzell', 'ar': 'appenzell', 'appenzell': 'appenzell',
    'sz': 'schwyz', 'schwyz': 'schwyz',
    'ow': 'obwald', 'obwald': 'obwald',
    'nw': 'nidwald', 'nidwald': 'nidwald',
    'ur': 'uri', 'uri': 'uri',
    'gl': 'glaris', 'glaris': 'glaris',
  };

  return CANTON_MAP[normalized] ?? normalized;
}
