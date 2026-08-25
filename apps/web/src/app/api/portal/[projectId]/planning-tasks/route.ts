import { NextRequest, NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/portal/session";

/**
 * GET /api/portal/[projectId]/planning-tasks
 *
 * Light list of the tasks of the project's ACTIVE planning, used by the field
 * report to impute hours to a planning task (site_report_entries.planning_task_id,
 * migration 093). Deliberately minimal — id, name, cfc_code — so no cost,
 * duration, supplier or margin data ever reaches a PIN-authenticated device.
 *
 * Milestones are excluded: no one books hours on a diamond.
 * Returns an empty list (never an error) when the project has no planning yet.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const { valid, admin } = await requirePortalSession(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Prefer the active planning; fall back to the most recently updated one so
    // a draft planning is still usable on site.
    const { data: plannings, error: planningError } = await (admin as any)
      .from("project_plannings")
      .select("id, status, updated_at")
      .eq("project_id", projectId)
      .in("status", ["active", "draft"])
      .order("updated_at", { ascending: false });

    if (planningError) {
      // Planning module not migrated on this database — not a portal failure.
      console.warn("[Portal PlanningTasks] planning lookup failed:", planningError.message);
      return NextResponse.json({ tasks: [] });
    }

    const planning =
      (plannings || []).find((p: any) => p.status === "active") || (plannings || [])[0];

    if (!planning) return NextResponse.json({ tasks: [] });

    const { data: tasks, error: tasksError } = await (admin as any)
      .from("planning_tasks")
      .select("id, name, cfc_code, start_date, is_milestone, sort_order")
      .eq("planning_id", planning.id)
      .order("start_date", { ascending: true })
      .limit(500);

    if (tasksError) {
      console.warn("[Portal PlanningTasks] tasks lookup failed:", tasksError.message);
      return NextResponse.json({ tasks: [] });
    }

    return NextResponse.json({
      planning_id: planning.id,
      tasks: (tasks || [])
        .filter((task: any) => !task.is_milestone)
        .map((task: any) => ({
          id: task.id,
          name: task.name,
          cfc_code: task.cfc_code || null,
        })),
    });
  } catch (error) {
    console.error("[Portal PlanningTasks] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
