// ═══════════════════════════════════════════════════════════════
// Cantaia Gantt — Duration Calculator
// Calculates realistic task durations from quantities, CFC codes,
// productivity ratios, seasonal factors, and regional coefficients.
// ═══════════════════════════════════════════════════════════════

import { findProductivityRatio, getSeasonalFactor } from './productivity-ratios';
import { REGIONAL_COEFFICIENTS } from '../plans/estimation/reference-data/regional-coefficients';

// ============================================================================
// Types
// ============================================================================

export interface DurationParams {
  quantity: number;
  unit: string;
  cfc_code: string;
  team_size: number;
  start_date: Date;
  project_type: 'new' | 'renovation' | 'extension' | 'interior';
  canton?: string;
  /** Organization-specific corrections from planning_duration_corrections table */
  org_corrections?: Array<{ cfc_code: string; corrected_ratio: number }>;
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
  'renovation': 1.35,   // Renovation is ~35% slower (demolition, surprises, access constraints)
  'extension': 1.20,    // Extension is ~20% slower (interface with existing)
  'interior': 1.10,     // Interior fit-out is ~10% slower (occupied building)
};

// ============================================================================
// Main calculator
// ============================================================================

/**
 * Calculate the duration in working days for a construction task.
 *
 * Algorithm:
 * 1. Find productivity ratio (org corrections > CRB 2025 > fallback estimate)
 * 2. base_days = quantity / (productivity_per_day * team_ratio)
 * 3. Apply seasonal factor based on start_date month
 * 4. Apply project type factor (renovation slower than new-build)
 * 5. Apply regional coefficient (optional, canton-based)
 * 6. Round up to nearest integer (minimum 1 day)
 */
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

  // ── Step 1: Find productivity ratio ──
  let productivityRatio: number;
  let productivitySource: 'org_calibrated' | 'crb_2025' | 'ai_estimate';
  let defaultTeamSize: number;

  // 1a. Check organization-specific corrections first
  const orgCorrection = org_corrections?.find((c) => {
    // Exact match or prefix match
    return c.cfc_code === cfc_code || cfc_code.startsWith(c.cfc_code + '.');
  });

  if (orgCorrection) {
    productivityRatio = orgCorrection.corrected_ratio;
    productivitySource = 'org_calibrated';
    defaultTeamSize = team_size; // Use provided team size
  } else {
    // 1b. Look up from CRB 2025 reference data
    const ratioEntry = findProductivityRatio(cfc_code, unit);
    if (ratioEntry) {
      productivityRatio = ratioEntry.productivity_per_day;
      productivitySource = 'crb_2025';
      defaultTeamSize = ratioEntry.team_size_default;

      // Apply seasonal factor
      const month = start_date.getMonth(); // 0-indexed
      const seasonalFactor = getSeasonalFactor(ratioEntry, month);
      if (seasonalFactor !== 1.0) {
        adjustmentFactors['seasonal'] = seasonalFactor;
      }
    } else {
      // 1c. Fallback: rough estimate based on unit type
      productivityRatio = estimateFallbackProductivity(unit);
      productivitySource = 'ai_estimate';
      defaultTeamSize = 2;
    }
  }

  // ── Step 2: Base duration ──
  // Adjust for team size relative to default: more people = faster
  const teamRatio = team_size / defaultTeamSize;
  // Diminishing returns: doubling team doesn't halve time (Brooks' law lite)
  const effectiveTeamMultiplier = teamRatio <= 1
    ? teamRatio
    : 1 + (teamRatio - 1) * 0.75; // 75% efficiency for extra workers

  const effectiveProductivity = productivityRatio * effectiveTeamMultiplier;
  const baseDurationDays = quantity / effectiveProductivity;

  if (teamRatio !== 1.0) {
    adjustmentFactors['team_size'] = effectiveTeamMultiplier;
  }

  // ── Step 3: Apply seasonal factor (already captured above for CRB source) ──
  let adjustedDays = baseDurationDays;
  const seasonalFactor = adjustmentFactors['seasonal'] ?? 1.0;
  // Seasonal factor reduces productivity → increases duration
  adjustedDays = adjustedDays / seasonalFactor;

  // ── Step 4: Project type factor ──
  const projectTypeFactor = PROJECT_TYPE_FACTORS[project_type] ?? 1.0;
  if (projectTypeFactor !== 1.0) {
    adjustmentFactors['project_type'] = projectTypeFactor;
    adjustedDays = adjustedDays * projectTypeFactor;
  }

  // ── Step 5: Regional coefficient ──
  if (canton) {
    const cantonKey = normalizeCantonName(canton);
    const regionalCoeff = REGIONAL_COEFFICIENTS[cantonKey];
    if (regionalCoeff && regionalCoeff !== 1.0) {
      // Higher regional coefficient = higher cost region = slightly slower (labor scarcity)
      // The effect on duration is smaller than on cost: use sqrt scaling
      const durationRegionalFactor = 1 + (regionalCoeff - 1) * 0.3;
      adjustmentFactors['regional'] = durationRegionalFactor;
      adjustedDays = adjustedDays * durationRegionalFactor;
    }
  }

  // ── Step 6: Round up, minimum 1 day ──
  const finalDays = Math.max(1, Math.ceil(adjustedDays));

  return {
    duration_days: finalDays,
    base_duration_days: Math.round(baseDurationDays * 100) / 100,
    productivity_ratio: productivityRatio,
    productivity_source: productivitySource,
    adjustment_factors: adjustmentFactors,
  };
}

