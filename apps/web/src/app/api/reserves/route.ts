import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

/**
 * /api/reserves — reception reserves (module Clôture).
 *
 * The reserve list existed since migration 010 but nothing ever wrote a row:
 * the reception form nested reserves inside `lots_reception` (JSONB) and the
 * DOCX, so `/projects/[id]/reserves` was permanently empty. This route is the
 * missing write path, and it is also where the reserve ⇄ task link lives:
 *
 *   create reserve  → create task  (source='reserve', source_id=reserve.id)
 *   reserve status  → task status  (verified ⇒ task done)
 *
 * Every handler is scoped through project → organization_id (anti-IDOR); the
 * admin client is used so a missing project_members row can never hide a
 * colleague's reserves.
 */

type Severity = "minor" | "major" | "blocking";
type ReserveStatus = "open" | "in_progress" | "corrected" | "verified" | "disputed";

const SEVERITIES: Severity[] = ["minor", "major", "blocking"];
const STATUSES: ReserveStatus[] = ["open", "in_progress", "corrected", "verified", "disputed"];

/** A blocking reserve holds up the whole reception — it outranks everything else. */
const PRIORITY_BY_SEVERITY: Record<Severity, string> = {
  blocking: "urgent",
  major: "high",
  minor: "medium",
};

/** Reserve status → task status. `disputed` deliberately leaves the task open. */
const TASK_STATUS_BY_RESERVE_STATUS: Partial<Record<ReserveStatus, string>> = {
  open: "todo",
  in_progress: "in_progress",
  corrected: "in_progress",
  verified: "done",
};

const TITLE_MAX = 70;

