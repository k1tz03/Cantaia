// ═══════════════════════════════════════════════════════════════
// Cantaia — CFC dependency rules (Swiss construction sequence)
//
// Rewritten against the canonical CFC registry (cfc-registry.ts).
// The previous rule set contained TWO dependency cycles
//   232 → 271 → 273 → 285 → 232      (élec → chapes → cloisons → peinture → élec)
//   251 → 271 → 281 → 285 → 251
// which the CPM silently swallowed by appending the stranded tasks at
// the end of the topological order — producing plausible-looking but
// meaningless dates. Cycles are now a hard error at module load.
//
// Lag units are EXPLICIT: curing times are calendar days, coordination
// offsets are working days. Conversion happens once, at the CPM boundary.
// ═══════════════════════════════════════════════════════════════

import { CURING_LAGS, calendarToWorkingDays, type LagUnit } from './lags';
import { isUnderCfc, cfcFamily } from './cfc-registry';

// ============================================================================
// Types
// ============================================================================

export interface DependencyRule {
  /** Canonical CFC code (or family prefix) of the predecessor activity */
  from_cfc: string;
  /** Canonical CFC code (or family prefix) of the successor activity */
  to_cfc: string;
  /** FS=Finish-to-Start, SS=Start-to-Start, FF=Finish-to-Finish, SF=Start-to-Finish */
  type: 'FS' | 'SS' | 'FF' | 'SF';
  /** Lag value, expressed in `lag_unit` */
  lag: number;
  /** Unit of `lag` — curing times are calendar, coordination offsets are working */
  lag_unit: LagUnit;
  /** Human-readable rationale (shown in the Gantt tooltip / audit log) */
  description: string;
}

// ============================================================================
// Rules
// ============================================================================

