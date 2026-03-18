import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

/**
 * GET /api/planning/[id]/export-pdf
 * Generates a PDF A3 landscape Gantt chart.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Fetch planning with org check
    const { data: planning } = await (admin as any)
      .from("project_plannings")
      .select("*, projects(name, code)")
      .eq("id", id)
      .maybeSingle();

    if (!planning || planning.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch phases and tasks
    const { data: phases } = await (admin as any)
      .from("planning_phases")
      .select("*")
      .eq("planning_id", id)
      .order("sort_order", { ascending: true });

    const { data: tasks } = await (admin as any)
      .from("planning_tasks")
      .select("*")
      .eq("planning_id", id)
      .order("sort_order", { ascending: true });

    // Generate PDF
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    // A3 landscape: 420 x 297 mm
    const doc = new jsPDF({ orientation: "landscape", format: "a3" });
    const pageWidth = 420;
    const pageHeight = 297;

    // === HEADER ===
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 58, 95); // brand dark blue
    doc.text("PLANNING DE CHANTIER", 14, 18);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Cantaia — cantaia.ch`, 14, 25);

    // Project info
    const projectName = planning.projects?.name || "Projet";
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50);
    doc.text(projectName, 14, 35);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const startStr = planning.start_date ? new Date(planning.start_date).toLocaleDateString("fr-CH") : "-";
    const endStr = planning.calculated_end_date ? new Date(planning.calculated_end_date).toLocaleDateString("fr-CH") : "-";
    doc.text(`Debut: ${startStr}  |  Fin estimee: ${endStr}  |  Type: ${planning.project_type || "-"}`, 14, 42);

    // === GANTT TABLE ===
    const tableRows: any[][] = [];

    for (const phase of (phases || [])) {
      const phaseTasks = (tasks || []).filter((t: any) => t.phase_id === phase.id);

      // Phase header row
      tableRows.push([
        { content: phase.name, colSpan: 1, styles: { fontStyle: "bold", fillColor: [240, 243, 250] } },
        { content: "", styles: { fillColor: [240, 243, 250] } },
        { content: `${phase.start_date ? new Date(phase.start_date).toLocaleDateString("fr-CH") : ""}`, styles: { fillColor: [240, 243, 250] } },
        { content: `${phase.end_date ? new Date(phase.end_date).toLocaleDateString("fr-CH") : ""}`, styles: { fillColor: [240, 243, 250] } },
        { content: "", styles: { fillColor: [240, 243, 250] } },
      ]);

      for (const task of phaseTasks) {
        if (task.is_milestone) {
          tableRows.push([
            { content: `  ◆ ${task.name}`, styles: { fontStyle: "italic", textColor: [180, 130, 0] } },
            "",
            task.start_date ? new Date(task.start_date).toLocaleDateString("fr-CH") : "",
            "",
            "",
          ]);
        } else {
          tableRows.push([
            `  ${task.name}`,
            `${task.duration_days}j`,
            task.start_date ? new Date(task.start_date).toLocaleDateString("fr-CH") : "",
            task.end_date ? new Date(task.end_date).toLocaleDateString("fr-CH") : "",
            task.productivity_source || "",
          ]);
        }
      }
    }

    autoTable(doc, {
      startY: 50,
      head: [["Tache", "Duree", "Debut", "Fin", "Source"]],
      body: tableRows,
      theme: "grid",
      headStyles: { fillColor: [30, 58, 95], textColor: [255, 255, 255] },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 180 },
        1: { cellWidth: 30, halign: "center" },
        2: { cellWidth: 40, halign: "center" },
        3: { cellWidth: 40, halign: "center" },
        4: { cellWidth: 40, halign: "center" },
      },
    });

    // === LEGEND ===
    const legendY = (doc as any).lastAutoTable?.finalY + 15 || 250;
    if (legendY < pageHeight - 30) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Legende:", 14, legendY);
      doc.setFont("helvetica", "normal");
      doc.text("◆ = Jalon  |  Sources: crb_2025 = Referentiel CRB  |  org_calibrated = Ratio calibre organisation  |  ai_estimate = Estimation IA", 14, legendY + 5);
    }

    // === FOOTER ON ALL PAGES ===
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150);
      doc.text(
        `Genere par Cantaia — cantaia.ch — ${new Date().toLocaleDateString("fr-CH")}`,
        14,
        pageHeight - 8,
      );
      doc.text(`Page ${i}/${totalPages}`, pageWidth - 14, pageHeight - 8, { align: "right" });
      doc.setTextColor(0);
    }

    // === RETURN PDF ===
    const pdfBuffer = doc.output("arraybuffer");
    const safeProjectName = projectName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
    const filename = `Planning_${safeProjectName}_${new Date().toISOString().split("T")[0]}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[planning/export-pdf] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
