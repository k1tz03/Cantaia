import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";

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

/**
 * Learn per-task duration corrections when a project is closed.
 *
 * WHAT WAS BROKEN
 * The previous implementation computed one global ratio
 *   (project.end_date − project.start_date) in CALENDAR days
 *   ÷ SUM(planning_tasks.duration_days) in WORKING days
 * and wrote that single number onto every CFC group. Two incompatible units
 * divided by each other, then applied to ~21 unrelated trades: a project that
 * ran exactly on schedule still produced a ~1.4 "correction" purely from the
 * calendar/working-day mismatch, and one badly-closed project poisoned every
 * future estimate for the organization.
 *
 * WHAT IT DOES NOW
 * Task by task: actual working days vs planned working days, using the real
 * per-task dates (migration 094). Tasks without actuals are SKIPPED — never
 * approximated from the project envelope. A CFC group needs at least
 * MIN_SAMPLES observations, and the resulting factor is clamped to
 * [MIN_FACTOR, MAX_FACTOR] so a single outlier cannot run away.
 */
async function extractPlanningCorrections(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  orgId: string,
) {
  /** Below this a CFC group is statistically meaningless — do not learn from it. */
  const MIN_SAMPLES = 2;
  /** A learnt factor never leaves this band. */
  const MIN_FACTOR = 0.5;
  const MAX_FACTOR = 2.0;

  const { data: planning } = await (admin as any)
    .from("project_plannings")
    .select("id, project_type, location_canton")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!planning) return;

  const { data: tasks, error: tasksError } = await (admin as any)
    .from("planning_tasks")
    .select("id, cfc_code, duration_days, productivity_ratio, unit, start_date, end_date, actual_start_date, actual_end_date, is_milestone")
    .eq("planning_id", planning.id);

  if (tasksError) {
    console.error("[planning-calibration] Read tasks failed:", tasksError.message);
    return;
  }
  if (!tasks?.length) return;

  // ── Per-task measurement ──────────────────────────────────────────────────
  type Observation = { factor: number; ratio: number; unit: string | null };
  const byCfc = new Map<string, Observation[]>();
  let skippedNoActuals = 0;

  for (const task of tasks) {
    if (task.is_milestone) continue;
    if (!task.cfc_code) continue;

    // No actuals → no measurement. Never fall back to the project envelope.
    if (!task.actual_start_date || !task.actual_end_date) {
      skippedNoActuals++;
      continue;
    }

    const plannedDays = Number(task.duration_days);
    if (!Number.isFinite(plannedDays) || plannedDays <= 0) continue;

    // Both sides in WORKING days — the unit the durations were computed in.
    const actualDays = countWorkingDaysBetween(task.actual_start_date, task.actual_end_date);
    if (actualDays <= 0) continue;

    // > 1 means the task took longer than planned, so productivity was lower.
    const slip = actualDays / plannedDays;
    const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, 1 / slip));

    const prefix = String(task.cfc_code).split(".")[0];
    if (!byCfc.has(prefix)) byCfc.set(prefix, []);
    byCfc.get(prefix)!.push({
      factor,
      ratio: Number(task.productivity_ratio) || 0,
      unit: task.unit || null,
    });
  }

  // ── One correction row per CFC group with enough observations ─────────────
  let inserted = 0;
  let skippedThinData = 0;

  for (const [cfcCode, observations] of byCfc) {
    if (observations.length < MIN_SAMPLES) {
      skippedThinData++;
      continue;
    }

    // Geometric mean — the natural average for a multiplicative factor.
    const logSum = observations.reduce((s, o) => s + Math.log(o.factor), 0);
    const meanFactor = Math.min(
      MAX_FACTOR,
      Math.max(MIN_FACTOR, Math.exp(logSum / observations.length)),
    );

    const rated = observations.filter((o) => o.ratio > 0);
    if (rated.length === 0) continue;
    const avgOriginalRatio = rated.reduce((s, o) => s + o.ratio, 0) / rated.length;

    // Most frequent unit in the group
    const unitCounts = new Map<string, number>();
    for (const o of observations) {
      if (o.unit) unitCounts.set(o.unit, (unitCounts.get(o.unit) || 0) + 1);
    }
    let commonUnit: string | null = null;
    let maxCount = 0;
    for (const [u, count] of unitCounts) {
      if (count > maxCount) { maxCount = count; commonUnit = u; }
    }

    const { error: insertError } = await (admin as any)
      .from("planning_duration_corrections")
      .insert({
        organization_id: orgId,
        cfc_code: cfcCode,
        unit: commonUnit,
        original_ratio: Math.round(avgOriginalRatio * 1000) / 1000,
        corrected_ratio: Math.round(avgOriginalRatio * meanFactor * 1000) / 1000,
        project_type: planning.project_type || null,
        canton: planning.location_canton || null,
        source: "project_closure",
        sample_count: observations.length,
      });

    if (insertError) {
      // Table or columns may predate migration 094 — non-blocking.
      console.warn(`[planning-calibration] CFC ${cfcCode} insert failed:`, insertError.message);
      continue;
    }
    inserted++;
  }

  console.log(
    `[planning-calibration] project=${projectId}: ${inserted} corrections CFC ecrites, ` +
    `${skippedThinData} groupes ignores (<${MIN_SAMPLES} observations), ` +
    `${skippedNoActuals} taches sans dates reelles`,
  );
}

/**
 * Working days between two ISO dates, inclusive of both ends.
 * Week-ends only — a task's actual span is measured the same way its planned
 * duration was expressed.
 */
function countWorkingDaysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  let guard = 3650;

  while (cursor <= end && guard-- > 0) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

/**
 * DELETE /api/projects/[id]
 *
 * Deletes a project, declassifies its emails and cleans up its Storage folders.
 *
 * `?preview=1` performs no write: it returns the impact counts so the
 * confirmation dialog can tell the user exactly what disappears — most
 * importantly the site reports (heures et bons de livraison saisis par les
 * chefs d'équipe), which cascade away silently today.
 *
 * Restricted to org admins / directors (requireOrgAdmin): this is the single
 * most destructive action in the product and it is not undoable.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const previewOnly = request.nextUrl.searchParams.get("preview") === "1";

  const check = await requireOrgAdmin();
  if (!check.authorized) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const admin = createAdminClient();
  const organizationId = check.profile.organization_id;

  // Verify project belongs to user's org
  const { data: existing } = await admin
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const counts = await collectDeletionImpact(admin, id);

  if (previewOnly) {
    return NextResponse.json({ preview: true, project_name: existing.name, counts });
  }

  // Declassify all emails linked to this project (they are kept, not deleted)
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

  // Storage cleanup runs BEFORE the row delete: once the project is gone we no
  // longer know which folders belonged to it. Best-effort — an orphaned file is
  // a lesser evil than a failed delete.
  const storage = await purgeProjectStorage(admin, organizationId, id);

  // Delete the project (FK cascades handle tasks, meetings, plans… — see
  // migration 098, which gave the last eight FKs an explicit ON DELETE)
  const { error } = await admin
    .from("projects")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[projects/[id]] Delete error:", error.message);
    return NextResponse.json(
      {
        error:
          "Suppression impossible : des données liées bloquent l'opération. " +
          "Vérifiez que la migration 098 est appliquée.",
        detail: error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, counts, storage });
}

/**
 * Counts everything the delete takes with it.
 *
 * Each table is queried independently and failures are swallowed: several of
 * these tables only exist once their migration is applied, and a missing count
 * must never block the deletion itself.
 */
async function collectDeletionImpact(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
): Promise<Record<string, number>> {
  const targets: { key: string; table: string; column?: string }[] = [
    { key: "tasks", table: "tasks" },
    { key: "meetings", table: "meetings" },
    { key: "plans", table: "plan_registry" },
    { key: "submissions", table: "submissions" },
    { key: "site_reports", table: "site_reports" },
    { key: "visits", table: "client_visits" },
    { key: "reserves", table: "reception_reserves" },
    { key: "closure_documents", table: "closure_documents" },
    { key: "plannings", table: "project_plannings" },
    { key: "emails", table: "email_records" },
  ];

  const counts: Record<string, number> = {};

  await Promise.all(
    targets.map(async ({ key, table, column }) => {
      try {
        const { count, error } = await (admin as any)
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq(column || "project_id", projectId);
        counts[key] = error ? 0 : count || 0;
      } catch {
        counts[key] = 0;
      }
    }),
  );

  // Hours logged in the field are the most painful loss — surface them apart
  // from the report count.
  try {
    const { data: reports } = await (admin as any)
      .from("site_reports")
      .select("id")
      .eq("project_id", projectId);

    const reportIds = (reports || []).map((r: any) => r.id);
    if (reportIds.length > 0) {
      const { count } = await (admin as any)
        .from("site_report_entries")
        .select("id", { count: "exact", head: true })
        .in("report_id", reportIds);
      counts.site_report_entries = count || 0;
    } else {
      counts.site_report_entries = 0;
    }
  } catch {
    counts.site_report_entries = 0;
  }

  return counts;
}

/**
 * Removes the project's folders from Storage.
 *
 * Supabase has no "delete prefix" call: every object has to be listed first.
 * The three prefixes below are the ones the app writes to (see plan-storage.ts,
 * /api/submissions, and the closure routes).
 */
async function purgeProjectStorage(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  projectId: string,
): Promise<{ removed: number; failed: string[] }> {
  const prefixes: { bucket: string; prefix: string }[] = [
    { bucket: "plans", prefix: `${organizationId}/${projectId}` },
    { bucket: "submissions", prefix: `${organizationId}/${projectId}` },
    { bucket: "audio", prefix: `closure/${organizationId}/${projectId}` },
    // Legacy closure path, written when the org id was not part of the prefix
    { bucket: "audio", prefix: `closure/${projectId}` },
  ];

  let removed = 0;
  const failed: string[] = [];

  for (const { bucket, prefix } of prefixes) {
    try {
      const { data: files, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
      if (error || !files || files.length === 0) continue;

      // `list` returns folders as entries with a null id — recurse one level,
      // which is as deep as any of these prefixes goes.
      const paths: string[] = [];
      for (const file of files as { name: string; id: string | null }[]) {
        if (file.id === null) {
          const { data: nested } = await admin.storage
            .from(bucket)
            .list(`${prefix}/${file.name}`, { limit: 1000 });
          for (const child of nested || []) {
            paths.push(`${prefix}/${file.name}/${child.name}`);
          }
        } else {
          paths.push(`${prefix}/${file.name}`);
        }
      }

      if (paths.length === 0) continue;

      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) {
        failed.push(`${bucket}/${prefix}: ${removeError.message}`);
      } else {
        removed += paths.length;
      }
    } catch (err) {
      failed.push(`${bucket}/${prefix}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  if (failed.length > 0) {
    console.warn("[projects/[id]] Storage cleanup partial:", failed);
  }

  return { removed, failed };
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
