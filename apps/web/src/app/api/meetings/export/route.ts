import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/parse-body";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
} from "docx";
import type { PVContent } from "@cantaia/database";

function createPVDocument(pv: PVContent): Document {
  const sections: Paragraph[] = [];

  // Title
  sections.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "PROCÈS-VERBAL DE SÉANCE",
          bold: true,
          size: 32,
          font: "Arial",
        }),
      ],
    })
  );

  // Project info
  sections.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: `${pv.header.project_name} (${pv.header.project_code})`,
          bold: true,
          size: 24,
          font: "Arial",
        }),
      ],
    })
  );

  sections.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: `Séance n° ${pv.header.meeting_number} — ${pv.header.date}`,
          size: 22,
          font: "Arial",
        }),
      ],
    })
  );

  // Location
  sections.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({ text: "Lieu : ", bold: true, size: 20, font: "Arial" }),
        new TextRun({ text: pv.header.location, size: 20, font: "Arial" }),
      ],
    })
  );

  // Next meeting
  if (pv.header.next_meeting_date) {
    sections.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: "Prochaine séance : ", bold: true, size: 20, font: "Arial" }),
          new TextRun({ text: pv.header.next_meeting_date, size: 20, font: "Arial" }),
        ],
      })
    );
  }

  // Participants table
  sections.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 },
      children: [
        new TextRun({ text: "Participants", bold: true, size: 24, font: "Arial" }),
      ],
    })
  );

  const participantRows = [
    new TableRow({
      children: [
        createHeaderCell("Nom"),
        createHeaderCell("Entreprise"),
        createHeaderCell("Fonction"),
        createHeaderCell("Présent"),
      ],
    }),
    ...pv.header.participants.map(
      (p) =>
        new TableRow({
          children: [
            createCell(p.name),
            createCell(p.company),
            createCell(p.role),
            createCell(p.present ? "✓" : "—"),
          ],
        })
    ),
  ];

  sections.push(
    new Paragraph({ children: [] }) // spacer
  );

  // Add participants table as a separate element after sections
  const participantsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: participantRows,
  });

  // Separator
  sections.push(
    new Paragraph({
      spacing: { before: 400, after: 200 },
      children: [
        new TextRun({ text: "─".repeat(60), size: 16, font: "Arial", color: "CCCCCC" }),
      ],
    })
  );

  // Sections
  for (const section of pv.sections) {
    // Section title
    sections.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 100 },
        children: [
          new TextRun({
            text: `${section.number}. ${section.title}`,
            bold: true,
            size: 24,
            font: "Arial",
          }),
        ],
      })
    );

    // Section content
    sections.push(
      new Paragraph({
        spacing: { after: 150 },
        children: [
          new TextRun({ text: section.content, size: 20, font: "Arial" }),
        ],
      })
    );

    // Decisions
    if (section.decisions.length > 0) {
      sections.push(
        new Paragraph({
          spacing: { before: 100, after: 50 },
          children: [
            new TextRun({ text: "Décisions :", bold: true, italics: true, size: 20, font: "Arial" }),
          ],
        })
      );
      for (const dec of section.decisions) {
        sections.push(
          new Paragraph({
            indent: { left: 360 },
            spacing: { after: 50 },
            children: [
              new TextRun({ text: `✓ ${dec}`, size: 20, font: "Arial", color: "2E7D32" }),
            ],
          })
        );
      }
    }

    // Actions
    if (section.actions.length > 0) {
      sections.push(
        new Paragraph({
          spacing: { before: 100, after: 50 },
          children: [
            new TextRun({ text: "Actions :", bold: true, italics: true, size: 20, font: "Arial" }),
          ],
        })
      );
      for (const act of section.actions) {
        const deadlineStr = act.deadline ? ` (délai: ${act.deadline})` : "";
        const urgentStr = act.priority === "urgent" ? " [URGENT]" : "";
        sections.push(
          new Paragraph({
            indent: { left: 360 },
            spacing: { after: 50 },
            children: [
              new TextRun({
                text: `→ ${act.description}`,
                size: 20,
                font: "Arial",
              }),
              new TextRun({
                text: ` — ${act.responsible_name} (${act.responsible_company})${deadlineStr}${urgentStr}`,
                size: 20,
                font: "Arial",
                color: act.priority === "urgent" ? "D32F2F" : "666666",
              }),
            ],
          })
        );
      }
    }
  }

  // Next steps
  if (pv.next_steps.length > 0) {
    sections.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 100 },
        children: [
          new TextRun({ text: "Prochaines étapes", bold: true, size: 24, font: "Arial" }),
        ],
      })
    );
    for (const step of pv.next_steps) {
      sections.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 50 },
          children: [
            new TextRun({ text: `→ ${step}`, size: 20, font: "Arial" }),
          ],
        })
      );
    }
  }

  // Summary
  if (pv.summary_fr) {
    sections.push(
      new Paragraph({
        spacing: { before: 400, after: 100 },
        children: [
          new TextRun({ text: "Résumé : ", bold: true, size: 20, font: "Arial" }),
          new TextRun({ text: pv.summary_fr, size: 20, font: "Arial", italics: true }),
        ],
      })
    );
  }

  // Footer
  sections.push(
    new Paragraph({
      spacing: { before: 600 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "— Document généré par Cantaia —",
          size: 16,
          font: "Arial",
          color: "999999",
          italics: true,
        }),
      ],
    })
  );

  return new Document({
    sections: [
      {
        children: [
          ...sections.slice(0, 8), // before participants table
          participantsTable,
          ...sections.slice(8),
        ],
      },
    ],
  });
}

function createHeaderCell(text: string): TableCell {
  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    shading: { fill: "1E3A5F" },
    children: [
      new Paragraph({
        children: [
          new TextRun({ text, bold: true, size: 18, font: "Arial", color: "FFFFFF" }),
        ],
      }),
    ],
  });
}

function createCell(text: string): TableCell {
  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
    },
    children: [
      new Paragraph({
        children: [
          new TextRun({ text, size: 18, font: "Arial" }),
        ],
      }),
    ],
  });
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
    }

    const { pv_content } = body;
    if (!pv_content) {
      return NextResponse.json({ error: "pv_content required" }, { status: 400 });
    }

    const doc = createPVDocument(pv_content as PVContent);
    const buffer = await Packer.toBuffer(doc);
    const uint8 = new Uint8Array(buffer);

    const fileName = `PV-${pv_content.header.project_code}-${pv_content.header.meeting_number}.docx`;

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[MeetingExport] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
