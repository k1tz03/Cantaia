import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface ExportPosition {
  position_number: string;
  can_code: string | null;
  description: string;
  quantity: number | null;
  unit: string;
  unit_price: number | null;
  total: number | null;
}

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { positions, format, metadata } = body as {
      positions: ExportPosition[];
      format: "xlsx" | "csv" | "sia451";
      metadata?: {
        document_title?: string;
        project_name?: string;
        cfc_chapter?: string;
      };
    };

    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json(
        { error: "No positions to export" },
        { status: 400 }
      );
    }

    if (format === "xlsx") {
      return exportExcel(positions, metadata);
    } else if (format === "csv") {
      return exportCSV(positions);
    } else if (format === "sia451") {
      return exportSIA451(positions, metadata);
    } else {
      return NextResponse.json(
        { error: "Unsupported export format" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("[submissions/export] Error:", error);
    return NextResponse.json(
      { error: error.message || "Export failed" },
      { status: 500 }
    );
  }
}

async function exportExcel(
  positions: ExportPosition[],
  metadata?: any
): Promise<NextResponse> {
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();

  const data = positions.map((p) => ({
    "N° Position": p.position_number,
    "Code CAN": p.can_code || "",
    Description: p.description,
    "Quantité": p.quantity,
    "Unité": p.unit,
    "Prix unitaire": p.unit_price,
    Total: p.total,
  }));

  const ws = XLSX.utils.json_to_sheet(data);

  ws["!cols"] = [
    { wch: 15 },
    { wch: 12 },
    { wch: 60 },
    { wch: 12 },
    { wch: 8 },
    { wch: 15 },
    { wch: 15 },
  ];

  const sheetName = metadata?.cfc_chapter || "Soumission";
  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="soumission_${Date.now()}.xlsx"`,
    },
  });
}

function exportCSV(positions: ExportPosition[]): NextResponse {
  const headers = [
    "N° Position",
    "Code CAN",
    "Description",
    "Quantité",
    "Unité",
    "Prix unitaire",
    "Total",
  ];

  const rows = positions.map((p) =>
    [
      escapeCSV(p.position_number),
      escapeCSV(p.can_code || ""),
      escapeCSV(p.description),
      p.quantity != null ? String(p.quantity) : "",
      escapeCSV(p.unit),
      p.unit_price != null ? String(p.unit_price) : "",
      p.total != null ? String(p.total) : "",
    ].join(";")
  );

  const csv = [headers.join(";"), ...rows].join("\r\n");

  // BOM for Excel UTF-8 compatibility
  const bom = "\uFEFF";
  const csvWithBom = bom + csv;

  return new NextResponse(csvWithBom, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="soumission_${Date.now()}.csv"`,
    },
  });
}

function exportSIA451(
  positions: ExportPosition[],
  metadata?: any
): NextResponse {
  // SIA 451 simplified format
  // Each record is a fixed-width text line
  let output = "";

  // Header record
  const date = new Date();
  const dateStr = `${date.getDate().toString().padStart(2, "0")}.${(date.getMonth() + 1).toString().padStart(2, "0")}.${date.getFullYear()}`;
  output += `01;92;Cantaia;${metadata?.project_name || ""};${dateStr}\r\n`;

  // Position records
  for (const pos of positions) {
    const qty = pos.quantity != null ? pos.quantity.toString() : "";
    const up = pos.unit_price != null ? pos.unit_price.toString() : "";
    const total = pos.total != null ? pos.total.toString() : "";

    output += `21;${pos.position_number};${pos.description.substring(0, 120)};${qty};${pos.unit};${up};${total}\r\n`;
  }

  // Footer record
  output += `99;${positions.length}\r\n`;

  return new NextResponse(output, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="soumission_${Date.now()}.01s"`,
    },
  });
}

function escapeCSV(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
