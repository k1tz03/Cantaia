import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addWorkingDays, rescheduleCPM } from "@cantaia/core/planning";
import type { GeneratedPlanning, GeneratedTask } from "@cantaia/core/planning";

// A reschedule persists new dates for every moved task; on a large planning the
// batched writes still need more than the default budget.
export const maxDuration = 60;

/**
 * GET /api/planning/[id]
 * Fetch planning with phases, tasks, dependencies.
 * Also supports ?project_id=xxx to find planning by project.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Support lookup by project_id (id param = "by-project" + query param)
    let planningId = id;
    const projectId = request.nextUrl.searchParams.get("project_id");

    if (id === "by-project" && projectId) {
      const { data: planningByProject } = await (admin as any)
        .from("project_plannings")
        .select("id")
        .eq("project_id", projectId)
        .eq("organization_id", userProfile.organization_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!planningByProject) {
        return NextResponse.json({ planning: null });
      }
      planningId = planningByProject.id;
    }

    // Fetch planning
    const { data: planning, error: planningError } = await (admin as any)
      .from("project_plannings")
      .select("*")
      .eq("id", planningId)
      .maybeSingle();

    if (planningError || !planning) {
      return NextResponse.json({ error: "Planning not found" }, { status: 404 });
    }

    if (planning.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch phases
    const { data: phases } = await (admin as any)
      .from("planning_phases")
      .select("*")
      .eq("planning_id", planningId)
      .order("sort_order", { ascending: true });

    // Fetch tasks with supplier names
    const { data: tasks } = await (admin as any)
      .from("planning_tasks")
      .select("*, suppliers(company_name)")
      .eq("planning_id", planningId)
      .order("sort_order", { ascending: true });

    // Fetch dependencies
    const { data: dependencies } = await (admin as any)
      .from("planning_dependencies")
      .select("*")
      .eq("planning_id", planningId);

    // Enrich tasks with supplier name
    const enrichedTasks = (tasks || []).map((t: any) => ({
      ...t,
      supplier_name: t.suppliers?.company_name || null,
      suppliers: undefined,
    }));

    return NextResponse.json({
      planning,
      phases: phases || [],
      tasks: enrichedTasks,
      dependencies: dependencies || [],
    });
  } catch (err: any) {
    console.error("[planning/[id]] GET error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/planning/[id]
 * Update planning fields or individual task.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Verify planning belongs to org
    const { data: planning } = await (admin as any)
      .from("project_plannings")
      .select("id, organization_id, project_type, location_canton")
      .eq("id", id)
      .maybeSingle();

    if (!planning || planning.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    // ─── Action-based CRUD operations ──────────────────────────────────────────
    if (body.action) {
      return handleCrudAction(body, id, admin, userProfile.organization_id);
    }

    // Case 1: Update a task (body contains task_id)
    if (body.task_id) {
      const { task_id, ...updates } = body;

      // If duration changed, save a correction for learning
      if (updates.duration_days != null) {
        const { data: existingTask } = await (admin as any)
          .from("planning_tasks")
          .select("duration_days, cfc_code, unit, productivity_ratio")
          .eq("id", task_id)
          .eq("planning_id", id)
          .maybeSingle();

        if (existingTask && existingTask.duration_days !== updates.duration_days && existingTask.cfc_code) {
          // A hand-edited duration is a real signal, but a single edit must
          // never move the org's reference ratio by more than 2x either way —
          // the conductor may simply be padding one lot for a known constraint.
          const originalRatio = Number(existingTask.productivity_ratio) || 0;
          const newDuration = Number(updates.duration_days);

          if (originalRatio > 0 && newDuration > 0 && existingTask.duration_days > 0) {
            const rawFactor = existingTask.duration_days / newDuration;
            const factor = Math.min(2.0, Math.max(0.5, rawFactor));

            const { error: correctionError } = await (admin as any)
              .from("planning_duration_corrections")
              .insert({
                organization_id: userProfile.organization_id,
                cfc_code: existingTask.cfc_code,
                unit: existingTask.unit,
                original_ratio: Math.round(originalRatio * 1000) / 1000,
                corrected_ratio: Math.round(originalRatio * factor * 1000) / 1000,
                project_type: planning.project_type,
                canton: planning.location_canton,
                source: "manual_edit",
                sample_count: 1,
                planning_task_id: task_id,
              });

            if (correctionError) {
              // Table/columns may predate migration 094 — never block the edit.
              console.warn("[planning/[id]] Calibration insert skipped:", correctionError.message);
            }
          }
        }

        // Recalculate end_date if start_date and duration changed.
        // Durations are expressed in WORKING days (same convention as the
        // generator), so the offset must skip week-ends — otherwise the Gantt
        // drifts every time a task is edited.
        if (updates.start_date || updates.duration_days) {
          const startDate = new Date(updates.start_date || existingTask?.start_date || new Date());
          const endDate = addWorkingDays(
            startDate,
            updates.duration_days ?? existingTask?.duration_days ?? 0,
          );
          updates.end_date = endDate.toISOString().split("T")[0];
        }
      }

      // `actual_*` (migration 094), `cfc_code` and `phase_id` were editable in
      // the side panel but never whitelisted here, so those edits silently
      // no-op'd and reappeared on reload.
      const allowedFields = [
        "name", "start_date", "end_date", "duration_days",
        "progress", "supplier_id", "team_size",
        "actual_start_date", "actual_end_date",
        "cfc_code", "phase_id",
        "is_milestone", "milestone_type",
      ];
      // Nullable columns: an empty string from a date/select input must clear
      // the column, not be written as "" (rejected by a DATE/uuid column).
      const nullableFields = new Set([
        "actual_start_date", "actual_end_date", "supplier_id", "cfc_code",
      ]);
      const safeUpdates: Record<string, any> = {};
      for (const key of allowedFields) {
        if (updates[key] === undefined) continue;
        const value = updates[key];
        safeUpdates[key] =
          nullableFields.has(key) && (value === "" || value === null) ? null : value;
      }

      // The DB CHECK constraint rejects end < start; fail loudly instead of
      // surfacing a raw Postgres error in the panel.
      const nextActualStart =
        safeUpdates.actual_start_date !== undefined
          ? safeUpdates.actual_start_date
          : undefined;
      const nextActualEnd =
        safeUpdates.actual_end_date !== undefined ? safeUpdates.actual_end_date : undefined;
      if (nextActualStart && nextActualEnd && nextActualEnd < nextActualStart) {
        return NextResponse.json(
          { error: "actual_end_date must be on or after actual_start_date" },
          { status: 400 },
        );
      }

      const { error: updateError } = await (admin as any)
        .from("planning_tasks")
        .update(safeUpdates)
        .eq("id", task_id)
        .eq("planning_id", id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // Return the persisted row so the client resyncs to the server truth. The
      // server recomputes end_date in WORKING days (addWorkingDays), which does
      // not match the calendar-day arithmetic the UI uses locally — sending the
      // canonical row back keeps the two in step without a full refetch.
      const { data: persistedTask } = await (admin as any)
        .from("planning_tasks")
        .select("*, suppliers(company_name)")
        .eq("id", task_id)
        .eq("planning_id", id)
        .maybeSingle();

      const task = persistedTask
        ? { ...persistedTask, supplier_name: persistedTask.suppliers?.company_name ?? null, suppliers: undefined }
        : null;

      return NextResponse.json({ success: true, task });
    }

    // Case 2: Delete a task — the Gantt client sends { delete_task_id }
    if (body.delete_task_id) {
      return handleCrudAction(
        { action: "delete_task", task_id: body.delete_task_id },
        id,
        admin,
        userProfile.organization_id,
      );
    }

    // Case 3: Create a dependency — { add_dependency: { predecessor_id, successor_id, dependency_type, lag_days } }
    if (body.add_dependency) {
      return handleAddDependency(body.add_dependency, id, admin);
    }

    // Case 4: Delete a dependency — { delete_dependency_id }
    if (body.delete_dependency_id) {
      const { error: depDeleteError } = await (admin as any)
        .from("planning_dependencies")
        .delete()
        .eq("id", body.delete_dependency_id)
        .eq("planning_id", id);

      if (depDeleteError) {
        return NextResponse.json({ error: depDeleteError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    // Case 5: Update a phase — { phase_id, name, ... }
    if (body.phase_id) {
      const { phase_id, ...phaseUpdates } = body;
      return handleCrudAction(
        { action: "update_phase", phase_id, updates: phaseUpdates },
        id,
        admin,
        userProfile.organization_id,
      );
    }

    // Case 6: Update planning-level fields
    const allowedPlanningFields = ["title", "status"];
    const safeUpdates: Record<string, any> = {};
    for (const key of allowedPlanningFields) {
      if (body[key] !== undefined) safeUpdates[key] = body[key];
    }

    // No silent no-op: an unrecognised payload used to return success:true
    // without writing anything, which made Gantt edits vanish on reload.
    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json(
        { error: "Unrecognized PATCH payload — expected action, task_id, delete_task_id, add_dependency, delete_dependency_id, phase_id, title or status" },
        { status: 400 },
      );
    }

    const { error: updateError } = await (admin as any)
      .from("project_plannings")
      .update(safeUpdates)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[planning/[id]] PATCH error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/planning/[id]
 * Delete planning and all related records (cascade in DB).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: planning } = await (admin as any)
      .from("project_plannings")
      .select("id, organization_id")
      .eq("id", id)
      .maybeSingle();

    if (!planning || planning.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // CASCADE delete handles phases, tasks, dependencies, shares
    const { error: deleteError } = await (admin as any)
      .from("project_plannings")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[planning/[id]] DELETE error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

// ─── Dependency creation ────────────────────────────────────────────────────

const DEPENDENCY_TYPES = ["FS", "FF", "SS", "SF"] as const;

/**
 * Insert a manual dependency between two tasks of the same planning.
 * Validates the dependency type and that BOTH tasks belong to this planning
 * (defence in depth — the planning itself is already org-scoped by the caller).
 */
