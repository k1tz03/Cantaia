import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
          // Save correction
          const originalRatio = existingTask.productivity_ratio || 1;
          const correctionFactor = existingTask.duration_days / updates.duration_days;
          const correctedRatio = originalRatio * correctionFactor;

          try {
            await (admin as any)
              .from("planning_duration_corrections")
              .insert({
                organization_id: userProfile.organization_id,
                cfc_code: existingTask.cfc_code,
                unit: existingTask.unit,
                original_ratio: originalRatio,
                corrected_ratio: correctedRatio,
                project_type: planning.project_type,
                canton: planning.location_canton,
              });
          } catch {
            // Non-fatal
          }
        }

        // Recalculate end_date if start_date and duration changed
        if (updates.start_date || updates.duration_days) {
          const startDate = new Date(updates.start_date || existingTask?.start_date || new Date());
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + (updates.duration_days ?? existingTask?.duration_days ?? 0));
          updates.end_date = endDate.toISOString().split("T")[0];
        }
      }

      const allowedFields = [
        "name", "start_date", "end_date", "duration_days",
        "progress", "supplier_id", "team_size",
      ];
      const safeUpdates: Record<string, any> = {};
      for (const key of allowedFields) {
        if (updates[key] !== undefined) safeUpdates[key] = updates[key];
      }

      const { error: updateError } = await (admin as any)
        .from("planning_tasks")
        .update(safeUpdates)
        .eq("id", task_id)
        .eq("planning_id", id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Case 2: Update planning-level fields
    const allowedPlanningFields = ["title", "status"];
    const safeUpdates: Record<string, any> = {};
    for (const key of allowedPlanningFields) {
      if (body[key] !== undefined) safeUpdates[key] = body[key];
    }

    if (Object.keys(safeUpdates).length > 0) {
      const { error: updateError } = await (admin as any)
        .from("project_plannings")
        .update(safeUpdates)
        .eq("id", id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
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

        // Determine sort_order
        const { data: existingTasks } = await (admin as any)
          .from("planning_tasks")
          .select("sort_order")
          .eq("planning_id", planningId)
          .eq("phase_id", targetPhaseId)
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

        // Fetch and duplicate tasks
        const { data: origTasks } = await (admin as any)
          .from("planning_tasks")
          .select("*")
          .eq("planning_id", planningId)
          .eq("phase_id", phase_id)
          .order("sort_order", { ascending: true });

        if (origTasks) {
          for (const t of origTasks) {
            await (admin as any)
              .from("planning_tasks")
              .insert({
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
                sort_order: t.sort_order,
              });
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

        // Get next sort_order in the same phase
        const { data: maxTask } = await (admin as any)
          .from("planning_tasks")
          .select("sort_order")
          .eq("planning_id", planningId)
          .eq("phase_id", origTask.phase_id)
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

        for (let i = 0; i < phase_ids.length; i++) {
          await (admin as any)
            .from("planning_phases")
            .update({ sort_order: i })
            .eq("id", phase_ids[i])
            .eq("planning_id", planningId);
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

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error(`[planning/[id]] CRUD action="${body.action}" error:`, err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
