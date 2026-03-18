import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePlanning } from "@cantaia/core/planning";
import { trackApiUsage } from "@cantaia/core/tracking";

export const maxDuration = 120;

/** Map frontend project types to DB CHECK constraint values */
function mapProjectType(frontendType: string | undefined): string {
  const map: Record<string, string> = {
    neuf: "new",
    renovation: "renovation",
    extension: "extension",
    amenagement: "interior",
  };
  return map[frontendType || ""] || frontendType || "new";
}

/**
 * POST /api/planning/generate
 * Generates a project planning from a submission's analyzed items.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Verify user's organization
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const body = await request.json();
    const { submission_id, project_id, config } = body;

    if (!submission_id || !project_id || !config?.start_date) {
      return NextResponse.json(
        { error: "submission_id, project_id, and config.start_date are required" },
        { status: 400 },
      );
    }

    // Verify project belongs to user's org
    const { data: project } = await (admin as any)
      .from("projects")
      .select("id, name, organization_id")
      .eq("id", project_id)
      .maybeSingle();

    if (!project || project.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify submission belongs to the same project
    const { data: submission } = await (admin as any)
      .from("submissions")
      .select("id, project_id")
      .eq("id", submission_id)
      .maybeSingle();

    if (!submission || submission.project_id !== project_id) {
      return NextResponse.json({ error: "Submission not found or not linked to this project" }, { status: 404 });
    }

    // Generate the planning using the core module (handles item fetching internally)
    console.log(`[planning/generate] Generating for project=${project.name}, submission=${submission_id}`);

    const planning = await generatePlanning({
      submission_id,
      project_id,
      org_id: userProfile.organization_id,
      config: {
        start_date: config.start_date,
        target_end_date: config.target_end_date,
        project_type: mapProjectType(config.project_type),
        canton: config.canton,
        constraints: config.constraints,
      },
      supabase: admin,
    });

    // Delete existing planning for this project (only one planning per project)
    try {
      await (admin as any)
        .from("project_plannings")
        .delete()
        .eq("project_id", project_id)
        .eq("organization_id", userProfile.organization_id);
    } catch {
      // Ignore if table doesn't exist
    }

    // Insert planning
    const { data: planningRow, error: planningError } = await (admin as any)
      .from("project_plannings")
      .insert({
        project_id,
        submission_id,
        organization_id: userProfile.organization_id,
        title: planning.title,
        status: "draft",
        start_date: config.start_date,
        target_end_date: config.target_end_date || null,
        calculated_end_date: planning.calculated_end_date,
        project_type: mapProjectType(config.project_type),
        location_canton: config.canton || null,
        config: { constraints: config.constraints },
        ai_generation_log: planning.ai_generation_log,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (planningError || !planningRow) {
      console.error("[planning/generate] Insert planning error:", planningError);
      return NextResponse.json({ error: "Failed to save planning" }, { status: 500 });
    }

    const planningId = planningRow.id;

    // Insert phases and tasks
    for (const phase of planning.phases) {
      const { data: phaseRow, error: phaseError } = await (admin as any)
        .from("planning_phases")
        .insert({
          planning_id: planningId,
          name: phase.name,
          cfc_codes: phase.cfc_codes,
          color: phase.color,
          sort_order: phase.sort_order,
          start_date: phase.start_date,
          end_date: phase.end_date,
        })
        .select("id")
        .single();

      if (phaseError || !phaseRow) {
        console.error("[planning/generate] Insert phase error:", phaseError);
        continue;
      }

      for (const task of phase.tasks) {
        await (admin as any)
          .from("planning_tasks")
          .insert({
            planning_id: planningId,
            phase_id: phaseRow.id,
            submission_item_id: task.submission_item_id,
            name: task.name,
            description: task.description || null,
            cfc_code: task.cfc_code,
            start_date: task.start_date,
            end_date: task.end_date,
            duration_days: task.duration_days,
            quantity: task.quantity,
            unit: task.unit,
            productivity_ratio: task.productivity_ratio,
            productivity_source: task.productivity_source,
            adjustment_factors: task.adjustment_factors,
            base_duration_days: task.base_duration_days,
            supplier_id: null,
            team_size: task.team_size,
            progress: 0,
            is_milestone: task.is_milestone,
            milestone_type: task.milestone_type,
            sort_order: task.sort_order,
          });
      }
    }

    // Insert dependencies
    try {
      const { data: dbTasks } = await (admin as any)
        .from("planning_tasks")
        .select("id, sort_order")
        .eq("planning_id", planningId)
        .order("sort_order", { ascending: true });

      if (dbTasks && dbTasks.length > 0) {
        const taskIdByIndex = new Map<number, string>();
        for (const t of dbTasks) {
          taskIdByIndex.set(t.sort_order, t.id);
        }

        for (const dep of planning.dependencies) {
          const predId = taskIdByIndex.get(dep.predecessor_index);
          const succId = taskIdByIndex.get(dep.successor_index);
          if (predId && succId) {
            await (admin as any)
              .from("planning_dependencies")
              .insert({
                planning_id: planningId,
                predecessor_id: predId,
                successor_id: succId,
                dependency_type: dep.dependency_type,
                lag_days: dep.lag_days,
                source: dep.source,
              });
          }
        }
      }
    } catch (err) {
      console.error("[planning/generate] Insert dependencies error:", err);
    }

    // Track API usage
    trackApiUsage({
      supabase: admin as any,
      userId: user.id,
      organizationId: userProfile.organization_id,
      actionType: "planning_generation" as any,
      apiProvider: "anthropic" as any,
      model: "mechanical",
      inputTokens: 0,
      outputTokens: 0,
      metadata: { project_id, submission_id, phases_count: planning.phases.length },
    }).catch(() => {});

    console.log(`[planning/generate] Success: id=${planningId}, phases=${planning.phases.length}`);

    return NextResponse.json({
      success: true,
      planning_id: planningId,
      phases_count: planning.phases.length,
      calculated_end_date: planning.calculated_end_date,
    });
  } catch (err: any) {
    console.error("[planning/generate] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
