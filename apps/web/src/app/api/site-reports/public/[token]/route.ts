import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/site-reports/public/[token]
 * Fetch site report data for a public shared link.
 * NO AUTH REQUIRED — this is a public endpoint.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    if (!token || token.length < 10) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch share record
    const { data: share, error: shareError } = await (admin as any)
      .from("site_report_shares")
      .select("id, organization_id, is_active, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (shareError || !share) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    // Check if active
    if (!share.is_active) {
      return NextResponse.json({ error: "This link has been revoked" }, { status: 410 });
    }

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 });
    }

    const orgId = share.organization_id;

    // Get organization name
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();

    // Read query params
    const { searchParams } = request.nextUrl;
    const projectId = searchParams.get("project_id");
    const weekStart = searchParams.get("week_start");
    const crewMemberId = searchParams.get("crew_member_id");
    const supplier = searchParams.get("supplier");

    // Get org projects
    const { data: projects } = await admin
      .from("projects")
      .select("id, name, code")
      .eq("organization_id", orgId)
      .order("name");

    const projectIds = (projects || []).map((p: any) => p.id);
    if (projectIds.length === 0) {
      return NextResponse.json({
        org_name: org?.name || "",
        hours: [],
        notes: [],
        projects: [],
        crew: [],
        summary: [],
        suppliers: [],
      });
    }

    // Build report query (shared logic for both hours and notes)
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
    if (!reports || reports.length === 0) {
      return NextResponse.json({
        org_name: org?.name || "",
        hours: [],
        notes: [],
        projects: projects || [],
        crew: [],
        summary: [],
        suppliers: [],
      });
    }

    const reportIds = reports.map((r: any) => r.id);
    const reportMap: Record<string, any> = {};
    for (const r of reports) reportMap[r.id] = r;

    // --- HOURS (labor entries) ---
    let laborQuery = (admin as any)
      .from("site_report_entries")
      .select("*, portal_crew_members(name, role)")
      .in("report_id", reportIds as string[])
      .eq("entry_type", "labor");

    if (crewMemberId) laborQuery = laborQuery.eq("crew_member_id", crewMemberId);

    const { data: laborEntries } = await laborQuery;

    const hours = (laborEntries || []).map((e: any) => ({
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

    // Unique crew members
    const crewIds = Array.from(new Set<string>(hours.map((h: any) => h.crew_member_id).filter(Boolean)));
    const crew = crewIds.map((id: string) => {
      const h = hours.find((x: any) => x.crew_member_id === id);
      return { id, name: h?.crew_member_name || "", role: h?.crew_member_role || "" };
    });

    // Weekly summary per crew member
    const summaryMap: Record<string, { name: string; role: string; days: Record<string, number>; total: number }> = {};
    for (const h of hours) {
      const key = h.crew_member_id || h.crew_member_name;
      if (!summaryMap[key]) {
        summaryMap[key] = { name: h.crew_member_name, role: h.crew_member_role, days: {}, total: 0 };
      }
      const day = h.report_date;
      summaryMap[key].days[day] = (summaryMap[key].days[day] || 0) + h.duration_hours;
      summaryMap[key].total += h.duration_hours;
    }

    // --- DELIVERY NOTES ---
    const { data: noteEntries } = await (admin as any)
      .from("site_report_entries")
      .select("*")
      .in("report_id", reportIds as string[])
      .eq("entry_type", "delivery_note");

    let notes = (noteEntries || []).map((e: any) => ({
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
    const supplierNames = Array.from(new Set<string>(notes.map((n: any) => n.supplier_name).filter(Boolean)));
    const supplierSummary = supplierNames.map((s: string) => ({
      name: s,
      count: notes.filter((n: any) => n.supplier_name === s).length,
      projects: Array.from(new Set<string>(notes.filter((n: any) => n.supplier_name === s).map((n: any) => n.project_name))),
    }));

    return NextResponse.json({
      org_name: org?.name || "",
      hours,
      notes,
      projects: projects || [],
      crew,
      summary: Object.values(summaryMap),
      suppliers: supplierSummary,
    });
  } catch (err: any) {
    console.error("[site-reports/public] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
