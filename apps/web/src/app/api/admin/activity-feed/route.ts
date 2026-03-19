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
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    // tasks and meetings do NOT have organization_id — must query via project_id
    const { data: orgProjects } = await (admin as any)
      .from("projects")
      .select("id")
      .eq("organization_id", orgId);

    const projectIds = (orgProjects || []).map((p: { id: string }) => p.id);

    const [emailsRes, tasksRes, meetingsRes, submissionsRes] =
      await Promise.all([
        (admin as any)
          .from("email_records")
          .select("id, user_id, subject, received_at")
          .eq("organization_id", orgId)
          .gte("received_at", sevenDaysAgo)
          .order("received_at", { ascending: false })
          .limit(20),
        projectIds.length > 0
          ? (admin as any)
              .from("tasks")
              .select("id, created_by, title, status, created_at")
              .in("project_id", projectIds)
              .gte("created_at", sevenDaysAgo)
              .order("created_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [], error: null }),
        projectIds.length > 0
          ? (admin as any)
              .from("meetings")
              .select("id, title, meeting_date, status, created_at")
              .in("project_id", projectIds)
              .gte("created_at", sevenDaysAgo)
              .order("created_at", { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [], error: null }),
        projectIds.length > 0
          ? (admin as any)
              .from("submissions")
              .select("id, title, status, created_at")
              .in("project_id", projectIds)
              .gte("created_at", sevenDaysAgo)
              .order("created_at", { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [], error: null }),
      ]);

    const { data: members } = await (admin as any)
      .from("users")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId);

    const memberMap = new Map(
      (members || []).map(
        (m: { id: string; first_name: string; last_name: string }) => [
          m.id,
          `${m.first_name || ""} ${m.last_name || ""}`.trim(),
        ]
      )
    );

    const activities: Array<{
      type: string;
      title: string;
      user: string;
      date: string;
    }> = [];

    (emailsRes.data || []).forEach(
      (e: {
        user_id: string;
        subject: string | null;
        received_at: string;
      }) =>
        activities.push({
          type: "email",
          title: e.subject || "Email",
          user: (memberMap.get(e.user_id) as string) || "",
          date: e.received_at,
        })
    );

    (tasksRes.data || []).forEach(
      (t: { created_by: string; title: string; created_at: string }) =>
        activities.push({
          type: "task",
          title: t.title,
          user: (memberMap.get(t.created_by) as string) || "",
          date: t.created_at,
        })
    );

    (meetingsRes.data || []).forEach(
      (m: {
        title: string;
        meeting_date: string | null;
        created_at: string;
      }) =>
        activities.push({
          type: "meeting",
          title: m.title,
          user: "",
          date: m.meeting_date || m.created_at,
        })
    );

    (submissionsRes.data || []).forEach(
      (s: { title: string; created_at: string }) =>
        activities.push({
          type: "submission",
          title: s.title,
          user: "",
          date: s.created_at,
        })
    );

    activities.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return NextResponse.json({ activities: activities.slice(0, 50) });
  } catch (error) {
    console.error("[admin/activity-feed]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
