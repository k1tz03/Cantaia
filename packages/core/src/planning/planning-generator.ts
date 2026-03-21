// ═══════════════════════════════════════════════════════════════
// Cantaia Gantt — Planning Generator (Orchestrator)
// Generates a full project planning from submission items.
// Pure algorithmic — no AI calls required.
//
// V2 — Realistic construction schedules:
//   - Aggregates items into 20-40 synthetic tasks (by material_group)
//   - Maps groups into SIA standard phases (6+1)
//   - Tasks within a phase run in PARALLEL (not sequential)
//   - Phases are SEQUENTIAL (finish-to-start)
//   - Total duration capped at 3 years (1095 days)
// ═══════════════════════════════════════════════════════════════

import { findProductivityRatio } from './productivity-ratios';
import { calculateDuration, addWorkingDays, type DurationResult } from './duration-calculator';
import { analyzeCriticalPath } from './critical-path';
import { findDependenciesFrom, getMajorCfcGroup } from './dependency-rules';

// ============================================================================
// Types
// ============================================================================

export interface PlanningConfig {
  /** Project start date (ISO YYYY-MM-DD) */
  start_date: string;
  /** Optional target end date */
  target_end_date?: string;
  /** Project type affects duration multipliers */
  project_type: 'new' | 'renovation' | 'extension' | 'interior';
  /** Canton for regional coefficient adjustment */
  canton?: string;
  /** Free-text constraints (informational, stored in ai_generation_log) */
  constraints?: string;
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
  submission_item_id: string | null;
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
  predecessor_index: number;   // index in flat tasks array
  successor_index: number;     // index in flat tasks array
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days: number;
  source: 'auto' | 'manual' | 'rule';
}

