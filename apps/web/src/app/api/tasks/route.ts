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

    const { data: task, error } = await (admin as any)
      .from("tasks")
      .insert({
        project_id,
        created_by: user.id,
        title,
        description: description || null,
        priority: priority || "medium",
        status: status || "todo",
        source: source || "manual",
        source_id: source_id || null,
        source_reference: source_reference || null,
        due_date: due_date || null,
        assigned_to_name: assigned_to_name || null,
        assigned_to_company: assigned_to_company || null,
        lot_code: lot_code || null,
        reminder: reminder || "none",
      })
      .select("*")
      .single();

    if (error) {
      console.error("[Tasks Create] Error:", error);
      return NextResponse.json(
        { error: "Failed to create task" },
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

    // Fetch tasks for user's projects
    const projectId = request.nextUrl.searchParams.get("project_id");

    let query = admin
      .from("tasks")
      .select("*")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data: tasks, error } = await query;

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

    return NextResponse.json({
      success: true,
      tasks: tasks || [],
      projects: projects || [],
    });
  } catch (error) {
    console.error("[Tasks List] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
