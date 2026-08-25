import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveOrgBranding,
  COUNTED_REPORT_STATUSES,
  normalizeSupplierName,
} from "@cantaia/core/financials";
import { drawFooter, drawLetterhead, fetchLogoDataUrl, wrapText } from "@/lib/site-reports-pdf";

export const maxDuration = 60;

/**
 * POST /api/site-reports/export-notes
 * Body: { format: "xlsx"|"pdf", project_id?, week_start?, supplier?, supplier_id? }
 *
 * Delivery notes on org letterhead, with the supplier resolved through
 * `site_report_entries.supplier_id` when the note is linked to the directory.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).single();
    if (!profile?.organization_id) return NextResponse.json({ error: "No org" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const { format, project_id, week_start, supplier, supplier_id } = body;

    const { data: projects, error: projectsError } = await admin
      .from("projects")
      .select("id, name, code")
      .eq("organization_id", profile.organization_id);

    if (projectsError) {
      console.error("[Export Notes] Projects error:", projectsError.message);
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
      console.error("[Export Notes] Reports error:", reportsError.message);
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
      .select("*")
      .in("report_id", reportIds as string[])
      .eq("entry_type", "delivery_note");

    if (entriesError) {
      console.error("[Export Notes] Entries error:", entriesError.message);
      return NextResponse.json({ error: "Failed to fetch delivery notes" }, { status: 500 });
    }

    // supplier_id → company_name (separate query: the FK ships with 093)
    const supplierIds = Array.from(
      new Set<string>((entries || []).map((e: any) => e.supplier_id).filter(Boolean)),
    );
    const supplierNames: Record<string, string> = {};
    if (supplierIds.length > 0) {
      const { data: supplierRows, error: supplierError } = await (admin as any)
        .from("suppliers")
        .select("id, company_name")
        .eq("organization_id", profile.organization_id)
        .in("id", supplierIds);
      if (supplierError) console.warn("[Export Notes] Suppliers lookup failed:", supplierError.message);
      for (const s of supplierRows || []) supplierNames[s.id] = s.company_name;
    }

    let notes = (entries || []).map((e: any) => ({
      date: reportMap[e.report_id]?.report_date || "",
      project: (projects || []).find((p: any) => p.id === reportMap[e.report_id]?.project_id)?.name || "",
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

    const branding = await resolveOrgBranding(admin as any, profile.organization_id);
    const periodLabel = week_start ? `Semaine du ${week_start}` : "Toutes périodes";

    if (format === "xlsx") {
      const XLSX = await import("xlsx");
      const rows = notes.map((n: any) => ({
        Date: n.date,
        Projet: n.project,
        "N° Bon": n.note_number,
        Fournisseur: n.supplier_name,
        "Fournisseur lié": n.supplier_id ? "Oui" : "",
        Photo: n.photo_url ? "Oui" : "Non",
        "Soumis par": n.submitted_by,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
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

      let y = drawLetterhead(doc, {
        branding,
        logo,
        title: "Bons de livraison",
        subtitle: periodLabel,
        meta: [`${notes.length} bon(s)`],
      });

      const cols = { date: 14, project: 38, number: 88, supplier: 118, by: 165 };
      const bottom = doc.internal.pageSize.getHeight() - 18;

      const header = () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text("Date", cols.date, y);
        doc.text("Projet", cols.project, y);
        doc.text("N° Bon", cols.number, y);
        doc.text("Fournisseur", cols.supplier, y);
        doc.text("Soumis par", cols.by, y);
        y += 5;
        doc.line(14, y - 2, doc.internal.pageSize.getWidth() - 14, y - 2);
        doc.setFont("helvetica", "normal");
      };

      doc.setFontSize(8);
      header();

      for (const n of notes) {
        const projectCell = wrapText(doc, n.project, 46, 2);
        const supplierCell = wrapText(doc, n.supplier_name || "—", 44, 2);
        const byCell = wrapText(doc, n.submitted_by || "—", 32, 2);
        const rowHeight = Math.max(projectCell.length, supplierCell.length, byCell.length) * 4 + 1;

        if (y + rowHeight > bottom) { doc.addPage(); y = 20; header(); }

        doc.text(n.date, cols.date, y);
        projectCell.forEach((line, i) => doc.text(line, cols.project, y + i * 4));
        doc.text(wrapText(doc, n.note_number || "—", 28, 1)[0], cols.number, y);
        supplierCell.forEach((line, i) => doc.text(line, cols.supplier, y + i * 4));
        byCell.forEach((line, i) => doc.text(line, cols.by, y + i * 4));
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

    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  } catch (error) {
    console.error("[Export Notes] Error:", error);
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