export interface AIDurationCorrection {
  task_id: string;
  current_duration: number;
  corrected_duration: number;
  reason: string;
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

export interface AIValidationResult {
  duration_corrections: AIDurationCorrection[];
  missing_dependencies: AIMissingDependency[];
  risks: AIRisk[];
  recommendations: AIRecommendation[];
  summary: string;
}

export interface GeneratedPlanning {
  title: string;
  phases: GeneratedPhase[];
  dependencies: GeneratedDependency[];
  calculated_end_date: string;
  critical_path_length: number;
  ai_generation_log: Record<string, unknown>;
  /** AI validation results — populated by the API route after generation */
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

/** A synthetic task aggregated from multiple submission items */
interface SyntheticTask {
  name: string;
  description: string;
  source_item_ids: string[];
  cfc_code: string | null;
  /** Duration = bottleneck item (the longest individual item) */
  duration_days: number;
  quantity: number | null;
  unit: string | null;
  productivity_ratio: number | null;
  productivity_source: string | null;
  adjustment_factors: Record<string, number> | null;
  base_duration_days: number | null;
  team_size: number;
}

// ============================================================================
// SIA Standard Phases (Swiss construction)
// ============================================================================

interface SIAPhaseDefinition {
  name: string;
  /** material_group values that map to this phase (case-insensitive partial match) */
  groups: string[];
  color: string;
  order: number;
}

const SIA_PHASES: SIAPhaseDefinition[] = [
  {
    name: 'Preparation du terrain',
    groups: [
      'Terrassement', 'Terre', 'Demolition', 'Fondations',
      'Installations de chantier', 'Travaux preparatoires',
    ],
    color: '#8B5CF6', // violet
    order: 1,
  },
  {
    name: 'Gros oeuvre',
    groups: [
      'Beton arme', 'Coffrage', 'Ferraillage', 'Maconnerie',
      'Structure beton', 'Beton', 'Construction metallique',
      'Charpente', 'Charpente metallique', 'Charpente bois',
    ],
    color: '#3B82F6', // blue
    order: 2,
  },
  {
    name: 'Clos et couvert',
    groups: [
      'Etancheite', 'Toiture', 'Fenetres', 'Fenetres/Portes',
      'Facades', 'Isolation', 'Isolation thermique', 'Ferblanterie',
      'Couverture',
    ],
    color: '#10B981', // green
    order: 3,
  },
  {
    name: 'Second oeuvre',
    groups: [
      'Electricite', 'CVC', 'CVC/Chauffage', 'Sanitaire',
      'Sanitaire/Plomberie', 'Ventilation', 'Reseaux',
      'Installation', 'Chauffage', 'Plomberie',
      'Ascenseurs',
    ],
    color: '#F59E0B', // amber
    order: 4,
  },
  {
    name: 'Finitions',
    groups: [
      'Revetements', 'Revetements sols', 'Revetements murs',
      'Peinture', 'Menuiserie', 'Menuiserie interieure',
      'Carrelage', 'Equipements', 'Platrerie',
      'Faux plafonds', 'Chapes',
    ],
    color: '#EF4444', // red
    order: 5,
  },
  {
    name: 'Amenagements exterieurs',
    groups: [
      'Plantations', 'Amenagements exterieurs', 'Clotures',
      'Eclairage exterieur', 'Jardinage', 'Paysagisme',
      'Graves',
    ],
    color: '#06B6D4', // cyan
    order: 6,
  },
];

const DIVERS_PHASE: SIAPhaseDefinition = {
  name: 'Divers',
  groups: [],
  color: '#6B7280', // gray
  order: 7,
};

/** Max total planning duration in working days (~14 months) */
const MAX_TOTAL_DAYS = 300;
/** Max duration per single synthetic task in working days (~3 months) */
const MAX_TASK_DAYS = 60;
/** Min duration per individual task in working days */
const MIN_TASK_DAYS = 1;

// ============================================================================
// Main generator (async — fetches from DB)
// ============================================================================

/**
 * Generate a construction planning from a submission stored in the database.
 *
 * Steps:
 * 1. Fetch submission items grouped by lot/CFC
 * 2. Aggregate items into synthetic tasks (by material_group)
 * 3. Map groups into SIA standard phases
 * 4. Tasks within a phase are PARALLEL
 * 5. Phases are SEQUENTIAL
 * 6. Add milestones (start + reception provisoire)
 * 7. Calculate critical path
 * 8. Return the full planning structure
 */
export async function generatePlanning(params: {
  submission_id: string;
  project_id: string;
  org_id: string;
  config: PlanningConfig;
  supabase: any; // admin client
}): Promise<GeneratedPlanning> {
  const { submission_id, project_id, org_id, config, supabase } = params;

  // ── Fetch submission data ──
  const items = await fetchSubmissionItems(supabase, submission_id);

  if (items.length === 0) {
    throw new Error('Aucun poste trouve pour cette soumission');
  }

  // ── Fetch project name ──
  let projectName = 'Projet';
  try {
    const { data: project } = await supabase
      .from('projects')
      .select('name')
      .eq('id', project_id)
      .single();
    if (project?.name) projectName = project.name;
  } catch { /* non-critical */ }

  // ── Fetch org corrections ──
  const orgCorrections = await fetchOrgCorrections(supabase, org_id);

  // ── Generate planning ──
  return generatePlanningFromItems(items, config, projectName, orgCorrections);
}

// ============================================================================
// Pure function generator (no DB access — useful for testing)
// ============================================================================

/**
 * Generate a construction planning directly from item inputs.
 * Does not require a database connection.
 *
 * Algorithm:
 * 1. Aggregate items by material_group into synthetic tasks (20-40 max)
 * 2. Map synthetic tasks into SIA standard phases (6+1)
 * 3. Tasks within a phase are PARALLEL (phase duration = longest task)
 * 4. Phases are SEQUENTIAL (finish-to-start, lag=0)
 * 5. Cap total duration at 3 years; scale down if exceeded
 * 6. Insert milestones (start + reception provisoire)
 * 7. Compute critical path
 */
export function generatePlanningFromItems(
  items: SubmissionItemInput[],
  config: PlanningConfig,
  projectName: string,
  orgCorrections?: Array<{ cfc_code: string; corrected_ratio: number }>,
): GeneratedPlanning {
  const startDate = new Date(config.start_date);
  const generationStart = Date.now();
  const logEntries: string[] = [];

  logEntries.push(`[planning] Generating from ${items.length} items, start=${config.start_date}, type=${config.project_type}`);

  // ── Step 1: Aggregate items into synthetic tasks by material_group ──
  const syntheticTasks = aggregateIntoSyntheticTasks(items, config, startDate, orgCorrections);
  logEntries.push(`[planning] ${syntheticTasks.size} synthetic tasks from ${items.length} items`);

  // ── Step 2: Map synthetic tasks into SIA phases ──
  const phaseMap = mapToSIAPhases(syntheticTasks);
  logEntries.push(`[planning] ${phaseMap.size} SIA phases`);

  // ── Step 3: Calculate total duration and check cap ──
  let totalDuration = 0;
  for (const [, tasks] of phaseMap) {
    // Phase duration = longest task (parallel within phase)
    const phaseDuration = Math.max(...tasks.map((t) => t.duration_days), 0);
    totalDuration += phaseDuration;
  }

  // Scale factor: if total exceeds MAX_TOTAL_DAYS, compress proportionally
  let scaleFactor = 1.0;
  if (totalDuration > MAX_TOTAL_DAYS) {
    scaleFactor = MAX_TOTAL_DAYS / totalDuration;
    logEntries.push(`[planning] WARNING: Raw duration ${totalDuration} days exceeds cap ${MAX_TOTAL_DAYS}. Scaling by ${scaleFactor.toFixed(3)}`);
  }

  // ── Step 4: Build phases with parallel tasks and sequential phases ──
  const phases: GeneratedPhase[] = [];
  const flatTasks: GeneratedTask[] = [];
  let globalSortOrder = 0;
  let currentDate = new Date(startDate);

  // Insert "Start" milestone
  const startMilestone: GeneratedTask = {
    submission_item_id: null,
    name: 'Debut de chantier',
    description: '',
    cfc_code: null,
    start_date: config.start_date,
    end_date: config.start_date,
    duration_days: 0,
    quantity: null,
    unit: null,
    productivity_ratio: null,
    productivity_source: null,
    adjustment_factors: null,
    base_duration_days: null,
    team_size: 1,
    progress: 0,
    is_milestone: true,
    milestone_type: 'start',
    sort_order: globalSortOrder++,
  };

  // Sort phases by SIA order
  const sortedPhaseEntries = Array.from(phaseMap.entries()).sort(
    (a, b) => getSIAPhaseOrder(a[0]) - getSIAPhaseOrder(b[0]),
  );

  for (let pi = 0; pi < sortedPhaseEntries.length; pi++) {
    const [phaseName, phaseSyntheticTasks] = sortedPhaseEntries[pi];
    const phaseDef = findSIAPhase(phaseName);
    const color = phaseDef?.color ?? DIVERS_PHASE.color;

    // All CFC codes in this phase
    const cfcCodes = [
      ...new Set(
        phaseSyntheticTasks
          .map((t) => t.cfc_code)
          .filter(Boolean) as string[],
      ),
    ];

    const phaseStartDate = new Date(currentDate);
    const phaseTasks: GeneratedTask[] = [];

    // Within this phase, all tasks start at the same date (PARALLEL)
    let maxPhaseDuration = 0;

    for (const synTask of phaseSyntheticTasks) {
      // Apply scale factor if total was capped
      const scaledDuration = Math.max(
        MIN_TASK_DAYS,
        Math.ceil(synTask.duration_days * scaleFactor),
      );

      const taskEndDate = addWorkingDays(phaseStartDate, scaledDuration);

      const task: GeneratedTask = {
        submission_item_id: null, // Aggregated task — maps to multiple items
        name: synTask.name,
        description: synTask.description,
        cfc_code: synTask.cfc_code,
        start_date: formatDate(phaseStartDate),
        end_date: formatDate(taskEndDate),
        duration_days: scaledDuration,
        quantity: synTask.quantity,
        unit: synTask.unit,
        productivity_ratio: synTask.productivity_ratio,
        productivity_source: synTask.productivity_source,
        adjustment_factors: synTask.adjustment_factors,
        base_duration_days: synTask.base_duration_days,
        team_size: synTask.team_size,
        progress: 0,
        is_milestone: false,
        milestone_type: null,
        sort_order: globalSortOrder++,
      };

      phaseTasks.push(task);
      flatTasks.push(task);

      if (scaledDuration > maxPhaseDuration) {
        maxPhaseDuration = scaledDuration;
      }
    }

    // Phase end = start + longest task duration
    const phaseEndDate = addWorkingDays(phaseStartDate, maxPhaseDuration);

    phases.push({
      name: phaseName,
      cfc_codes: cfcCodes,
      color,
      sort_order: pi,
      start_date: formatDate(phaseStartDate),
      end_date: formatDate(phaseEndDate),
      tasks: phaseTasks,
    });

    // Next phase starts when this phase ends (sequential)
    currentDate = new Date(phaseEndDate);
  }

  logEntries.push(`[planning] ${flatTasks.length} tasks across ${phases.length} phases`);

  // ── Step 5: Create phase-to-phase FS dependencies ──
  const dependencies: GeneratedDependency[] = [];
  const allTasksFlat = [startMilestone, ...flatTasks];

  // Start milestone → first task of first phase
  if (phases.length > 0 && phases[0].tasks.length > 0) {
    // The first task after the start milestone is at index 1
    dependencies.push({
      predecessor_index: 0, // start milestone
      successor_index: 1,   // first task of first phase
      dependency_type: 'FS',
      lag_days: 0,
      source: 'auto',
    });
  }

  // Phase N last task → Phase N+1 first task (FS, lag=0)
  let taskOffset = 1; // skip start milestone
  for (let pi = 0; pi < phases.length - 1; pi++) {
    const currentPhaseTaskCount = phases[pi].tasks.length;
    const nextPhaseFirstTaskIndex = taskOffset + currentPhaseTaskCount;

    // Use the longest task in the current phase as the predecessor
    // (it determines when the phase actually ends)
    let longestTaskIndex = taskOffset;
    let longestDuration = 0;
    for (let ti = 0; ti < currentPhaseTaskCount; ti++) {
      const task = allTasksFlat[taskOffset + ti];
      if (task && task.duration_days > longestDuration) {
        longestDuration = task.duration_days;
        longestTaskIndex = taskOffset + ti;
      }
    }

    if (nextPhaseFirstTaskIndex < allTasksFlat.length) {
      dependencies.push({
        predecessor_index: longestTaskIndex,
        successor_index: nextPhaseFirstTaskIndex,
        dependency_type: 'FS',
        lag_days: 0,
        source: 'auto',
      });
    }

    taskOffset += currentPhaseTaskCount;
  }

  // ── Step 6: Insert "Reception provisoire" milestone ──
  const projectEndDate = phases.length > 0
    ? phases[phases.length - 1].end_date
    : config.start_date;

  const receptionMilestone: GeneratedTask = {
    submission_item_id: null,
    name: 'Reception provisoire (SIA 118)',
    description: '',
    cfc_code: null,
    start_date: projectEndDate,
    end_date: projectEndDate,
    duration_days: 0,
    quantity: null,
    unit: null,
    productivity_ratio: null,
    productivity_source: null,
    adjustment_factors: null,
    base_duration_days: null,
    team_size: 1,
    progress: 0,
    is_milestone: true,
    milestone_type: 'reception_provisoire',
    sort_order: globalSortOrder++,
  };

  // Add dependency from last phase longest task to reception milestone
  if (phases.length > 0) {
    // Find longest task in the last phase (before milestones are added)
    let longestIdx = -1;
    let longestDur = 0;
    const lastPhaseTasks = phases[phases.length - 1].tasks;
    for (const t of lastPhaseTasks) {
      if (!t.is_milestone && t.duration_days > longestDur) {
        longestDur = t.duration_days;
        longestIdx = t.sort_order;
      }
    }
    if (longestIdx >= 0) {
      dependencies.push({
        predecessor_index: longestIdx,
        successor_index: receptionMilestone.sort_order,
        dependency_type: 'FS',
        lag_days: 0,
        source: 'auto',
      });
    }
  }

  const phaseToPhaseDepCount = dependencies.length;
  logEntries.push(`[planning] ${phaseToPhaseDepCount} dependencies (phase-to-phase + milestones)`);

  // ── Step 5b: Inject CFC-based dependency rules (intra-phase and cross-phase) ──
  let cfcRuleDepCount = 0;
  for (const task of allTasksFlat) {
    const cfcCode = task.cfc_code;
    if (!cfcCode || task.is_milestone) continue;

    const rules = findDependenciesFrom(cfcCode);
    for (const rule of rules) {
      // Find tasks whose CFC code matches the rule's successor CFC
      // Use prefix matching: rule.to_cfc "271" matches task CFC "271", "271.1", "271.2.3"
      const successors = allTasksFlat.filter((t) =>
        t.cfc_code &&
        !t.is_milestone &&
        (t.cfc_code === rule.to_cfc ||
         t.cfc_code.startsWith(rule.to_cfc + '.') ||
         getMajorCfcGroup(t.cfc_code) === rule.to_cfc),
      );

      for (const successor of successors) {
        if (successor.sort_order === task.sort_order) continue;

        // Check if this exact dependency already exists (avoid duplicates)
        const exists = dependencies.some(
          (d) =>
            d.predecessor_index === task.sort_order &&
            d.successor_index === successor.sort_order,
        );
        if (exists) continue;

        dependencies.push({
          predecessor_index: task.sort_order,
          successor_index: successor.sort_order,
          dependency_type: rule.type,
          lag_days: rule.lag_days,
          source: 'rule',
        });
        cfcRuleDepCount++;
      }
    }
  }

  logEntries.push(`[planning] ${cfcRuleDepCount} CFC dependency rules injected`);
  logEntries.push(`[planning] ${dependencies.length} total dependencies (phase-to-phase + CFC rules + milestones)`);

  // Add milestones to phases
  if (phases.length > 0) {
    phases[0].tasks.unshift(startMilestone);
    phases[phases.length - 1].tasks.push(receptionMilestone);
  }

  // ── Step 7: Critical path analysis + date recalculation ──
  const allForCpm = [startMilestone, ...flatTasks, receptionMilestone];
  const cpmTasks = allForCpm.map((t) => ({
    id: t.sort_order.toString(),
    duration_days: t.duration_days,
    is_milestone: t.is_milestone,
  }));

  const cpmDeps = dependencies.map((d) => ({
    predecessor_id: d.predecessor_index.toString(),
    successor_id: d.successor_index.toString(),
    dependency_type: d.dependency_type,
    lag_days: d.lag_days,
  }));

  const cpmAnalysis = analyzeCriticalPath(cpmTasks, cpmDeps);
  const criticalPath = cpmAnalysis.critical_path;

  // ── Step 7b: Recalculate task dates from CPM early-start values ──
  // CFC rules may shift tasks later than their phase start date.
  // Use ES (Earliest Start) from the CPM forward pass to recompute dates.
  const taskBySortOrder = new Map<number, GeneratedTask>();
  for (const t of allForCpm) {
    taskBySortOrder.set(t.sort_order, t);
  }

  for (const [taskId, schedule] of cpmAnalysis.task_schedules) {
    const sortOrder = parseInt(taskId, 10);
    const task = taskBySortOrder.get(sortOrder);
    if (!task) continue;

    const newStart = addWorkingDays(startDate, schedule.es);
    const newEnd = addWorkingDays(startDate, schedule.ef);
    task.start_date = formatDate(newStart);
    task.end_date = formatDate(newEnd);
  }

  // Recalculate phase start/end dates from their tasks
  for (const phase of phases) {
    if (phase.tasks.length === 0) continue;
    let phaseStart = phase.tasks[0].start_date;
    let phaseEnd = phase.tasks[0].end_date;
    for (const t of phase.tasks) {
      if (t.start_date < phaseStart) phaseStart = t.start_date;
      if (t.end_date > phaseEnd) phaseEnd = t.end_date;
    }
    phase.start_date = phaseStart;
    phase.end_date = phaseEnd;
  }

  // Recalculate the project end date from phases
  const recalculatedEndDate = phases.length > 0
    ? phases.reduce((max, p) => p.end_date > max ? p.end_date : max, phases[0].end_date)
    : config.start_date;

  logEntries.push(`[planning] Critical path: ${criticalPath.length} tasks, project duration: ${cpmAnalysis.project_duration} working days`);
  logEntries.push(`[planning] Calculated end date: ${recalculatedEndDate} (scale factor: ${scaleFactor.toFixed(3)})`);
  logEntries.push(`[planning] Generated in ${Date.now() - generationStart}ms`);

  return {
    title: `Planning — ${projectName}`,
    phases,
    dependencies,
    calculated_end_date: recalculatedEndDate,
    critical_path_length: cpmTasks.reduce(
      (sum, t) => sum + (criticalPath.includes(t.id) ? t.duration_days : 0),
      0,
    ),
    ai_generation_log: {
      generated_at: new Date().toISOString(),
      generation_time_ms: Date.now() - generationStart,
      items_count: items.length,
      synthetic_tasks_count: flatTasks.length,
      phases_count: phases.length,
      dependencies_count: dependencies.length,
      cfc_rule_dependencies_count: cfcRuleDepCount,
      scale_factor: scaleFactor,
      critical_path_task_ids: criticalPath,
      config,
      log: logEntries,
    },
  };
}

// ============================================================================
// Step 1: Aggregate items into synthetic tasks by material_group
// ============================================================================

function aggregateIntoSyntheticTasks(
  items: SubmissionItemInput[],
  config: PlanningConfig,
  startDate: Date,
  orgCorrections?: Array<{ cfc_code: string; corrected_ratio: number }>,
): Map<string, SyntheticTask> {
  // Group items by material_group
  const groupMap = new Map<string, SubmissionItemInput[]>();

  for (const item of items) {
    if (!item.quantity || !item.unit) continue;
    const groupName = item.material_group || 'Divers';
    if (!groupMap.has(groupName)) groupMap.set(groupName, []);
    groupMap.get(groupName)!.push(item);
  }

  const syntheticTasks = new Map<string, SyntheticTask>();

  for (const [groupName, groupItems] of groupMap) {
    // ── Aggregate quantities by unit ──
    const unitCounts = new Map<string, { qty: number; items: SubmissionItemInput[] }>();
    for (const item of groupItems) {
      if (item.unit && item.quantity) {
        const normUnit = item.unit.toLowerCase().replace(/[²³]/g, (m) => m === '²' ? '2' : '3');
        const entry = unitCounts.get(normUnit) || { qty: 0, items: [] };
        entry.qty += item.quantity;
        entry.items.push(item);
        unitCounts.set(normUnit, entry);
      }
    }

    // Find dominant unit (most total quantity)
    let dominantUnit: string | null = null;
    let dominantQty = 0;
    for (const [u, { qty }] of unitCounts) {
      if (qty > dominantQty) { dominantQty = qty; dominantUnit = u; }
    }

    // ── Find best CFC code (most frequent in the group) ──
    const cfcFreq = new Map<string, number>();
    for (const item of groupItems) {
      if (item.cfc_code) {
        cfcFreq.set(item.cfc_code, (cfcFreq.get(item.cfc_code) || 0) + 1);
      }
    }
    let bestCfc: string | null = null;
    let bestCfcCount = 0;
    for (const [code, count] of cfcFreq) {
      if (count > bestCfcCount) { bestCfcCount = count; bestCfc = code; }
    }

    // ── Calculate duration using AGGREGATED quantity ──
    // Use the total quantity of the dominant unit with the group's CFC code.
    // This is more realistic: a construction crew works on ALL items in the group.
    const cfcCode = bestCfc ?? '000';
    const ratioEntry = findProductivityRatio(cfcCode, dominantUnit ?? undefined);
    const defaultTeam = ratioEntry?.team_size_default ?? 2;

    let result: DurationResult;
    try {
      result = calculateDuration({
        quantity: dominantQty || groupItems.length,
        unit: dominantUnit || 'pce',
        cfc_code: cfcCode,
        team_size: defaultTeam,
        start_date: startDate,
        project_type: config.project_type,
        canton: config.canton,
        org_corrections: orgCorrections,
      });
    } catch {
      result = {
        duration_days: 5,
        base_duration_days: 5,
        productivity_ratio: 0,
        productivity_source: 'ai_estimate',
        adjustment_factors: {},
      };
    }

    // ── Auto-scale teams for large durations ──
    // In construction, you add more crews when the job is too big for one team.
    let finalDuration = result.duration_days;
    let finalTeamSize = defaultTeam;
    const adjustmentFactors = { ...(result.adjustment_factors ?? {}) };

    if (finalDuration > MAX_TASK_DAYS) {
      // Scale up teams with diminishing returns (Brooks' law)
      const teamsNeeded = Math.ceil(finalDuration / MAX_TASK_DAYS);
      const efficiency = 1 / (1 + (teamsNeeded - 1) * 0.25); // 75% efficiency per extra team
      finalDuration = Math.ceil(finalDuration / (teamsNeeded * efficiency));
      finalTeamSize = defaultTeam * teamsNeeded;
      adjustmentFactors['team_auto_scale'] = teamsNeeded;
    }

    // Clamp to caps
    finalDuration = Math.min(MAX_TASK_DAYS, Math.max(MIN_TASK_DAYS, finalDuration));

    // Build description
    const firstDescriptions = groupItems
      .slice(0, 3)
      .map((i) => i.description.substring(0, 80))
      .join(', ');
    const suffix = groupItems.length > 3 ? `, ... (+${groupItems.length - 3})` : '';
    const description = `${groupItems.length} postes — ${firstDescriptions}${suffix}`;

    syntheticTasks.set(groupName, {
      name: groupName,
      description,
      source_item_ids: groupItems.map((i) => i.id),
      cfc_code: bestCfc,
      duration_days: finalDuration,
      quantity: dominantQty || groupItems.length,
      unit: dominantUnit,
      productivity_ratio: result.productivity_ratio,
      productivity_source: result.productivity_source,
      adjustment_factors: Object.keys(adjustmentFactors).length > 0 ? adjustmentFactors : null,
      base_duration_days: result.base_duration_days,
      team_size: finalTeamSize,
    });
  }

  return syntheticTasks;
}

// ============================================================================
// Step 2: Map material_groups into SIA standard phases
// ============================================================================

/**
 * Normalize a string for case-insensitive, accent-insensitive comparison.
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[àâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[ùûü]/g, 'u')
    .replace(/[ôö]/g, 'o')
    .replace(/[îï]/g, 'i')
    .replace(/[ç]/g, 'c')
    .replace(/[œ]/g, 'oe')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a material_group matches a SIA phase group entry.
 * Uses case-insensitive partial matching:
 * - "Structure beton" matches group "Beton arme" if they share the word "beton"
 * - "Béton armé" matches "Beton arme" after normalization
 */
function matchesGroup(materialGroup: string, phaseGroup: string): boolean {
  const normGroup = normalizeForMatch(materialGroup);
  const normPhase = normalizeForMatch(phaseGroup);

  // Exact match after normalization
  if (normGroup === normPhase) return true;

  // Check if one contains the other
  if (normGroup.includes(normPhase) || normPhase.includes(normGroup)) return true;

  // Word-level partial match: if any significant word (3+ chars) overlaps
  const groupWords = normGroup.split(' ').filter((w) => w.length >= 3);
  const phaseWords = normPhase.split(' ').filter((w) => w.length >= 3);

  for (const gw of groupWords) {
    for (const pw of phaseWords) {
      if (gw === pw) return true;
    }
  }

  return false;
}

function findSIAPhaseForGroup(materialGroup: string): SIAPhaseDefinition {
  for (const phase of SIA_PHASES) {
    for (const group of phase.groups) {
      if (matchesGroup(materialGroup, group)) {
        return phase;
      }
    }
  }
  return DIVERS_PHASE;
}

function findSIAPhase(phaseName: string): SIAPhaseDefinition | null {
  return SIA_PHASES.find((p) => p.name === phaseName) ?? null;
}

function getSIAPhaseOrder(phaseName: string): number {
  const phase = SIA_PHASES.find((p) => p.name === phaseName);
  return phase?.order ?? DIVERS_PHASE.order;
}

function mapToSIAPhases(
  syntheticTasks: Map<string, SyntheticTask>,
): Map<string, SyntheticTask[]> {
  const phaseMap = new Map<string, SyntheticTask[]>();

  for (const [, task] of syntheticTasks) {
    const phase = findSIAPhaseForGroup(task.name);
    const phaseName = phase.name;

    if (!phaseMap.has(phaseName)) phaseMap.set(phaseName, []);
    phaseMap.get(phaseName)!.push(task);
  }

  // Remove empty phases
  for (const [key, tasks] of phaseMap) {
    if (tasks.length === 0) phaseMap.delete(key);
  }

  return phaseMap;
}

// ============================================================================
// Database fetchers
// ============================================================================

async function fetchSubmissionItems(
  supabase: any,
  submissionId: string,
): Promise<SubmissionItemInput[]> {
  // Fetch items directly by submission_id (Cantaia stores items flat, not via lots)
  const { data: items, error: itemsError } = await supabase
    .from('submission_items')
    .select('id, item_number, description, unit, quantity, cfc_code, material_group, product_name, status')
    .eq('submission_id', submissionId)
    .order('item_number', { ascending: true });

  if (itemsError) {
    throw new Error(`Erreur lecture postes: ${itemsError.message}`);
  }

  if (!items || items.length === 0) {
    return [];
  }

  // Map to SubmissionItemInput
  return items.map((item: any) => {
    return {
      id: item.id,
      item_number: item.item_number,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity ? Number(item.quantity) : null,
      cfc_code: item.cfc_code ?? null,
      material_group: item.material_group ?? 'Divers',
    };
  });
}

async function fetchOrgCorrections(
  supabase: any,
  orgId: string,
): Promise<Array<{ cfc_code: string; corrected_ratio: number }>> {
  try {
    const { data, error } = await supabase
      .from('planning_duration_corrections')
      .select('cfc_code, corrected_ratio')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    // De-duplicate: keep most recent correction per cfc_code
    const seen = new Set<string>();
    const results: Array<{ cfc_code: string; corrected_ratio: number }> = [];
    for (const row of data) {
      if (!seen.has(row.cfc_code)) {
        seen.add(row.cfc_code);
        results.push({ cfc_code: row.cfc_code, corrected_ratio: row.corrected_ratio });
      }
    }
    return results;
  } catch {
    // Table may not exist yet (migration not applied)
    return [];
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Format a Date to ISO date string (YYYY-MM-DD) */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
