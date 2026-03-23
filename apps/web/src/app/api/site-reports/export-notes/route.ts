import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).single();
    if (!profile?.organization_id) return NextResponse.json({ error: "No org" }, { status: 400 });

    const body = await request.json();
    const { format, project_id, week_start, supplier } = body;

    const { data: projects } = await admin
      .from("projects")
      .select("id, name, code")
      .eq("organization_id", profile.organization_id);

    const projectIds = (projects || []).map((p: any) => p.id);

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

    const { data: entries } = await (admin as any)
      .from("site_report_entries")
      .select("*")
      .in("report_id", reportIds as string[])
      .eq("entry_type", "delivery_note");

    let notes = (entries || []).map((e: any) => ({
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

    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  } catch (error) {
    console.error("[Export Notes] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
