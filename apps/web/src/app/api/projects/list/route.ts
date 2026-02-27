import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/projects/list
 * Returns all projects for the authenticated user's organization,
 * enriched with task counts, email counts, and next meeting.
 */
export async function GET() {
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
    return NextResponse.json({ projects: [] });
  }

  const { data: projects, error } = await admin
    .from("projects")
    .select("*")
    .eq("organization_id", userRow.organization_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[projects/list] Error:", error.message);
    return NextResponse.json({ projects: [] });
  }

  if (!projects || projects.length === 0) {
    return NextResponse.json({ projects: [] });
  }

  const projectIds = projects.map((p) => p.id);
  const today = new Date().toISOString().split("T")[0];

  // Fetch all tasks for these projects (only open ones for counts)
  const { data: allTasks } = await admin
    .from("tasks")
    .select("id, project_id, status, due_date")
    .in("project_id", projectIds);

  // Fetch email counts per project
  const { data: allEmails } = await admin
    .from("emails")
    .select("id, project_id")
    .in("project_id", projectIds);

  // Fetch next meeting per project (future meetings only)
  const { data: futureMeetings } = await admin
    .from("meetings")
    .select("id, project_id, title, meeting_date")
    .in("project_id", projectIds)
    .gte("meeting_date", today)
    .order("meeting_date", { ascending: true });

  // Build lookup maps
  const tasksByProject = new Map<string, typeof allTasks>();
  for (const task of allTasks || []) {
    const list = tasksByProject.get(task.project_id) || [];
    list.push(task);
    tasksByProject.set(task.project_id, list);
  }

  const emailCountByProject = new Map<string, number>();
  for (const email of allEmails || []) {
    if (email.project_id) {
      emailCountByProject.set(
        email.project_id,
        (emailCountByProject.get(email.project_id) || 0) + 1
      );
    }
  }

  // First future meeting per project
  const nextMeetingByProject = new Map<string, { title: string; meeting_date: string }>();
  for (const m of futureMeetings || []) {
    if (!nextMeetingByProject.has(m.project_id)) {
      nextMeetingByProject.set(m.project_id, {
        title: m.title,
        meeting_date: m.meeting_date,
      });
    }
  }

  // Enrich projects
  const enriched = projects.map((p) => {
    const tasks = tasksByProject.get(p.id) || [];
    const openTasks = tasks.filter(
      (t) => t.status !== "done" && t.status !== "cancelled"
    );
    const overdueTasks = openTasks.filter(
      (t) => t.due_date && t.due_date < today
    );

    return {
      ...p,
      openTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      emailCount: emailCountByProject.get(p.id) || 0,
      nextMeeting: nextMeetingByProject.get(p.id) || null,
    };
  });

  return NextResponse.json({ projects: enriched });
}
