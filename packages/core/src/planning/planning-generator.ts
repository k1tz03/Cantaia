// ═══════════════════════════════════════════════════════════════
// Cantaia — Planning generator
//
// Builds a construction schedule from a submission's items. Pure and
// deterministic: no AI call is required to produce the schedule.
//
// V3 — realism pass (audit distortions D1-D5):
//   D1  every task outside phase 1 has a predecessor (assertion enforced)
//   D2  one CFC vocabulary only — cfc-registry.ts
//   D3  one task per (phase, CFC) instead of per material_group, so the
//       screed → floor-covering drying lag becomes expressible
//   D4  Swiss calendar, per-task seasonality, procurement lead times,
//       crew-capacity levelling, weather buffer
//   D5  CPM re-run after the AI pass, reception milestone anchored on
//       max(EF), hors d'eau / hors d'air milestones, calendar lags
//       converted explicitly to working days
// ═══════════════════════════════════════════════════════════════

import {
  findProductivityRatio,
} from './productivity-ratios';
import {
  calculateDuration,
  addWorkingDays,
  type DurationResult,
  type OrgCorrection,
  clampCalibrationFactor,
} from './duration-calculator';
import { analyzeCriticalPath } from './critical-path';
import {
  findDependenciesFrom,
  ruleLagInWorkingDays,
  type DependencyRule,
} from './dependency-rules';
import {
  resolveCfc,
  getCfcEntry,
  getPhaseDef,
  getPhaseOrder,
  isUnderCfc,
  SIA_PHASE_DEFS,
  type SiaPhaseKey,
} from './cfc-registry';
import { getProcurementLeadWorkingDays } from './lags';
import {
  buildSwissCalendar,
  weekendOnlyCalendar,
  toIsoDate,
  type CalendarClosure,
  type WorkingCalendar,
} from './swiss-calendar';

// ============================================================================
// Public types
// ============================================================================

export interface PlanningConfig {
  /** Project start date (ISO YYYY-MM-DD) */
  start_date: string;
  /** Optional target end date (informational) */
  target_end_date?: string;
  /** Project type affects duration multipliers */
  project_type: 'new' | 'renovation' | 'extension' | 'interior';
  /** Canton — drives regional coefficient AND the public-holiday calendar */
  canton?: string;
  /** Free-text constraints (stored in ai_generation_log) */
  constraints?: string;
  /** Max simultaneous crews on site. Default 4. */
  max_concurrent_crews?: number;
  /** Company closure periods; `false` disables the Swiss defaults */
  building_closures?: CalendarClosure[] | false;
  /** Set false to schedule on week-ends-only (tests, non-CH projects) */
  use_swiss_calendar?: boolean;
  /** Set false to skip the "Commande {lot}" milestones */
  include_procurement_milestones?: boolean;
  /** Set false to skip the weather contingency task */
  include_weather_buffer?: boolean;
}

export interface GeneratedPhase {
  name: string;
  cfc_codes: string[];
  color: string;
  sort_order: number;
  start_date: string;
  end_date: string;
  tasks: GeneratedTask[];
}

export interface GeneratedTask {
  /** First source item (kept for backward compatibility) */
  submission_item_id: string | null;
  /** Every submission item aggregated into this task */
  source_item_ids: string[];
  name: string;
  description: string;
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
  team_size: number;
  progress: number;
  is_milestone: boolean;
  milestone_type: string | null;
  sort_order: number;
}

export interface GeneratedDependency {
  predecessor_index: number;   // sort_order of the predecessor
  successor_index: number;     // sort_order of the successor
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
  /** Lag in WORKING days (calendar lags are converted before they land here) */
  lag_days: number;
  source: 'auto' | 'manual' | 'rule';
}

export interface AIMissingDependency {
  from_task_id: string;
  to_task_id: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days: number;
  reason: string;
}

export interface AIRisk {
  title: string;
  probability: 'high' | 'medium' | 'low';
  impact_days: number;
  mitigation: string;
}

export interface AIRecommendation {
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
}

export interface AIProcurementItem {
  cfc_code: string | null;
  lot: string;
  order_by: string;
  lead_time_weeks: number;
  reason: string;
}

/**
 * AI validation output.
 *
 * NOTE — duration corrections were deliberately removed. The algorithm plus
 * the org calibration loop produce better durations than a language model
 * guessing from a task list, and the corrections were applied without
 * rescheduling, which made the whole pass decorative (audit distortion D5).
 * The AI now does what it is actually good at: contextual risks, a
 * procurement plan, and a written synthesis for the client.
 */
export interface AIValidationResult {
  missing_dependencies: AIMissingDependency[];
  risks: AIRisk[];
  recommendations: AIRecommendation[];
  procurement_plan: AIProcurementItem[];
  summary: string;
}

export interface GeneratedPlanning {
  title: string;
  phases: GeneratedPhase[];
  dependencies: GeneratedDependency[];
  calculated_end_date: string;
  critical_path_length: number;
  ai_generation_log: Record<string, unknown>;
  ai_validation?: AIValidationResult | null;
}

// ============================================================================
// Internal types
// ============================================================================

interface SubmissionItemInput {
  id: string;
  item_number: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  cfc_code: string | null;
  material_group: string;
}

interface UnitLot {
  unit: string;
  quantity: number;
  duration: number;
  itemIds: string[];
}