async function handleAddDependency(
  dep: any,
  planningId: string,
  admin: any,
): Promise<NextResponse> {
  const predecessorId = dep?.predecessor_id;
  const successorId = dep?.successor_id;
  const dependencyType = String(dep?.dependency_type || "FS").toUpperCase();
  const lagDays = Number.isFinite(Number(dep?.lag_days)) ? Math.trunc(Number(dep.lag_days)) : 0;

  if (!predecessorId || !successorId) {
    return NextResponse.json(
      { error: "predecessor_id and successor_id are required" },
      { status: 400 },
    );
  }

  if (predecessorId === successorId) {
    return NextResponse.json(
      { error: "A task cannot depend on itself" },
      { status: 400 },
    );
  }

  if (!DEPENDENCY_TYPES.includes(dependencyType as (typeof DEPENDENCY_TYPES)[number])) {
    return NextResponse.json(
      { error: `dependency_type must be one of ${DEPENDENCY_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  // Both tasks must belong to this planning
  const { data: tasks, error: tasksError } = await (admin as any)
    .from("planning_tasks")
    .select("id")
    .eq("planning_id", planningId)
    .in("id", [predecessorId, successorId]);

  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 500 });
  }

  if (!tasks || tasks.length !== 2) {
    return NextResponse.json(
      { error: "Both tasks must belong to this planning" },
      { status: 400 },
    );
  }

  // Reject links that would close a cycle. The CPM cannot topologically order a
  // cyclic graph, so without this the loop is only discovered at the next
  // reschedule (as a warning) with untrustworthy dates in between. Mirrors the
  // reaches() guard the AI pass already applies.
  const { data: existingDeps, error: existingDepsError } = await (admin as any)
    .from("planning_dependencies")
    .select("predecessor_id, successor_id")
    .eq("planning_id", planningId);

  if (existingDepsError) {
    return NextResponse.json({ error: existingDepsError.message }, { status: 500 });
  }

  const adjacency = new Map<string, string[]>();
  for (const d of existingDeps ?? []) {
    if (!adjacency.has(d.predecessor_id)) adjacency.set(d.predecessor_id, []);
    adjacency.get(d.predecessor_id)!.push(d.successor_id);
  }

  // Adding predecessor → successor closes a cycle iff successor already reaches predecessor.
  const reaches = (from: string, to: string): boolean => {
    const seen = new Set<string>([from]);
    const stack = [from];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === to) return true;
      for (const next of adjacency.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    return false;
  };

  if (reaches(successorId, predecessorId)) {
    return NextResponse.json(
      { error: "This dependency would create a cycle" },
      { status: 400 },
    );
  }

  const { data: newDep, error } = await (admin as any)
    .from("planning_dependencies")
    .insert({
      planning_id: planningId,
      predecessor_id: predecessorId,
      successor_id: successorId,
      dependency_type: dependencyType,
      lag_days: lagDays,
      source: "manual",
    })
    .select("*")
    .single();

  if (error) {
    // 23505 = unique violation on (predecessor_id, successor_id)
    if (error.code === "23505") {
      return NextResponse.json({ error: "This dependency already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, dependency: newDep });
}

// ─── Reschedule: re-run the CPM over the stored planning ────────────────────

/**
 * Recompute every task date from the stored durations and dependencies.
 *
 * Editing one duration in the Gantt used to move only that bar: its successors
 * kept their old dates, so the plan quietly stopped being a plan. This walks
 * the whole graph through the same CPM the generator uses.
 */
async function handleReschedule(planningId: string, admin: any): Promise<NextResponse> {
  const { data: planningRow, error: planningError } = await admin
    .from("project_plannings")
    .select("id, start_date, project_type, location_canton, config, ai_generation_log")
    .eq("id", planningId)
    .maybeSingle();

  if (planningError || !planningRow) {
    return NextResponse.json({ error: "Planning not found" }, { status: 404 });
  }
  if (!planningRow.start_date) {
    return NextResponse.json({ error: "Planning has no start_date" }, { status: 400 });
  }

  const [{ data: phases }, { data: tasks }, { data: deps }] = await Promise.all([
    admin.from("planning_phases").select("*").eq("planning_id", planningId).order("sort_order", { ascending: true }),
    admin.from("planning_tasks").select("*").eq("planning_id", planningId).order("sort_order", { ascending: true }),
    admin.from("planning_dependencies").select("*").eq("planning_id", planningId),
  ]);

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ error: "Planning has no tasks" }, { status: 400 });
  }

  // The stored `sort_order` is NOT a safe CPM node id: manual add_task /
  // duplicate rows can share one (older plannings especially), which would make
  // the CPM merge two tasks and corrupt every downstream date. Assign a fresh
  // collision-proof index per task, keyed by its uuid, and map dependencies and
  // persistence through that — the DB sort_order is never used as an identity.
  const indexByTaskId = new Map<string, number>();
  const taskIdByIndex = new Map<number, string>();
  const dbTaskById = new Map<string, any>();
  tasks.forEach((t: any, i: number) => {
    indexByTaskId.set(t.id, i);
    taskIdByIndex.set(i, t.id);
    dbTaskById.set(t.id, t);
  });

  const tasksByPhase = new Map<string, any[]>();
  for (const t of tasks) {
    const key = t.phase_id ?? "__none";
    if (!tasksByPhase.has(key)) tasksByPhase.set(key, []);
    tasksByPhase.get(key)!.push(t);
  }

  const structure: GeneratedPlanning = {
    title: "",
    phases: (phases && phases.length > 0 ? phases : [{ id: "__none", name: "", cfc_codes: [], color: "", sort_order: 0, start_date: planningRow.start_date, end_date: planningRow.start_date }])
      .map((phase: any) => ({
        name: phase.name,
        cfc_codes: phase.cfc_codes ?? [],
        color: phase.color,
        sort_order: phase.sort_order,
        start_date: phase.start_date,
        end_date: phase.end_date,
        tasks: (tasksByPhase.get(phase.id) ?? []).map((t: any): GeneratedTask => ({
          submission_item_id: t.submission_item_id ?? null,
          source_item_ids: t.source_item_ids ?? [],
          name: t.name,
          description: t.description ?? "",
          cfc_code: t.cfc_code ?? null,
          start_date: t.start_date,
          end_date: t.end_date,
          duration_days: Number(t.duration_days) || 0,
          quantity: t.quantity,
          unit: t.unit,
          productivity_ratio: t.productivity_ratio,
          productivity_source: t.productivity_source,
          adjustment_factors: t.adjustment_factors,
          base_duration_days: t.base_duration_days,
          team_size: t.team_size ?? 1,
          progress: Number(t.progress) || 0,
          is_milestone: !!t.is_milestone,
          milestone_type: t.milestone_type ?? null,
          // Synthetic collision-proof node id — NOT the stored sort_order.
          sort_order: indexByTaskId.get(t.id)!,
        })),
      })),
    dependencies: (deps ?? [])
      .map((d: any) => ({
        predecessor_index: indexByTaskId.get(d.predecessor_id),
        successor_index: indexByTaskId.get(d.successor_id),
        dependency_type: d.dependency_type,
        lag_days: Number(d.lag_days) || 0,
        source: d.source ?? "auto",
      }))
      .filter((d: any) => d.predecessor_index !== undefined && d.successor_index !== undefined),
    calculated_end_date: planningRow.start_date,
    critical_path_length: 0,
    ai_generation_log: (planningRow.ai_generation_log as any) ?? {},
  };

  let result;
  try {
    result = rescheduleCPM(structure, {
      start_date: planningRow.start_date,
      calendar: undefined, // rebuilt from the recorded canton / closures
    });
  } catch (err: any) {
    console.error("[planning/[id]] reschedule failed:", err);
    return NextResponse.json({ error: err.message || "Reschedule failed" }, { status: 500 });
  }

  // Persist the new dates. Only the rows that actually moved are written, and
  // they go out concurrently instead of one blocking round-trip per task — a
  // 60-task planning was previously 60+ sequential updates per keystroke.
  const taskUpdates: Array<Promise<{ error: any } | void>> = [];
  for (const phase of structure.phases) {
    for (const task of phase.tasks) {
      const dbTask = taskIdByIndex.has(task.sort_order)
        ? dbTaskById.get(taskIdByIndex.get(task.sort_order)!)
        : undefined;
      if (!dbTask) continue;
      if (dbTask.start_date === task.start_date && dbTask.end_date === task.end_date) continue;

      taskUpdates.push(
        admin
          .from("planning_tasks")
          .update({ start_date: task.start_date, end_date: task.end_date })
          .eq("id", dbTask.id)
          .eq("planning_id", planningId),
      );
    }
  }

  const taskResults = await Promise.all(taskUpdates);
  let updated = 0;
  for (const r of taskResults) {
    if (r && (r as any).error) {
      console.error("[planning/[id]] reschedule task update failed:", (r as any).error.message);
    } else {
      updated++;
    }
  }

  if (phases) {
    const phaseUpdates: Array<Promise<any>> = [];
    for (const phase of structure.phases) {
      const dbPhase = phases.find((p: any) => p.sort_order === phase.sort_order);
      if (!dbPhase || !phase.start_date) continue;
      phaseUpdates.push(
        admin
          .from("planning_phases")
          .update({ start_date: phase.start_date, end_date: phase.end_date })
          .eq("id", dbPhase.id)
          .eq("planning_id", planningId),
      );
    }
    await Promise.all(phaseUpdates);
  }

  // The critical path moves with the dates. Leaving the generation-time list in
  // place would keep the Gantt highlighting a chain that no longer is critical,
  // so persist the fresh one under the same sort_order convention the client
  // already knows how to remap.
  const existingLog =
    typeof planningRow.ai_generation_log === "object" && planningRow.ai_generation_log
      ? planningRow.ai_generation_log
      : {};

  // result.critical_path holds SYNTHETIC indices. Resolve them to real task uuids
  // (for the client) and to DB sort_order strings (the format the page and the
  // PDF export both remap on read).
  const criticalTaskIds = result.critical_path
    .map((syn: string) => taskIdByIndex.get(Number(syn)))
    .filter((taskId: string | undefined): taskId is string => Boolean(taskId));
  const criticalSortOrders = criticalTaskIds
    .map((taskId: string) => dbTaskById.get(taskId))
    .filter(Boolean)
    .map((db: any) => String(db.sort_order));

  const { error: planningUpdateError } = await admin
    .from("project_plannings")
    .update({
      calculated_end_date: result.calculated_end_date,
      ai_generation_log: {
        ...existingLog,
        critical_path_task_ids: criticalSortOrders,
        critical_path_length: result.critical_path_length,
        last_reschedule_at: new Date().toISOString(),
      },
    })
    .eq("id", planningId);

  if (planningUpdateError) {
    console.error("[planning/[id]] reschedule planning update failed:", planningUpdateError.message);
  }

  return NextResponse.json({
    success: true,
    tasks_updated: updated,
    calculated_end_date: result.calculated_end_date,
    project_duration_days: result.project_duration,
    critical_path_length: result.critical_path_length,
    critical_task_ids: criticalTaskIds,
    // Non-empty means the dependency graph loops — the dates are not trustworthy.
    cyclic_task_count: result.cyclic_task_ids.length,
  });
}

// ─── Action-based CRUD handler ──────────────────────────────────────────────

const PHASE_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1",
];

async function handleCrudAction(
  body: any,
  planningId: string,
  admin: any,
  _orgId: string, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<NextResponse> {
  try {
    switch (body.action) {
      // ── Add phase ──────────────────────────────────────────────────────────
      case "add_phase": {
        const { phase } = body;

        // Determine sort_order: max + 1
        const { data: existingPhases } = await (admin as any)
          .from("planning_phases")
          .select("sort_order, color")
          .eq("planning_id", planningId)
          .order("sort_order", { ascending: false })
          .limit(1);

        const nextOrder = (existingPhases?.[0]?.sort_order ?? -1) + 1;

        // Determine next available color
        const { data: allPhases } = await (admin as any)
          .from("planning_phases")
          .select("color")
          .eq("planning_id", planningId);

        const usedColors = new Set((allPhases || []).map((p: any) => p.color));
        const nextColor = PHASE_COLORS.find((c) => !usedColors.has(c)) || PHASE_COLORS[nextOrder % PHASE_COLORS.length];

        // Get planning start/end for defaults
        const { data: planningData } = await (admin as any)
          .from("project_plannings")
          .select("start_date, calculated_end_date")
          .eq("id", planningId)
          .single();

        const startDate = planningData?.start_date || new Date().toISOString().split("T")[0];
        const endDate = planningData?.calculated_end_date || startDate;

        const { data: newPhase, error } = await (admin as any)
          .from("planning_phases")
          .insert({
            planning_id: planningId,
            name: phase?.name || "Nouvelle phase",
            cfc_codes: phase?.cfc_codes || [],
            color: phase?.color || nextColor,
            sort_order: phase?.sort_order ?? nextOrder,
            start_date: phase?.start_date || startDate,
            end_date: phase?.end_date || endDate,
          })
          .select("*")
          .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, phase: newPhase });
      }

      // ── Add task ───────────────────────────────────────────────────────────
      case "add_task": {
        const { task } = body;
        const phaseId = task?.phase_id;

        // If no phase exists, create a default one
        let targetPhaseId = phaseId;
        if (!targetPhaseId) {
          const { data: phases } = await (admin as any)
            .from("planning_phases")
            .select("id")
            .eq("planning_id", planningId)
            .order("sort_order", { ascending: true })
            .limit(1);

          if (phases && phases.length > 0) {
            targetPhaseId = phases[0].id;
          } else {
            // Create default phase
            const { data: planningData } = await (admin as any)
              .from("project_plannings")
              .select("start_date, calculated_end_date")
              .eq("id", planningId)
              .single();

            const { data: newPhase } = await (admin as any)
              .from("planning_phases")
              .insert({
                planning_id: planningId,
                name: "Phase 1",
                cfc_codes: [],
                color: PHASE_COLORS[0],
                sort_order: 0,
                start_date: planningData?.start_date || new Date().toISOString().split("T")[0],
                end_date: planningData?.calculated_end_date || planningData?.start_date || new Date().toISOString().split("T")[0],
              })
              .select("id")
              .single();

            targetPhaseId = newPhase?.id;
          }
        }

        // Determine sort_order — MUST be unique across the WHOLE planning, not
        // just the phase: the CPM reschedule uses it as a node id, so a per-phase
        // max would collide with a task in another phase and corrupt the dates.
        const { data: existingTasks } = await (admin as any)
          .from("planning_tasks")
          .select("sort_order")
          .eq("planning_id", planningId)
          .order("sort_order", { ascending: false })
          .limit(1);

        const nextTaskOrder = (existingTasks?.[0]?.sort_order ?? -1) + 1;

        // Get phase start date for default
        const { data: phaseData } = await (admin as any)
          .from("planning_phases")
          .select("start_date")
          .eq("id", targetPhaseId)
          .single();

        const taskStartDate = task?.start_date || phaseData?.start_date || new Date().toISOString().split("T")[0];
        const durationDays = task?.duration_days || 5;
        const taskEndDate = task?.end_date || (() => {
          const d = new Date(taskStartDate);
          d.setDate(d.getDate() + durationDays);
          return d.toISOString().split("T")[0];
        })();

        const { data: newTask, error } = await (admin as any)
          .from("planning_tasks")
          .insert({
            planning_id: planningId,
            phase_id: targetPhaseId,
            name: task?.name || "Nouvelle tache",
            start_date: taskStartDate,
            end_date: taskEndDate,
            duration_days: durationDays,
            team_size: task?.team_size || 1,
            progress: 0,
            is_milestone: task?.is_milestone || false,
            milestone_type: task?.milestone_type || null,
            sort_order: task?.sort_order ?? nextTaskOrder,
          })
          .select("*")
          .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, task: newTask });
      }

      // ── Delete phase ───────────────────────────────────────────────────────
      case "delete_phase": {
        const { phase_id } = body;
        if (!phase_id) return NextResponse.json({ error: "phase_id required" }, { status: 400 });

        // Delete tasks in the phase first
        await (admin as any)
          .from("planning_tasks")
          .delete()
          .eq("planning_id", planningId)
          .eq("phase_id", phase_id);

        // Delete the phase
        const { error } = await (admin as any)
          .from("planning_phases")
          .delete()
          .eq("id", phase_id)
          .eq("planning_id", planningId);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      // ── Delete task ────────────────────────────────────────────────────────
      case "delete_task": {
        const { task_id } = body;
        if (!task_id) return NextResponse.json({ error: "task_id required" }, { status: 400 });
        const safeTaskId = String(task_id).replace(/[^a-zA-Z0-9-]/g, "");

        // Also delete dependencies referencing this task
        await (admin as any)
          .from("planning_dependencies")
          .delete()
          .eq("planning_id", planningId)
          .or(`predecessor_id.eq.${safeTaskId},successor_id.eq.${safeTaskId}`);

        const { error } = await (admin as any)
          .from("planning_tasks")
          .delete()
          .eq("id", task_id)
          .eq("planning_id", planningId);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      // ── Duplicate phase ────────────────────────────────────────────────────
      case "duplicate_phase": {
        const { phase_id } = body;
        if (!phase_id) return NextResponse.json({ error: "phase_id required" }, { status: 400 });

        // Fetch original phase
        const { data: origPhase } = await (admin as any)
          .from("planning_phases")
          .select("*")
          .eq("id", phase_id)
          .eq("planning_id", planningId)
          .single();

        if (!origPhase) return NextResponse.json({ error: "Phase not found" }, { status: 404 });

        // Get max sort_order
        const { data: maxPhase } = await (admin as any)
          .from("planning_phases")
          .select("sort_order")
          .eq("planning_id", planningId)
          .order("sort_order", { ascending: false })
          .limit(1);

        const newOrder = (maxPhase?.[0]?.sort_order ?? 0) + 1;

        // Insert duplicated phase
        const { data: newPhase, error: phaseError } = await (admin as any)
          .from("planning_phases")
          .insert({
            planning_id: planningId,
            name: `${origPhase.name} (copie)`,
            cfc_codes: origPhase.cfc_codes,
            color: origPhase.color,
            sort_order: newOrder,
            start_date: origPhase.start_date,
            end_date: origPhase.end_date,
          })
          .select("id")
          .single();

        if (phaseError || !newPhase) return NextResponse.json({ error: "Failed to duplicate phase" }, { status: 500 });

        // Fetch and duplicate tasks. The copies MUST get fresh, planning-wide
        // unique sort_orders — reusing the originals' sort_order would give two
        // tasks the same CPM node id and corrupt the reschedule.
        const { data: origTasks } = await (admin as any)
          .from("planning_tasks")
          .select("*")
          .eq("planning_id", planningId)
          .eq("phase_id", phase_id)
          .order("sort_order", { ascending: true });

        if (origTasks && origTasks.length > 0) {
          const { data: maxTaskRow } = await (admin as any)
            .from("planning_tasks")
            .select("sort_order")
            .eq("planning_id", planningId)
            .order("sort_order", { ascending: false })
            .limit(1);

          let nextOrder = (maxTaskRow?.[0]?.sort_order ?? -1) + 1;

          const rows = origTasks.map((t: any) => ({
            planning_id: planningId,
            phase_id: newPhase.id,
            name: t.name,
            cfc_code: t.cfc_code,
            start_date: t.start_date,
            end_date: t.end_date,
            duration_days: t.duration_days,
            team_size: t.team_size,
            progress: 0,
            is_milestone: t.is_milestone,
            milestone_type: t.milestone_type,
            sort_order: nextOrder++,
          }));

          const { error: tasksError } = await (admin as any)
            .from("planning_tasks")
            .insert(rows);

          if (tasksError) {
            return NextResponse.json({ error: tasksError.message }, { status: 500 });
          }
        }

        return NextResponse.json({ success: true, phase_id: newPhase.id });
      }

      // ── Duplicate task ─────────────────────────────────────────────────────
      case "duplicate_task": {
        const { task_id } = body;
        if (!task_id) return NextResponse.json({ error: "task_id required" }, { status: 400 });

        const { data: origTask } = await (admin as any)
          .from("planning_tasks")
          .select("*")
          .eq("id", task_id)
          .eq("planning_id", planningId)
          .single();

        if (!origTask) return NextResponse.json({ error: "Task not found" }, { status: 404 });

        // Next sort_order across the WHOLE planning — a per-phase max would
        // collide with tasks in other phases and break the CPM reschedule.
        const { data: maxTask } = await (admin as any)
          .from("planning_tasks")
          .select("sort_order")
          .eq("planning_id", planningId)
          .order("sort_order", { ascending: false })
          .limit(1);

        const newOrder = (maxTask?.[0]?.sort_order ?? 0) + 1;

        const { data: newTask, error } = await (admin as any)
          .from("planning_tasks")
          .insert({
            planning_id: planningId,
            phase_id: origTask.phase_id,
            name: `${origTask.name} (copie)`,
            cfc_code: origTask.cfc_code,
            start_date: origTask.start_date,
            end_date: origTask.end_date,
            duration_days: origTask.duration_days,
            team_size: origTask.team_size,
            progress: 0,
            is_milestone: origTask.is_milestone,
            milestone_type: origTask.milestone_type,
            sort_order: newOrder,
          })
          .select("*")
          .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, task: newTask });
      }

      // ── Reorder phases ─────────────────────────────────────────────────────
      case "reorder_phases": {
        const { phase_ids } = body;
        if (!Array.isArray(phase_ids)) return NextResponse.json({ error: "phase_ids array required" }, { status: 400 });

        const reorderResults = await Promise.all(
          phase_ids.map((phaseId: string, i: number) =>
            (admin as any)
              .from("planning_phases")
              .update({ sort_order: i })
              .eq("id", phaseId)
              .eq("planning_id", planningId),
          ),
        );
        const reorderError = reorderResults.find((r: any) => r?.error)?.error;
        if (reorderError) {
          return NextResponse.json({ error: reorderError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
      }

      // ── Update phase ───────────────────────────────────────────────────────
      case "update_phase": {
        const { phase_id, updates } = body;
        if (!phase_id) return NextResponse.json({ error: "phase_id required" }, { status: 400 });

        const allowedFields = ["name", "color", "sort_order", "start_date", "end_date", "cfc_codes"];
        const safeUpdates: Record<string, any> = {};
        for (const key of allowedFields) {
          if (updates?.[key] !== undefined) safeUpdates[key] = updates[key];
        }

        if (Object.keys(safeUpdates).length === 0) {
          return NextResponse.json({ success: true });
        }

        const { error } = await (admin as any)
          .from("planning_phases")
          .update(safeUpdates)
          .eq("id", phase_id)
          .eq("planning_id", planningId);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      // ── Save baseline ──────────────────────────────────────────────────
      case "save_baseline": {
        // Snapshot all task dates into the config.baseline JSONB field
        const { data: allTasks } = await (admin as any)
          .from("planning_tasks")
          .select("id, start_date, end_date, duration_days, is_milestone")
          .eq("planning_id", planningId);

        const baselineSnapshot: Record<string, { start_date: string; end_date: string; duration_days: number }> = {};
        for (const tk of (allTasks || [])) {
          if (!tk.is_milestone) {
            baselineSnapshot[tk.id] = {
              start_date: tk.start_date,
              end_date: tk.end_date,
              duration_days: tk.duration_days,
            };
          }
        }

        // Read existing config to merge
        const { data: existingPlanning } = await (admin as any)
          .from("project_plannings")
          .select("config")
          .eq("id", planningId)
          .maybeSingle();

        const existingConfig = existingPlanning?.config || {};
        const updatedConfig = { ...existingConfig, baseline: baselineSnapshot };

        const { error } = await (admin as any)
          .from("project_plannings")
          .update({ config: updatedConfig })
          .eq("id", planningId);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, baseline: baselineSnapshot });
      }

      // ── Clear baseline ─────────────────────────────────────────────────
      case "clear_baseline": {
        const { data: existingPlanningClear } = await (admin as any)
          .from("project_plannings")
          .select("config")
          .eq("id", planningId)
          .maybeSingle();

        const existingConfigClear = existingPlanningClear?.config || {};
        const { baseline: _baseline, ...configWithoutBaseline } = existingConfigClear;

        const { error: clearError } = await (admin as any)
          .from("project_plannings")
          .update({ config: configWithoutBaseline })
          .eq("id", planningId);

        if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      // ── Reschedule (re-run the CPM on the stored planning) ─────────────
      case "reschedule":
        return handleReschedule(planningId, admin);

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error(`[planning/[id]] CRUD action="${body.action}" error:`, err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
