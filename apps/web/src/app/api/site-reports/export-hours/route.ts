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
    const { format, project_id, week_start } = body; // format: "xlsx" or "pdf"

    // Fetch hours data (reuse same logic)
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
      // Header
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

    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  } catch (error) {
    console.error("[Export Hours] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
