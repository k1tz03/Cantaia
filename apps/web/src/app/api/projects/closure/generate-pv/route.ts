import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

export const maxDuration = 120;
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

interface ReceptionParticipant {
  name: string;
  role: string;
  company: string;
  present: boolean;
  signed: boolean;
}

interface LotReception {
  lot_name: string;
  cfc_code: string;
  company: string;
  contract_amount: number;
  final_amount: number;
  status: "accepted" | "reserves" | "refused";
  notes: string;
  reserves?: Array<{
    description: string;
    location: string;
    severity: string;
    deadline: string;
  }>;
}

interface ReceptionData {
  project_id: string;
  project_name: string;
  project_code: string;
  reception_type: string;
  reception_date: string;
  reception_location: string;
  participants: ReceptionParticipant[];
  lots: LotReception[];
  general_notes: string;
}

function formatDateFR(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "long", year: "numeric" });
}

function formatCHF(amount: number): string {
  return amount.toLocaleString("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function createHeaderCell(text: string, width?: number): TableCell {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
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

function createCell(text: string, options?: { color?: string; bold?: boolean; width?: number }): TableCell {
  return new TableCell({
    width: options?.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
    },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            size: 18,
            font: "Arial",
            bold: options?.bold,
            color: options?.color,
          }),
        ],
      }),
    ],
  });
}

