import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify user's organization
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    const { data: meeting } = await admin
      .from("meetings")
      .select("*, projects(name, code, organization_id)")
      .eq("id", id)
      .maybeSingle();

    if (!meeting || !meeting.pv_content) {
      return NextResponse.json(
        { error: "Meeting or PV not found" },
        { status: 404 }
      );
    }

    // Verify meeting's project belongs to user's org
    const proj = (meeting as any).projects;
    if (proj && userProfile?.organization_id && proj.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const pv = meeting.pv_content as any;

    // Dynamic import jsPDF (server-side)
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF();

    // === HEADER ===
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("PROCES-VERBAL DE SEANCE", 105, 20, { align: "center" });

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Projet : ${pv.header?.project_name || ""}`, 14, 35);
    doc.text(`Seance n. : ${pv.header?.meeting_number || ""}`, 14, 42);
    doc.text(`Date : ${pv.header?.date || ""}`, 14, 49);
    doc.text(`Lieu : ${pv.header?.location || ""}`, 14, 56);

    // === PARTICIPANTS TABLE ===
    const participantRows = (pv.header?.participants || []).map(
      (p: any) => [
        p.name || "",
        p.company || "",
        p.role || "",
        p.present ? "Present" : "Absent",
      ]
    );

    if (participantRows.length > 0) {
      autoTable(doc, {
        startY: 65,
        head: [["Nom", "Entreprise", "Role", "Presence"]],
        body: participantRows,
        theme: "grid",
        headStyles: { fillColor: [30, 58, 95] },
        styles: { fontSize: 9 },
      });
    }

    let currentY =
      participantRows.length > 0
        ? (doc as any).lastAutoTable.finalY + 15
        : 75;

    // === SECTIONS ===
    for (const section of pv.sections || []) {
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      // Section title
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(
        `${section.number}. ${section.title}`,
        14,
        currentY
      );
      currentY += 8;

      // Content
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const contentLines = doc.splitTextToSize(
        section.content || "",
        180
      );
      doc.text(contentLines, 14, currentY);
      currentY += contentLines.length * 5 + 5;

      // Decisions
      if (section.decisions?.length > 0) {
        if (currentY > 260) {
          doc.addPage();
          currentY = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.text("Decisions :", 14, currentY);
        currentY += 6;
        doc.setFont("helvetica", "italic");
        for (const decision of section.decisions) {
          const decLines = doc.splitTextToSize(
            `- ${decision}`,
            175
          );
          doc.text(decLines, 18, currentY);
          currentY += decLines.length * 5 + 2;
        }
        currentY += 3;
      }

      // Actions table
      if (section.actions?.length > 0) {
        if (currentY > 240) {
          doc.addPage();
          currentY = 20;
        }
        doc.setFont("helvetica", "bold");
        doc.text("Actions :", 14, currentY);
        currentY += 3;

        const actionRows = section.actions.map((a: any) => [
          a.description || "",
          `${a.responsible_name || "?"}\n${a.responsible_company || ""}`,
          a.deadline || "-",
          a.priority === "urgent" ? "URGENT" : "Normal",
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [["Action", "Responsable", "Delai", "Priorite"]],
          body: actionRows,
          theme: "grid",
          headStyles: { fillColor: [100, 100, 100] },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 45 },
            2: { cellWidth: 30 },
            3: { cellWidth: 25 },
          },
          styles: { fontSize: 8 },
        });

        currentY = (doc as any).lastAutoTable.finalY + 10;
      }

      currentY += 5;
    }

    // === SUMMARY ===
    const summary = pv.summary_fr || pv.summary;
    if (summary) {
      if (currentY > 240) {
        doc.addPage();
        currentY = 20;
      }
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Resume", 14, currentY);
      currentY += 7;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const summaryLines = doc.splitTextToSize(summary, 180);
      doc.text(summaryLines, 14, currentY);
    }

    // === FOOTER ON ALL PAGES ===
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150);
      doc.text(
        `Genere par Cantaia - ${new Date().toLocaleDateString("fr-CH")}`,
        14,
        290
      );
      doc.text(`Page ${i}/${totalPages}`, 196, 290, {
        align: "right",
      });
      doc.setTextColor(0);
    }

    // === RETURN PDF ===
    const pdfBuffer = doc.output("arraybuffer");
    const projectName = (
      pv.header?.project_name || "Projet"
    ).replace(/\s/g, "_");
    const meetingNum = pv.header?.meeting_number || "";
    const dateStr = (pv.header?.date || "").replace(/\./g, "-");
    const filename = `PV_${projectName}_Seance${meetingNum}_${dateStr}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[ExportPDF] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
