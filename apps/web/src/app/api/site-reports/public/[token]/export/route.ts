import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * POST /api/site-reports/public/[token]/export
 * Export site report data as XLSX or PDF. No auth required — token-based access.
 * Body: { format: "xlsx"|"pdf", type: "hours"|"notes", week_start?, project_id?, supplier? }
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

    // Validate token
    const { data: share, error: shareError } = await (admin as any)
      .from("site_report_shares")
      .select("id, organization_id, is_active, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (shareError || !share) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    if (!share.is_active) {
      return NextResponse.json({ error: "This link has been revoked" }, { status: 410 });
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 });
    }

    const orgId = share.organization_id;
    const body = await request.json();
    const { format, type, week_start, project_id, supplier } = body;

    if (!format || !type) {
      return NextResponse.json({ error: "Missing format or type" }, { status: 400 });
    }

    // Get org projects
    const { data: projects } = await admin
      .from("projects")
      .select("id, name, code")
      .eq("organization_id", orgId);

    const projectIds = (projects || []).map((p: any) => p.id);
    if (projectIds.length === 0) {
      return NextResponse.json({ error: "No data to export" }, { status: 400 });
    }

    // Build report query
    let reportQuery = (admin as any)
      .from("site_reports")
      .select("id, project_id, report_date, submitted_by_name")
      .in("project_id", projectIds as string[])
      .in("status", ["submitted", "locked"]);

    if (project_id) reportQuery = reportQuery.eq("project_id", project_id);
    if (week_start) {
      const weekEnd = new Date(week_start);
      weekEnd.setDate(weekEnd.getDate() + 6);
      reportQuery = reportQuery.gte("report_date", week_start).lte("report_date", weekEnd.toISOString().split("T")[0]);
    }

    const { data: reports } = await reportQuery.order("report_date");
    if (!reports || reports.length === 0) {
      return NextResponse.json({ error: "No data to export" }, { status: 400 });
    }

    const reportIds = reports.map((r: any) => r.id);
    const reportMap: Record<string, any> = {};
    for (const r of reports) reportMap[r.id] = r;

    // --- EXPORT HOURS ---
    if (type === "hours") {
      const { data: entries } = await (admin as any)
        .from("site_report_entries")
        .select("*, portal_crew_members(name, role)")
        .in("report_id", reportIds as string[])
        .eq("entry_type", "labor");

      if (format === "xlsx") {
        const XLSX = await import("xlsx");
        const rows = (entries || []).map((e: any) => ({
          Date: reportMap[e.report_id]?.report_date || "",
          Projet: (projects || []).find((p: any) => p.id === reportMap[e.report_id]?.project_id)?.name || "",
          Ouvrier: e.portal_crew_members?.name || "—",
          Fonction: e.portal_crew_members?.role || "",
          Travail: e.work_description || "",
          "Heures": Number(e.duration_hours) || 0,
          Conducteur: e.is_driver ? "Oui" : "",
          "Soumis par": reportMap[e.report_id]?.submitted_by_name || "",
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Heures");
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
        doc.setFontSize(16);
        doc.text("Récapitulatif des heures", 14, 20);
        doc.setFontSize(10);
        if (week_start) doc.text(`Semaine du ${week_start}`, 14, 28);

        let y = 38;
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Date", 14, y);
        doc.text("Projet", 40, y);
        doc.text("Ouvrier", 90, y);
        doc.text("Travail", 130, y);
        doc.text("Heures", 220, y);
        y += 6;
        doc.setFont("helvetica", "normal");

        let totalHours = 0;
        for (const e of (entries || [])) {
          if (y > 190) { doc.addPage(); y = 20; }
          const hours = Number(e.duration_hours) || 0;
          totalHours += hours;
          doc.text(reportMap[e.report_id]?.report_date || "", 14, y);
          doc.text(((projects || []).find((p: any) => p.id === reportMap[e.report_id]?.project_id)?.name || "").slice(0, 25), 40, y);
          doc.text((e.portal_crew_members?.name || "—").slice(0, 20), 90, y);
          doc.text((e.work_description || "").slice(0, 45), 130, y);
          doc.text(hours.toFixed(1), 220, y);
          y += 5;
        }
        y += 4;
        doc.setFont("helvetica", "bold");
        doc.text(`Total: ${totalHours.toFixed(1)} heures`, 14, y);

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
      const { data: noteEntries } = await (admin as any)
        .from("site_report_entries")
        .select("*")
        .in("report_id", reportIds as string[])
        .eq("entry_type", "delivery_note");

      let notes = (noteEntries || []).map((e: any) => ({
        date: reportMap[e.report_id]?.report_date || "",
        project: (projects || []).find((p: any) => p.id === reportMap[e.report_id]?.project_id)?.name || "",
        note_number: e.note_number || "",
        supplier_name: e.supplier_name || "",
        photo_url: e.photo_url || "",
        submitted_by: reportMap[e.report_id]?.submitted_by_name || "",
      }));

      if (supplier) {
        notes = notes.filter((n: any) => n.supplier_name?.toLowerCase().includes(supplier.toLowerCase()));
      }

      if (format === "xlsx") {
        const XLSX = await import("xlsx");
        const rows = notes.map((n: any) => ({
          Date: n.date,
          Projet: n.project,
          "N° Bon": n.note_number,
          Fournisseur: n.supplier_name,
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
        doc.setFontSize(16);
        doc.text("Bons de livraison", 14, 20);
        doc.setFontSize(10);
        if (week_start) doc.text(`Semaine du ${week_start}`, 14, 28);

        let y = 38;
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Date", 14, y);
        doc.text("Projet", 40, y);
        doc.text("N° Bon", 90, y);
        doc.text("Fournisseur", 120, y);
        doc.text("Soumis par", 160, y);
        y += 6;
        doc.setFont("helvetica", "normal");

        for (const n of notes) {
          if (y > 280) { doc.addPage(); y = 20; }
          doc.text(n.date, 14, y);
          doc.text(n.project.slice(0, 25), 40, y);
          doc.text(n.note_number.slice(0, 15), 90, y);
          doc.text(n.supplier_name.slice(0, 20), 120, y);
          doc.text(n.submitted_by.slice(0, 20), 160, y);
          y += 5;
        }

        y += 4;
        doc.setFont("helvetica", "bold");
        doc.text(`Total: ${notes.length} bons`, 14, y);

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