// ============================================================================
// Add working days to a date (skips weekends)
// ============================================================================

/**
 * Add a number of working days to a date, skipping Saturdays and Sundays.
 * Swiss public holidays are NOT handled (would require canton-specific calendar).
 */
export function addWorkingDays(start: Date, workingDays: number): Date {
  const result = new Date(start);
  let remaining = workingDays;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }

  return result;
}

/**
 * Count working days between two dates (exclusive of end date).
 */
export function countWorkingDays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);

  while (current < end) {
    current.setDate(current.getDate() + 1);
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      count++;
    }
  }

  return count;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Fallback productivity estimate when no CRB reference is found.
 * Based on broad unit categories.
 */
function estimateFallbackProductivity(unit: string): number {
  const u = unit.toLowerCase().replace(/²/g, '2').replace(/³/g, '3');
  switch (u) {
    case 'm2':  return 10;   // ~10 m² per day (generic surface work)
    case 'm3':  return 15;   // ~15 m³ per day (generic volume work)
    case 'ml':
    case 'm':   return 20;   // ~20 ml per day (generic linear work)
    case 'pce':
    case 'st':  return 4;    // ~4 pieces per day (generic)
    case 'kg':  return 200;  // ~200 kg per day (generic)
    case 'h':   return 8;    // ~8 hours per day = 1 FTE day
    case 'f':   return 1;    // 1 forfait per day
    default:    return 5;    // very conservative default
  }
}

/**
 * Normalize canton name to match REGIONAL_COEFFICIENTS keys.
 * Handles common French/German names and abbreviations.
 */
function normalizeCantonName(canton: string): string {
  const normalized = canton.toLowerCase().trim()
    .replace(/[àâ]/g, 'a')
    .replace(/[éèê]/g, 'e')
    .replace(/[ùû]/g, 'u')
    .replace(/[ôö]/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ä/g, 'a');

  // Map common abbreviations and alternative names
  const CANTON_MAP: Record<string, string> = {
    'zh': 'zurich', 'zurich': 'zurich', 'zürich': 'zurich',
    'be': 'berne', 'bern': 'berne', 'berne': 'berne',
    'bs': 'bale', 'bl': 'bale', 'basel': 'bale', 'bale': 'bale', 'bâle': 'bale',
    'ge': 'geneve', 'geneve': 'geneve', 'genf': 'geneve',
    'vd': 'vaud', 'vaud': 'vaud',
    'lausanne': 'lausanne',
    'vs': 'valais', 'valais': 'valais', 'wallis': 'valais',
    'fr': 'fribourg', 'fribourg': 'fribourg', 'freiburg': 'fribourg',
    'ne': 'neuchatel', 'neuchatel': 'neuchatel', 'neuenburg': 'neuchatel',
    'ti': 'tessin', 'tessin': 'tessin', 'ticino': 'tessin',
    'lu': 'lucerne', 'lucerne': 'lucerne', 'luzern': 'lucerne',
    'zg': 'zoug', 'zoug': 'zoug', 'zug': 'zoug',
    'sg': 'st-gall', 'st-gall': 'st-gall', 'st. gallen': 'st-gall', 'saint-gall': 'st-gall',
    'tg': 'thurgovie', 'thurgovie': 'thurgovie', 'thurgau': 'thurgovie',
    'gr': 'grisons', 'grisons': 'grisons', 'graubunden': 'grisons',
    'ju': 'jura', 'jura': 'jura',
    'ag': 'argovie', 'argovie': 'argovie', 'aargau': 'argovie',
    'so': 'soleure', 'soleure': 'soleure', 'solothurn': 'soleure',
    'sh': 'schaffhouse', 'schaffhouse': 'schaffhouse', 'schaffhausen': 'schaffhouse',
    'ai': 'appenzell', 'ar': 'appenzell', 'appenzell': 'appenzell',
    'sz': 'schwyz', 'schwyz': 'schwyz',
    'ow': 'obwald', 'obwald': 'obwald', 'obwalden': 'obwald',
    'nw': 'nidwald', 'nidwald': 'nidwald', 'nidwalden': 'nidwald',
    'ur': 'uri', 'uri': 'uri',
    'gl': 'glaris', 'glaris': 'glaris', 'glarus': 'glaris',
  };

  return CANTON_MAP[normalized] ?? normalized;
}
