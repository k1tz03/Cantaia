import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  // Auth check
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get user's organization
  const { data: profile } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // IDOR check: verify project belongs to user's org
  const { data: project } = await admin
    .from("projects")
    .select("id, organization_id")
    .eq("id", projectId)
    .single();

  if (!project || project.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parallel COUNT queries
  const [
    tasksRes,
    plansRes,
    submissionsRes,
    meetingsRes,
    visitsRes,
    emailsRes,
    budgetRes,
  ] = await Promise.all([
    admin
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .in("status", ["todo", "in_progress", "waiting"]),
    admin
      .from("plan_registry")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    admin
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    admin
      .from("meetings")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    admin
      .from("client_visits" as any)
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    admin
      .from("email_records")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    admin
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .not("budget_estimate", "is", null),
  ]);

  return NextResponse.json({
    task_count: tasksRes.count ?? 0,
    plan_count: plansRes.count ?? 0,
    submission_count: submissionsRes.count ?? 0,
    meeting_count: meetingsRes.count ?? 0,
    visit_count: visitsRes.count ?? 0,
    email_count: emailsRes.count ?? 0,
    has_budget_estimate: (budgetRes.count ?? 0) > 0,
  });
}
