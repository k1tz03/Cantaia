import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).single();
    if (!profile?.organization_id) return NextResponse.json({ error: "No org" }, { status: 400 });

    const { searchParams } = request.nextUrl;
    const projectId = searchParams.get("project_id");
    const weekStart = searchParams.get("week_start"); // YYYY-MM-DD (Monday)
    const crewMemberId = searchParams.get("crew_member_id");

    // Get org projects
    const { data: projects } = await admin
      .from("projects")
      .select("id, name, code")
      .eq("organization_id", profile.organization_id)
      .order("name");

    const projectIds = (projects || []).map((p: any) => p.id);
    if (projectIds.length === 0) return NextResponse.json({ hours: [], projects: [], crew: [], summary: [] });

    // Build report query
    let reportQuery = (admin as any)
      .from("site_reports")
      .select("id, project_id, report_date, submitted_by_name")
      .in("project_id", projectIds as string[])
      .in("status", ["submitted", "locked"]);

    if (projectId) reportQuery = reportQuery.eq("project_id", projectId);
    if (weekStart) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      reportQuery = reportQuery.gte("report_date", weekStart).lte("report_date", weekEnd.toISOString().split("T")[0]);
    }

    const { data: reports } = await reportQuery.order("report_date", { ascending: false });
    if (!reports || reports.length === 0) return NextResponse.json({ hours: [], projects, crew: [], summary: [] });

    const reportIds = reports.map((r: any) => r.id);

    // Get labor entries
    let entryQuery = (admin as any)
      .from("site_report_entries")
      .select("*, portal_crew_members(name, role)")
      .in("report_id", reportIds as string[])
      .eq("entry_type", "labor");

    if (crewMemberId) entryQuery = entryQuery.eq("crew_member_id", crewMemberId);

    const { data: entries } = await entryQuery;

    // Build report lookup
    const reportMap: Record<string, any> = {};
    for (const r of reports) reportMap[r.id] = r;

    // Enrich entries with report info
    const hours = (entries || []).map((e: any) => ({
      id: e.id,
      report_date: reportMap[e.report_id]?.report_date,
      project_id: reportMap[e.report_id]?.project_id,
      project_name: (projects || []).find((p: any) => p.id === reportMap[e.report_id]?.project_id)?.name || "",
      crew_member_name: e.portal_crew_members?.name || "—",
      crew_member_role: e.portal_crew_members?.role || "",
      crew_member_id: e.crew_member_id,
      work_description: e.work_description,
      duration_hours: Number(e.duration_hours) || 0,
      is_driver: e.is_driver,
      submitted_by: reportMap[e.report_id]?.submitted_by_name,
    }));

    // Get unique crew members
    const crewIds = [...new Set(hours.map((h: any) => h.crew_member_id).filter(Boolean))] as string[];
    const crew = crewIds.map(id => {
      const h = hours.find((x: any) => x.crew_member_id === id);
      return { id, name: h?.crew_member_name || "", role: h?.crew_member_role || "" };
    });

    // Weekly summary per crew member
    const summary: Record<string, { name: string; role: string; days: Record<string, number>; total: number }> = {};
    for (const h of hours) {
      const key = h.crew_member_id || h.crew_member_name;
      if (!summary[key]) {
        summary[key] = { name: h.crew_member_name, role: h.crew_member_role, days: {}, total: 0 };
      }
      const day = h.report_date;
      summary[key].days[day] = (summary[key].days[day] || 0) + h.duration_hours;
      summary[key].total += h.duration_hours;
    }

    return NextResponse.json({
      hours,
      projects: projects || [],
      crew,
      summary: Object.values(summary),
    });
  } catch (error) {
    console.error("[Site Reports Hours] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
