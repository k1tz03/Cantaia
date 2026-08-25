import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COUNTED_REPORT_STATUSES, normalizeSupplierName, roundChf } from "@cantaia/core/financials";
import { signPhotoPaths, displayPhotoUrl } from "@/lib/portal/photos";

export const dynamic = "force-dynamic";

/**
 * GET /api/site-reports/public/[token]
 * Site report data behind a public share link. NO AUTH — token only.
 *
 * Two changes worth knowing:
 *  - the link can now be scoped to a single project (`site_report_shares.project_id`,
 *    migration 100). An unscoped link keeps the legacy org-wide behaviour;
 *  - machine hours are returned (they were collected and silently dropped).
 *
 * Deliberately NOT returned here: hourly rates and CHF amounts. A share link is
 * an unauthenticated 90-day URL — individual wage data stays behind the login,
 * in /api/site-reports/hours and the payroll export.
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

    // `*`: `project_id` ships with migration 100 and must stay optional.
    const { data: share, error: shareError } = await (admin as any)
      .from("site_report_shares")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (shareError || !share) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    if (!share.is_active) {
      return NextResponse.json({ error: "This link has been revoked", reason: "revoked" }, { status: 410 });
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return NextResponse.json({ error: "This link has expired", reason: "expired" }, { status: 410 });
    }

    const orgId = share.organization_id;
    const scopedProjectId: string | null = share.project_id || null;

    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();

    const { searchParams } = request.nextUrl;
    const requestedProjectId = searchParams.get("project_id");
    const weekStart = searchParams.get("week_start");
    const crewMemberId = searchParams.get("crew_member_id");
    const supplier = searchParams.get("supplier");
    const supplierId = searchParams.get("supplier_id");

    // A scoped link ignores any project_id the caller passes.
    const projectId = scopedProjectId || requestedProjectId;

    let projectQuery = admin
      .from("projects")
      .select("id, name, code")
      .eq("organization_id", orgId)
      .order("name");
    if (scopedProjectId) projectQuery = projectQuery.eq("id", scopedProjectId);

    const { data: projects, error: projectsError } = await projectQuery;
    if (projectsError) {
      console.error("[site-reports/public] Projects error:", projectsError.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const empty = {
      org_name: org?.name || "",
      scoped_project_id: scopedProjectId,
      hours: [],
      machines: [],
      notes: [],
      projects: projects || [],
      crew: [],
      summary: [],
      machine_summary: [],
      suppliers: [],
    };

    const projectIds = (projects || []).map((p: any) => p.id);
    if (projectIds.length === 0) {
      return NextResponse.json({ ...empty, projects: [] });
    }

    let reportQuery = (admin as any)
      .from("site_reports")
      .select("id, project_id, report_date, submitted_by_name")
      .in("project_id", projectIds as string[])
      .in("status", COUNTED_REPORT_STATUSES as unknown as string[]);

    if (projectId) reportQuery = reportQuery.eq("project_id", projectId);
    if (weekStart) {
      reportQuery = reportQuery.gte("report_date", weekStart).lte("report_date", addDays(weekStart, 6));
    }

    const { data: reports, error: reportsError } = await reportQuery.order("report_date", { ascending: false });
    if (reportsError) {
      console.error("[site-reports/public] Reports error:", reportsError.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    if (!reports || reports.length === 0) {
      return NextResponse.json(empty);
    }

    const reportIds = reports.map((r: any) => r.id);
    const reportMap: Record<string, any> = {};
    for (const r of reports) reportMap[r.id] = r;

    const projectName = (id: string | null | undefined) =>
      (projects || []).find((p: any) => p.id === id)?.name || "";

    // --- HOURS + MACHINES ---
    const { data: workEntries, error: workError } = await (admin as any)
      .from("site_report_entries")
      .select("*, portal_crew_members(name, role)")
      .in("report_id", reportIds as string[])
      .in("entry_type", ["labor", "machine"]);

    if (workError) {
      console.error("[site-reports/public] Entries error:", workError.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const hours: any[] = [];
    const machines: any[] = [];

    for (const e of workEntries || []) {
      const report = reportMap[e.report_id];
      const common = {
        id: e.id,
        report_date: report?.report_date ?? null,
        project_id: report?.project_id ?? null,
        project_name: projectName(report?.project_id),
        cfc_code: e.cfc_code || null,
        duration_hours: Number(e.duration_hours) || 0,
        submitted_by: report?.submitted_by_name ?? null,
      };

      if (e.entry_type === "labor") {
        if (crewMemberId && e.crew_member_id !== crewMemberId) continue;
        hours.push({
          ...common,
          crew_member_name: e.portal_crew_members?.name || "—",
          crew_member_role: e.portal_crew_members?.role || "",
          crew_member_id: e.crew_member_id,
          work_description: e.work_description,
          is_driver: e.is_driver,
        });
      } else {
        machines.push({
          ...common,
          machine_description: e.machine_description || "—",
          is_rented: e.is_rented === true,
        });
      }
    }

    const crewIds = Array.from(new Set<string>(hours.map((h) => h.crew_member_id).filter(Boolean)));
    const crew = crewIds.map((id: string) => {
      const h = hours.find((x) => x.crew_member_id === id);
      return { id, name: h?.crew_member_name || "", role: h?.crew_member_role || "" };
    });

    const summaryMap: Record<string, { name: string; role: string; days: Record<string, number>; total: number }> = {};
    for (const h of hours) {
      const key = h.crew_member_id || h.crew_member_name;
      if (!summaryMap[key]) {
        summaryMap[key] = { name: h.crew_member_name, role: h.crew_member_role, days: {}, total: 0 };
      }
      const day = h.report_date;
      if (day) summaryMap[key].days[day] = roundChf((summaryMap[key].days[day] || 0) + h.duration_hours);
      summaryMap[key].total = roundChf(summaryMap[key].total + h.duration_hours);
    }

    const machineGroups: Record<string, { description: string; hours: number; is_rented: boolean }> = {};
    for (const m of machines) {
      const key = (m.machine_description || "—").trim().toLowerCase() || "—";
      if (!machineGroups[key]) {
        machineGroups[key] = { description: m.machine_description, hours: 0, is_rented: m.is_rented };
      }
      machineGroups[key].hours = roundChf(machineGroups[key].hours + m.duration_hours);
      machineGroups[key].is_rented = machineGroups[key].is_rented || m.is_rented;
    }

    // --- DELIVERY NOTES ---
    const { data: noteEntries, error: notesError } = await (admin as any)
      .from("site_report_entries")
      .select("*")
      .in("report_id", reportIds as string[])
      .eq("entry_type", "delivery_note");

    if (notesError) {
      console.error("[site-reports/public] Notes error:", notesError.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    const supplierIds = Array.from(
      new Set<string>((noteEntries || []).map((e: any) => e.supplier_id).filter(Boolean)),
    );
    const supplierNames: Record<string, string> = {};
    if (supplierIds.length > 0) {
      const { data: supplierRows, error: supplierError } = await (admin as any)
        .from("suppliers")
        .select("id, company_name")
        .eq("organization_id", orgId)
        .in("id", supplierIds);
      if (supplierError) console.warn("[site-reports/public] Suppliers lookup failed:", supplierError.message);
      for (const s of supplierRows || []) supplierNames[s.id] = s.company_name;
    }

    // Photos are stored as storage paths (private bucket). Re-sign them
    // short-lived so revoking or expiring THIS share link really cuts off photo
    // access — a long-lived URL stored verbatim would survive revocation.
    const notePhotoUrls = await signPhotoPaths(admin, (noteEntries || []).map((e: any) => e.photo_url));

    let notes = (noteEntries || []).map((e: any) => {
      const linkedName = e.supplier_id ? supplierNames[e.supplier_id] : undefined;
      return {
        id: e.id,
        report_date: reportMap[e.report_id]?.report_date,
        project_id: reportMap[e.report_id]?.project_id,
        project_name: projectName(reportMap[e.report_id]?.project_id),
        note_number: e.note_number,
        supplier_id: e.supplier_id || null,
        supplier_name: linkedName || e.supplier_name || "",
        supplier_linked: Boolean(linkedName),
        photo_url: displayPhotoUrl(e.photo_url, notePhotoUrls),
        submitted_by: reportMap[e.report_id]?.submitted_by_name,
      };
    });

    if (supplierId) {
      notes = notes.filter((n: any) => n.supplier_id === supplierId);
    } else if (supplier) {
      const needle = normalizeSupplierName(supplier);
      notes = notes.filter((n: any) => normalizeSupplierName(n.supplier_name).includes(needle));
    }

    const groups = new Map<string, { key: string; supplier_id: string | null; name: string; count: number; projects: Set<string> }>();
    for (const n of notes) {
      if (!n.supplier_name && !n.supplier_id) continue;
      const key = n.supplier_id ? `id:${n.supplier_id}` : `name:${normalizeSupplierName(n.supplier_name)}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, supplier_id: n.supplier_id, name: n.supplier_name || "—", count: 0, projects: new Set<string>() };
        groups.set(key, group);
      }
      group.count += 1;
      if (n.project_name) group.projects.add(n.project_name);
    }

    return NextResponse.json({
      org_name: org?.name || "",
      scoped_project_id: scopedProjectId,
      hours,
      machines,
      notes,
      projects: projects || [],
      crew,
      summary: Object.values(summaryMap),
      machine_summary: Object.values(machineGroups),
      suppliers: Array.from(groups.values())
        .map((g) => ({
          key: g.key,
          supplier_id: g.supplier_id,
          name: g.name,
          count: g.count,
          projects: Array.from(g.projects),
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    });
  } catch (err: any) {
    console.error("[site-reports/public] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Calendar-safe date arithmetic (see hours route). */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split("T")[0];
}
