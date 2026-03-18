// ═══════════════════════════════════════════════════════════════
// Cantaia Gantt — Critical Path Method (CPM) Algorithm
// Standard forward/backward pass with float calculation.
// Tasks with total float = 0 lie on the critical path.
// ═══════════════════════════════════════════════════════════════

// ============================================================================
// Types
// ============================================================================

export interface PlanningTask {
  id: string;
  duration_days: number;
  is_milestone?: boolean;
}

export interface PlanningDependency {
  predecessor_id: string;
  successor_id: string;
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days: number;
}

export interface TaskSchedule {
  /** Earliest Start (in working days from project start, 0-indexed) */
  es: number;
  /** Earliest Finish */
  ef: number;
  /** Latest Start */
  ls: number;
  /** Latest Finish */
  lf: number;
  /** Total Float = LS - ES (or LF - EF) */
  total_float: number;
}

// ============================================================================
// CPM Algorithm
// ============================================================================

/**
 * Calculate the critical path using the standard CPM algorithm.
 *
 * Steps:
 * 1. Build adjacency lists (successors and predecessors)
 * 2. Topological sort (Kahn's algorithm)
 * 3. Forward pass: compute ES and EF for each task
 * 4. Backward pass: compute LS and LF for each task
 * 5. Float = LS - ES for each task
 * 6. Critical path = all tasks where float = 0
 *
 * @param tasks Array of tasks with id and duration
 * @param dependencies Array of dependencies between tasks
 * @returns Array of task IDs on the critical path, in execution order
 */
export function calculateCriticalPath(
  tasks: PlanningTask[],
  dependencies: PlanningDependency[],
): string[] {
  const analysis = analyzeCriticalPath(tasks, dependencies);
  return analysis.critical_path;
}

// ============================================================================
// Extended analysis
// ============================================================================

export interface CriticalPathAnalysis {
  /** Task IDs on the critical path, in topological order */
  critical_path: string[];
  /** Total project duration in working days */
  project_duration: number;
  /** Per-task schedule details */
  task_schedules: Map<string, TaskSchedule>;
}

/**
 * Full CPM analysis returning schedules for all tasks.
 * Useful for displaying float values in the Gantt chart.
 */
export function analyzeCriticalPath(
  tasks: PlanningTask[],
  dependencies: PlanningDependency[],
): CriticalPathAnalysis {
  if (tasks.length === 0) {
    return { critical_path: [], project_duration: 0, task_schedules: new Map() };
  }

  if (tasks.length === 1) {
    const t = tasks[0];
    const sched: TaskSchedule = {
      es: 0, ef: t.duration_days,
      ls: 0, lf: t.duration_days,
      total_float: 0,
    };
    return {
      critical_path: [t.id],
      project_duration: t.duration_days,
      task_schedules: new Map([[t.id, sched]]),
    };
  }

  // ── Build lookup maps ──
  const taskMap = new Map<string, PlanningTask>();
  for (const t of tasks) {
    taskMap.set(t.id, t);
  }

  const successorsMap = new Map<string, Array<{ id: string; type: string; lag: number }>>();
  const predecessorsMap = new Map<string, Array<{ id: string; type: string; lag: number }>>();

  for (const t of tasks) {
    successorsMap.set(t.id, []);
    predecessorsMap.set(t.id, []);
  }

  for (const dep of dependencies) {
    // Only process dependencies where both tasks exist
    if (!taskMap.has(dep.predecessor_id) || !taskMap.has(dep.successor_id)) continue;

    successorsMap.get(dep.predecessor_id)!.push({
      id: dep.successor_id,
      type: dep.dependency_type,
      lag: dep.lag_days,
    });
    predecessorsMap.get(dep.successor_id)!.push({
      id: dep.predecessor_id,
      type: dep.dependency_type,
      lag: dep.lag_days,
    });
  }

  // ── Topological sort (Kahn's algorithm) ──
  const inDegree = new Map<string, number>();
  for (const t of tasks) {
    inDegree.set(t.id, 0);
  }
  for (const dep of dependencies) {
    if (!taskMap.has(dep.predecessor_id) || !taskMap.has(dep.successor_id)) continue;
    inDegree.set(dep.successor_id, (inDegree.get(dep.successor_id) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const t of tasks) {
    if ((inDegree.get(t.id) ?? 0) === 0) {
      queue.push(t.id);
    }
  }

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    topoOrder.push(current);

    for (const succ of successorsMap.get(current) ?? []) {
      const newDegree = (inDegree.get(succ.id) ?? 1) - 1;
      inDegree.set(succ.id, newDegree);
      if (newDegree === 0) {
        queue.push(succ.id);
      }
    }
  }

  // If topological sort doesn't include all tasks, there may be a cycle.
  // Include remaining tasks at the end to avoid losing data.
  if (topoOrder.length < tasks.length) {
    for (const t of tasks) {
      if (!topoOrder.includes(t.id)) {
        topoOrder.push(t.id);
      }
    }
  }

  // ── Forward pass: compute ES and EF ──
  const scheduleMap = new Map<string, TaskSchedule>();
  for (const t of tasks) {
    scheduleMap.set(t.id, { es: 0, ef: 0, ls: 0, lf: 0, total_float: 0 });
  }

  for (const taskId of topoOrder) {
    const task = taskMap.get(taskId)!;
    const sched = scheduleMap.get(taskId)!;

    // ES = max over all predecessor constraints
    let maxES = 0;
    for (const pred of predecessorsMap.get(taskId) ?? []) {
      const predSched = scheduleMap.get(pred.id)!;

      const constraintValue = computeForwardConstraint(
        pred.type,
        predSched.es,
        predSched.ef,
        pred.lag,
        task.duration_days,
      );
      maxES = Math.max(maxES, constraintValue);
    }

    sched.es = maxES;
    sched.ef = sched.es + task.duration_days;
  }

  // ── Project end time ──
  let projectEnd = 0;
  for (const t of tasks) {
    const sched = scheduleMap.get(t.id)!;
    projectEnd = Math.max(projectEnd, sched.ef);
  }

  // ── Backward pass: compute LS and LF ──
  // Initialize all to project end
  for (const t of tasks) {
    const s = scheduleMap.get(t.id)!;
    s.lf = projectEnd;
    s.ls = s.lf - t.duration_days;
  }

  // Process in reverse topological order
  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const taskId = topoOrder[i];
    const task = taskMap.get(taskId)!;
    const sched = scheduleMap.get(taskId)!;

    // LF = min over all successor constraints
    let minLF = projectEnd;
    for (const succ of successorsMap.get(taskId) ?? []) {
      const succSched = scheduleMap.get(succ.id)!;

      const constraintValue = computeBackwardConstraint(
        succ.type,
        succSched.ls,
        succSched.lf,
        succ.lag,
        task.duration_days,
      );
      minLF = Math.min(minLF, constraintValue);
    }

    sched.lf = minLF;
    sched.ls = sched.lf - task.duration_days;
  }

  // ── Calculate float and identify critical path ──
  const criticalPath: string[] = [];
  for (const taskId of topoOrder) {
    const sched = scheduleMap.get(taskId)!;
    sched.total_float = Math.round((sched.ls - sched.es) * 1000) / 1000;

    if (Math.abs(sched.total_float) < 0.001) {
      criticalPath.push(taskId);
    }
  }

  return {
    critical_path: criticalPath,
    project_duration: projectEnd,
    task_schedules: scheduleMap,
  };
}