export const DEPENDENCY_RULES: DependencyRule[] = [
  // ── Préparation ────────────────────────────────────────────────────────────
  { from_cfc: '113', to_cfc: '112', type: 'SS', lag: 0, lag_unit: 'working',
    description: 'Demolition apres mise en place des installations de chantier' },
  { from_cfc: '112', to_cfc: '201', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Excavation apres demolition / deconstruction' },
  { from_cfc: '117', to_cfc: '201', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Excavation apres blindage / soutenement de la fouille' },
  { from_cfc: '201', to_cfc: '151', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Canalisations enterrees apres excavation' },
  { from_cfc: '201', to_cfc: '116', type: 'SS', lag: 2, lag_unit: 'working',
    description: 'Evacuation des materiaux en continu des le debut de l excavation' },

  // ── Préparation → gros œuvre ──────────────────────────────────────────────
  { from_cfc: '201', to_cfc: '211.1', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Coffrage des fondations apres excavation du fond de fouille' },
  { from_cfc: '151', to_cfc: '211.3', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Radier coule apres passage des canalisations sous dalle' },
  { from_cfc: '211.6', to_cfc: '211.5', type: 'SS', lag: 0, lag_unit: 'working',
    description: 'Echafaudage monte avant la maconnerie en elevation' },

  // ── Gros œuvre interne ────────────────────────────────────────────────────
  { from_cfc: '211.1', to_cfc: '211.2', type: 'SS', lag: 2, lag_unit: 'working',
    description: 'Ferraillage pose au fur et a mesure du coffrage (decalage 2 j)' },
  { from_cfc: '211.2', to_cfc: '211.3', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Coulage du beton apres reception du ferraillage' },
  { from_cfc: '211.3', to_cfc: '211.5', type: 'SS', lag: 5, lag_unit: 'working',
    description: 'Maconnerie en elevation demarre sur les niveaux deja coules' },
  { from_cfc: '211.3', to_cfc: '216', type: 'FS', lag: CURING_LAGS.decoffrage, lag_unit: 'calendar',
    description: 'Pose des elements prefabriques apres decoffrage / montee en resistance' },
  { from_cfc: '211.3', to_cfc: '214', type: 'FS', lag: CURING_LAGS.decoffrage, lag_unit: 'calendar',
    description: 'Charpente bois posee apres decoffrage de la dalle porteuse (21 j calendaires)' },
  { from_cfc: '211.3', to_cfc: '215', type: 'FS', lag: CURING_LAGS.decoffrage, lag_unit: 'calendar',
    description: 'Charpente metallique montee apres decoffrage / scellement des platines' },
  { from_cfc: '211.3', to_cfc: '213', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Ouvrages en pierre naturelle apres structure porteuse' },

  // ── Gros œuvre → clos et couvert ──────────────────────────────────────────
  { from_cfc: '214', to_cfc: '224', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Couverture apres montage de la charpente bois' },
  { from_cfc: '215', to_cfc: '224', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Couverture apres montage de la charpente metallique' },
  { from_cfc: '211.3', to_cfc: '225', type: 'FS', lag: CURING_LAGS.decoffrage, lag_unit: 'calendar',
    description: 'Etancheite de toiture plate apres sechage du support beton' },
  { from_cfc: '224', to_cfc: '222', type: 'SS', lag: 2, lag_unit: 'working',
    description: 'Ferblanterie posee en accompagnement de la couverture' },
  { from_cfc: '224', to_cfc: '223', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Protection foudre apres couverture' },
  { from_cfc: '211.5', to_cfc: '221', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Pose des fenetres apres maconnerie des tableaux (hors d air)' },
  { from_cfc: '211.5', to_cfc: '227', type: 'FS', lag: 5, lag_unit: 'working',
    description: 'Isolation peripherique / bardage apres maconnerie' },
  { from_cfc: '227', to_cfc: '226', type: 'FS', lag: 3, lag_unit: 'working',
    description: 'Crepi de finition apres pose de l isolation peripherique' },
  { from_cfc: '221', to_cfc: '228', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Stores poses apres les fenetres' },

  // ── Hors d'air → techniques ───────────────────────────────────────────────
  { from_cfc: '221', to_cfc: '232', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Encastrements electriques une fois le batiment hors d air' },
  { from_cfc: '221', to_cfc: '235', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Courant faible une fois le batiment hors d air' },
  { from_cfc: '221', to_cfc: '253', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Conduites sanitaires encastrees une fois le batiment hors d air' },
  { from_cfc: '221', to_cfc: '243', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Gaines de ventilation une fois le batiment hors d air' },
  { from_cfc: '221', to_cfc: '241', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Production de chaleur installee une fois le local technique clos' },
  { from_cfc: '241', to_cfc: '242', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Distribution de chaleur apres mise en place de la production' },
  { from_cfc: '211.3', to_cfc: '261', type: 'SS', lag: 20, lag_unit: 'working',
    description: 'Montage ascenseur apres realisation de la gaine beton' },
  { from_cfc: '232', to_cfc: '231', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Raccordement du tableau apres tirage des cables' },
  { from_cfc: '232', to_cfc: '236', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Installations de securite apres cablage courant fort' },
  { from_cfc: '243', to_cfc: '244', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Climatisation apres reseau de ventilation' },
  { from_cfc: '244', to_cfc: '245', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Installations frigorifiques apres climatisation' },

  // ── Techniques → plâtrerie ────────────────────────────────────────────────
  { from_cfc: '232', to_cfc: '271', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Fermeture des cloisons apres encastrements electriques' },
  { from_cfc: '253', to_cfc: '271', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Fermeture des cloisons apres conduites sanitaires encastrees' },
  { from_cfc: '243', to_cfc: '271', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Fermeture des cloisons apres passage des gaines de ventilation' },
  { from_cfc: '242', to_cfc: '271', type: 'SS', lag: 5, lag_unit: 'working',
    description: 'Platrerie en parallele de la distribution de chaleur' },
  { from_cfc: '271', to_cfc: '277', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Cloisons systemes apres platrerie' },

  // ── Chape et séchages ─────────────────────────────────────────────────────
  { from_cfc: '242', to_cfc: '281.1', type: 'FS', lag: 3, lag_unit: 'working',
    description: 'Chape coulee apres pose et mise en pression du chauffage au sol' },
  { from_cfc: '271', to_cfc: '281.1', type: 'FS', lag: CURING_LAGS.joints_platre, lag_unit: 'calendar',
    description: 'Chape coulee apres montage des cloisons (joints secs)' },
  { from_cfc: '281.1', to_cfc: '281.2', type: 'FS', lag: CURING_LAGS.chape_ciment, lag_unit: 'calendar',
    description: 'Carrelage pose apres sechage de la chape (28 j calendaires — le lag le plus structurant du chantier)' },
  { from_cfc: '281.1', to_cfc: '281.3', type: 'FS', lag: CURING_LAGS.chape_ciment, lag_unit: 'calendar',
    description: 'Parquet / sol souple pose apres sechage complet de la chape' },
  { from_cfc: '271', to_cfc: '282', type: 'FS', lag: CURING_LAGS.joints_platre, lag_unit: 'calendar',
    description: 'Faience murale apres sechage des joints de platre' },
  { from_cfc: '271', to_cfc: '283', type: 'FS', lag: CURING_LAGS.joints_platre, lag_unit: 'calendar',
    description: 'Faux-plafonds apres platrerie' },

  // ── Peinture (dernier corps d'état de finition) ───────────────────────────
  { from_cfc: '271', to_cfc: '285', type: 'FS', lag: CURING_LAGS.joints_platre, lag_unit: 'calendar',
    description: 'Peinture apres sechage des joints de plaques de platre (3 j calendaires)' },
  { from_cfc: '283', to_cfc: '285', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Peinture apres pose des faux-plafonds' },
  { from_cfc: '281.2', to_cfc: '285', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Peinture apres pose du carrelage (protection des sols)' },
  { from_cfc: '281.3', to_cfc: '285', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Peinture apres pose des sols souples / parquet' },
  { from_cfc: '226', to_cfc: '285', type: 'FS', lag: CURING_LAGS.crepi_peinture, lag_unit: 'calendar',
    description: 'Mise en peinture apres sechage du crepi (14 j calendaires)' },

  // ── Appareillage final (après peinture) ───────────────────────────────────
  { from_cfc: '285', to_cfc: '233', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Pose des luminaires apres peinture' },
  { from_cfc: '285', to_cfc: '251', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Pose des appareils sanitaires apres peinture' },
  { from_cfc: '285', to_cfc: '273', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Menuiserie interieure / portes posees apres peinture' },
  { from_cfc: '285', to_cfc: '258', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Agencement de cuisine apres peinture' },
  { from_cfc: '285', to_cfc: '272', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Serrurerie interieure (garde-corps) apres peinture' },
  { from_cfc: '273', to_cfc: '275', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Systeme de verrouillage apres pose des portes' },

  // ── Nettoyage de réception ────────────────────────────────────────────────
  { from_cfc: '233', to_cfc: '287', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Nettoyage final apres appareillage electrique' },
  { from_cfc: '251', to_cfc: '287', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Nettoyage final apres pose des appareils sanitaires' },
  { from_cfc: '258', to_cfc: '287', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Nettoyage final apres agencement de cuisine' },
  { from_cfc: '275', to_cfc: '287', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Nettoyage final apres bouclement de la serrurerie' },
  { from_cfc: '261', to_cfc: '287', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Nettoyage final apres reception de l ascenseur' },

  // ── Aménagements extérieurs ───────────────────────────────────────────────
  { from_cfc: '226', to_cfc: '411', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Amenagements exterieurs apres depose des echafaudages de facade' },
  { from_cfc: '227', to_cfc: '411', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Amenagements exterieurs apres finition de facade' },
  { from_cfc: '151', to_cfc: '411', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Revetements exterieurs apres remblai des canalisations' },
  { from_cfc: '411', to_cfc: '421', type: 'FS', lag: 0, lag_unit: 'working',
    description: 'Plantations apres realisation des revetements et bordures' },
];

// ============================================================================
// Cycle detection — runs once at module load
// ============================================================================

export class DependencyCycleError extends Error {
  readonly cycle: string[];
  constructor(cycle: string[]) {
    super(
      `[dependency-rules] Cycle detected in the CFC dependency graph: ${cycle.join(' -> ')}. ` +
      'A construction sequence cannot loop — fix DEPENDENCY_RULES before shipping.',
    );
    this.name = 'DependencyCycleError';
    this.cycle = cycle;
  }
}

/**
 * Detect a cycle in a rule set. Returns the cycle path, or null when the
 * graph is a DAG.
 *
 * Note: SS/FF edges between two activities are NOT true precedence cycles in
 * CPM terms when they run in opposite directions, but the forward pass still
 * needs a topological order, so we treat every edge as a precedence edge.
 */
export function findRuleCycle(rules: DependencyRule[] = DEPENDENCY_RULES): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const r of rules) {
    if (!adjacency.has(r.from_cfc)) adjacency.set(r.from_cfc, []);
    adjacency.get(r.from_cfc)!.push(r.to_cfc);
    if (!adjacency.has(r.to_cfc)) adjacency.set(r.to_cfc, []);
  }

  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const node of adjacency.keys()) color.set(node, WHITE);
  const stack: string[] = [];

  function visit(node: string): string[] | null {
    color.set(node, GREY);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GREY) {
        const idx = stack.indexOf(next);
        return [...stack.slice(idx), next];
      }
      if (c === WHITE) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const node of adjacency.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  }
  return null;
}

/** Throws DependencyCycleError when the rule set is not a DAG. */
export function assertNoRuleCycles(rules: DependencyRule[] = DEPENDENCY_RULES): void {
  const cycle = findRuleCycle(rules);
  if (cycle) throw new DependencyCycleError(cycle);
}

// Fail fast: a cyclic rule set silently corrupts every schedule.
assertNoRuleCycles();

// ============================================================================
// Lookup helpers
// ============================================================================

/** Resolve a rule's lag to WORKING days (the CPM's unit). */
export function ruleLagInWorkingDays(rule: DependencyRule, workingDaysPerWeek = 5): number {
  return rule.lag_unit === 'calendar'
    ? calendarToWorkingDays(rule.lag, workingDaysPerWeek)
    : Math.round(rule.lag);
}

/**
 * Rules whose predecessor matches the given canonical CFC code.
 *
 * A rule on "211" fires for "211.3". When the task carries only the bare
 * family code ("211" — a lumped gros-œuvre lot), the rules of its sub-codes
 * are used instead, minus the intra-family ones (211.1 → 211.2 would
 * otherwise become a self-edge).
 */
export function findDependenciesFrom(cfc_code: string): DependencyRule[] {
  const direct = DEPENDENCY_RULES.filter((r) => isUnderCfc(cfc_code, r.from_cfc));
  if (direct.length > 0 || cfc_code.includes('.')) return direct;
  return DEPENDENCY_RULES.filter(
    (r) => isUnderCfc(r.from_cfc, cfc_code) && cfcFamily(r.to_cfc) !== cfc_code,
  );
}

/** Rules whose successor matches the given canonical CFC code (same family fallback). */
export function findDependenciesTo(cfc_code: string): DependencyRule[] {
  const direct = DEPENDENCY_RULES.filter((r) => isUnderCfc(cfc_code, r.to_cfc));
  if (direct.length > 0 || cfc_code.includes('.')) return direct;
  return DEPENDENCY_RULES.filter(
    (r) => isUnderCfc(r.to_cfc, cfc_code) && cfcFamily(r.from_cfc) !== cfc_code,
  );
}

/** The rule linking two canonical CFC codes, if any. */
export function findDependencyBetween(from_cfc: string, to_cfc: string): DependencyRule | null {
  return DEPENDENCY_RULES.find(
    (r) => isUnderCfc(from_cfc, r.from_cfc) && isUnderCfc(to_cfc, r.to_cfc),
  ) ?? null;
}

/**
 * Major CFC group of a detailed code ("211.3.1" → "211").
 * @deprecated prefer cfcFamily() from cfc-registry.
 */
export function getMajorCfcGroup(cfc_code: string): string {
  const match = cfc_code.match(/^(\d{1,3})/);
  return match ? match[1] : cfc_code;
}
