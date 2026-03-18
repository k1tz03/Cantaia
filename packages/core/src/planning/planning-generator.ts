// ═══════════════════════════════════════════════════════════════
// Cantaia Gantt — Planning Generator (Orchestrator)
// Generates a full project planning from submission items.
// Pure algorithmic — no AI calls required.
// ═══════════════════════════════════════════════════════════════

import { findProductivityRatio } from './productivity-ratios';
import { DEPENDENCY_RULES, getMajorCfcGroup } from './dependency-rules';
import { calculateDuration, addWorkingDays, type DurationResult } from './duration-calculator';
import { calculateCriticalPath } from './critical-path';

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
  source: 'auto' | 'manual';
}

export interface GeneratedPlanning {
  title: string;
  phases: GeneratedPhase[];
  dependencies: GeneratedDependency[];
  calculated_end_date: string;
  critical_path_length: number;
  ai_generation_log: Record<string, unknown>;
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

// Phase color palette
const PHASE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1',
  '#14B8A6', '#EF4444', '#84CC16', '#A855F7',
];

// Phase ordering by CFC group (construction sequence)
const CFC_PHASE_ORDER: Record<string, number> = {
  '1': 1,    // Travaux preparatoires
  '113': 1,
  '114': 1,
  '116': 1,
  '117': 1,
  '151': 2,  // Canalisations
  '2': 3,    // Gros-oeuvre
  '211': 3,
  '213': 3,
  '214': 4,
  '215': 4,
  '216': 5,
  '221': 6,  // Enveloppe
  '222': 6,
  '224': 7,  // Facade
  '225': 7,
  '227': 7,
  '228': 7,
  '231': 8,  // Techniques
  '232': 8,
  '234': 9,
  '241': 9,
  '242': 9,
  '244': 9,
  '245': 9,
  '251': 10, // Sanitaire
  '261': 11, // Amenagement
  '271': 11,
  '273': 11,
  '281': 12, // Finitions
  '283': 12,
  '285': 12,
  '286': 12,
  '291': 13,
  '311': 14, // Systemes
  '421': 15,
};

function getPhaseOrder(cfcCode: string): number {
  if (CFC_PHASE_ORDER[cfcCode] != null) return CFC_PHASE_ORDER[cfcCode];
  const major = getMajorCfcGroup(cfcCode);
  if (CFC_PHASE_ORDER[major] != null) return CFC_PHASE_ORDER[major];
  const majorFirst = major.charAt(0);
  if (CFC_PHASE_ORDER[majorFirst] != null) return CFC_PHASE_ORDER[majorFirst];
  return 99;
}

// Phase name mapping by material_group
const PHASE_NAME_MAP: Record<string, string> = {
  'Terrassement': 'Terrassement',
  'Fondations': 'Fondations / Gros-oeuvre',
  'Beton arme': 'Structure beton',
  'Coffrage': 'Structure beton',
  'Ferraillage': 'Structure beton',
  'Maconnerie': 'Maconnerie',
  'Etancheite': 'Etancheite',
  'Isolation thermique': 'Isolation',
  'Fenetres/Portes': 'Fenetres et portes',
  'Facades': 'Facades',
  'Toiture': 'Toiture',
  'Ferblanterie': 'Toiture',
  'Electricite': 'Electricite',
  'CVC/Chauffage': 'CVC / Chauffage',
  'Sanitaire/Plomberie': 'Sanitaire',
  'Ventilation': 'CVC / Chauffage',
  'Revetements sols': 'Revetements',
  'Revetements murs': 'Revetements',
  'Peinture': 'Peinture',
  'Platrerie': 'Platrerie / Cloisons',
  'Menuiserie interieure': 'Menuiserie',
  'Faux plafonds': 'Faux plafonds',
  'Construction metallique': 'Construction metallique',
  'Amenagements exterieurs': 'Amenagements exterieurs',
  'Ascenseurs': 'Ascenseurs',
  'Installations de chantier': 'Installations de chantier',
  'Divers': 'Divers',
};

// ============================================================================
// Main generator (async — fetches from DB)
// ============================================================================

