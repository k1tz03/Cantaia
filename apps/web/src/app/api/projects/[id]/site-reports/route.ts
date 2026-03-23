import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).single();

    const { data: project } = await admin
      .from("projects")
      .select("id, organization_id")
      .eq("id", id)
      .single();

    if (!project || project.organization_id !== profile?.organization_id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = (page - 1) * limit;

    const { data: reports, count } = await (admin as any)
      .from("site_reports")
      .select("*", { count: "exact" })
      .eq("project_id", id)
      .order("report_date", { ascending: false })
      .range(offset, offset + limit - 1);

    // Get entry counts and total hours per report
    const reportIds = (reports || []).map((r: any) => r.id);
    let entriesMap: Record<string, { workers: number; totalHours: number }> = {};

    if (reportIds.length > 0) {
      const { data: entries } = await (admin as any)
        .from("site_report_entries")
        .select("report_id, entry_type, duration_hours, crew_member_id")
        .in("report_id", reportIds);

      if (entries) {
        for (const e of entries) {
          if (!entriesMap[e.report_id]) entriesMap[e.report_id] = { workers: 0, totalHours: 0 };
          if (e.entry_type === "labor") {
            entriesMap[e.report_id].totalHours += Number(e.duration_hours || 0);
          }
        }
        // Count unique workers per report
        const workerSets: Record<string, Set<string>> = {};
        for (const e of entries) {
          if (e.entry_type === "labor" && e.crew_member_id) {
            if (!workerSets[e.report_id]) workerSets[e.report_id] = new Set();
            workerSets[e.report_id].add(e.crew_member_id);
          }
        }
        for (const [rid, set] of Object.entries(workerSets)) {
          if (entriesMap[rid]) entriesMap[rid].workers = set.size;
        }
      }
    }

    const enriched = (reports || []).map((r: any) => ({
      ...r,
      workers_count: entriesMap[r.id]?.workers || 0,
      total_hours: entriesMap[r.id]?.totalHours || 0,
    }));

    return NextResponse.json({ reports: enriched, total: count || 0, page, limit });
  } catch (error) {
    console.error("[Site Reports] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
