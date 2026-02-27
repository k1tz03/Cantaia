import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
