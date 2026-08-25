import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTaskAssigned } from "@cantaia/core/notifications";

/** Reminder lead times the cron actually understands (REMINDER_LEAD_DAYS). */
const VALID_REMINDERS = ["none", "1_day", "3_days", "1_week"];

/**
 * Validates a requested `assigned_to` against the caller's organization.
 * Mirrors the guard in POST /api/tasks — a task must never be assignable to a
 * user of another tenant (that UUID would otherwise leak into team views).
 */
async function resolveAssignedTo(
  admin: ReturnType<typeof createAdminClient>,
  raw: unknown,
  organizationId: string
): Promise<{ value?: string | null; error?: string }> {
  if (raw === null || raw === "") return { value: null };

  if (typeof raw !== "string") {
    return { error: "assigned_to must be a user id or null" };
  }

  const { data: member, error } = await (admin as any)
    .from("users")
    .select("id, organization_id")
    .eq("id", raw)
    .maybeSingle();

  if (error) {
    console.error("[Tasks PATCH] assigned_to lookup failed:", error.message);
    return { error: "Failed to validate assignee" };
  }

  if (!member || member.organization_id !== organizationId) {
    return { error: "Assignee is not a member of your organization" };
  }

  return { value: member.id };
}

// PATCH — update a task (status, fields, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const admin = createAdminClient();

    // Verify task belongs to user's organization
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: existingTask } = await (admin as any)
      .from("tasks")
      .select("id, project_id, status, created_at, assigned_to")
      .eq("id", id)
      .maybeSingle();

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { data: project } = await (admin as any)
      .from("projects")
      .select("organization_id, name")
      .eq("id", existingTask.project_id)
      .maybeSingle();

    if (!project || project.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build update object from allowed fields
    const allowedFields = [
      "title",
      "description",
      "status",
      "priority",
      "due_date",
      "assigned_to_name",
      "assigned_to_company",
      "lot_code",
      "reminder",
    ];
    // A reminder value the cron doesn't recognise would be stored but never
    // fire — reject it up front.
    if ("reminder" in body && body.reminder !== null && !VALID_REMINDERS.includes(body.reminder)) {
      return NextResponse.json({ error: "Invalid reminder value" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        update[field] = body[field];
      }
    }

    // `assigned_to` is a FK to users — validated separately, never taken raw.
    if ("assigned_to" in body) {
      const assignee = await resolveAssignedTo(admin, body.assigned_to, userProfile.organization_id);
      if (assignee.error) {
        return NextResponse.json({ error: assignee.error }, { status: 400 });
      }
      update.assigned_to = assignee.value ?? null;
      // Re-assigning clears the reminder ledger so the new owner gets the
      // deadline reminder even if the previous one already consumed it.
      if (assignee.value && assignee.value !== existingTask.assigned_to) {
        update.reminder_sent_at = null;
      }
    }

    // Set completed_at when marking as done
    if (update.status === "done") {
      update.completed_at = new Date().toISOString();
    } else if (update.status && update.status !== "done") {
      update.completed_at = null;
    }

    update.updated_at = new Date().toISOString();

    let { data: task, error } = await (admin as any)
      .from("tasks")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    // If update failed due to missing column or enum mismatch, retry with fallback values
    if (error && (error.message?.includes("does not exist") || error.message?.includes("invalid input value"))) {
      console.warn("[Tasks PATCH] Error, retrying with fallback:", error.message);
      delete update.reminder;
      // reminder_sent_at only exists once migration 092 is applied.
      delete update.reminder_sent_at;
      const statusMap: Record<string, string> = { todo: "open", done: "completed" };
      if (update.status && statusMap[update.status as string]) {
        update.status = statusMap[update.status as string];
      }
      const retry = await (admin as any)
        .from("tasks")
        .update(update)
        .eq("id", id)
        .select("*")
        .single();
      task = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error("[Tasks PATCH] Error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to update task" },
        { status: 500 }
      );
    }

    // task_assigned notification — only when the owner actually changed, and
    // never back to the person who just did the assigning.
    const newAssignee = update.assigned_to as string | null | undefined;
    if (newAssignee && newAssignee !== existingTask.assigned_to) {
      // Run after the response so the Resend round-trip never delays the PATCH.
      after(async () => {
        try {
          await notifyTaskAssigned(admin, {
            task: {
              id,
              title: (task?.title as string) || (body.title as string) || "",
              due_date: (task?.due_date as string | null) ?? null,
              priority: (task?.priority as string | null) ?? null,
              assigned_to: newAssignee,
            },
            actorId: user.id,
            projectName: project.name || null,
          });
        } catch (err) {
          console.error("[Tasks PATCH] task_assigned notification failed:", err);
        }
      });
    }

    // Log status change to task_status_log. supabase-js does not throw, so the
    // try/catch here never caught anything — read {error} and log it instead.
    const newStatus = body.status;
    const previousStatus = existingTask.status;
    if (newStatus && newStatus !== previousStatus) {
      const now = new Date();
      const createdAt = existingTask.created_at ? new Date(existingTask.created_at) : now;
      const durationDays = Math.round((now.getTime() - createdAt.getTime()) / 86400000);
      const { error: logError } = await (admin as any).from("task_status_log").insert({
        organization_id: userProfile.organization_id,
        task_id: id,
        previous_status: previousStatus || null,
        new_status: newStatus,
        changed_by: user.id,
        changed_at: now.toISOString(),
        duration_days: durationDays,
      });
      if (logError) {
        // Non-blocking: the task IS updated; only the analytics log is missing.
        console.error("[Tasks PATCH] task_status_log insert failed (non-blocking):", logError.message);
      }
    }

    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error("[Tasks PATCH] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT — full update (used by TaskCreateModal edit mode)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return PATCH(request, { params });
}

// DELETE — delete a task
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const admin = createAdminClient();

    // Verify task belongs to user's organization
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: existingTask } = await (admin as any)
      .from("tasks")
      .select("id, project_id")
      .eq("id", id)
      .maybeSingle();

    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { data: project } = await (admin as any)
      .from("projects")
      .select("organization_id")
      .eq("id", existingTask.project_id)
      .maybeSingle();

    if (!project || project.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await (admin as any)
      .from("tasks")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[Tasks DELETE] Error:", error);
      return NextResponse.json(
        { error: "Failed to delete task" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Tasks DELETE] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
