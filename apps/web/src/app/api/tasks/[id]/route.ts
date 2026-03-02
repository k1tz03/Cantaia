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

    const { data: task, error } = await (admin as any)
      .from("tasks")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("[Tasks PATCH] Error:", error);
      return NextResponse.json(
        { error: "Failed to update task" },
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
