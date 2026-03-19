import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const orgId = profile.organization_id;

    const { data: members } = await (admin as any)
      .from("users")
      .select("id, first_name, last_name, email, role, avatar_url")
      .eq("organization_id", orgId);

    if (!members) {
      return NextResponse.json({ members: [] });
    }

    // tasks and meetings do NOT have organization_id — must query via project_id
    const { data: orgProjects } = await (admin as any)
      .from("projects")
      .select("id")
      .eq("organization_id", orgId);

    const projectIds = (orgProjects || []).map((p: { id: string }) => p.id);

    const now = new Date().toISOString();

    const [overdueRes, inProgressRes, unprocessedRes] = await Promise.all([
      projectIds.length > 0
        ? (admin as any)
            .from("tasks")
            .select("assigned_to, id")
            .in("project_id", projectIds)
            .not("status", "in", '("done","cancelled")')
            .lt("due_date", now)
        : Promise.resolve({ data: [] }),
      projectIds.length > 0
        ? (admin as any)
            .from("tasks")
            .select("assigned_to, id")
            .in("project_id", projectIds)
            .eq("status", "in_progress")
        : Promise.resolve({ data: [] }),
      (admin as any)
        .from("email_records")
        .select("user_id, id")
        .eq("organization_id", orgId)
        .eq("is_processed", false),
    ]);

    const overdueTasks = overdueRes.data || [];
    const inProgressTasks = inProgressRes.data || [];
    const unprocessedEmails = unprocessedRes.data || [];

    // Get last sign-in info from auth
    let authUsersMap = new Map<string, string | null>();
    try {
      const {
        data: { users: authUsers },
      } = await admin.auth.admin.listUsers();
      if (authUsers) {
        for (const au of authUsers) {
          authUsersMap.set(au.id, au.last_sign_in_at || null);
        }
      }
    } catch {
      // Graceful degradation if auth admin API fails
    }

    const memberHealth = members.map(
      (member: {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
        role: string;
        avatar_url: string | null;
      }) => {
        const overdue =
          overdueTasks.filter(
            (t: { assigned_to: string }) => t.assigned_to === member.id
          ).length || 0;
        const inProgress =
          inProgressTasks.filter(
            (t: { assigned_to: string }) => t.assigned_to === member.id
          ).length || 0;
        const unread =
          unprocessedEmails.filter(
            (e: { user_id: string }) => e.user_id === member.id
          ).length || 0;
        const lastSignIn = authUsersMap.get(member.id) || null;

        return {
          ...member,
          overdue_tasks: overdue,
          in_progress_tasks: inProgress,
          unprocessed_emails: unread,
          last_sign_in: lastSignIn,
        };
      }
    );

    return NextResponse.json({ members: memberHealth });
  } catch (error) {
    console.error("[admin/team-health]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
