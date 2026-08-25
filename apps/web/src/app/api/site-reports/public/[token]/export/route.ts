import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveOrgBranding,
  COUNTED_REPORT_STATUSES,
  normalizeSupplierName,
  roundChf,
} from "@cantaia/core/financials";
import { drawFooter, drawLetterhead, fetchLogoDataUrl, wrapText } from "@/lib/site-reports-pdf";

export const maxDuration = 60;

/**
 * POST /api/site-reports/public/[token]/export
 * Body: { format: "xlsx"|"pdf", type: "hours"|"notes", week_start?, project_id?, supplier?, supplier_id? }
 *
 * Token-based export of the shared view. Mirrors the public GET exactly:
 *  - a project-scoped link (migration 100) can only export that project;
 *  - machine hours are included (they were dropped by the `entry_type = labor`
 *    filter);
 *  - NO rates or CHF amounts — those stay behind the login (see the GET route).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    if (!token || token.length < 10) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const admin = createAdminClient();

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

    const body = await request.json().catch(() => ({}));
    const { format, type, week_start, supplier, supplier_id, crew_member_id } = body;
    const projectId = scopedProjectId || body.project_id || null;

    if (!format || !type) {
      return NextResponse.json({ error: "Missing format or type" }, { status: 400 });
    }

    let projectQuery = admin.from("projects").select("id, name, code").eq("organization_id", orgId);
    if (scopedProjectId) projectQuery = projectQuery.eq("id", scopedProjectId);

    const { data: projects, error: projectsError } = await projectQuery;
    if (projectsError) {
      console.error("[site-reports/public/export] Projects error:", projectsError.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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

    if (projectId) reportQuery = reportQuery.eq("project_id", projectId);
    if (week_start) {
      reportQuery = reportQuery.gte("report_date", week_start).lte("report_date", addDays(week_start, 6));
    }

    const { data: reports, error: reportsError } = await reportQuery.order("report_date");
    if (reportsError) {
      console.error("[site-reports/public/export] Reports error:", reportsError.message);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    if (!reports || reports.length === 0) {
      return NextResponse.json({ error: "No data to export" }, { status: 400 });
    }

    const reportIds = reports.map((r: any) => r.id);
    const reportMap: Record<string, any> = {};
    for (const r of reports) reportMap[r.id] = r;

    const projectName = (id: string | null | undefined) =>
      (projects || []).find((p: any) => p.id === id)?.name || "";

    const branding = await resolveOrgBranding(admin as any, orgId);
    const periodLabel = week_start ? `Semaine du ${week_start}` : "Toutes périodes";

    // --- EXPORT HOURS (labour + machines) ---
    if (type === "hours") {
      const { data: entries, error: entriesError } = await (admin as any)
        .from("site_report_entries")
        .select("*, portal_crew_members(name, role)")
        .in("report_id", reportIds as string[])
        .in("entry_type", ["labor", "machine"]);

      if (entriesError) {
        console.error("[site-reports/public/export] Entries error:", entriesError.message);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }

      const labor = (entries || [])
        .filter((e: any) => e.entry_type === "labor")
        .filter((e: any) => !crew_member_id || e.crew_member_id === crew_member_id)
        .map((e: any) => ({
          date: reportMap[e.report_id]?.report_date || "",
          project: projectName(reportMap[e.report_id]?.project_id),
          worker: e.portal_crew_members?.name || "—",
          role: e.portal_crew_members?.role || "",
          cfc: e.cfc_code || "",
          work: e.work_description || "",
          hours: Number(e.duration_hours) || 0,
          is_driver: e.is_driver === true,
          submitted_by: reportMap[e.report_id]?.submitted_by_name || "",
        }));

      const machines = (entries || [])
        .filter((e: any) => e.entry_type === "machine")
        // A crew filter is worker-scoped; machines are not attributable to a
        // worker, so drop them to keep the file consistent with the filter.
        .filter(() => !crew_member_id)
        .map((e: any) => ({
          date: reportMap[e.report_id]?.report_date || "",
          project: projectName(reportMap[e.report_id]?.project_id),
          machine: e.machine_description || "—",
          is_rented: e.is_rented === true,
          cfc: e.cfc_code || "",
          hours: Number(e.duration_hours) || 0,
          submitted_by: reportMap[e.report_id]?.submitted_by_name || "",
        }));

      const totalLabor = roundChf(labor.reduce((s: number, l: any) => s + l.hours, 0));
      const totalMachine = roundChf(machines.reduce((s: number, m: any) => s + m.hours, 0));

      if (format === "xlsx") {
        const XLSX = await import("xlsx");
        const wb = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            labor.map((l: any) => ({
              Date: l.date, Projet: l.project, Ouvrier: l.worker, Fonction: l.role,
              CFC: l.cfc, Travail: l.work, Heures: l.hours,
              Conducteur: l.is_driver ? "Oui" : "", "Soumis par": l.submitted_by,
            })),
          ),
          "Heures",
        );

        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            machines.map((m: any) => ({
              Date: m.date, Projet: m.project, Machine: m.machine,
              Location: m.is_rented ? "Oui" : "", CFC: m.cfc, Heures: m.hours,
              "Soumis par": m.submitted_by,
            })),
          ),
          "Machines",
        );

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
        const pageWidth = doc.internal.pageSize.getWidth();
        const bottom = doc.internal.pageSize.getHeight() - 18;

        let y = drawLetterhead(doc, {
          branding,
          logo,
          title: "Récapitulatif des heures",
          subtitle: periodLabel,
          meta: [scopedProjectId ? projectName(scopedProjectId) : "Tous les projets"],
        });

        const cols = { date: 14, project: 42, worker: 96, cfc: 146, work: 166, hours: 268 };

        const header = (first: string, second: string) => {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.text("Date", cols.date, y);
          doc.text("Projet", cols.project, y);
          doc.text(first, cols.worker, y);
          doc.text("CFC", cols.cfc, y);
          doc.text(second, cols.work, y);
          doc.text("Heures", cols.hours, y, { align: "right" });
          y += 5;
          doc.line(14, y - 2, pageWidth - 14, y - 2);
          doc.setFont("helvetica", "normal");
        };

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Main-d'œuvre", 14, y);
        y += 6;
        header("Ouvrier", "Travail");

        for (const l of labor) {
          const projectCell = wrapText(doc, l.project, 50, 2);
          const workerCell = wrapText(doc, l.worker + (l.is_driver ? " (cond.)" : ""), 46, 2);
          const workCell = wrapText(doc, l.work, 96, 2);
          const rowHeight = Math.max(projectCell.length, workerCell.length, workCell.length) * 4 + 1;
          if (y + rowHeight > bottom) { doc.addPage(); y = 20; header("Ouvrier", "Travail"); }

          doc.text(l.date, cols.date, y);
          projectCell.forEach((line: string, i: number) => doc.text(line, cols.project, y + i * 4));
          workerCell.forEach((line: string, i: number) => doc.text(line, cols.worker, y + i * 4));
          doc.text(l.cfc || "—", cols.cfc, y);
          workCell.forEach((line: string, i: number) => doc.text(line, cols.work, y + i * 4));
          doc.text(l.hours.toFixed(2), cols.hours, y, { align: "right" });
          y += rowHeight;
        }

        doc.setFont("helvetica", "bold");
        doc.text(`Total : ${totalLabor.toFixed(2)} h`, cols.work, y + 2);
        y += 12;

        if (machines.length > 0) {
          if (y + 24 > bottom) { doc.addPage(); y = 20; }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.text("Machines", 14, y);
          y += 6;
          header("Machine", "Location");

          for (const m of machines) {
            const projectCell = wrapText(doc, m.project, 50, 2);
            const machineCell = wrapText(doc, m.machine, 46, 2);
            const rowHeight = Math.max(projectCell.length, machineCell.length) * 4 + 1;
            if (y + rowHeight > bottom) { doc.addPage(); y = 20; header("Machine", "Location"); }

            doc.text(m.date, cols.date, y);
            projectCell.forEach((line: string, i: number) => doc.text(line, cols.project, y + i * 4));
            machineCell.forEach((line: string, i: number) => doc.text(line, cols.worker, y + i * 4));
            doc.text(m.cfc || "—", cols.cfc, y);
            doc.text(m.is_rented ? "Oui" : "—", cols.work, y);
            doc.text(m.hours.toFixed(2), cols.hours, y, { align: "right" });
            y += rowHeight;
          }

          doc.setFont("helvetica", "bold");
          doc.text(`Total : ${totalMachine.toFixed(2)} h`, cols.work, y + 2);
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
    }

    // --- EXPORT NOTES ---
    if (type === "notes") {
      const { data: noteEntries, error: notesError } = await (admin as any)
        .from("site_report_entries")
        .select("*")
        .in("report_id", reportIds as string[])
        .eq("entry_type", "delivery_note");

      if (notesError) {
        console.error("[site-reports/public/export] Notes error:", notesError.message);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
      }

      const supplierIds = Array.from(
        new Set<string>((noteEntries || []).map((e: any) => e.supplier_id).filter(Boolean)),
      );
      const supplierNames: Record<string, string> = {};
      if (supplierIds.length > 0) {
        const { data: supplierRows } = await (admin as any)
          .from("suppliers")
          .select("id, company_name")
          .eq("organization_id", orgId)
          .in("id", supplierIds);
        for (const s of supplierRows || []) supplierNames[s.id] = s.company_name;
      }

      let notes = (noteEntries || []).map((e: any) => ({
        date: reportMap[e.report_id]?.report_date || "",
        project: projectName(reportMap[e.report_id]?.project_id),
        note_number: e.note_number || "",
        supplier_id: e.supplier_id || null,
        supplier_name: (e.supplier_id ? supplierNames[e.supplier_id] : "") || e.supplier_name || "",
        photo_url: e.photo_url || "",
        submitted_by: reportMap[e.report_id]?.submitted_by_name || "",
      }));

      if (supplier_id) {
        notes = notes.filter((n: any) => n.supplier_id === supplier_id);
      } else if (supplier) {
        const needle = normalizeSupplierName(supplier);
        notes = notes.filter((n: any) => normalizeSupplierName(n.supplier_name).includes(needle));
      }

      if (format === "xlsx") {
        const XLSX = await import("xlsx");
        const ws = XLSX.utils.json_to_sheet(
          notes.map((n: any) => ({
            Date: n.date,
            Projet: n.project,
            "N° Bon": n.note_number,
            Fournisseur: n.supplier_name,
            Photo: n.photo_url ? "Oui" : "Non",
            "Soumis par": n.submitted_by,
          })),
        );
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Bons de livraison");
        const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        return new NextResponse(buffer, {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="bons_${week_start || "all"}.xlsx"`,
          },
        });
      }

      if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        const doc = new jsPDF();
        const logo = await fetchLogoDataUrl(branding.logoUrl);
        const pageWidth = doc.internal.pageSize.getWidth();
        const bottom = doc.internal.pageSize.getHeight() - 18;

        let y = drawLetterhead(doc, {
          branding,
          logo,
          title: "Bons de livraison",
          subtitle: periodLabel,
          meta: [`${notes.length} bon(s)`],
        });

        const cols = { date: 14, project: 38, number: 88, supplier: 118, by: 165 };
        const header = () => {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.text("Date", cols.date, y);
          doc.text("Projet", cols.project, y);
          doc.text("N° Bon", cols.number, y);
          doc.text("Fournisseur", cols.supplier, y);
          doc.text("Soumis par", cols.by, y);
          y += 5;
          doc.line(14, y - 2, pageWidth - 14, y - 2);
          doc.setFont("helvetica", "normal");
        };

        doc.setFontSize(8);
        header();

        for (const n of notes) {
          const projectCell = wrapText(doc, n.project, 46, 2);
          const supplierCell = wrapText(doc, n.supplier_name || "—", 44, 2);
          const rowHeight = Math.max(projectCell.length, supplierCell.length) * 4 + 1;
          if (y + rowHeight > bottom) { doc.addPage(); y = 20; header(); }

          doc.text(n.date, cols.date, y);
          projectCell.forEach((line: string, i: number) => doc.text(line, cols.project, y + i * 4));
          doc.text(wrapText(doc, n.note_number || "—", 28, 1)[0], cols.number, y);
          supplierCell.forEach((line: string, i: number) => doc.text(line, cols.supplier, y + i * 4));
          doc.text(wrapText(doc, n.submitted_by || "—", 32, 1)[0], cols.by, y);
          y += rowHeight;
        }

        y += 3;
        doc.setFont("helvetica", "bold");
        doc.text(`Total : ${notes.length} bon(s)`, cols.date, y);

        drawFooter(doc, branding.name);

        const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
        return new NextResponse(pdfBuffer, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="bons_${week_start || "all"}.pdf"`,
          },
        });
      }
    }

    return NextResponse.json({ error: "Invalid format or type" }, { status: 400 });
  } catch (err: any) {
    console.error("[site-reports/public/export] Error:", err);
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