/**
 * Generate a construction planning from a submission stored in the database.
 *
 * Steps:
 * 1. Fetch submission items grouped by lot/CFC
 * 2. Group items into phases by CFC category
 * 3. Calculate durations for each phase using duration-calculator
 * 4. Apply dependency rules
 * 5. Calculate start/end dates (respecting dependencies)
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
    throw new Error('Aucun poste trouvé pour cette soumission');
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
 * 1. Group items by material_group into phases
 * 2. Calculate duration for each task using productivity ratios
 * 3. Apply CFC-based dependency rules between phases
 * 4. Sequence tasks within phases
 * 5. Insert milestones (start + reception provisoire)
 * 6. Compute critical path
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

  // ── Step 1: Group items into phases ──
  const phaseGroupMap = new Map<string, SubmissionItemInput[]>();

  for (const item of items) {
    if (!item.quantity || !item.unit) continue;
    const phaseName = PHASE_NAME_MAP[item.material_group] ?? item.material_group;
    if (!phaseGroupMap.has(phaseName)) phaseGroupMap.set(phaseName, []);
    phaseGroupMap.get(phaseName)!.push(item);
  }

  logEntries.push(`[planning] ${phaseGroupMap.size} phases from ${items.length} items`);

  // Sort phases by CFC construction sequence
  const sortedPhaseNames = Array.from(phaseGroupMap.keys()).sort((a, b) => {
    const itemsA = phaseGroupMap.get(a)!;
    const itemsB = phaseGroupMap.get(b)!;
    const orderA = Math.min(...itemsA.map((i) => getPhaseOrder(i.cfc_code ?? '999')));
    const orderB = Math.min(...itemsB.map((i) => getPhaseOrder(i.cfc_code ?? '999')));
    return orderA - orderB;
  });

  // ── Step 2: Calculate durations and build phases ──
  const phases: GeneratedPhase[] = [];
  const flatTasks: GeneratedTask[] = [];
  const taskCfcMap: { cfcCode: string; taskIndex: number }[] = [];

  let currentDate = new Date(startDate);
  let globalSortOrder = 0;

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

  for (let pi = 0; pi < sortedPhaseNames.length; pi++) {
    const phaseName = sortedPhaseNames[pi];
    const phaseItems = phaseGroupMap.get(phaseName)!;
    const color = PHASE_COLORS[pi % PHASE_COLORS.length];
    const cfcCodes = [...new Set(phaseItems.map((i) => i.cfc_code).filter(Boolean))] as string[];

    const phaseTasks: GeneratedTask[] = [];
    let phaseStartDate = new Date(currentDate);
    let phaseEndDate = new Date(currentDate);

    for (const item of phaseItems) {
      if (!item.quantity || !item.unit) continue;

      const cfcCode = item.cfc_code ?? '000';
      let durationResult: DurationResult;

      try {
        durationResult = calculateDuration({
          quantity: item.quantity,
          unit: item.unit,
          cfc_code: cfcCode,
          team_size: findProductivityRatio(cfcCode, item.unit)?.team_size_default ?? 2,
          start_date: currentDate,
          project_type: config.project_type,
          canton: config.canton,
          org_corrections: orgCorrections,
        });
      } catch {
        durationResult = {
          duration_days: 5,
          base_duration_days: 5,
          productivity_ratio: 0,
          productivity_source: 'ai_estimate',
          adjustment_factors: {},
        };
      }

      const taskStartDate = new Date(currentDate);
      const taskEndDate = addWorkingDays(taskStartDate, durationResult.duration_days);

      const task: GeneratedTask = {
        submission_item_id: item.id,
        name: item.description.substring(0, 120),
        description: item.description,
        cfc_code: cfcCode,
        start_date: formatDate(taskStartDate),
        end_date: formatDate(taskEndDate),
        duration_days: durationResult.duration_days,
        quantity: item.quantity,
        unit: item.unit,
        productivity_ratio: durationResult.productivity_ratio,
        productivity_source: durationResult.productivity_source,
        adjustment_factors: durationResult.adjustment_factors,
        base_duration_days: durationResult.base_duration_days,
        team_size: findProductivityRatio(cfcCode, item.unit)?.team_size_default ?? 2,
        progress: 0,
        is_milestone: false,
        milestone_type: null,
        sort_order: globalSortOrder++,
      };

      phaseTasks.push(task);
      const taskIndex = flatTasks.length + 1; // +1 for start milestone at index 0
      flatTasks.push(task);
      taskCfcMap.push({ cfcCode, taskIndex });

      if (taskEndDate > phaseEndDate) phaseEndDate = taskEndDate;

      // Tasks within same phase start sequentially
      currentDate = new Date(taskEndDate);
    }

    phases.push({
      name: phaseName,
      cfc_codes: cfcCodes,
      color,
      sort_order: pi,
      start_date: formatDate(phaseStartDate),
      end_date: formatDate(phaseEndDate),
      tasks: phaseTasks,
    });
  }

  // ── Step 3: Apply CFC-based dependencies ──
  const dependencies: GeneratedDependency[] = [];

  for (const rule of DEPENDENCY_RULES) {
    const fromTasks = taskCfcMap.filter(
      (t) => t.cfcCode === rule.from_cfc || t.cfcCode.startsWith(rule.from_cfc + '.'),
    );
    const toTasks = taskCfcMap.filter(
      (t) => t.cfcCode === rule.to_cfc || t.cfcCode.startsWith(rule.to_cfc + '.'),
    );

    if (fromTasks.length > 0 && toTasks.length > 0) {
      const fromLast = fromTasks[fromTasks.length - 1];
      const toFirst = toTasks[0];

      // Avoid duplicates
      const exists = dependencies.some(
        (d) => d.predecessor_index === fromLast.taskIndex && d.successor_index === toFirst.taskIndex,
      );
      if (!exists) {
        dependencies.push({
          predecessor_index: fromLast.taskIndex,
          successor_index: toFirst.taskIndex,
          dependency_type: rule.type,
          lag_days: rule.lag_days,
          source: 'auto',
        });
      }
    }
  }

  logEntries.push(`[planning] ${dependencies.length} dependencies from CFC rules`);

  // ── Step 4: Recalculate dates based on dependencies ──
  const allTasksFlat = [startMilestone, ...flatTasks];

  for (const dep of dependencies) {
    const pred = allTasksFlat[dep.predecessor_index];
    const succ = allTasksFlat[dep.successor_index];
    if (!pred || !succ) continue;

    let requiredStart: Date;
    switch (dep.dependency_type) {
      case 'FS':
        requiredStart = new Date(pred.end_date);
        requiredStart.setDate(requiredStart.getDate() + dep.lag_days);
        break;
      case 'SS':
        requiredStart = new Date(pred.start_date);
        requiredStart.setDate(requiredStart.getDate() + dep.lag_days);
        break;
      case 'FF':
        requiredStart = new Date(pred.end_date);
        requiredStart.setDate(requiredStart.getDate() + dep.lag_days - succ.duration_days);
        break;
      case 'SF':
        requiredStart = new Date(pred.start_date);
        requiredStart.setDate(requiredStart.getDate() + dep.lag_days - succ.duration_days);
        break;
      default:
        requiredStart = new Date(pred.end_date);
        requiredStart.setDate(requiredStart.getDate() + dep.lag_days);
    }

    const currentStart = new Date(succ.start_date);
    if (requiredStart > currentStart) {
      succ.start_date = formatDate(requiredStart);
      const newEnd = addWorkingDays(requiredStart, succ.duration_days);
      succ.end_date = formatDate(newEnd);
    }
  }

  // Update phase dates from tasks
  for (const phase of phases) {
    if (phase.tasks.length > 0) {
      const starts = phase.tasks.map((t) => t.start_date).sort();
      const ends = phase.tasks.map((t) => t.end_date).sort();
      phase.start_date = starts[0];
      phase.end_date = ends[ends.length - 1];
    }
  }

  // ── Step 5: Insert "Reception provisoire" milestone ──
  const allEndDates = allTasksFlat.map((t) => t.end_date).sort();
  const projectEndDate = allEndDates[allEndDates.length - 1] || config.start_date;

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

  // Add milestones to the first and last phase
  if (phases.length > 0) {
    phases[0].tasks.unshift(startMilestone);
    phases[phases.length - 1].tasks.push(receptionMilestone);
  }

  // ── Step 6: Critical path ──
  const cpmTasks = allTasksFlat.map((t) => ({
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
  const criticalPath = calculateCriticalPath(cpmTasks, cpmDeps);

  logEntries.push(`[planning] Critical path: ${criticalPath.length} tasks`);
  logEntries.push(`[planning] Generated in ${Date.now() - generationStart}ms`);

  return {
    title: `Planning — ${projectName}`,
    phases,
    dependencies,
    calculated_end_date: projectEndDate,
    critical_path_length: cpmTasks.reduce(
      (sum, t) => sum + (criticalPath.includes(t.id) ? t.duration_days : 0),
      0,
    ),
    ai_generation_log: {
      generated_at: new Date().toISOString(),
      generation_time_ms: Date.now() - generationStart,
      items_count: items.length,
      phases_count: phases.length,
      dependencies_count: dependencies.length,
      critical_path_task_ids: criticalPath,
      config,
      log: logEntries,
    },
  };
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
