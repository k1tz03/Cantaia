import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadRateContext,
  resolveOrgBranding,
  toValuedLaborLine,
  toValuedMachineLine,
  COUNTED_REPORT_STATUSES,
  roundChf,
} from "@cantaia/core/financials";
import { drawFooter, drawLetterhead, fetchLogoDataUrl, formatChf, wrapText } from "@/lib/site-reports-pdf";

export const maxDuration = 60;

/**
 * POST /api/site-reports/export-hours
 * Body: { format: "xlsx"|"pdf", project_id?, week_start? }
 *
 * Exports labour AND machine hours, valued in CHF, on org letterhead.
 * Machines were collected by the portal and dropped by this export
 * (`.eq("entry_type", "labor")`); project names were cut at 25 characters.
 */
export async function POST(request: NextRequest) {
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

    // Same policy as /api/site-reports/hours and the payroll export: hours are
    // exportable by everyone, CHF (rates/amounts) by management only.
    const FINANCIAL_ROLES = ["admin", "director", "project_manager"];
    const canViewFinancials =
      (profile as any).is_superadmin === true || FINANCIAL_ROLES.includes((profile as any).role);
    /** Blank a CHF value in the xlsx export for non-privileged roles. */
    const money = (value: number | null): number | string =>
      canViewFinancials ? (value ?? "") : "";
    /** Dash a CHF value in the pdf export for non-privileged roles. */
    const pchf = (value: number | null): string => (canViewFinancials ? formatChf(value) : "—");

    const body = await request.json().catch(() => ({}));
    const { format, project_id, week_start, crew_member_id } = body; // format: "xlsx" or "pdf"

    const { data: projects, error: projectsError } = await admin
      .from("projects")
      .select("id, name, code")
      .eq("organization_id", profile.organization_id);

    if (projectsError) {
      console.error("[Export Hours] Projects error:", projectsError.message);
      return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
    }

    const projectIds = (projects || []).map((p: any) => p.id);
    if (projectIds.length === 0) {
      return NextResponse.json({ error: "No data to export" }, { status: 400 });
    }

    let reportQuery = (admin as any)
      .from("site_reports")
      .select("id, project_id, report_date, submitted_by_name")
      .in("project_id", projectIds as string[])
      .in("status", COUNTED_REPORT_STATUSES as unknown as string[]);

    if (project_id) reportQuery = reportQuery.eq("project_id", project_id);
    if (week_start) {
      reportQuery = reportQuery.gte("report_date", week_start).lte("report_date", addDays(week_start, 6));
    }

    const { data: reports, error: reportsError } = await reportQuery.order("report_date");
    if (reportsError) {
      console.error("[Export Hours] Reports error:", reportsError.message);
      return NextResponse.json({ error: "Failed to fetch site reports" }, { status: 500 });
    }
    if (!reports || reports.length === 0) {
      return NextResponse.json({ error: "No data to export" }, { status: 400 });
    }

    const reportIds = reports.map((r: any) => r.id);
    const reportMap: Record<string, any> = {};
    for (const r of reports) reportMap[r.id] = r;

    const { data: entries, error: entriesError } = await (admin as any)
      .from("site_report_entries")
      .select("*, portal_crew_members(name, role)")
      .in("report_id", reportIds as string[])
      .in("entry_type", ["labor", "machine"]);

    if (entriesError) {
      console.error("[Export Hours] Entries error:", entriesError.message);
      return NextResponse.json({ error: "Failed to fetch entries" }, { status: 500 });
    }

    const rates = await loadRateContext(admin as any, profile.organization_id, projectIds);
    const projectName = (id: string | null | undefined) =>
      (projects || []).find((p: any) => p.id === id)?.name || "";

    const laborLines = [];
    const machineLines = [];
    for (const e of entries || []) {
      // Honour the on-screen crew filter: labour is filtered to that worker, and
      // machines (which are not attributable to a worker) are dropped so the
      // file matches the filtered view instead of exporting the whole team.
      if (crew_member_id) {
        if (e.entry_type !== "labor" || e.crew_member_id !== crew_member_id) continue;
      }
      const report = reportMap[e.report_id];
      const ctx = {
        reportDate: report?.report_date ?? null,
        projectId: report?.project_id ?? null,
        projectName: projectName(report?.project_id),
        crewName: e.portal_crew_members?.name || "—",
        crewRole: e.portal_crew_members?.role || "",
      };
      if (e.entry_type === "labor") laborLines.push(toValuedLaborLine(e, rates, ctx));
      else machineLines.push(toValuedMachineLine(e, rates, ctx));
    }

    const totalLaborHours = roundChf(laborLines.reduce((s, l) => s + l.hours, 0));
    const totalLaborCost = roundChf(laborLines.reduce((s, l) => s + l.amount_chf, 0));
    const totalMachineHours = roundChf(machineLines.reduce((s, l) => s + l.hours, 0));
    const totalMachineCost = roundChf(machineLines.reduce((s, l) => s + (l.amount_chf || 0), 0));

    const branding = await resolveOrgBranding(admin as any, profile.organization_id);
    const periodLabel = week_start ? `Semaine du ${week_start}` : "Toutes périodes";

    if (format === "xlsx") {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      const laborRows = laborLines.map((l) => ({
        Date: l.report_date || "",
        Projet: l.project_name,
        Ouvrier: l.crew_member_name,
        Fonction: l.crew_member_role,
        CFC: l.cfc_code || "",
        Travail: l.work_description,
        Heures: l.hours,
        "Taux CHF/h": money(l.rate_chf),
        "Montant CHF": money(l.amount_chf),
        Conducteur: l.is_driver ? "Oui" : "",
        "Soumis par": reportMap[l.report_id || ""]?.submitted_by_name || "",
      }));
      laborRows.push({
        Date: "", Projet: "", Ouvrier: "TOTAL", Fonction: "", CFC: "", Travail: "",
        Heures: totalLaborHours, "Taux CHF/h": "" as any, "Montant CHF": money(totalLaborCost),
        Conducteur: "", "Soumis par": "",
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(laborRows), "Heures");

      const machineRows = machineLines.map((l) => ({
        Date: l.report_date || "",
        Projet: l.project_name,
        Machine: l.machine_description,
        Location: l.is_rented ? "Oui" : "",
        CFC: l.cfc_code || "",
        Heures: l.hours,
        "Taux CHF/h": money(l.rate_chf),
        "Montant CHF": money(l.amount_chf),
        "Soumis par": reportMap[l.report_id || ""]?.submitted_by_name || "",
      }));
      machineRows.push({
        Date: "", Projet: "", Machine: "TOTAL", Location: "", CFC: "",
        Heures: totalMachineHours, "Taux CHF/h": "" as any, "Montant CHF": money(totalMachineCost),
        "Soumis par": "",
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(machineRows), "Machines");

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="heures_${week_start || "all"}.xlsx"`,
        },
      });
    }

    if (format === "pdf") {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "landscape" });
      const logo = await fetchLogoDataUrl(branding.logoUrl);

      let y = drawLetterhead(doc, {
        branding,
        logo,
        title: "Récapitulatif des heures",
        subtitle: periodLabel,
        meta: [
          project_id ? projectName(project_id) : "Tous les projets",
          ...(canViewFinancials
            ? [`Taux de base : ${formatChf(rates.defaultRate ?? null)} CHF/h`]
            : []),
        ],
      });

      // ── Labour ────────────────────────────────────────────────────────────
      const cols = { date: 14, project: 40, worker: 92, cfc: 140, work: 158, hours: 232, rate: 250, amount: 268 };
      const bottom = doc.internal.pageSize.getHeight() - 18;

      const header = () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text("Date", cols.date, y);
        doc.text("Projet", cols.project, y);
        doc.text("Ouvrier", cols.worker, y);
        doc.text("CFC", cols.cfc, y);
        doc.text("Travail", cols.work, y);
        doc.text("Heures", cols.hours, y, { align: "right" });
        doc.text("Taux", cols.rate, y, { align: "right" });
        doc.text("Montant", cols.amount, y, { align: "right" });
        y += 5;
        doc.line(14, y - 2, doc.internal.pageSize.getWidth() - 14, y - 2);
        doc.setFont("helvetica", "normal");
      };

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Main-d'œuvre", 14, y);
      y += 6;
      header();

      for (const l of laborLines) {
        const projectCell = wrapText(doc, l.project_name, 48, 2);
        const workerCell = wrapText(doc, l.crew_member_name + (l.is_driver ? " (cond.)" : ""), 44, 2);
        const workCell = wrapText(doc, l.work_description, 70, 2);
        const rowHeight = Math.max(projectCell.length, workerCell.length, workCell.length) * 4 + 1;

        if (y + rowHeight > bottom) {
          doc.addPage();
          y = 20;
          header();
        }

        doc.text(l.report_date || "", cols.date, y);
        projectCell.forEach((line, i) => doc.text(line, cols.project, y + i * 4));
        workerCell.forEach((line, i) => doc.text(line, cols.worker, y + i * 4));
        doc.text(l.cfc_code || "—", cols.cfc, y);
        workCell.forEach((line, i) => doc.text(line, cols.work, y + i * 4));
        doc.text(l.hours.toFixed(2), cols.hours, y, { align: "right" });
        doc.text(pchf(l.rate_chf), cols.rate, y, { align: "right" });
        doc.text(pchf(l.amount_chf), cols.amount, y, { align: "right" });
        y += rowHeight;
      }

      y += 2;
      doc.setFont("helvetica", "bold");
      doc.text(`Total main-d'œuvre : ${totalLaborHours.toFixed(2)} h`, cols.work, y);
      doc.text(`${pchf(totalLaborCost)} CHF`, cols.amount, y, { align: "right" });
      y += 10;

      // ── Machines ──────────────────────────────────────────────────────────
      if (machineLines.length > 0) {
        if (y + 24 > bottom) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Machines", 14, y);
        y += 6;
        doc.setFontSize(8);
        doc.text("Date", cols.date, y);
        doc.text("Projet", cols.project, y);
        doc.text("Machine", cols.worker, y);
        doc.text("CFC", cols.cfc, y);
        doc.text("Location", cols.work, y);
        doc.text("Heures", cols.hours, y, { align: "right" });
        doc.text("Taux", cols.rate, y, { align: "right" });
        doc.text("Montant", cols.amount, y, { align: "right" });
        y += 5;
        doc.line(14, y - 2, doc.internal.pageSize.getWidth() - 14, y - 2);
        doc.setFont("helvetica", "normal");

        for (const l of machineLines) {
          const projectCell = wrapText(doc, l.project_name, 48, 2);
          const machineCell = wrapText(doc, l.machine_description, 44, 2);
          const rowHeight = Math.max(projectCell.length, machineCell.length) * 4 + 1;

          if (y + rowHeight > bottom) { doc.addPage(); y = 20; }

          doc.text(l.report_date || "", cols.date, y);
          projectCell.forEach((line, i) => doc.text(line, cols.project, y + i * 4));
          machineCell.forEach((line, i) => doc.text(line, cols.worker, y + i * 4));
          doc.text(l.cfc_code || "—", cols.cfc, y);
          doc.text(l.is_rented ? "Oui" : "—", cols.work, y);
          doc.text(l.hours.toFixed(2), cols.hours, y, { align: "right" });
          doc.text(l.rate_chf === null ? "—" : pchf(l.rate_chf), cols.rate, y, { align: "right" });
          doc.text(l.amount_chf === null ? "—" : pchf(l.amount_chf), cols.amount, y, { align: "right" });
          y += rowHeight;
        }

        y += 2;
        doc.setFont("helvetica", "bold");
        doc.text(`Total machines : ${totalMachineHours.toFixed(2)} h`, cols.work, y);
        doc.text(`${pchf(totalMachineCost)} CHF`, cols.amount, y, { align: "right" });
      }

      drawFooter(doc, branding.name);

      const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="heures_${week_start || "all"}.pdf"`,
        },
      });
    }

    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  } catch (error) {
    console.error("[Export Hours] Error:", error);
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