// ============================================================================
// Constraint computation helpers for dependency types
// ============================================================================

/**
 * Forward pass: given a predecessor's schedule, compute the earliest
 * the successor can start (or the earliest its finish must be).
 *
 * Returns the minimum ES value for the successor.
 */
function computeForwardConstraint(
  type: string,
  predES: number,
  predEF: number,
  lag: number,
  succDuration: number,
): number {
  switch (type) {
    case 'FS':
      // Finish-to-Start: successor starts after predecessor finishes + lag
      return predEF + lag;
    case 'SS':
      // Start-to-Start: successor starts after predecessor starts + lag
      return predES + lag;
    case 'FF':
      // Finish-to-Finish: successor finishes after predecessor finishes + lag
      // EF_succ >= EF_pred + lag  =>  ES_succ >= EF_pred + lag - duration_succ
      return predEF + lag - succDuration;
    case 'SF':
      // Start-to-Finish: successor finishes after predecessor starts + lag
      // EF_succ >= ES_pred + lag  =>  ES_succ >= ES_pred + lag - duration_succ
      return predES + lag - succDuration;
    default:
      return predEF + lag;
  }
}

/**
 * Backward pass: given a successor's schedule, compute the latest
 * the predecessor can finish (LF constraint).
 */
function computeBackwardConstraint(
  type: string,
  succLS: number,
  succLF: number,
  lag: number,
  predDuration: number,
): number {
  switch (type) {
    case 'FS':
      // Finish-to-Start: predecessor must finish before successor starts - lag
      // LF_pred <= LS_succ - lag
      return succLS - lag;
    case 'SS':
      // Start-to-Start: predecessor must start before successor starts - lag
      // LS_pred <= LS_succ - lag  =>  LF_pred <= LS_succ - lag + duration_pred
      return succLS - lag + predDuration;
    case 'FF':
      // Finish-to-Finish: predecessor must finish before successor finishes - lag
      return succLF - lag;
    case 'SF':
      // Start-to-Finish: predecessor must start before successor finishes - lag
      // LS_pred <= LF_succ - lag  =>  LF_pred <= LF_succ - lag + duration_pred
      return succLF - lag + predDuration;
    default:
      return succLS - lag;
  }
}
