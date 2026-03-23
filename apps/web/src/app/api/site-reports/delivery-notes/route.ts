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
    const supplier = searchParams.get("supplier");
    const weekStart = searchParams.get("week_start");

    const { data: projects } = await admin
      .from("projects")
      .select("id, name, code")
      .eq("organization_id", profile.organization_id)
      .order("name");

    const projectIds = (projects || []).map((p: any) => p.id);
    if (projectIds.length === 0) return NextResponse.json({ notes: [], projects: [], suppliers: [] });

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
    if (!reports || reports.length === 0) return NextResponse.json({ notes: [], projects, suppliers: [] });

    const reportIds = reports.map((r: any) => r.id);
    const reportMap: Record<string, any> = {};
    for (const r of reports) reportMap[r.id] = r;

    let entryQuery = (admin as any)
      .from("site_report_entries")
      .select("*")
      .in("report_id", reportIds as string[])
      .eq("entry_type", "delivery_note");

    const { data: entries } = await entryQuery;

    let notes = (entries || []).map((e: any) => ({
      id: e.id,
      report_date: reportMap[e.report_id]?.report_date,
      project_id: reportMap[e.report_id]?.project_id,
      project_name: (projects || []).find((p: any) => p.id === reportMap[e.report_id]?.project_id)?.name || "",
      note_number: e.note_number,
      supplier_name: e.supplier_name,
      photo_url: e.photo_url,
      submitted_by: reportMap[e.report_id]?.submitted_by_name,
    }));

    if (supplier) {
      notes = notes.filter((n: any) => n.supplier_name?.toLowerCase().includes(supplier.toLowerCase()));
    }

    // Unique suppliers
    const suppliers = [...new Set(notes.map((n: any) => n.supplier_name).filter(Boolean))] as string[];

    // Summary by supplier
    const supplierSummary = suppliers.map(s => ({
      name: s,
      count: notes.filter((n: any) => n.supplier_name === s).length,
      projects: [...new Set(notes.filter((n: any) => n.supplier_name === s).map((n: any) => n.project_name))],
    }));

    return NextResponse.json({ notes, projects: projects || [], suppliers: supplierSummary });
  } catch (error) {
    console.error("[Site Reports Notes] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
