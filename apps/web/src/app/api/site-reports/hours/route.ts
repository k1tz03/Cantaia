import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadRateContext,
  toValuedLaborLine,
  toValuedMachineLine,
  COUNTED_REPORT_STATUSES,
  roundChf,
} from "@cantaia/core/financials";

/**
 * GET /api/site-reports/hours
 * Weekly hours for the back-office, VALUED in CHF.
 *
 * Two long-standing gaps closed here:
 *  - machine entries were saved by the portal and then dropped by every
 *    consumer (`.eq("entry_type", "labor")`), so rented-machine hours existed
 *    in the database and nowhere else;
 *  - hours were never multiplied by a rate, which is what made the Direction
 *    margin structurally wrong.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id, role, is_superadmin")
      .eq("id", user.id)
      .single();
    if (!profile?.organization_id) return NextResponse.json({ error: "No org" }, { status: 400 });

    // Individual pay data (rates, amounts) is management-only — same policy as
    // the payroll export (requireOrgAdmin) and /api/direction/stats. Foremen and
    // site managers see HOURS; only these roles see CHF.
    const FINANCIAL_ROLES = ["admin", "director", "project_manager"];
    const canViewFinancials =
      (profile as any).is_superadmin === true || FINANCIAL_ROLES.includes((profile as any).role);

    const { searchParams } = request.nextUrl;
    const projectId = searchParams.get("project_id");
    const weekStart = searchParams.get("week_start"); // YYYY-MM-DD (Monday)
    const crewMemberId = searchParams.get("crew_member_id");

    // Get org projects
    const { data: projects, error: projectsError } = await admin
      .from("projects")
      .select("id, name, code")
      .eq("organization_id", profile.organization_id)
      .order("name");

    if (projectsError) {
      console.error("[Site Reports Hours] Projects error:", projectsError.message);
      return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
    }

    const projectIds = (projects || []).map((p: any) => p.id);
    const emptyTotals = {
      labor_hours: 0,
      labor_cost: 0,
      machine_hours: 0,
      machine_cost: 0,
      machine_valued: false,
      hourly_rate: null as number | null,
      machine_rate: null as number | null,
    };

    if (projectIds.length === 0) {
      return NextResponse.json({
        hours: [], machines: [], projects: [], crew: [], summary: [], machine_summary: [],
        reports: [], totals: emptyTotals,
      });
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
      console.error("[Site Reports Hours] Reports error:", reportsError.message);
      return NextResponse.json({ error: "Failed to fetch site reports" }, { status: 500 });
    }
    if (!reports || reports.length === 0) {
      return NextResponse.json({
        hours: [], machines: [], projects, crew: [], summary: [], machine_summary: [],
        reports: [], totals: emptyTotals,
      });
    }

    const reportIds = reports.map((r: any) => r.id);
    const reportMap: Record<string, any> = {};
    for (const r of reports) reportMap[r.id] = r;

    const projectName = (id: string | null | undefined) =>
      (projects || []).find((p: any) => p.id === id)?.name || "";

    // Labour + machines in one pass (`*` keeps migration-093 columns optional).
    const { data: entries, error: entriesError } = await (admin as any)
      .from("site_report_entries")
      .select("*, portal_crew_members(name, role)")
      .in("report_id", reportIds as string[])
      .in("entry_type", ["labor", "machine"]);

    if (entriesError) {
      console.error("[Site Reports Hours] Entries error:", entriesError.message);
      return NextResponse.json({ error: "Failed to fetch entries" }, { status: 500 });
    }

    const rates = await loadRateContext(admin as any, profile.organization_id, projectIds);

    const hours: any[] = [];
    const machines: any[] = [];
    // Built from ALL labour entries, before the crew filter — otherwise picking
    // a worker collapses the dropdown to that single worker and there is no way
    // back to "all".
    const crewMap = new Map<string, { id: string; name: string; role: string }>();

    for (const e of entries || []) {
      const report = reportMap[e.report_id];
      const ctx = {
        reportDate: report?.report_date ?? null,
        projectId: report?.project_id ?? null,
        projectName: projectName(report?.project_id),
        crewName: e.portal_crew_members?.name || "—",
        crewRole: e.portal_crew_members?.role || "",
      };

      if (e.entry_type === "labor") {
        if (e.crew_member_id && !crewMap.has(e.crew_member_id)) {
          crewMap.set(e.crew_member_id, {
            id: e.crew_member_id,
            name: ctx.crewName,
            role: ctx.crewRole,
          });
        }
        if (crewMemberId && e.crew_member_id !== crewMemberId) continue;
        const line = toValuedLaborLine(e, rates, ctx);
        hours.push({
          id: e.id,
          report_date: line.report_date,
          project_id: line.project_id,
          project_name: line.project_name,
          crew_member_name: line.crew_member_name,
          crew_member_role: line.crew_member_role,
          crew_member_id: line.crew_member_id,
          work_description: line.work_description,
          cfc_code: line.cfc_code,
          duration_hours: line.hours,
          is_driver: line.is_driver,
          rate_chf: line.rate_chf,
          amount_chf: line.amount_chf,
          submitted_by: report?.submitted_by_name ?? null,
        });
      } else {
        const line = toValuedMachineLine(e, rates, ctx);
        machines.push({
          id: e.id,
          report_date: line.report_date,
          project_id: line.project_id,
          project_name: line.project_name,
          machine_description: line.machine_description,
          is_rented: line.is_rented,
          cfc_code: line.cfc_code,
          duration_hours: line.hours,
          rate_chf: line.rate_chf,
          amount_chf: line.amount_chf,
          submitted_by: report?.submitted_by_name ?? null,
        });
      }
    }

    const crew = Array.from(crewMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    // Weekly summary per crew member (hours per day + valued total)
    const summary: Record<
      string,
      { name: string; role: string; days: Record<string, number>; total: number; amount: number }
    > = {};
    for (const h of hours) {
      const key = h.crew_member_id || h.crew_member_name;
      if (!summary[key]) {
        summary[key] = { name: h.crew_member_name, role: h.crew_member_role, days: {}, total: 0, amount: 0 };
      }
      const day = h.report_date;
      if (day) summary[key].days[day] = roundChf((summary[key].days[day] || 0) + h.duration_hours);
      summary[key].total = roundChf(summary[key].total + h.duration_hours);
      summary[key].amount = roundChf(summary[key].amount + h.amount_chf);
    }

    // Machine summary, grouped by description
    const machineGroups: Record<
      string,
      { description: string; hours: number; amount: number | null; is_rented: boolean }
    > = {};
    for (const m of machines) {
      const key = (m.machine_description || "—").trim().toLowerCase() || "—";
      if (!machineGroups[key]) {
        machineGroups[key] = {
          description: m.machine_description || "—",
          hours: 0,
          amount: m.amount_chf === null ? null : 0,
          is_rented: m.is_rented === true,
        };
      }
      const group = machineGroups[key];
      group.hours = roundChf(group.hours + m.duration_hours);
      group.amount = m.amount_chf === null || group.amount === null ? null : roundChf(group.amount + m.amount_chf);
      group.is_rented = group.is_rented || m.is_rented === true;
    }

    const laborCost = roundChf(hours.reduce((sum, h) => sum + h.amount_chf, 0));
    const laborHours = roundChf(hours.reduce((sum, h) => sum + h.duration_hours, 0));
    const machineHours = roundChf(machines.reduce((sum, m) => sum + m.duration_hours, 0));
    const machineCost = roundChf(machines.reduce((sum, m) => sum + (m.amount_chf || 0), 0));
    const machineValued = machines.some((m) => m.amount_chf !== null);

    const summaryList = Object.values(summary);
    const machineSummaryList = Object.values(machineGroups);

    // Defence in depth: strip every CHF field for non-privileged roles (hours
    // stay, money goes). The UI hides them too, but the API must not depend on it.
    if (!canViewFinancials) {
      for (const h of hours) {
        h.rate_chf = null;
        h.amount_chf = null;
      }
      for (const m of machines) {
        m.rate_chf = null;
        m.amount_chf = null;
      }
      for (const s of summaryList) s.amount = null as unknown as number;
      for (const g of machineSummaryList) g.amount = null;
    }

    return NextResponse.json({
      can_view_financials: canViewFinancials,
      hours,
      machines,
      projects: projects || [],
      crew,
      summary: summaryList,
      machine_summary: machineSummaryList,
      // Reports of the period — lets the UI offer a régie sheet per report
      // (POST /api/site-reports/regie) without a second round-trip.
      reports: (reports || []).map((r: any) => ({
        id: r.id,
        report_date: r.report_date,
        project_id: r.project_id,
        project_name: projectName(r.project_id),
        submitted_by: r.submitted_by_name,
      })),
      totals: {
        labor_hours: laborHours,
        labor_cost: canViewFinancials ? laborCost : null,
        machine_hours: machineHours,
        machine_cost: canViewFinancials ? machineCost : null,
        machine_valued: machineValued,
        hourly_rate: canViewFinancials ? rates.defaultRate ?? null : null,
        machine_rate: canViewFinancials ? rates.machineRate ?? null : null,
      },
    });
  } catch (error) {
    console.error("[Site Reports Hours] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Add days to a "YYYY-MM-DD" calendar date without leaving the calendar.
 * `new Date(str)` + `toISOString()` shifts the day for any timezone east of
 * UTC — the week filter used to drop Sunday in Europe/Zurich.
 */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split("T")[0];
}