function createReceptionDocument(data: ReceptionData): Document {
  const elements: (Paragraph | Table)[] = [];

  // Title
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: "PROCÈS-VERBAL DE RÉCEPTION",
          bold: true,
          size: 32,
          font: "Arial",
        }),
      ],
    })
  );

  // Reception type
  const typeLabels: Record<string, string> = {
    provisional: "Réception provisoire",
    final: "Réception définitive",
    partial: "Réception partielle (par lot)",
  };
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: typeLabels[data.reception_type] || data.reception_type,
          bold: true,
          size: 24,
          font: "Arial",
          color: "1E3A5F",
        }),
      ],
    })
  );

  // Project info
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: `${data.project_name}${data.project_code ? ` (${data.project_code})` : ""}`,
          bold: true,
          size: 24,
          font: "Arial",
        }),
      ],
    })
  );

  // Date & Location
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: `Date : ${formatDateFR(data.reception_date)}`,
          size: 20,
          font: "Arial",
        }),
      ],
    })
  );
  elements.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: `Lieu : ${data.reception_location}`,
          size: 20,
          font: "Arial",
        }),
      ],
    })
  );

  // Reference
  elements.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Référence : PVR-${data.project_code || "PROJ"}-001`,
          bold: true,
          size: 20,
          font: "Arial",
          color: "666666",
        }),
      ],
    })
  );

  // Separator
  elements.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: "─".repeat(60), size: 16, font: "Arial", color: "CCCCCC" }),
      ],
    })
  );

  // Participants section
  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({ text: "1. Participants", bold: true, size: 24, font: "Arial" }),
      ],
    })
  );

  const participantTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          createHeaderCell("Nom", 25),
          createHeaderCell("Fonction", 20),
          createHeaderCell("Entreprise", 25),
          createHeaderCell("Présent", 15),
          createHeaderCell("Signature", 15),
        ],
      }),
      ...data.participants.map(
        (p) =>
          new TableRow({
            children: [
              createCell(p.name, { width: 25 }),
              createCell(p.role, { width: 20 }),
              createCell(p.company, { width: 25 }),
              createCell(p.present ? "✓" : "—", { width: 15 }),
              createCell("", { width: 15 }), // empty for signature
            ],
          })
      ),
    ],
  });
  elements.push(participantTable);

  // Lots section
  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 100 },
      children: [
        new TextRun({ text: "2. Lots réceptionnés", bold: true, size: 24, font: "Arial" }),
      ],
    })
  );

  const statusLabels: Record<string, string> = {
    accepted: "Accepté",
    reserves: "Avec réserves",
    refused: "Refusé",
  };
  const statusColors: Record<string, string> = {
    accepted: "2E7D32",
    reserves: "F57F17",
    refused: "D32F2F",
  };

  let totalContract = 0;
  let totalFinal = 0;

  const lotRows = data.lots.map((lot) => {
    totalContract += lot.contract_amount;
    totalFinal += lot.final_amount;
    const ecart = lot.contract_amount > 0
      ? ((lot.final_amount - lot.contract_amount) / lot.contract_amount * 100).toFixed(1)
      : "0.0";

    return new TableRow({
      children: [
        createCell(lot.cfc_code),
        createCell(lot.lot_name),
        createCell(lot.company),
        createCell(`${formatCHF(lot.contract_amount)} CHF`),
        createCell(`${formatCHF(lot.final_amount)} CHF`),
        createCell(`${ecart}%`),
        createCell(statusLabels[lot.status] || lot.status, { color: statusColors[lot.status], bold: true }),
      ],
    });
  });

  // Total row
  const totalEcart = totalContract > 0
    ? ((totalFinal - totalContract) / totalContract * 100).toFixed(1)
    : "0.0";
  lotRows.push(
    new TableRow({
      children: [
        createCell("", { bold: true }),
        createCell("TOTAL", { bold: true }),
        createCell(""),
        createCell(`${formatCHF(totalContract)} CHF`, { bold: true }),
        createCell(`${formatCHF(totalFinal)} CHF`, { bold: true }),
        createCell(`${totalEcart}%`, { bold: true }),
        createCell(""),
      ],
    })
  );

  const lotTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          createHeaderCell("CFC"),
          createHeaderCell("Description"),
          createHeaderCell("Entreprise"),
          createHeaderCell("Contrat"),
          createHeaderCell("Final"),
          createHeaderCell("Écart"),
          createHeaderCell("Statut"),
        ],
      }),
      ...lotRows,
    ],
  });
  elements.push(lotTable);

  // Reserves section
  const allReserves = data.lots.flatMap((lot, i) =>
    (lot.reserves || []).map((r, j) => ({
      ref: `R-${String(i * 10 + j + 1).padStart(3, "0")}`,
      ...r,
      lot_name: lot.lot_name,
      cfc_code: lot.cfc_code,
      company: lot.company,
    }))
  );

  if (allReserves.length > 0) {
    elements.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 100 },
        children: [
          new TextRun({ text: "3. Réserves", bold: true, size: 24, font: "Arial" }),
        ],
      })
    );

    const severityLabels: Record<string, string> = { minor: "Mineur", major: "Majeur", blocking: "Bloquant" };
    const severityColors: Record<string, string> = { minor: "F57F17", major: "E65100", blocking: "D32F2F" };

    const reserveTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createHeaderCell("Réf"),
            createHeaderCell("Description"),
            createHeaderCell("Localisation"),
            createHeaderCell("Lot"),
            createHeaderCell("Gravité"),
            createHeaderCell("Deadline"),
          ],
        }),
        ...allReserves.map(
          (r) =>
            new TableRow({
              children: [
                createCell(r.ref),
                createCell(r.description),
                createCell(r.location || "—"),
                createCell(`CFC ${r.cfc_code}`),
                createCell(severityLabels[r.severity] || r.severity, { color: severityColors[r.severity] }),
                createCell(r.deadline ? formatDateFR(r.deadline) : "—"),
              ],
            })
        ),
      ],
    });
    elements.push(reserveTable);
  }

  // Legal clause
  const sectionNum = allReserves.length > 0 ? 4 : 3;
  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 100 },
      children: [
        new TextRun({ text: `${sectionNum}. Clause juridique`, bold: true, size: 24, font: "Arial" }),
      ],
    })
  );

  elements.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: "Le maître d'ouvrage déclare réceptionner les travaux sous les réserves ci-dessus. Le délai de garantie de 2 ans (SIA 118, art. 172) commence à courir à la date de signature du présent procès-verbal.",
          size: 20,
          font: "Arial",
          italics: true,
        }),
      ],
    })
  );

  // Guarantee dates
  const receptionDate = new Date(data.reception_date);
  const guarantee2y = new Date(receptionDate);
  guarantee2y.setFullYear(guarantee2y.getFullYear() + 2);
  const guarantee5y = new Date(receptionDate);
  guarantee5y.setFullYear(guarantee5y.getFullYear() + 5);

  elements.push(
    new Paragraph({
      spacing: { after: 50 },
      children: [
        new TextRun({ text: "Fin de garantie 2 ans : ", bold: true, size: 20, font: "Arial" }),
        new TextRun({ text: formatDateFR(guarantee2y.toISOString()), size: 20, font: "Arial" }),
      ],
    })
  );
  elements.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: "Fin de garantie 5 ans : ", bold: true, size: 20, font: "Arial" }),
        new TextRun({ text: formatDateFR(guarantee5y.toISOString()), size: 20, font: "Arial" }),
      ],
    })
  );

  // General notes
  if (data.general_notes) {
    elements.push(
      new Paragraph({
        spacing: { before: 200, after: 200 },
        children: [
          new TextRun({ text: "Notes : ", bold: true, size: 20, font: "Arial" }),
          new TextRun({ text: data.general_notes, size: 20, font: "Arial" }),
        ],
      })
    );
  }

  // Signatures
  const sigSectionNum = sectionNum + 1;
  elements.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200 },
      children: [
        new TextRun({ text: `${sigSectionNum}. Signatures`, bold: true, size: 24, font: "Arial" }),
      ],
    })
  );

  for (const p of data.participants) {
    elements.push(
      new Paragraph({
        spacing: { before: 200, after: 50 },
        children: [
          new TextRun({ text: p.name, bold: true, size: 20, font: "Arial" }),
          new TextRun({ text: ` — ${p.role} — ${p.company}`, size: 20, font: "Arial", color: "666666" }),
        ],
      })
    );
    elements.push(
      new Paragraph({
        spacing: { after: 50 },
        children: [
          new TextRun({ text: "Date : ________________    Signature : ________________________________", size: 18, font: "Arial", color: "999999" }),
        ],
      })
    );
    elements.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
  }

  // Footer
  elements.push(
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
    sections: [{ children: elements }],
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: body, error: parseError } = await parseBody<ReceptionData>(request);
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
    }

    const validationError = validateRequired(body as any, ["project_id", "reception_date"]);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const doc = createReceptionDocument(body);
    const buffer = await Packer.toBuffer(doc);
    const uint8 = new Uint8Array(buffer);

    const fileName = `PVR-${body.project_code || "PROJ"}-001.docx`;

    // ── Save reception record to DB ──
    let dbSaveSuccess = false;
    let dbSaveError = "";
    try {
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("users")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.organization_id) {
        // Ensure the "audio" bucket exists (auto-create if missing)
        try {
          const { data: buckets } = await admin.storage.listBuckets();
          const bucketExists = buckets?.some((b: { name: string }) => b.name === "audio");
          if (!bucketExists) {
            console.log("[GeneratePV] Creating missing 'audio' bucket");
            await admin.storage.createBucket("audio", { public: true });
          }
        } catch (bucketErr) {
          console.warn("[GeneratePV] Bucket check/create failed:", bucketErr);
        }

        // Upload DOCX to storage — check for errors
        const storagePath = `closure/${profile.organization_id}/${body.project_id}/${fileName}`;
        const { error: uploadError } = await admin.storage.from("audio").upload(storagePath, uint8, {
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: true,
        });

        if (uploadError) {
          console.error("[ClosureGeneratePV] Storage upload failed:", uploadError.message);
          // Try alternative path without orgId subfolder
          const altPath = `closure/${body.project_id}/${fileName}`;
          const { error: altError } = await admin.storage.from("audio").upload(altPath, uint8, {
            contentType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            upsert: true,
          });
          if (altError) {
            console.error("[ClosureGeneratePV] Alt storage upload also failed:", altError.message);
          } else {
            console.log("[ClosureGeneratePV] Alt storage upload succeeded at:", altPath);
          }
        } else {
          console.log("[ClosureGeneratePV] Storage upload succeeded at:", storagePath);
        }

        const { data: urlData } = admin.storage
          .from("audio")
          .getPublicUrl(storagePath);

        // Calculate guarantee dates
        const receptionDate = new Date(body.reception_date);
        const g2y = new Date(receptionDate);
        g2y.setFullYear(g2y.getFullYear() + 2);
        const g5y = new Date(receptionDate);
        g5y.setFullYear(g5y.getFullYear() + 5);

        // Delete any existing reception for this project (regeneration)
        const { error: deleteErr } = await (admin as any)
          .from("project_receptions")
          .delete()
          .eq("project_id", body.project_id);

        if (deleteErr) {
          console.warn("[ClosureGeneratePV] Delete old reception failed:", deleteErr.message);
          // If table doesn't exist, this will fail — that's OK, we'll try insert anyway
        }

        // Insert new reception record
        const { error: insertErr } = await (admin as any).from("project_receptions").insert({
          project_id: body.project_id,
          organization_id: profile.organization_id,
          reception_type: body.reception_type || "provisional",
          reception_date: body.reception_date,
          reception_location: body.reception_location || "",
          status: "completed",
          participants: body.participants || [],
          pv_document_url: urlData?.publicUrl || storagePath,
          lots_reception: body.lots || [],
          guarantee_2y_end: g2y.toISOString().split("T")[0],
          guarantee_5y_end: g5y.toISOString().split("T")[0],
          general_notes: body.general_notes || "",
          created_by: user.id,
        });

        if (insertErr) {
          console.error("[ClosureGeneratePV] Insert reception failed:", insertErr.message, insertErr.details, insertErr.hint);
          dbSaveError = insertErr.message;
        } else {
          dbSaveSuccess = true;
          console.log(
            "[ClosureGeneratePV] Reception record saved for project:",
            body.project_id
          );
        }
      } else {
        dbSaveError = "User has no organization_id";
      }
    } catch (dbErr: any) {
      console.error("[ClosureGeneratePV] DB save exception:", dbErr?.message || dbErr);
      dbSaveError = dbErr?.message || "Unknown DB error";
    }

    // Return DOCX file with custom headers indicating save status
    const response = new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "X-DB-Save-Status": dbSaveSuccess ? "ok" : "failed",
        "X-DB-Save-Error": dbSaveError || "",
        "X-Reception-Data": JSON.stringify({
          project_id: body.project_id,
          reception_type: body.reception_type || "provisional",
          reception_date: body.reception_date,
          db_saved: dbSaveSuccess,
        }),
      },
    });
    return response;
  } catch (error) {
    console.error("[ClosureGeneratePV] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
