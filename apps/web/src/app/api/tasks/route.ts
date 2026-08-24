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

    // Only include optional columns if values provided
    if (status) insertData.status = status;

    const BASE_SELECT = "id, project_id, created_by, title, description, priority, status, source, source_id, source_reference, due_date, assigned_to_name, assigned_to_company, lot_code, created_at, updated_at";

    // Try insert with reminder column first (if migration 006 applied)
    if (reminder && reminder !== "none") insertData.reminder = reminder;

    let { data: task, error } = await (admin as any)
      .from("tasks")
      .insert(insertData)
      .select(insertData.reminder ? `${BASE_SELECT}, reminder` : BASE_SELECT)
      .single();

    // If insert failed due to missing column or enum mismatch, retry with fallback values
    if (error && (error.message?.includes("does not exist") || error.message?.includes("invalid input value"))) {
      console.warn("[Tasks Create] Error, retrying with fallback:", error.message);
      // Remove reminder column (doesn't exist without migration 006)
      delete insertData.reminder;
      // Map new enum values to old ones (migration 006 might not be applied)
      const statusMap: Record<string, string> = { todo: "open", done: "completed" };
      const sourceMap: Record<string, string> = { meeting: "meeting_pv", reserve: "ai_suggestion" };
      if (insertData.status && statusMap[insertData.status as string]) {
        insertData.status = statusMap[insertData.status as string];
      }
      if (insertData.source && sourceMap[insertData.source as string]) {
        insertData.source = sourceMap[insertData.source as string];
      }

      const retry = await (admin as any)
        .from("tasks")
        .insert(insertData)
        .select(BASE_SELECT)
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

// Tasks lists are consumed unpaginated by the UI (counters, project health,
// Kanban), so the default has to cover a realistic org rather than silently
// truncating at 50.
const DEFAULT_TASKS_LIMIT = 500;
const MAX_TASKS_LIMIT = 1000;

// GET — list tasks for the current user's organization
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

    // Org-wide scope: project_members is not maintained for every project, so a
    // manager who is not an explicit member used to see an empty list (and the
    // Direction counters read 0).
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ success: true, tasks: [], projects: [] });
    }

    const { data: orgProjects } = await admin
      .from("projects")
      .select("id, name, code, color")
      .eq("organization_id", userProfile.organization_id);

    const projectIds = (orgProjects || []).map((p: any) => p.id);

    if (projectIds.length === 0) {
      return NextResponse.json({ success: true, tasks: [], projects: [] });
    }

    // Pagination
    const parsedPage = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const parsedLimit = parseInt(request.nextUrl.searchParams.get("limit") || String(DEFAULT_TASKS_LIMIT));
    const limit = Math.min(
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_TASKS_LIMIT,
      MAX_TASKS_LIMIT,
    );
    const offset = (page - 1) * limit;

    // Fetch tasks for the org's projects
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

    const response = NextResponse.json({
      success: true,
      tasks: tasks || [],
      projects: orgProjects || [],
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
