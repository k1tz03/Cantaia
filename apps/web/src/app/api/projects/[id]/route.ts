import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";

/**
 * GET /api/projects/[id]
 * Returns a single project by ID for the authenticated user's organization.
 * Uses admin client to bypass RLS.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing project ID" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get user's organization
  const { data: userRow } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Fetch the project (must belong to user's org)
  const { data: project, error } = await admin
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("organization_id", userRow.organization_id)
    .maybeSingle();

  if (error) {
    console.error("[projects/[id]] Error:", error.message);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}

/**
 * PUT /api/projects/[id]
 * Updates a project. Only updates fields that are provided.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: userRow } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Verify project belongs to user's org
  const { data: existing } = await admin
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("organization_id", userRow.organization_id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  // Allowlist of updatable fields
  const allowedFields = [
    "name", "code", "description", "client_name", "address", "city",
    "status", "start_date", "end_date", "budget_total", "currency",
    "color", "email_keywords", "email_senders",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: project, error } = await admin
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[projects/[id]] Update error:", error.message);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }

  // When a project is marked as completed, extract planning calibration data + C2 benchmarks
  if (body.status === "completed") {
    extractPlanningCorrections(admin, id, userRow.organization_id)
      .catch(err => console.error("[planning-calibration]", err));

    insertProjectBenchmark(admin, id, userRow.organization_id)
      .catch(err => console.error("[project-benchmark]", err));
  }

  return NextResponse.json({ project });
}

// ============================================================================
// Planning calibration: compare planned vs actual durations on project completion
// ============================================================================

async function extractPlanningCorrections(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  orgId: string,
) {
  // 1. Get the project's planning
  const { data: planning } = await (admin as any)
    .from("project_plannings")
    .select("id, project_type, location_canton")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!planning) return;

  // 2. Get planning tasks with their planned durations and productivity ratios
  const { data: tasks } = await (admin as any)
    .from("planning_tasks")
    .select("id, cfc_code, duration_days, productivity_ratio, unit, start_date, end_date")
    .eq("planning_id", planning.id);

  if (!tasks?.length) return;

  // 3. Get project actual dates
  const { data: project } = await admin
    .from("projects")
    .select("start_date, end_date")
    .eq("id", projectId)
    .single();

  if (!project?.start_date || !project?.end_date) return;

  // Calculate actual vs planned total duration
  const actualTotalDays = Math.ceil(
    (new Date(project.end_date).getTime() - new Date(project.start_date).getTime()) / (1000 * 60 * 60 * 24)
  );
  const plannedTotalDays = tasks.reduce(
    (sum: number, t: any) => sum + (t.duration_days || 0),
    0,
  );
  if (plannedTotalDays === 0 || actualTotalDays <= 0) return;

  // Global ratio: >1 means project took longer than planned, <1 means faster
  const globalRatio = actualTotalDays / plannedTotalDays;

  // 4. Group tasks by CFC prefix and insert correction rows
  const cfcTasks = new Map<string, Array<{ productivity_ratio: number; unit: string | null }>>();
  for (const t of tasks) {
    if (!t.cfc_code) continue;
    const prefix = t.cfc_code.split(".")[0];
    if (!cfcTasks.has(prefix)) cfcTasks.set(prefix, []);
    cfcTasks.get(prefix)!.push({
      productivity_ratio: t.productivity_ratio || 1,
      unit: t.unit || null,
    });
  }

  let insertedCount = 0;
  for (const [cfcCode, taskGroup] of cfcTasks) {
    try {
      // Average the original productivity ratios for tasks in this CFC group
      const avgOriginalRatio =
        taskGroup.reduce((s, t) => s + t.productivity_ratio, 0) / taskGroup.length;

      // The corrected ratio accounts for the actual/planned drift:
      // If the project took 1.2x longer, productivity was effectively lower (divide by globalRatio)
      const correctedRatio = Math.round((avgOriginalRatio / globalRatio) * 100) / 100;

      // Use the most common unit in this CFC group
      const unitCounts = new Map<string, number>();
      for (const t of taskGroup) {
        if (t.unit) unitCounts.set(t.unit, (unitCounts.get(t.unit) || 0) + 1);
      }
      let commonUnit: string | null = null;
      let maxCount = 0;
      for (const [u, count] of unitCounts) {
        if (count > maxCount) { maxCount = count; commonUnit = u; }
      }

      await (admin as any)
        .from("planning_duration_corrections")
        .insert({
          organization_id: orgId,
          cfc_code: cfcCode,
          unit: commonUnit,
          original_ratio: Math.round(avgOriginalRatio * 100) / 100,
          corrected_ratio: correctedRatio,
          project_type: planning.project_type || null,
          canton: planning.location_canton || null,
        });

      insertedCount++;
    } catch (e) {
      // Table may not exist yet (migration 055 not applied) — non-blocking
      console.warn(`[planning-calibration] Failed to insert correction for CFC ${cfcCode}:`, e);
    }
  }

  console.log(
    `[planning-calibration] Stored ${insertedCount} CFC corrections for project ${projectId} (global ratio: ${globalRatio.toFixed(2)}, planned: ${plannedTotalDays}d, actual: ${actualTotalDays}d)`
  );
}

/**
 * DELETE /api/projects/[id]
 * Deletes a project and declassifies all its emails.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: userRow } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Verify project belongs to user's org
  const { data: existing } = await admin
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("organization_id", userRow.organization_id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Declassify all emails linked to this project
  await admin
    .from("email_records")
    .update({
      project_id: null,
      classification: null,
      classification_status: "classified_no_project",
      ai_classification_confidence: null,
      ai_project_match_confidence: null,
    } as Record<string, unknown>)
    .eq("project_id", id);

  // Delete the project (cascade will handle project_members, tasks, etc.)
  const { error } = await admin
    .from("projects")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[projects/[id]] Delete error:", error.message);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// ============================================================================
// C2 Benchmark: insert anonymized project data when project completes
// ============================================================================

async function insertProjectBenchmark(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  orgId: string,
): Promise<void> {
  // Check opt-in for data sharing
  try {
    const { data: consent } = await (admin as any)
      .from("aggregation_consent")
      .select("modules")
      .eq("organization_id", orgId)
      .maybeSingle();

    // Only insert if org has opted in to sharing project data (or no consent table exists)
    if (consent && consent.modules && !consent.modules.prix && !consent.modules.taches) {
      return; // Org has consent record but did not opt in for relevant modules
    }
  } catch {
    // aggregation_consent table may not exist — proceed anyway
  }

  // Get full project data with financial fields
  const { data: fullProject } = await (admin as any)
    .from("projects")
    .select("name, description, budget_total, invoiced_amount, purchase_costs, start_date, end_date, closed_at, city, status")
    .eq("id", projectId)
    .maybeSingle();

  if (!fullProject) return;

  const startDate = fullProject.start_date ? new Date(fullProject.start_date) : null;
  const endDate = fullProject.end_date ? new Date(fullProject.end_date) : null;
  const closedAt = fullProject.closed_at ? new Date(fullProject.closed_at) : new Date();

  const durationPlannedDays = startDate && endDate
    ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const durationActualDays = startDate
    ? Math.ceil((closedAt.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const invoiced = parseFloat(fullProject.invoiced_amount || "0");
  const costs = parseFloat(fullProject.purchase_costs || "0");
  const marginPercent = invoiced > 0 ? ((invoiced - costs) / invoiced) * 100 : null;

  // Detect project type from description
  const desc = (fullProject.description || "").toLowerCase();
  let projectType = "new_build";
  if (desc.includes("rénovation") || desc.includes("renovation") || desc.includes("sanierung")) {
    projectType = "renovation";
  } else if (desc.includes("extension") || desc.includes("agrandissement") || desc.includes("erweiterung")) {
    projectType = "extension";
  } else if (desc.includes("transformation") || desc.includes("umbau")) {
    projectType = "transformation";
  }

  // Get CFC summary from planning if available
  let cfcSummary: Record<string, number> | null = null;
  try {
    const { data: planning } = await (admin as any)
      .from("project_plannings")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planning) {
      const { data: tasks } = await (admin as any)
        .from("planning_tasks")
        .select("cfc_code, duration_days")
        .eq("planning_id", planning.id)
        .not("cfc_code", "is", null);

      if (tasks && tasks.length > 0) {
        cfcSummary = {};
        for (const t of tasks) {
          if (!t.cfc_code) continue;
          const prefix = t.cfc_code.split(".")[0];
          cfcSummary[prefix] = (cfcSummary[prefix] || 0) + (t.duration_days || 0);
        }
      }
    }
  } catch {
    // Planning tables may not exist
  }

  try {
    await (admin as any)
      .from("project_benchmarks")
      .insert({
        organization_id: orgId,
        project_type: projectType,
        total_budget: fullProject.budget_total ? parseFloat(fullProject.budget_total) : null,
        actual_cost: costs > 0 ? costs : null,
        margin_percent: marginPercent !== null ? Math.round(marginPercent * 100) / 100 : null,
        duration_planned_days: durationPlannedDays,
        duration_actual_days: durationActualDays,
        region: fullProject.city || null,
        cfc_summary: cfcSummary,
        created_at: new Date().toISOString(),
      });

    console.log(`[project-benchmark] Inserted C2 benchmark for project ${projectId} (${projectType}, ${fullProject.city})`);
  } catch (err) {
    // project_benchmarks table may not exist — non-blocking
    console.warn("[project-benchmark] Insert failed (table may not exist):", err);
  }
}
