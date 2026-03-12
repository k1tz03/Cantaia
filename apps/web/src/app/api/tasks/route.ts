import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST — create a new task
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      project_id,
      title,
      description,
      priority,
      status,
      source,
      source_id,
      source_reference,
      due_date,
      assigned_to_name,
      assigned_to_company,
      lot_code,
      reminder,
    } = body;

    if (!project_id || !title) {
      return NextResponse.json(
        { error: "project_id and title are required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Verify project belongs to user's organization
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: projectCheck } = await (admin as any)
      .from("projects")
      .select("organization_id")
      .eq("id", project_id)
      .maybeSingle();

    if (!projectCheck || projectCheck.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Project not found or forbidden" }, { status: 403 });
    }

    // Build insert object with only base columns first
    const insertData: Record<string, unknown> = {
      project_id,
      created_by: user.id,
      title,
      description: description || null,
      priority: priority || "medium",
      source: source || "manual",
      source_id: source_id || null,
      source_reference: source_reference || null,
      due_date: due_date || null,
      assigned_to_name: assigned_to_name || null,
      assigned_to_company: assigned_to_company || null,
      lot_code: lot_code || null,
    };

    // Only include optional columns if values provided (avoids errors if migration 006 not applied)
    if (status) insertData.status = status;
    if (reminder && reminder !== "none") insertData.reminder = reminder;

    let { data: task, error } = await (admin as any)
      .from("tasks")
      .insert(insertData)
      .select("id, project_id, created_by, title, description, priority, status, source, source_id, source_reference, due_date, assigned_to_name, assigned_to_company, lot_code, reminder, created_at, updated_at")
      .single();

    // If insert failed (likely due to enum mismatch), retry with fallback values
    if (error && error.message?.includes("invalid input value")) {
      if (process.env.NODE_ENV === "development") console.warn("[Tasks Create] Enum error, retrying with legacy values:", error.message);
      // Map new enum values to old ones (migration 006 might not be applied)
      const statusMap: Record<string, string> = { todo: "open", done: "completed" };
      const sourceMap: Record<string, string> = { meeting: "meeting_pv", reserve: "ai_suggestion" };
      if (insertData.status && statusMap[insertData.status as string]) {
        insertData.status = statusMap[insertData.status as string];
      }
      if (insertData.source && sourceMap[insertData.source as string]) {
        insertData.source = sourceMap[insertData.source as string];
      }
      // Remove reminder column (doesn't exist without migration 006)
      delete insertData.reminder;

      const retry = await (admin as any)
        .from("tasks")
        .insert(insertData)
        .select("id, project_id, created_by, title, description, priority, status, source, source_id, source_reference, due_date, assigned_to_name, assigned_to_company, lot_code, created_at, updated_at")
        .single();
      task = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error("[Tasks Create] Error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to create task" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, task });
  } catch (error) {
    console.error("[Tasks Create] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET — list tasks for the current user (filtered by project membership)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Get user's projects via project_members
    const { data: memberships } = await admin
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);

    const projectIds = (memberships || []).map((m: any) => m.project_id);

    if (projectIds.length === 0) {
      return NextResponse.json({ success: true, tasks: [], projects: [] });
    }

    // Pagination
    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50"), 100);
    const offset = (page - 1) * limit;

    // Fetch tasks for user's projects
    const projectId = request.nextUrl.searchParams.get("project_id");

    let query = admin
      .from("tasks")
      .select("id, project_id, created_by, title, description, priority, status, source, source_id, source_reference, due_date, assigned_to_name, assigned_to_company, lot_code, created_at, updated_at", { count: "exact" })
      .in("project_id", projectIds)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data: tasks, error, count } = await query;

    if (error) {
      console.error("[Tasks List] Error:", error);
      return NextResponse.json(
        { error: "Failed to fetch tasks" },
        { status: 500 }
      );
    }

    // Also fetch projects for display
    const { data: projects } = await admin
      .from("projects")
      .select("id, name, code, color")
      .in("id", projectIds);

    const response = NextResponse.json({
      success: true,
      tasks: tasks || [],
      projects: projects || [],
    });
    if (count !== null) response.headers.set("X-Total-Count", String(count));
    return response;
  } catch (error) {
    console.error("[Tasks List] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
