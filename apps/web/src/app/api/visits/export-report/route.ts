import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
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

// ─── Helpers ───

function formatDateFR(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatCHF(amount: number): string {
  return amount.toLocaleString("fr-CH");
}

function createHeaderCell(text: string, color: string, width?: number): TableCell {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: { fill: color.replace("#", "") },
    children: [
      new Paragraph({
        children: [
          new TextRun({ text, bold: true, size: 18, font: "Arial", color: "FFFFFF" }),
        ],
      }),
    ],
  });
}

function createCell(text: string, opts?: { bold?: boolean; width?: number }): TableCell {
  return new TableCell({
    width: opts?.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
    },
    children: [
      new Paragraph({
        children: [
          new TextRun({ text, size: 18, font: "Arial", bold: opts?.bold }),
        ],
      }),
    ],
  });
}

function separator(): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 200 },
    children: [
      new TextRun({ text: "─".repeat(60), size: 16, font: "Arial", color: "CCCCCC" }),
    ],
  });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 100 },
    children: [
      new TextRun({ text, bold: true, size: 24, font: "Arial" }),
    ],
  });
}

function bulletItem(text: string, opts?: { color?: string; indent?: number }): Paragraph {
  return new Paragraph({
    indent: { left: opts?.indent ?? 360 },
    spacing: { after: 60 },
    children: [
      new TextRun({
        text: `• ${text}`,
        size: 20,
        font: "Arial",
        color: opts?.color?.replace("#", ""),
      }),
    ],
  });
}

// ─── Document builder ───

