// ═══════════════════════════════════════════════════════════════
// Cantaia — Lags: curing times and procurement lead times
//
// IMPORTANT — units.
// Curing / drying times are physical: they run in CALENDAR days
// (concrete cures on Sundays too). The CPM works in WORKING days.
// The conversion is explicit and happens ONCE, at the CPM boundary,
// via calendarToWorkingDays(). Before this module the two units were
// silently conflated, inflating every drying lag by ~40 %.
// ═══════════════════════════════════════════════════════════════

/** Unit a dependency lag is expressed in. */
export type LagUnit = 'calendar' | 'working';

/** Physical curing / drying times, in CALENDAR days. */
export const CURING_LAGS = {
  /** Décoffrage + montée en résistance avant charge (béton armé) */
  decoffrage: 21,
  /** Séchage chape ciment avant pose d'un revêtement collé */
  chape_ciment: 28,
  /** Séchage chape anhydrite (fluide) */
  chape_anhydrite: 7,
  /** Mise en chauffe / protocole de séchage plancher chauffant */
  mise_en_chauffe: 21,
  /** Séchage des joints de plaques de plâtre avant peinture */
  joints_platre: 3,
  /** Séchage crépi de façade avant mise en peinture / finition */
  crepi_peinture: 14,
  /** Prise de la colle carrelage avant jointoiement / circulation */
  colle_carrelage: 3,
} as const;

export type CuringLagKey = keyof typeof CURING_LAGS;

/**
 * Convert calendar days to working days.
 *
 * A construction week has 5 working days out of 7 calendar days, so a
 * 28-calendar-day cure is 20 working days — NOT 28. Rounding is to the
 * nearest day; a positive calendar lag never converts to 0.
 */
export function calendarToWorkingDays(calendarDays: number, workingDaysPerWeek = 5): number {
  if (!Number.isFinite(calendarDays) || calendarDays === 0) return 0;
  const sign = calendarDays < 0 ? -1 : 1;
  const magnitude = Math.abs(calendarDays);
  const converted = Math.round((magnitude * workingDaysPerWeek) / 7);
  return sign * Math.max(1, converted);
}

/** Inverse conversion (working → calendar), used for display only. */
export function workingToCalendarDays(workingDays: number, workingDaysPerWeek = 5): number {
  if (!Number.isFinite(workingDays) || workingDays === 0) return 0;
  return Math.round((workingDays * 7) / workingDaysPerWeek);
}

// ============================================================================
// Procurement
// ============================================================================

/**
 * Supplier lead times in WEEKS, keyed on canonical CFC codes
 * (see cfc-registry.ts). These are order-to-delivery times for Swiss
 * suppliers on a standard residential / small commercial project.
 *
 * They are the reason a schedule that ignores procurement is fantasy:
 * on a villa, the windows (10 weeks) drive "hors d'air", not the mason.
 */
export const PROCUREMENT_LEAD_TIMES: Record<string, number> = {
  '214': 8,    // Charpente bois — fabrication en atelier
  '215': 10,   // Charpente métallique — calepinage + fabrication
  '216': 8,    // Éléments préfabriqués béton
  '221': 10,   // Fenêtres et portes extérieures
  '224': 4,    // Couverture — tuiles
  '225': 4,    // Étanchéité — membranes / isolants spéciaux
  '227': 8,    // Façade ventilée / panneaux
  '228': 8,    // Stores, protections solaires
  '231': 6,    // Tableaux électriques
  '241': 12,   // Production de chaleur — PAC / chaudière
  '243': 10,   // Ventilation — monobloc
  '251': 6,    // Appareils sanitaires
  '258': 12,   // Agencement de cuisine
  '261': 16,   // Ascenseur
  '272': 6,    // Serrurerie — garde-corps sur mesure
  '273': 8,    // Menuiserie intérieure sur mesure
  '281.2': 5,  // Carrelage — approvisionnement lot
  '281.3': 4,  // Parquet
};

/** Lead time in weeks for a canonical CFC code (sub-code falls back to family). */
export function getProcurementLeadWeeks(cfcCode: string | null): number | null {
  if (!cfcCode) return null;
  if (PROCUREMENT_LEAD_TIMES[cfcCode] != null) return PROCUREMENT_LEAD_TIMES[cfcCode];
  const family = cfcCode.replace(/\..*/, '');
  return PROCUREMENT_LEAD_TIMES[family] ?? null;
}

/** Lead time expressed in working days (5-day weeks). */
export function getProcurementLeadWorkingDays(cfcCode: string | null): number | null {
  const weeks = getProcurementLeadWeeks(cfcCode);
  return weeks == null ? null : weeks * 5;
}
