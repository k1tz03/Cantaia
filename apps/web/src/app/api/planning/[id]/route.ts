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