function reserveTaskTitle(description: string): string {
  const clean = description.trim().replace(/\s+/g, " ");
  const short = clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1)}…` : clean;
  return `Lever la réserve : ${short}`;
}

/**
 * Resolves the caller's org and checks the project belongs to it.
 * Returns a ready-to-send NextResponse on failure.
 */
async function resolveProjectScope(projectId: string | null | undefined) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }

  const admin = createAdminClient();

  const { data: profile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 403 }) } as const;
  }

  if (!projectId) {
    return { error: NextResponse.json({ error: "project_id is required" }, { status: 400 }) } as const;
  }

  const { data: project } = await (admin as any)
    .from("projects")
    .select("id, organization_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project || project.organization_id !== profile.organization_id) {
    return { error: NextResponse.json({ error: "Project not found or forbidden" }, { status: 403 }) } as const;
  }

  return {
    admin,
    userId: user.id,
    organizationId: profile.organization_id as string,
    projectId: project.id as string,
  } as const;
}

/**
 * Creates the task that mirrors a reserve.
 *
 * Mirrors the enum fallback of POST /api/tasks: on a database where migration
 * 006 was never applied, `source='reserve'` is still called `ai_suggestion` and
 * `status='todo'` is still `open`. The error is inspected, never swallowed.
 */
async function createReserveTask(
  admin: ReturnType<typeof createAdminClient>,
  reserve: {
    id: string;
    project_id: string;
    description: string;
    severity: Severity;
    deadline: string | null;
    location: string | null;
    lot_name: string | null;
    cfc_code: string | null;
    responsible_company: string | null;
  },
  createdBy: string,
): Promise<{ taskId: string | null; error: string | null }> {
  const descriptionLines = [
    `Réserve relevée lors de la réception.`,
    reserve.location ? `Localisation : ${reserve.location}` : null,
    reserve.cfc_code || reserve.lot_name
      ? `Lot : ${[reserve.cfc_code ? `CFC ${reserve.cfc_code}` : null, reserve.lot_name].filter(Boolean).join(" — ")}`
      : null,
    reserve.responsible_company ? `Entreprise responsable : ${reserve.responsible_company}` : null,
    "",
    reserve.description,
  ].filter((l) => l !== null);

  const insertData: Record<string, unknown> = {
    project_id: reserve.project_id,
    created_by: createdBy,
    title: reserveTaskTitle(reserve.description),
    description: descriptionLines.join("\n"),
    priority: PRIORITY_BY_SEVERITY[reserve.severity],
    status: "todo",
    source: "reserve",
    source_id: reserve.id,
    source_reference: `Réserve — ${reserve.cfc_code ? `CFC ${reserve.cfc_code}` : reserve.location || "réception"}`,
    due_date: reserve.deadline,
    assigned_to_company: reserve.responsible_company,
    lot_code: reserve.cfc_code,
  };

  let { data, error } = await (admin as any)
    .from("tasks")
    .insert(insertData)
    .select("id")
    .single();

  if (error && (error.message?.includes("does not exist") || error.message?.includes("invalid input value"))) {
    console.warn("[Reserves] Task insert enum mismatch, retrying with legacy values:", error.message);
    insertData.status = "open";
    insertData.source = "ai_suggestion";
    const retry = await (admin as any).from("tasks").insert(insertData).select("id").single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error("[Reserves] Task creation failed:", error.message);
    return { taskId: null, error: error.message };
  }

  return { taskId: data?.id ?? null, error: null };
}

/** Pushes a reserve status change onto its task. Never fatal. */
async function syncReserveTask(
  admin: ReturnType<typeof createAdminClient>,
  taskId: string | null | undefined,
  status: ReserveStatus,
): Promise<void> {
  if (!taskId) return;

  const taskStatus = TASK_STATUS_BY_RESERVE_STATUS[status];
  if (!taskStatus) return;

  const updates: Record<string, unknown> = {
    status: taskStatus,
    updated_at: new Date().toISOString(),
  };
  // Reopening a verified reserve must clear the completion timestamp too.
  updates.completed_at = taskStatus === "done" ? new Date().toISOString() : null;

  let { error } = await (admin as any).from("tasks").update(updates).eq("id", taskId);

  if (error && error.message?.includes("invalid input value")) {
    const legacy: Record<string, string> = { todo: "open", done: "completed" };
    if (legacy[taskStatus]) {
      updates.status = legacy[taskStatus];
      const retry = await (admin as any).from("tasks").update(updates).eq("id", taskId);
      error = retry.error;
    }
  }

  if (error) {
    console.warn("[Reserves] Task sync failed (non-blocking):", error.message);
  }
}

// ───────────────────────────── GET ─────────────────────────────

/**
 * GET /api/reserves?project_id=xxx
 * Reserves of a project + the counters the Clôture tab / tab badge need.
 */
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("project_id");
    const scope = await resolveProjectScope(projectId);
    if ("error" in scope) return scope.error;

    const { data, error } = await (scope.admin as any)
      .from("reception_reserves")
      .select("*")
      .eq("project_id", scope.projectId)
      .order("created_at", { ascending: true });

    if (error) {
      // Table absent (migration 010 not applied) — an empty list is the honest
      // answer here; the caller renders the empty state instead of an error.
      console.warn("[Reserves] List failed:", error.message);
      return NextResponse.json({
        reserves: [],
        counts: { total: 0, open: 0, verified: 0 },
        table_missing: true,
      });
    }

    const reserves = data || [];
    return NextResponse.json({
      reserves,
      counts: {
        total: reserves.length,
        open: reserves.filter((r: any) => r.status !== "verified").length,
        verified: reserves.filter((r: any) => r.status === "verified").length,
      },
    });
  } catch (err) {
    console.error("[Reserves] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ───────────────────────────── POST ─────────────────────────────

/**
 * POST /api/reserves
 * Creates a reserve AND the task that carries it through to completion.
 *
 * Body: project_id, description, severity?, location?, deadline?, lot_name?,
 *       cfc_code?, responsible_company?, reception_id?
 */
export async function POST(request: NextRequest) {
  try {
    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
    }

    const requiredError = validateRequired(body, ["project_id", "description"]);
    if (requiredError) {
      return NextResponse.json({ error: requiredError }, { status: 400 });
    }

    const scope = await resolveProjectScope(body.project_id);
    if ("error" in scope) return scope.error;

    const description = String(body.description).trim();
    if (!description) {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }

    const severity: Severity = SEVERITIES.includes(body.severity) ? body.severity : "minor";

    // Attach to the project's latest reception when the caller did not name one
    // (the reserves page is always reached from a reception).
    let receptionId: string | null = body.reception_id || null;
    if (!receptionId) {
      const { data: reception } = await (scope.admin as any)
        .from("project_receptions")
        .select("id")
        .eq("project_id", scope.projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      receptionId = reception?.id ?? null;
    }

    const insertData = {
      reception_id: receptionId,
      project_id: scope.projectId,
      organization_id: scope.organizationId,
      description,
      location: body.location?.trim() || null,
      lot_name: body.lot_name?.trim() || null,
      cfc_code: body.cfc_code?.trim() || null,
      responsible_company: body.responsible_company?.trim() || null,
      severity,
      deadline: body.deadline || null,
      status: "open",
    };

    const { data: reserve, error } = await (scope.admin as any)
      .from("reception_reserves")
      .insert(insertData)
      .select("*")
      .single();

    if (error || !reserve) {
      console.error("[Reserves] Insert failed:", error?.message);
      return NextResponse.json(
        { error: error?.message || "Impossible de créer la réserve" },
        { status: 500 },
      );
    }

    // The task is what makes a reserve actionable — a reserve without one is
    // just a note. Its failure is surfaced, not swallowed.
    const { taskId, error: taskError } = await createReserveTask(
      scope.admin,
      {
        id: reserve.id,
        project_id: scope.projectId,
        description,
        severity,
        deadline: insertData.deadline,
        location: insertData.location,
        lot_name: insertData.lot_name,
        cfc_code: insertData.cfc_code,
        responsible_company: insertData.responsible_company,
      },
      scope.userId,
    );

    if (taskId) {
      const { error: linkError } = await (scope.admin as any)
        .from("reception_reserves")
        .update({ task_id: taskId, updated_at: new Date().toISOString() })
        .eq("id", reserve.id);
      if (linkError) {
        console.warn("[Reserves] task_id link failed:", linkError.message);
      } else {
        reserve.task_id = taskId;
      }
    }

    return NextResponse.json({
      success: true,
      reserve,
      task_id: taskId,
      task_error: taskError || undefined,
    });
  } catch (err) {
    console.error("[Reserves] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ───────────────────────────── PATCH ─────────────────────────────

/**
 * PATCH /api/reserves
 * Updates one reserve and mirrors the change onto its task.
 * Body: id + any of status, correction_notes, severity, deadline, location,
 *       description, responsible_company.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
    }

    const requiredError = validateRequired(body, ["id"]);
    if (requiredError) {
      return NextResponse.json({ error: requiredError }, { status: 400 });
    }

    // Read the reserve first so the org check runs against its own project,
    // not against a project_id the caller chose.
    const admin = createAdminClient();
    const { data: existing, error: readError } = await (admin as any)
      .from("reception_reserves")
      .select("id, project_id, task_id, status, severity")
      .eq("id", body.id)
      .maybeSingle();

    if (readError || !existing) {
      return NextResponse.json({ error: "Réserve introuvable" }, { status: 404 });
    }

    const scope = await resolveProjectScope(existing.project_id);
    if ("error" in scope) return scope.error;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.description === "string" && body.description.trim()) {
      updates.description = body.description.trim();
    }
    if (typeof body.location === "string") updates.location = body.location.trim() || null;
    if (typeof body.responsible_company === "string") {
      updates.responsible_company = body.responsible_company.trim() || null;
    }
    if (SEVERITIES.includes(body.severity)) updates.severity = body.severity;
    if ("deadline" in body) updates.deadline = body.deadline || null;
    if ("correction_notes" in body) {
      updates.correction_notes = body.correction_notes?.trim?.() || null;
    }

    let nextStatus: ReserveStatus | null = null;
    if (body.status) {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "Statut de réserve invalide" }, { status: 400 });
      }
      nextStatus = body.status;
      updates.status = nextStatus;

      if (nextStatus === "corrected") {
        updates.corrected_at = new Date().toISOString();
        updates.corrected_by = body.corrected_by || null;
      }
      if (nextStatus === "verified") {
        updates.verified_at = new Date().toISOString();
        updates.verified_by = scope.userId;
      }
      // Reopening clears the lifting trail so the timeline stays truthful.
      if (nextStatus === "open" || nextStatus === "in_progress") {
        updates.verified_at = null;
        updates.verified_by = null;
      }
    }

    const { data: reserve, error } = await (scope.admin as any)
      .from("reception_reserves")
      .update(updates)
      .eq("id", body.id)
      .select("*")
      .single();

    if (error || !reserve) {
      console.error("[Reserves] Update failed:", error?.message);
      return NextResponse.json(
        { error: error?.message || "Impossible de mettre à jour la réserve" },
        { status: 500 },
      );
    }

    if (nextStatus) {
      await syncReserveTask(scope.admin, reserve.task_id, nextStatus);
    }

    return NextResponse.json({ success: true, reserve });
  } catch (err) {
    console.error("[Reserves] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
