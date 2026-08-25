import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";
import {
  buildPayrollRows,
  loadRateContext,
  toValuedLaborLine,
  COUNTED_REPORT_STATUSES,
  roundChf,
} from "@cantaia/core/financials";

export const maxDuration = 60;

/**
 * POST /api/site-reports/export-payroll
 * Body: { date_from?: "YYYY-MM-DD", date_to?: "YYYY-MM-DD", week_start?, project_id?, crew_member_id? }
 *
 * Payroll-ready CSV: ONE ROW PER WORKER × DAY × PROJECT, with hours, hourly
 * rate, amount and the CFC codes worked. This is the export the back-office
 * actually needs and that the product never had — the existing hours export is
 * a per-entry listing with no money in it, so wages were retyped by hand.
 *
 * Semicolon-separated + UTF-8 BOM: that is what Excel in a fr-CH/de-CH locale
 * opens without a mangled import dialog. Restricted to org admins/directors:
 * the file contains individual pay data.
 */
export async function POST(request: NextRequest) {
  try {
    const check = await requireOrgAdmin();
    if (!check.authorized) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
    const orgId = check.profile.organization_id;
    const admin = createAdminClient();

    const body = await request.json().catch(() => ({}));
    const { project_id, crew_member_id, week_start } = body || {};

    // Period: explicit range wins, otherwise the week, otherwise everything.
    let dateFrom: string | null = isDate(body?.date_from) ? body.date_from : null;
    let dateTo: string | null = isDate(body?.date_to) ? body.date_to : null;
    if (!dateFrom && isDate(week_start)) {
      dateFrom = week_start;
      dateTo = addDays(week_start, 6);
    }
    if (dateFrom && dateTo && dateTo < dateFrom) {
      return NextResponse.json({ error: "date_to must be after date_from" }, { status: 400 });
    }

    const { data: projects, error: projectsError } = await admin
      .from("projects")
      .select("id, name, code")
      .eq("organization_id", orgId);

    if (projectsError) {
      console.error("[Export Payroll] Projects error:", projectsError.message);
      return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
    }

    const projectIds = (projects || []).map((p: any) => p.id);
    if (projectIds.length === 0) {
      return NextResponse.json({ error: "No data to export" }, { status: 400 });
    }
    if (project_id && !projectIds.includes(project_id)) {
      // Anti-IDOR: never export another org's project, even by accident.
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    let reportQuery = (admin as any)
      .from("site_reports")
      .select("id, project_id, report_date, submitted_by_name")
      .in("project_id", (project_id ? [project_id] : projectIds) as string[])
      .in("status", COUNTED_REPORT_STATUSES as unknown as string[]);

    if (dateFrom) reportQuery = reportQuery.gte("report_date", dateFrom);
    if (dateTo) reportQuery = reportQuery.lte("report_date", dateTo);

    const { data: reports, error: reportsError } = await reportQuery.order("report_date");
    if (reportsError) {
      console.error("[Export Payroll] Reports error:", reportsError.message);
      return NextResponse.json({ error: "Failed to fetch site reports" }, { status: 500 });
    }
    if (!reports || reports.length === 0) {
      return NextResponse.json({ error: "No data to export" }, { status: 400 });
    }

    const reportMap: Record<string, any> = {};
    for (const r of reports) reportMap[r.id] = r;
    const reportIds = reports.map((r: any) => r.id);

    const { data: entries, error: entriesError } = await (admin as any)
      .from("site_report_entries")
      .select("*, portal_crew_members(name, role)")
      .in("report_id", reportIds as string[])
      .eq("entry_type", "labor");

    if (entriesError) {
      console.error("[Export Payroll] Entries error:", entriesError.message);
      return NextResponse.json({ error: "Failed to fetch entries" }, { status: 500 });
    }

    const rates = await loadRateContext(admin as any, orgId, projectIds);
    const projectName = (id: string | null | undefined) =>
      (projects || []).find((p: any) => p.id === id)?.name || "";

    const lines = (entries || [])
      .filter((e: any) => !crew_member_id || e.crew_member_id === crew_member_id)
      .map((e: any) => {
        const report = reportMap[e.report_id];
        return toValuedLaborLine(e, rates, {
          reportDate: report?.report_date ?? null,
          projectId: report?.project_id ?? null,
          projectName: projectName(report?.project_id),
          crewName: e.portal_crew_members?.name || "—",
          crewRole: e.portal_crew_members?.role || "",
        });
      });

    if (lines.length === 0) {
      return NextResponse.json({ error: "No data to export" }, { status: 400 });
    }

    const rows = buildPayrollRows(lines);
    const totalHours = roundChf(rows.reduce((s, r) => s + r.hours, 0));
    const totalAmount = roundChf(rows.reduce((s, r) => s + r.amount_chf, 0));

    const header = [
      "Date", "Ouvrier", "Fonction", "Projet", "Code projet", "CFC", "Heures", "Taux CHF/h", "Montant CHF",
    ];

    const projectCode = (id: string) =>
      (projects || []).find((p: any) => p.id === id)?.code || "";

    const csvLines = [
      header.map(csvCell).join(";"),
      ...rows.map((r) =>
        [
          r.report_date,
          r.crew_member_name,
          r.crew_member_role,
          r.project_name,
          projectCode(r.project_id),
          r.cfc_codes.join(" "),
          decimal(r.hours),
          decimal(r.rate_chf),
          decimal(r.amount_chf),
        ]
          .map(csvCell)
          .join(";"),
      ),
      ["TOTAL", "", "", "", "", "", decimal(totalHours), "", decimal(totalAmount)].map(csvCell).join(";"),
    ];

    // BOM so Excel detects UTF-8 (without it "Sablière" arrives as "SabliÃ¨re").
    const csv = `﻿${csvLines.join("\r\n")}\r\n`;
    const periodTag = dateFrom ? `${dateFrom}_${dateTo || dateFrom}` : "all";

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="paie_${periodTag}.csv"`,
      },
    });
  } catch (error) {
    console.error("[Export Payroll] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Comma decimal separator — the Swiss/European payroll convention. */
function decimal(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/**
 * CSV cell: quote when needed and neutralise formula injection
 * (`=`, `+`, `-`, `@` open a live formula when the file lands in Excel).
 */
function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Calendar-safe date arithmetic (see hours route). */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split("T")[0];
}
