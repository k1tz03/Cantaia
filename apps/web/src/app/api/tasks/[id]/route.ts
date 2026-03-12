import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const update: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        update[field] = body[field];
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

    // If update failed due to enum mismatch, retry with legacy values
    if (error && error.message?.includes("invalid input value")) {
      console.warn("[Tasks PATCH] Enum error, retrying with legacy values:", error.message);
      const statusMap: Record<string, string> = { todo: "open", done: "completed" };
      if (update.status && statusMap[update.status as string]) {
        update.status = statusMap[update.status as string];
      }
      delete update.reminder;
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
