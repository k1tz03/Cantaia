import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";
import { isTaskOverdue } from "@cantaia/core/projects/counters";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    // Org-wide analytics — restricted to org admins (admin/director) or superadmins
    const check = await requireOrgAdmin();
    if (!check.authorized) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    const admin = createAdminClient();
    const orgId = check.profile.organization_id;

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

    // Overdue is computed in JS with the shared date-only predicate
    // (@cantaia/core/projects/counters): the previous `.lt("due_date", now)`
    // compared a DATE column against a full ISO timestamp, so every task due
    // TODAY was reported as late from midnight onwards.
    const [overdueRes, inProgressRes, unprocessedRes] = await Promise.all([
      projectIds.length > 0
        ? (admin as any)
            .from("tasks")
            .select("assigned_to, id, status, due_date")
            .in("project_id", projectIds)
            .not("status", "in", '("done","cancelled")')
            .not("due_date", "is", null)
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

    const overdueTasks = (overdueRes.data || []).filter((t: { status: string; due_date: string | null }) =>
      isTaskOverdue(t)
    );
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