interface WorkTask {
  /** sort_order — also the CPM node id and the dependency index */
  index: number;
  phaseKey: SiaPhaseKey;
  cfcCode: string | null;
  name: string;
  description: string;
  sourceItemIds: string[];
  unitLots: UnitLot[];
  quantity: number | null;
  unit: string | null;
  duration: number;
  teamSize: number;
  productivityRatio: number | null;
  productivitySource: string | null;
  adjustmentFactors: Record<string, number> | null;
  baseDuration: number | null;
  isMilestone: boolean;
  milestoneType: string | null;
  earliestStart?: number;
  /** Weather-exposed trades feed the intemperie buffer */
  exposure: 'exterior' | 'sheltered' | 'interior';
  /** Procurement milestone only: the task whose delivery it gates */
  procurementTargetIndex?: number;
  /** Procurement milestone only: supplier lead time in working days */
  procurementLeadDays?: number;
  /** Scheduled dates, written by applySchedule() */
  startIso?: string;
  endIso?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Max duration of a single task before extra crews are assumed (working days) */
const MAX_TASK_DAYS = 60;
const MIN_TASK_DAYS = 1;

/**
 * Above this the schedule is merely FLAGGED, never compressed. A 24-month
 * site is a 24-month site; scaling it down to fit an arbitrary cap was the
 * single most dishonest line in the previous generator.
 */
const WARN_TOTAL_WORKING_DAYS = 750;

/** Default simultaneous crews on a Swiss residential site */
const DEFAULT_MAX_CONCURRENT_CREWS = 4;

/** Negative lags (overlaps) are allowed but bounded */
const MAX_NEGATIVE_LAG = -10;

/** Seasonality convergence passes (calculate → CPM → recalculate) */
const SEASONALITY_PASSES = 3;

/** Share of winter-exposed exterior work provisioned as weather contingency */
const WEATHER_BUFFER_RATIO = 0.15;
const WEATHER_BUFFER_MAX_DAYS = 20;

// ============================================================================
// Main generator (DB-backed)
// ============================================================================

export async function generatePlanning(params: {
  submission_id: string;
  project_id: string;
  org_id: string;
  config: PlanningConfig;
  supabase: any; // admin client
}): Promise<GeneratedPlanning> {
  const { submission_id, project_id, org_id, config, supabase } = params;

  const items = await fetchSubmissionItems(supabase, submission_id);
  if (items.length === 0) {
    throw new Error('Aucun poste trouve pour cette soumission');
  }

  let projectName = 'Projet';
  try {
    const { data: project } = await supabase
      .from('projects')
      .select('name')
      .eq('id', project_id)
      .single();
    if (project?.name) projectName = project.name;
  } catch { /* non-critical */ }

  const orgCorrections = await fetchOrgCorrections(supabase, org_id);

  return generatePlanningFromItems(items, config, projectName, orgCorrections);
}

// ============================================================================
// Pure generator (no DB — testable offline)
// ============================================================================

export function generatePlanningFromItems(
  items: SubmissionItemInput[],
  config: PlanningConfig,
  projectName: string,
  orgCorrections?: OrgCorrection[],
): GeneratedPlanning {
  const generationStart = Date.now();
  const logEntries: string[] = [];
  const log = (m: string) => { logEntries.push(m); };

  const startDate = parseIsoDate(config.start_date);
  const calendar = buildCalendarForConfig(config, startDate);
  log(`[planning] Start=${config.start_date} type=${config.project_type} canton=${config.canton ?? '-'} items=${items.length}`);
  log(`[planning] Calendrier: ${calendar.holidays.size} jours feries, ${calendar.closures.length} periodes de fermeture`);

  // ── Step 1: group items by (phase, canonical CFC) ─────────────────────────
  const groups = groupItemsByCfc(items, log);
  log(`[planning] ${groups.size} taches metier depuis ${items.length} postes (groupement phase+CFC)`);

  // ── Step 2: build the work tasks (durations, pass 0) ──────────────────────
  const tasks: WorkTask[] = [];
  let nextIndex = 0;

  const startMilestone: WorkTask = makeMilestone(nextIndex++, 'Debut de chantier', 'start', firstPhaseKey(groups));
  tasks.push(startMilestone);

  const workTasks: WorkTask[] = [];
  for (const group of sortGroups(groups)) {
    const task = buildWorkTask(nextIndex++, group, config, startDate, orgCorrections, log);
    tasks.push(task);
    workTasks.push(task);
  }

  if (workTasks.length === 0) {
    throw new Error('Aucune tache exploitable (postes sans quantite ni unite)');
  }

  // ── Step 3: dependencies ──────────────────────────────────────────────────
  const dependencies: GeneratedDependency[] = [];
  const depKeys = new Set<string>();

  const addDep = (
    predecessor: number,
    successor: number,
    type: GeneratedDependency['dependency_type'],
    lagWorkingDays: number,
    source: GeneratedDependency['source'],
  ): boolean => {
    if (predecessor === successor) return false;
    const key = `${predecessor}->${successor}`;
    if (depKeys.has(key)) return false;
    depKeys.add(key);
    dependencies.push({
      predecessor_index: predecessor,
      successor_index: successor,
      dependency_type: type,
      lag_days: Math.max(MAX_NEGATIVE_LAG, Math.round(lagWorkingDays)),
      source,
    });
    return true;
  };

  // 3a. CFC sequence rules
  let ruleDeps = 0;
  for (const from of workTasks) {
    if (!from.cfcCode) continue;
    const rules: DependencyRule[] = findDependenciesFrom(from.cfcCode);
    for (const rule of rules) {
      const successors = workTasks.filter(
        (t) => t.cfcCode && isUnderCfc(t.cfcCode, rule.to_cfc) && t.index !== from.index,
      );
      for (const to of successors) {
        if (addDep(from.index, to.index, rule.type, ruleLagInWorkingDays(rule, calendar.workingDaysPerWeek), 'rule')) {
          ruleDeps++;
        }
      }
    }
  }
  log(`[planning] ${ruleDeps} liens issus des regles CFC`);

  // 3b. D1 — phase chaining: every orphan in phase N+1 hangs off the LONGEST
  //     task of the previous non-empty phase.
  const phaseOrder = distinctPhasesInOrder(workTasks);
  const tasksByPhase = new Map<SiaPhaseKey, WorkTask[]>();
  for (const t of workTasks) {
    if (!tasksByPhase.has(t.phaseKey)) tasksByPhase.set(t.phaseKey, []);
    tasksByPhase.get(t.phaseKey)!.push(t);
  }

  const hasPredecessor = (index: number) =>
    dependencies.some((d) => d.successor_index === index);

  let chainDeps = 0;
  for (let p = 1; p < phaseOrder.length; p++) {
    const previous = tasksByPhase.get(phaseOrder[p - 1]) ?? [];
    const anchor = longestTask(previous);
    if (!anchor) continue;
    for (const task of tasksByPhase.get(phaseOrder[p]) ?? []) {
      if (hasPredecessor(task.index)) continue;
      if (addDep(anchor.index, task.index, 'FS', 0, 'auto')) chainDeps++;
    }
  }
  log(`[planning] ${chainDeps} liens de chainage de phase (filet D1)`);

  // 3c. First phase hangs off the start milestone
  for (const task of tasksByPhase.get(phaseOrder[0]) ?? []) {
    if (!hasPredecessor(task.index)) addDep(startMilestone.index, task.index, 'FS', 0, 'auto');
  }

  // 3d. Last-resort net — a lazily created phase-start milestone
  const phaseStartMilestones = new Map<SiaPhaseKey, WorkTask>();
  let netDeps = 0;
  for (let p = 1; p < phaseOrder.length; p++) {
    const phaseKey = phaseOrder[p];
    for (const task of tasksByPhase.get(phaseKey) ?? []) {
      if (hasPredecessor(task.index)) continue;

      let milestone = phaseStartMilestones.get(phaseKey);
      if (!milestone) {
        milestone = makeMilestone(
          nextIndex++,
          `Debut ${getPhaseDef(phaseKey).name}`,
          'phase_start',
          phaseKey,
        );
        tasks.push(milestone);
        phaseStartMilestones.set(phaseKey, milestone);

        const previous = tasksByPhase.get(phaseOrder[p - 1]) ?? [];
        const anchor = longestTask(previous);
        addDep(anchor ? anchor.index : startMilestone.index, milestone.index, 'FS', 0, 'auto');
      }

      if (addDep(milestone.index, task.index, 'FS', 0, 'auto')) netDeps++;
    }
  }
  if (netDeps > 0) log(`[planning] ${netDeps} liens depuis un jalon de debut de phase (filet de securite)`);

  // 3e. Procurement milestones — the differentiator: on a villa the windows
  //     (10 weeks) drive "hors d'air", not the mason.
  let procurementCount = 0;
  if (config.include_procurement_milestones !== false) {
    for (const task of [...workTasks]) {
      const leadDays = getProcurementLeadWorkingDays(task.cfcCode);
      if (!leadDays) continue;

      const milestone = makeMilestone(
        nextIndex++,
        `Commande ${task.name}`,
        'procurement',
        task.phaseKey,
      );
      milestone.cfcCode = task.cfcCode;
      milestone.procurementTargetIndex = task.index;
      milestone.procurementLeadDays = leadDays;
      milestone.description =
        `Delai fournisseur ${Math.round(leadDays / 5)} semaines — a commander pour tenir la pose`;
      tasks.push(milestone);

      addDep(startMilestone.index, milestone.index, 'FS', 0, 'auto');
      addDep(milestone.index, task.index, 'FS', leadDays, 'auto');
      procurementCount++;
    }
  }
  log(`[planning] ${procurementCount} jalons d'approvisionnement`);

  // 3f. Hors d'eau / hors d'air milestones
  const horsEauSources = workTasks.filter(
    (t) => t.cfcCode && (isUnderCfc(t.cfcCode, '224') || isUnderCfc(t.cfcCode, '225')),
  );
  const horsAirSources = workTasks.filter((t) => t.cfcCode && isUnderCfc(t.cfcCode, '221'));

  let horsEau: WorkTask | null = null;
  if (horsEauSources.length > 0) {
    horsEau = makeMilestone(nextIndex++, "Hors d'eau", 'hors_eau', 'clos_couvert');
    tasks.push(horsEau);
    for (const s of horsEauSources) addDep(s.index, horsEau.index, 'FS', 0, 'auto');
  }

  let horsAir: WorkTask | null = null;
  if (horsAirSources.length > 0) {
    horsAir = makeMilestone(nextIndex++, "Hors d'air", 'hors_air', 'clos_couvert');
    tasks.push(horsAir);
    for (const s of horsAirSources) addDep(s.index, horsAir.index, 'FS', 0, 'auto');
    if (horsEau) addDep(horsEau.index, horsAir.index, 'FS', 0, 'auto');
  }

  // 3g. Weather contingency task (duration set once the schedule is known)
  let weatherBuffer: WorkTask | null = null;
  if (config.include_weather_buffer !== false) {
    weatherBuffer = {
      index: nextIndex++,
      phaseKey: phaseOrder[phaseOrder.length - 1],
      cfcCode: null,
      name: 'Aleas meteo (SIA 118)',
      description: 'Provision intemperies dimensionnee sur l exposition hivernale des lots exterieurs',
      sourceItemIds: [],
      unitLots: [],
      quantity: null,
      unit: null,
      duration: 0,
      teamSize: 1,
      productivityRatio: null,
      productivitySource: 'buffer',
      adjustmentFactors: null,
      baseDuration: null,
      isMilestone: false,
      milestoneType: null,
      exposure: 'exterior',
    };
    tasks.push(weatherBuffer);
  }

  // 3h. Reception milestone — anchored on max(EF), i.e. FS from every task
  //     that nothing else follows (D5). Never on "the last SIA phase".
  const receptionMilestone = makeMilestone(
    nextIndex++,
    'Reception provisoire (SIA 118)',
    'reception_provisoire',
    phaseOrder[phaseOrder.length - 1],
  );
  tasks.push(receptionMilestone);

  const wireTerminalTasks = () => {
    const hasSuccessor = new Set(dependencies.map((d) => d.predecessor_index));
    const terminalTarget = weatherBuffer ?? receptionMilestone;

    for (const t of tasks) {
      if (t.index === receptionMilestone.index) continue;
      if (weatherBuffer && t.index === weatherBuffer.index) continue;
      if (hasSuccessor.has(t.index)) continue;
      addDep(t.index, terminalTarget.index, 'FS', 0, 'auto');
    }
    if (weatherBuffer) addDep(weatherBuffer.index, receptionMilestone.index, 'FS', 0, 'auto');
  };
  wireTerminalTasks();

  // ── Step 4: D1 assertion ──────────────────────────────────────────────────
  assertNoOrphanTasks(workTasks, phaseOrder[0], dependencies, log);

  // ── Step 5: seasonality convergence (calculate → CPM → recalculate) ───────
  let analysis = runCpm(tasks, dependencies);

  for (let pass = 1; pass < SEASONALITY_PASSES; pass++) {
    let changed = 0;
    for (const task of workTasks) {
      const schedule = analysis.task_schedules.get(String(task.index));
      if (!schedule) continue;
      const realStart = addWorkingDays(startDate, schedule.es, calendar);
      const previous = task.duration;
      recomputeDuration(task, realStart, config, orgCorrections);
      if (task.duration !== previous) changed++;
    }
    analysis = runCpm(tasks, dependencies);
    log(`[planning] Saisonnalite passe ${pass}: ${changed} durees recalculees sur le mois de demarrage reel`);
    if (changed === 0) break;
  }

  // ── Step 6: weather buffer sizing ─────────────────────────────────────────
  if (weatherBuffer) {
    const winterExposedDays = countWinterExposedDays(workTasks, analysis, startDate, calendar);
    weatherBuffer.duration = Math.min(
      WEATHER_BUFFER_MAX_DAYS,
      Math.round(winterExposedDays * WEATHER_BUFFER_RATIO),
    );
    weatherBuffer.description =
      `Provision intemperies — ${winterExposedDays} j ouvres de travaux exterieurs en periode hivernale (nov.-mars)`;
    log(`[planning] Tampon meteo: ${weatherBuffer.duration} j (exposition hivernale ${winterExposedDays} j)`);
    analysis = runCpm(tasks, dependencies);
  }

  // ── Step 7: crew capacity levelling ───────────────────────────────────────
  const maxCrews = Math.max(1, config.max_concurrent_crews ?? DEFAULT_MAX_CONCURRENT_CREWS);
  const levelled = levelCapacity(tasks, analysis, maxCrews);
  if (levelled > 0) {
    // Materialise each levelling floor as a real FS link from the start
    // milestone, so the constraint is persisted, auditable in the Gantt, and
    // survives a later rescheduleCPM() instead of silently evaporating.
    for (const task of tasks) {
      if (!task.earliestStart) continue;
      addDep(startMilestone.index, task.index, 'FS', task.earliestStart, 'auto');
    }
    analysis = runCpm(tasks, dependencies);
    log(`[planning] Nivellement capacite (max ${maxCrews} equipes): ${levelled} taches decalees`);
  }

  // ── Step 8: write dates, build the output structure ───────────────────────
  // Park the buffer and the reception in the phase that actually finishes
  // last, not in the highest-numbered SIA phase.
  const lastPhase = phaseFinishingLast(workTasks, analysis);
  if (weatherBuffer) weatherBuffer.phaseKey = lastPhase;
  receptionMilestone.phaseKey = lastPhase;

  applySchedule(tasks, analysis, startDate, calendar);

  const phases = buildPhases(tasks);
  const generatedTasks = new Map<number, GeneratedTask>();
  for (const phase of phases) {
    for (const t of phase.tasks) generatedTasks.set(t.sort_order, t);
  }

  const totalDuration = analysis.project_duration;
  if (totalDuration > WARN_TOTAL_WORKING_DAYS) {
    log(
      `[planning] ATTENTION: duree totale ${totalDuration} j ouvres (~${(totalDuration / 21).toFixed(1)} mois). ` +
      'Verifier le decoupage des lots — aucune compression n est appliquee.',
    );
  }

  if (analysis.cyclic_task_ids.length > 0) {
    log(`[planning] ATTENTION: ${analysis.cyclic_task_ids.length} taches sur un cycle de dependances — dates non fiables`);
  }

  const calculatedEndDate = phases.length > 0
    ? phases.reduce((max, p) => (p.end_date > max ? p.end_date : max), phases[0].end_date)
    : config.start_date;

  const criticalPathLength = computeCriticalPathLength(tasks, analysis);

  log(`[planning] Chemin critique: ${analysis.critical_path.length} noeuds, ${totalDuration} j ouvres`);
  log(`[planning] Fin calculee: ${calculatedEndDate}`);
  log(`[planning] Genere en ${Date.now() - generationStart} ms`);

  return {
    title: `Planning — ${projectName}`,
    phases,
    dependencies,
    calculated_end_date: calculatedEndDate,
    critical_path_length: criticalPathLength,
    ai_generation_log: {
      generated_at: new Date().toISOString(),
      generation_time_ms: Date.now() - generationStart,
      items_count: items.length,
      synthetic_tasks_count: workTasks.length,
      milestones_count: tasks.filter((t) => t.isMilestone).length,
      phases_count: phases.length,
      dependencies_count: dependencies.length,
      cfc_rule_dependencies_count: ruleDeps,
      procurement_milestones_count: procurementCount,
      weather_buffer_days: weatherBuffer?.duration ?? 0,
      max_concurrent_crews: maxCrews,
      levelled_tasks_count: levelled,
      project_duration_working_days: totalDuration,
      critical_path_task_ids: analysis.critical_path,
      cyclic_task_ids: analysis.cyclic_task_ids,
      calendar: {
        canton: calendar.canton,
        holidays_count: calendar.holidays.size,
        closures: calendar.closures.map((c) => `${c.start}→${c.end}`),
      },
      config,
      log: logEntries,
    },
  };
}

// ============================================================================
// rescheduleCPM — re-run the CPM on an existing planning structure
// ============================================================================

export interface RescheduleOptions {
  /** Project start date (defaults to the value recorded at generation time) */
  start_date?: string;
  /** Calendar to schedule on (defaults to the recorded canton's calendar) */
  calendar?: WorkingCalendar | null;
  /** Negative lags are clamped to this floor (default -10 working days) */
  max_negative_lag?: number;
}

export interface RescheduleResult {
  project_duration: number;
  calculated_end_date: string;
  critical_path: string[];
  critical_path_length: number;
  cyclic_task_ids: string[];
  orphan_task_ids: string[];
}

/**
 * Recompute every date of a planning from its current durations and
 * dependencies.
 *
 * This is what makes the AI pass real rather than decorative: the route calls
 * it AFTER the AI has added dependencies, so the suggestions actually move
 * the schedule (audit distortion D5).
 */
export function rescheduleCPM(
  planning: GeneratedPlanning,
  options: RescheduleOptions = {},
): RescheduleResult {
  const recordedConfig = (planning.ai_generation_log as any)?.config as PlanningConfig | undefined;
  const startIso = options.start_date ?? recordedConfig?.start_date;
  if (!startIso) {
    throw new Error('rescheduleCPM: start_date introuvable (ni en option ni dans ai_generation_log.config)');
  }

  const startDate = parseIsoDate(startIso);
  const calendar = options.calendar !== undefined
    ? options.calendar
    : buildCalendarForConfig(recordedConfig ?? { start_date: startIso, project_type: 'new' }, startDate);

  const floor = options.max_negative_lag ?? MAX_NEGATIVE_LAG;

  const allTasks: GeneratedTask[] = [];
  for (const phase of planning.phases) allTasks.push(...phase.tasks);

  const cpmTasks = allTasks.map((t) => ({
    id: String(t.sort_order),
    duration_days: t.duration_days,
    is_milestone: t.is_milestone,
  }));

  const cpmDeps = planning.dependencies.map((d) => ({
    predecessor_id: String(d.predecessor_index),
    successor_id: String(d.successor_index),
    dependency_type: d.dependency_type,
    lag_days: Math.max(floor, Math.round(d.lag_days)),
  }));

  const analysis = analyzeCriticalPath(cpmTasks, cpmDeps);

  for (const task of allTasks) {
    const schedule = analysis.task_schedules.get(String(task.sort_order));
    if (!schedule) continue;

    let start = schedule.es;
    let end = schedule.ef;

    // Procurement milestones show "order by" = ES(pose) − lead (see applySchedule).
    // The target and lead are recovered from the milestone's outgoing lagged link.
    if (task.milestone_type === 'procurement') {
      const link = planning.dependencies.find(
        (d) => d.predecessor_index === task.sort_order && d.lag_days > 0,
      );
      const target = link ? analysis.task_schedules.get(String(link.successor_index)) : null;
      if (link && target) {
        start = Math.max(0, target.es - link.lag_days);
        end = start;
      }
    }

    task.start_date = toIsoDate(addWorkingDays(startDate, Math.max(0, start), calendar));
    task.end_date = toIsoDate(addWorkingDays(startDate, Math.max(0, end), calendar));
  }

  for (const phase of planning.phases) {
    if (phase.tasks.length === 0) continue;
    let start = phase.tasks[0].start_date;
    let end = phase.tasks[0].end_date;
    for (const t of phase.tasks) {
      if (t.start_date < start) start = t.start_date;
      if (t.end_date > end) end = t.end_date;
    }
    phase.start_date = start;
    phase.end_date = end;
  }

  const calculatedEndDate = planning.phases.length > 0
    ? planning.phases.reduce((max, p) => (p.end_date > max ? p.end_date : max), planning.phases[0].end_date)
    : startIso;

  const criticalSet = new Set(analysis.critical_path);
  const criticalPathLength = allTasks.reduce(
    (sum, t) => sum + (criticalSet.has(String(t.sort_order)) ? t.duration_days : 0),
    0,
  );

  planning.calculated_end_date = calculatedEndDate;
  planning.critical_path_length = criticalPathLength;

  if (planning.ai_generation_log && typeof planning.ai_generation_log === 'object') {
    (planning.ai_generation_log as any).critical_path_task_ids = analysis.critical_path;
    (planning.ai_generation_log as any).project_duration_working_days = analysis.project_duration;
    (planning.ai_generation_log as any).rescheduled_at = new Date().toISOString();
    if (analysis.cyclic_task_ids.length > 0) {
      (planning.ai_generation_log as any).cyclic_task_ids = analysis.cyclic_task_ids;
    }
  }

  return {
    project_duration: analysis.project_duration,
    calculated_end_date: calculatedEndDate,
    critical_path: analysis.critical_path,
    critical_path_length: criticalPathLength,
    cyclic_task_ids: analysis.cyclic_task_ids,
    orphan_task_ids: analysis.orphan_task_ids,
  };
}

// ============================================================================
// Step 1 — grouping
// ============================================================================

interface CfcGroup {
  key: string;
  cfcCode: string | null;
  phaseKey: SiaPhaseKey;
  label: string;
  exposure: 'exterior' | 'sheltered' | 'interior';
  items: SubmissionItemInput[];
}

function groupItemsByCfc(
  items: SubmissionItemInput[],
  log: (m: string) => void,
): Map<string, CfcGroup> {
  const groups = new Map<string, CfcGroup>();
  let unresolved = 0;

  for (const item of items) {
    if (!item.quantity || !item.unit) continue;

    const resolution = resolveCfc(item.cfc_code, {
      text: `${item.description ?? ''} ${item.material_group ?? ''}`,
      log: () => { /* aggregated below */ },
    });

    if (!resolution.entry) unresolved++;

    const entry = resolution.entry;
    const cfcCode = entry?.code ?? null;
    const phaseKey: SiaPhaseKey = entry?.phase ?? 'divers';
    const label = entry?.group ?? (item.material_group || 'Divers');
    const key = `${phaseKey}|${cfcCode ?? label}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        cfcCode,
        phaseKey,
        label,
        exposure: entry?.exposure ?? 'interior',
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }

  if (unresolved > 0) {
    log(`[planning] ${unresolved}/${items.length} postes sans code CFC resolvable — regroupes en "Divers"`);
  }

  return groups;
}

function sortGroups(groups: Map<string, CfcGroup>): CfcGroup[] {
  return Array.from(groups.values()).sort((a, b) => {
    const orderDiff = getPhaseOrder(a.phaseKey) - getPhaseOrder(b.phaseKey);
    if (orderDiff !== 0) return orderDiff;
    return (a.cfcCode ?? a.label).localeCompare(b.cfcCode ?? b.label);
  });
}

function firstPhaseKey(groups: Map<string, CfcGroup>): SiaPhaseKey {
  const sorted = sortGroups(groups);
  return sorted[0]?.phaseKey ?? 'preparation';
}

function distinctPhasesInOrder(tasks: WorkTask[]): SiaPhaseKey[] {
  const present = new Set(tasks.map((t) => t.phaseKey));
  return SIA_PHASE_DEFS
    .filter((p) => present.has(p.key))
    .sort((a, b) => a.order - b.order)
    .map((p) => p.key);
}

// ============================================================================
// Step 2 — durations
// ============================================================================

/**
 * Duration of a (phase, CFC) task = SUM of the durations of its
 * homogeneous-unit sub-lots.
 *
 * The old generator kept only the "dominant unit" and threw the rest away,
 * so 12 t of rebar plus 340 m² of formwork plus 180 m³ of concrete became
 * "180 m³" and the other two disappeared from the schedule entirely (D3).
 */
function buildWorkTask(
  index: number,
  group: CfcGroup,
  config: PlanningConfig,
  startDate: Date,
  orgCorrections: OrgCorrection[] | undefined,
  log: (m: string) => void,
): WorkTask {
  const unitLots = buildUnitLots(group, config, startDate, orgCorrections);

  const totalDuration = unitLots.reduce((s, l) => s + l.duration, 0);
  const dominant = unitLots.reduce<UnitLot | null>(
    (best, lot) => (!best || lot.duration > best.duration ? lot : best),
    null,
  );

  const cfcCode = group.cfcCode ?? '';
  const ratioEntry = cfcCode ? findProductivityRatio(cfcCode, dominant?.unit) : null;
  const defaultTeam = ratioEntry?.team_size_default ?? 2;

  // Reference result for traceability (ratio / source / factors persisted)
  const reference = safeCalculateDuration({
    quantity: dominant?.quantity ?? group.items.length,
    unit: dominant?.unit ?? 'pce',
    cfc_code: cfcCode || '000',
    team_size: defaultTeam,
    start_date: startDate,
    project_type: config.project_type,
    canton: config.canton,
    org_corrections: orgCorrections,
  });

  // Auto-scale crews for oversized lots (more crews, diminishing returns)
  let duration = Math.max(MIN_TASK_DAYS, Math.ceil(totalDuration));
  let teamSize = defaultTeam;
  const adjustmentFactors: Record<string, number> = { ...reference.adjustment_factors };

  if (duration > MAX_TASK_DAYS) {
    const crews = Math.ceil(duration / MAX_TASK_DAYS);
    const efficiency = 1 / (1 + (crews - 1) * 0.25);
    duration = Math.ceil(duration / (crews * efficiency));
    teamSize = defaultTeam * crews;
    adjustmentFactors['team_auto_scale'] = crews;
  }
  duration = Math.min(MAX_TASK_DAYS, Math.max(MIN_TASK_DAYS, duration));

  if (unitLots.length > 1) {
    const breakdown = unitLots.map((l) => `${round2(l.quantity)} ${l.unit} = ${l.duration} j`).join(' + ');
    log(`[planning] ${group.label} (${cfcCode || 'sans CFC'}): ${breakdown}`);
  }

  const entry = group.cfcCode ? getCfcEntry(group.cfcCode) : null;
  const name = entry ? `${entry.group} (${entry.code})` : group.label;

  const previews = group.items.slice(0, 3).map((i) => (i.description ?? '').substring(0, 70)).join(', ');
  const suffix = group.items.length > 3 ? `, ... (+${group.items.length - 3})` : '';

  return {
    index,
    phaseKey: group.phaseKey,
    cfcCode: group.cfcCode,
    name,
    description: `${group.items.length} postes — ${previews}${suffix}`,
    sourceItemIds: group.items.map((i) => i.id),
    unitLots,
    quantity: dominant?.quantity ?? null,
    unit: dominant?.unit ?? null,
    duration,
    teamSize,
    productivityRatio: reference.productivity_ratio,
    productivitySource: reference.productivity_source,
    adjustmentFactors: Object.keys(adjustmentFactors).length > 0 ? adjustmentFactors : null,
    baseDuration: reference.base_duration_days,
    isMilestone: false,
    milestoneType: null,
    exposure: group.exposure,
  };
}

function buildUnitLots(
  group: CfcGroup,
  config: PlanningConfig,
  startDate: Date,
  orgCorrections: OrgCorrection[] | undefined,
): UnitLot[] {
  const byUnit = new Map<string, { quantity: number; itemIds: string[] }>();

  for (const item of group.items) {
    if (!item.unit || !item.quantity) continue;
    const unit = normalizeUnitLabel(item.unit);
    const entry = byUnit.get(unit) ?? { quantity: 0, itemIds: [] };
    entry.quantity += item.quantity;
    entry.itemIds.push(item.id);
    byUnit.set(unit, entry);
  }

  const cfcCode = group.cfcCode ?? '000';
  const lots: UnitLot[] = [];

  for (const [unit, { quantity, itemIds }] of byUnit) {
    const ratioEntry = findProductivityRatio(cfcCode, unit);
    const team = ratioEntry?.team_size_default ?? 2;
    const result = safeCalculateDuration({
      quantity,
      unit,
      cfc_code: cfcCode,
      team_size: team,
      start_date: startDate,
      project_type: config.project_type,
      canton: config.canton,
      org_corrections: orgCorrections,
    });
    lots.push({ unit, quantity, duration: result.duration_days, itemIds });
  }

  if (lots.length === 0) {
    lots.push({ unit: 'pce', quantity: group.items.length, duration: MIN_TASK_DAYS, itemIds: group.items.map((i) => i.id) });
  }

  return lots;
}

/** Recompute a task's duration from its real start month (seasonality pass). */
function recomputeDuration(
  task: WorkTask,
  realStart: Date,
  config: PlanningConfig,
  orgCorrections: OrgCorrection[] | undefined,
): void {
  if (task.isMilestone || task.unitLots.length === 0) return;

  const cfcCode = task.cfcCode ?? '000';
  let total = 0;
  let reference: DurationResult | null = null;

  for (const lot of task.unitLots) {
    const ratioEntry = findProductivityRatio(cfcCode, lot.unit);
    const team = ratioEntry?.team_size_default ?? 2;
    const result = safeCalculateDuration({
      quantity: lot.quantity,
      unit: lot.unit,
      cfc_code: cfcCode,
      team_size: team,
      start_date: realStart,
      project_type: config.project_type,
      canton: config.canton,
      org_corrections: orgCorrections,
    });
    lot.duration = result.duration_days;
    total += result.duration_days;
    if (!reference || result.duration_days > reference.duration_days) reference = result;
  }

  const crews = task.adjustmentFactors?.['team_auto_scale'];
  let duration = Math.max(MIN_TASK_DAYS, Math.ceil(total));
  if (crews && crews > 1) {
    const efficiency = 1 / (1 + (crews - 1) * 0.25);
    duration = Math.ceil(duration / (crews * efficiency));
  }
  task.duration = Math.min(MAX_TASK_DAYS, Math.max(MIN_TASK_DAYS, duration));

  if (reference) {
    task.productivityRatio = reference.productivity_ratio;
    task.productivitySource = reference.productivity_source;
    task.baseDuration = reference.base_duration_days;
    task.adjustmentFactors = {
      ...reference.adjustment_factors,
      ...(crews ? { team_auto_scale: crews } : {}),
    };
  }
}

function safeCalculateDuration(params: Parameters<typeof calculateDuration>[0]): DurationResult {
  try {
    return calculateDuration(params);
  } catch {
    return {
      duration_days: 5,
      base_duration_days: 5,
      productivity_ratio: 0,
      productivity_source: 'ai_estimate',
      adjustment_factors: {},
    };
  }
}

// ============================================================================
// Step 4 — D1 assertion
// ============================================================================

export class OrphanTaskError extends Error {
  readonly orphans: string[];
  constructor(orphans: string[]) {
    super(
      `[planning] ${orphans.length} tache(s) hors phase 1 sans predecesseur — elles demarreraient au jour 0: ` +
      orphans.join(', '),
    );
    this.name = 'OrphanTaskError';
    this.orphans = orphans;
  }
}

function assertNoOrphanTasks(
  workTasks: WorkTask[],
  firstPhase: SiaPhaseKey,
  dependencies: GeneratedDependency[],
  log: (m: string) => void,
): void {
  const withPredecessor = new Set(dependencies.map((d) => d.successor_index));
  const orphans = workTasks
    .filter((t) => t.phaseKey !== firstPhase && !withPredecessor.has(t.index))
    .map((t) => `${t.name} [${t.cfcCode ?? '-'}]`);

  if (orphans.length === 0) return;

  if (process.env.NODE_ENV !== 'production') {
    throw new OrphanTaskError(orphans);
  }
  log(`[planning] ERREUR (non bloquante en prod): ${orphans.length} taches orphelines: ${orphans.join(', ')}`);
}

// ============================================================================
// Steps 5-7 — CPM, weather, capacity
// ============================================================================

function runCpm(tasks: WorkTask[], dependencies: GeneratedDependency[]) {
  return analyzeCriticalPath(
    tasks.map((t) => ({
      id: String(t.index),
      duration_days: t.duration,
      is_milestone: t.isMilestone,
      earliest_start: t.earliestStart,
    })),
    dependencies.map((d) => ({
      predecessor_id: String(d.predecessor_index),
      successor_id: String(d.successor_index),
      dependency_type: d.dependency_type,
      lag_days: Math.max(MAX_NEGATIVE_LAG, d.lag_days),
    })),
  );
}

function countWinterExposedDays(
  workTasks: WorkTask[],
  analysis: ReturnType<typeof runCpm>,
  startDate: Date,
  calendar: WorkingCalendar,
): number {
  let exposed = 0;

  for (const task of workTasks) {
    if (task.exposure !== 'exterior' || task.duration <= 0) continue;
    const schedule = analysis.task_schedules.get(String(task.index));
    if (!schedule) continue;

    const cursor = addWorkingDays(startDate, schedule.es, calendar);
    for (let d = 0; d < task.duration; d++) {
      const month = cursor.getMonth(); // 0 = January
      if (month >= 10 || month <= 2) exposed++;  // Nov, Dec, Jan, Feb, Mar
      cursor.setTime(addWorkingDays(cursor, 1, calendar).getTime());
    }
  }

  return exposed;
}

/**
 * Simple crew-capacity levelling.
 *
 * Serial greedy pass over the CPM early starts: when more than `maxCrews`
 * tasks would run on the same day, the one with the LARGEST total float is
 * pushed a day at a time. The result is expressed as an `earliest_start`
 * floor so the CPM — not a hand-rolled date shuffle — produces the final
 * schedule. Returns the number of tasks that were moved.
 */
function levelCapacity(
  tasks: WorkTask[],
  analysis: ReturnType<typeof runCpm>,
  maxCrews: number,
): number {
  const candidates = tasks
    .filter((t) => !t.isMilestone && t.duration > 0)
    .map((t) => {
      const s = analysis.task_schedules.get(String(t.index));
      return { task: t, es: s?.es ?? 0, float: s?.total_float ?? 0 };
    })
    .sort((a, b) => (a.es - b.es) || (a.float - b.float));

  if (candidates.length <= maxCrews) return 0;

  const load = new Map<number, number>();
  const occupancy = (day: number) => load.get(day) ?? 0;
  let moved = 0;

  for (const candidate of candidates) {
    let start = candidate.es;
    // A task is never pushed beyond its float plus a generous margin —
    // levelling must not silently double the project duration.
    const limit = candidate.es + Math.max(candidate.float, 0) + 60;

    while (start <= limit) {
      let fits = true;
      for (let d = start; d < start + candidate.task.duration; d++) {
        if (occupancy(d) >= maxCrews) { fits = false; break; }
      }
      if (fits) break;
      start++;
    }

    for (let d = start; d < start + candidate.task.duration; d++) {
      load.set(d, occupancy(d) + 1);
    }

    if (start > candidate.es) {
      candidate.task.earliestStart = start;
      moved++;
    }
  }

  return moved;
}

// ============================================================================
// Step 8 — output structure
// ============================================================================

function applySchedule(
  tasks: WorkTask[],
  analysis: ReturnType<typeof runCpm>,
  startDate: Date,
  calendar: WorkingCalendar,
): void {
  for (const task of tasks) {
    const schedule = analysis.task_schedules.get(String(task.index));
    if (!schedule) continue;

    // A procurement milestone is a DEADLINE, not a start: what the conductor
    // needs is "order by to hold the PLANNED installation date", i.e.
    // ES(pose) − lead time. Its own CPM Latest Start would be far too
    // permissive whenever the trade carries float (ordering the roof timber
    // in December for a June installation is not advice, it is a trap).
    let offset = schedule.es;
    let endOffset = schedule.ef;

    if (task.milestoneType === 'procurement' && task.procurementTargetIndex != null) {
      const target = analysis.task_schedules.get(String(task.procurementTargetIndex));
      if (target) {
        offset = Math.max(0, target.es - (task.procurementLeadDays ?? 0));
        endOffset = offset;
      }
    }

    task.startIso = toIsoDate(addWorkingDays(startDate, Math.max(0, offset), calendar));
    task.endIso = toIsoDate(addWorkingDays(startDate, Math.max(0, endOffset), calendar));
  }
}

/** The phase whose work actually finishes last (by CPM early finish). */
function phaseFinishingLast(
  workTasks: WorkTask[],
  analysis: ReturnType<typeof runCpm>,
): SiaPhaseKey {
  let bestPhase: SiaPhaseKey = workTasks[0]?.phaseKey ?? 'divers';
  let bestFinish = -1;

  for (const task of workTasks) {
    const schedule = analysis.task_schedules.get(String(task.index));
    if (!schedule) continue;
    if (schedule.ef > bestFinish) {
      bestFinish = schedule.ef;
      bestPhase = task.phaseKey;
    }
  }

  return bestPhase;
}

function buildPhases(tasks: WorkTask[]): GeneratedPhase[] {
  const byPhase = new Map<SiaPhaseKey, WorkTask[]>();
  for (const t of tasks) {
    if (!byPhase.has(t.phaseKey)) byPhase.set(t.phaseKey, []);
    byPhase.get(t.phaseKey)!.push(t);
  }

  const ordered = SIA_PHASE_DEFS
    .filter((p) => byPhase.has(p.key))
    .sort((a, b) => a.order - b.order);

  return ordered.map((def, sortOrder) => {
    const phaseTasks = (byPhase.get(def.key) ?? []).sort((a, b) => a.index - b.index);
    const generated = phaseTasks.map(toGeneratedTask);

    let start = generated[0]?.start_date ?? '';
    let end = generated[0]?.end_date ?? '';
    for (const t of generated) {
      if (t.start_date < start) start = t.start_date;
      if (t.end_date > end) end = t.end_date;
    }

    const cfcCodes = Array.from(
      new Set(phaseTasks.map((t) => t.cfcCode).filter((c): c is string => !!c)),
    );

    return {
      name: def.name,
      cfc_codes: cfcCodes,
      color: def.color,
      sort_order: sortOrder,
      start_date: start,
      end_date: end,
      tasks: generated,
    };
  });
}

function toGeneratedTask(task: WorkTask): GeneratedTask {
  return {
    submission_item_id: task.sourceItemIds[0] ?? null,
    source_item_ids: task.sourceItemIds,
    name: task.name,
    description: task.description,
    cfc_code: task.cfcCode,
    start_date: task.startIso ?? '',
    end_date: task.endIso ?? '',
    duration_days: task.duration,
    quantity: task.quantity,
    unit: task.unit,
    productivity_ratio: task.productivityRatio,
    productivity_source: task.productivitySource,
    adjustment_factors: task.adjustmentFactors,
    base_duration_days: task.baseDuration,
    team_size: task.teamSize,
    progress: 0,
    is_milestone: task.isMilestone,
    milestone_type: task.milestoneType,
    sort_order: task.index,
  };
}

function computeCriticalPathLength(
  tasks: WorkTask[],
  analysis: ReturnType<typeof runCpm>,
): number {
  const critical = new Set(analysis.critical_path);
  return tasks.reduce((sum, t) => sum + (critical.has(String(t.index)) ? t.duration : 0), 0);
}

// ============================================================================
// Helpers
// ============================================================================

function makeMilestone(
  index: number,
  name: string,
  milestoneType: string,
  phaseKey: SiaPhaseKey,
): WorkTask {
  return {
    index,
    phaseKey,
    cfcCode: null,
    name,
    description: '',
    sourceItemIds: [],
    unitLots: [],
    quantity: null,
    unit: null,
    duration: 0,
    teamSize: 1,
    productivityRatio: null,
    productivitySource: null,
    adjustmentFactors: null,
    baseDuration: null,
    isMilestone: true,
    milestoneType,
    exposure: 'interior',
  };
}

function longestTask(tasks: WorkTask[]): WorkTask | null {
  let best: WorkTask | null = null;
  for (const t of tasks) {
    if (t.isMilestone) continue;
    if (!best || t.duration > best.duration) best = t;
  }
  return best;
}

function buildCalendarForConfig(config: PlanningConfig, startDate: Date): WorkingCalendar {
  if (config.use_swiss_calendar === false) return weekendOnlyCalendar();
  const fromYear = startDate.getFullYear();
  return buildSwissCalendar({
    canton: config.canton ?? null,
    fromYear,
    toYear: fromYear + 5,
    closures: config.building_closures,
  });
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return new Date(iso);
  return new Date(y, m - 1, d);
}

function normalizeUnitLabel(unit: string): string {
  return unit.toLowerCase().replace(/²/g, '2').replace(/³/g, '3').replace(/\s+/g, '').trim();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Damp a calibration factor by the number of observations behind it. */
export function dampenCalibrationFactor(rawFactor: number, samples: number): number {
  const bounded = clampCalibrationFactor(rawFactor);
  const weight = Math.min(0.7, 0.25 * Math.max(0, samples));
  return 1 + weight * (bounded - 1);
}

// ============================================================================
// Database fetchers
// ============================================================================

async function fetchSubmissionItems(
  supabase: any,
  submissionId: string,
): Promise<SubmissionItemInput[]> {
  const { data: items, error: itemsError } = await supabase
    .from('submission_items')
    .select('id, item_number, description, unit, quantity, cfc_code, material_group, product_name, status')
    .eq('submission_id', submissionId)
    .order('item_number', { ascending: true });

  if (itemsError) {
    throw new Error(`Erreur lecture postes: ${itemsError.message}`);
  }

  if (!items || items.length === 0) return [];

  return items.map((item: any) => ({
    id: item.id,
    item_number: item.item_number,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity ? Number(item.quantity) : null,
    cfc_code: item.cfc_code ?? null,
    material_group: item.material_group ?? 'Divers',
  }));
}

/**
 * Read the org's learnt calibrations and turn them into DAMPED multipliers.
 *
 * Previously the most recent row per CFC was applied verbatim as an absolute
 * ratio, so one badly-closed project could halve every future estimate. Now
 * the ratio is averaged across observations, expressed as a factor relative to
 * the reference, bounded to [0.5, 2.0], and weighted by sample count.
 */
async function fetchOrgCorrections(
  supabase: any,
  orgId: string,
): Promise<OrgCorrection[]> {
  try {
    // AUDIT 08/2026 — QUARANTAINE des lignes legacy : l'ancien writer (pré-094)
    // divisait des jours CALENDAIRES projet par une SOMME de durées de tâches
    // parallèles (unités incompatibles), produisait des ratios 0→Infinity, et
    // écrasait le CRB de l'org sur n=1. Ces lignes sont toujours en base et
    // empoisonnaient chaque génération, même amorties.
    // On ne lit QUE les lignes du writer refondu (mesure par tâche en jours
    // ouvrés, cf. extractPlanningCorrections dans /api/projects/[id]) :
    // source='project_closure' ET sample_count>=2 (colonnes migration 094).
    // Sur une base sans la 094, le SELECT échoue → [] → lecture désactivée,
    // ce qui est exactement le comportement voulu.
    const { data, error } = await supabase
      .from('planning_duration_corrections')
      .select('cfc_code, unit, original_ratio, corrected_ratio, created_at, source, sample_count')
      .eq('organization_id', orgId)
      .eq('source', 'project_closure')
      .gte('sample_count', 2)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error || !data) return [];

    const byCfc = new Map<string, { factors: number[]; corrected: number[]; original: number[] }>();

    for (const row of data) {
      if (!row.cfc_code) continue;
      const original = Number(row.original_ratio);
      const corrected = Number(row.corrected_ratio);
      if (!Number.isFinite(corrected) || corrected <= 0) continue;

      const bucket = byCfc.get(row.cfc_code) ?? { factors: [], corrected: [], original: [] };
      // Keep at most the 20 most recent observations per CFC
      if (bucket.corrected.length >= 20) continue;

      if (Number.isFinite(original) && original > 0) {
        bucket.factors.push(clampCalibrationFactor(corrected / original));
        bucket.original.push(original);
      }
      bucket.corrected.push(corrected);
      byCfc.set(row.cfc_code, bucket);
    }

    const results: OrgCorrection[] = [];
    for (const [cfcCode, bucket] of byCfc) {
      const samples = bucket.factors.length;
      if (samples > 0) {
        // Geometric mean — a ratio's natural average
        const logSum = bucket.factors.reduce((s, f) => s + Math.log(f), 0);
        const rawFactor = Math.exp(logSum / samples);
        results.push({
          cfc_code: cfcCode,
          correction_factor: dampenCalibrationFactor(rawFactor, samples),
          corrected_ratio: bucket.corrected[0],
          original_ratio: bucket.original[0],
          samples,
        });
      } else {
        results.push({ cfc_code: cfcCode, corrected_ratio: bucket.corrected[0], samples: bucket.corrected.length });
      }
    }

    return results;
  } catch {
    // Table may not exist yet (migration not applied)
    return [];
  }
}