function createVisitReportDocument(
  visit: any,
  report: any,
  orgName: string,
  brandColor: string
): Document {
  const children: (Paragraph | Table)[] = [];

  // ── Title ──
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: "RAPPORT DE VISITE CLIENT",
          bold: true,
          size: 32,
          font: "Arial",
          color: brandColor.replace("#", ""),
        }),
      ],
    })
  );

  if (report.title) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: report.title,
            size: 24,
            font: "Arial",
            italics: true,
          }),
        ],
      })
    );
  }

  // ── Client info box ──
  children.push(separator());

  const clientInfoRows = [
    new TableRow({
      children: [
        createHeaderCell("Information", brandColor, 30),
        createHeaderCell("Détail", brandColor, 70),
      ],
    }),
  ];

  const clientFields: [string, string | undefined][] = [
    ["Client", visit.client_name],
    ["Entreprise", visit.client_company],
    ["Téléphone", visit.client_phone],
    ["Email", visit.client_email],
    ["Adresse", [visit.client_address, visit.client_postal_code, visit.client_city].filter(Boolean).join(", ")],
    ["Date de visite", formatDateFR(visit.visit_date)],
    ["Durée", visit.duration_minutes ? `${visit.duration_minutes} min` : undefined],
  ];

  for (const [label, value] of clientFields) {
    if (value) {
      clientInfoRows.push(
        new TableRow({
          children: [
            createCell(label, { bold: true, width: 30 }),
            createCell(value, { width: 70 }),
          ],
        })
      );
    }
  }

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: clientInfoRows,
    })
  );

  // ── Summary ──
  if (report.summary) {
    children.push(separator());
    children.push(sectionHeading("Résumé"));
    children.push(
      new Paragraph({
        spacing: { after: 150 },
        children: [
          new TextRun({ text: report.summary, size: 20, font: "Arial" }),
        ],
      })
    );
  }

  // ── Client requests ──
  const requests = report.client_requests || [];
  if (requests.length > 0) {
    children.push(separator());
    children.push(sectionHeading(`Demandes du client (${requests.length})`));

    const priorityOrder = ["high", "medium", "low"];
    const priorityLabels: Record<string, string> = {
      high: "HAUTE",
      medium: "MOYENNE",
      low: "BASSE",
    };
    const priorityColors: Record<string, string> = {
      high: "D32F2F",
      medium: "F57C00",
      low: "388E3C",
    };

    for (const prio of priorityOrder) {
      const items = requests.filter((r: any) => r.priority === prio);
      if (items.length === 0) continue;

      children.push(
        new Paragraph({
          spacing: { before: 150, after: 80 },
          children: [
            new TextRun({
              text: `Priorité ${priorityLabels[prio]} :`,
              bold: true,
              size: 20,
              font: "Arial",
              color: priorityColors[prio],
            }),
          ],
        })
      );

      for (const req of items) {
        const cfcStr = req.cfc_code ? ` [CFC ${req.cfc_code}]` : "";
        const category = req.category?.replace(/_/g, " ") || "";
        children.push(
          new Paragraph({
            indent: { left: 360 },
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: `→ ${category}${cfcStr}`,
                bold: true,
                size: 20,
                font: "Arial",
              }),
              new TextRun({
                text: ` — ${req.description}`,
                size: 20,
                font: "Arial",
              }),
            ],
          })
        );
        if (req.details) {
          children.push(
            new Paragraph({
              indent: { left: 720 },
              spacing: { after: 40 },
              children: [
                new TextRun({
                  text: req.details,
                  size: 18,
                  font: "Arial",
                  italics: true,
                  color: "666666",
                }),
              ],
            })
          );
        }
      }
    }
  }

  // ── Measurements ──
  if (report.measurements && report.measurements.length > 0) {
    children.push(separator());
    children.push(sectionHeading("Mesures relevées"));

    const measureRows = [
      new TableRow({
        children: [
          createHeaderCell("Zone", brandColor, 30),
          createHeaderCell("Dimensions", brandColor, 40),
          createHeaderCell("Notes", brandColor, 30),
        ],
      }),
      ...report.measurements.map(
        (m: any) =>
          new TableRow({
            children: [
              createCell(m.zone || "", { width: 30 }),
              createCell(m.dimensions || "", { width: 40 }),
              createCell(m.notes || "", { width: 30 }),
            ],
          })
      ),
    ];

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: measureRows,
      })
    );
  }

  // ── Constraints ──
  if (report.constraints && report.constraints.length > 0) {
    children.push(separator());
    children.push(sectionHeading("Contraintes identifiées"));
    for (const c of report.constraints) {
      children.push(bulletItem(`⚠ ${c}`, { color: "#F57C00" }));
    }
  }

  // ── Budget ──
  if (report.budget) {
    children.push(separator());
    children.push(sectionHeading("Budget"));

    if (report.budget.client_mentioned) {
      const min = report.budget.range_min ? formatCHF(report.budget.range_min) : "?";
      const max = report.budget.range_max ? formatCHF(report.budget.range_max) : "";
      const rangeStr = max ? `${min} — ${max}` : min;
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "Fourchette : ", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: `${rangeStr} ${report.budget.currency || "CHF"}`, size: 20, font: "Arial" }),
          ],
        })
      );
      if (report.budget.notes) {
        children.push(
          new Paragraph({
            indent: { left: 360 },
            spacing: { after: 60 },
            children: [
              new TextRun({ text: `"${report.budget.notes}"`, size: 18, font: "Arial", italics: true, color: "666666" }),
            ],
          })
        );
      }
    } else {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "Le client n'a pas mentionné de budget précis.", size: 20, font: "Arial", italics: true, color: "999999" }),
          ],
        })
      );
    }
  }

  // ── Timeline ──
  if (report.timeline) {
    children.push(separator());
    children.push(sectionHeading("Planning souhaité"));

    const urgencyLabels: Record<string, string> = {
      low: "Basse",
      moderate: "Modérée",
      high: "Haute",
      critical: "Critique",
    };

    if (report.timeline.desired_start) {
      children.push(bulletItem(`Début souhaité : ${report.timeline.desired_start}`));
    }
    if (report.timeline.desired_end) {
      children.push(bulletItem(`Fin souhaitée : ${report.timeline.desired_end}`));
    }
    if (report.timeline.constraints) {
      children.push(bulletItem(`Contraintes : ${report.timeline.constraints}`, { color: "#F57C00" }));
    }
    children.push(
      new Paragraph({
        indent: { left: 360 },
        spacing: { after: 60 },
        children: [
          new TextRun({ text: "• Urgence : ", size: 20, font: "Arial" }),
          new TextRun({
            text: urgencyLabels[report.timeline.urgency] || report.timeline.urgency || "Modérée",
            bold: true,
            size: 20,
            font: "Arial",
          }),
        ],
      })
    );
  }

  // ── Next steps ──
  if (report.next_steps && report.next_steps.length > 0) {
    children.push(separator());
    children.push(sectionHeading("Prochaines étapes"));
    for (const step of report.next_steps) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 60 },
          children: [
            new TextRun({ text: `→ ${step}`, size: 20, font: "Arial" }),
          ],
        })
      );
    }
  }

  // ── Competitors ──
  if (report.competitors_mentioned && report.competitors_mentioned.length > 0) {
    children.push(separator());
    children.push(sectionHeading("Concurrents mentionnés"));
    for (const comp of report.competitors_mentioned) {
      children.push(bulletItem(comp, { color: "#D32F2F" }));
    }
  }

  // ── AI Analysis ──
  if (report.closing_probability || report.sentiment) {
    children.push(separator());
    children.push(sectionHeading("Analyse IA"));

    const sentimentLabels: Record<string, string> = {
      positive: "Positif",
      neutral: "Neutre",
      hesitant: "Hésitant",
      negative: "Négatif",
    };

    if (report.closing_probability) {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "Probabilité de signature : ", bold: true, size: 20, font: "Arial" }),
            new TextRun({
              text: `${Math.round(report.closing_probability * 100)}%`,
              size: 20,
              font: "Arial",
              bold: true,
              color: report.closing_probability >= 0.7 ? "388E3C" : report.closing_probability >= 0.4 ? "F57C00" : "D32F2F",
            }),
          ],
        })
      );
    }
    if (report.sentiment) {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: "Sentiment général : ", bold: true, size: 20, font: "Arial" }),
            new TextRun({ text: sentimentLabels[report.sentiment] || report.sentiment, size: 20, font: "Arial" }),
          ],
        })
      );
    }
    if (report.closing_notes) {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 60 },
          children: [
            new TextRun({ text: report.closing_notes, size: 18, font: "Arial", italics: true, color: "666666" }),
          ],
        })
      );
    }
  }

  // ── Footer ──
  children.push(
    new Paragraph({
      spacing: { before: 600 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `— Document généré par ${orgName} —`,
          size: 16,
          font: "Arial",
          color: "999999",
          italics: true,
        }),
      ],
    })
  );

  return new Document({
    sections: [{ children }],
  });
}

// ─── Route handler ───

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // Get user's org for access control
    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!userRow?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
    }

    const validationError = validateRequired(body, ["visit_id"]);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { visit_id } = body;

    // Load visit — scoped to user's organization
    const { data: visit, error: visitErr } = await supabaseAdmin
      .from("client_visits")
      .select("*")
      .eq("id", visit_id)
      .eq("organization_id", userRow.organization_id)
      .maybeSingle();

    if (visitErr || !visit) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    const report = (visit as any).report || {};

    // Load organization branding
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name, primary_color, branding_enabled")
      .eq("id", userRow.organization_id)
      .maybeSingle();

    const orgName = (org as any)?.name || "Cantaia";
    const brandColor = (org as any)?.branding_enabled && (org as any)?.primary_color
      ? (org as any).primary_color
      : "#0A1F30";

    // Generate document
    const doc = createVisitReportDocument(visit, report, orgName, brandColor);
    const buffer = await Packer.toBuffer(doc);
    const uint8 = new Uint8Array(buffer);

    // Upload to Supabase Storage
    const clientSlug = ((visit as any).client_name || "client").replace(/\s+/g, "-").toLowerCase().slice(0, 30);
    const dateStr = new Date((visit as any).visit_date).toISOString().split("T")[0];
    const storagePath = `reports/${(visit as any).organization_id}/${visit_id}/rapport-visite-${clientSlug}-${dateStr}.docx`;

    await supabaseAdmin.storage
      .from("audio")
      .upload(storagePath, uint8, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });

    // Update visit with PDF URL
    await supabaseAdmin
      .from("client_visits")
      .update({ report_pdf_url: storagePath })
      .eq("id", visit_id);

    // Return file
    const fileName = `Rapport-Visite-${clientSlug}-${dateStr}.docx`;

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[VisitExport] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
