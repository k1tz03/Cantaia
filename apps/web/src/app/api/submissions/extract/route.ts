import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface ExtractedPosition {
  position_number: string;
  can_code: string | null;
  description: string;
  quantity: number | null;
  unit: string;
  unit_price: number | null;
  total: number | null;
  confidence: number;
  flags: string[];
}

interface ExtractionResult {
  positions: ExtractedPosition[];
  metadata: {
    source_type: string;
    total_positions: number;
    flagged_positions: number;
    extraction_time_ms: number;
    project_suggestion: string | null;
    document_title: string | null;
    cfc_chapter: string | null;
    currency: string;
  };
}

const EXTRACTION_PROMPT = `Tu es un expert en soumissions de construction suisse.

Analyse ce document et extrais TOUTES les positions du descriptif/soumission.

## Format de sortie STRICT (JSON uniquement)

Retourne UNIQUEMENT un JSON valide, sans texte avant ni après :

{
  "positions": [
    {
      "position_number": "string — le numéro de position (ex: 211.111.101, 1.1.1, A.01)",
      "can_code": "string | null — le code CAN/NPK si identifiable",
      "description": "string — la description complète de la prestation",
      "quantity": "number | null",
      "unit": "string — m2, m3, m, pce, kg, h, fft, gl, etc.",
      "unit_price": "number | null",
      "total": "number | null",
      "confidence": "number (0-1)"
    }
  ],
  "metadata": {
    "document_title": "string | null",
    "project_name": "string | null",
    "cfc_chapter": "string | null — ex: CFC 21, CFC 25",
    "total_ht": "number | null",
    "currency": "CHF",
    "date": "string | null"
  }
}

## Règles d'extraction

1. Extrais CHAQUE ligne qui a un numéro de position, même si le prix est vide
2. Les positions intermédiaires (sous-totaux, titres de chapitre) : extrais-les avec quantity=null
3. Les unités suisses courantes : m2, m3, m, m', pce, kg, t, h, j, fft (forfait), gl (global)
4. Si un numéro CAN est reconnaissable (format NPK : xxx.xxx.xxx), extrais-le
5. Si le document est en allemand, traduis les descriptions en français
6. confidence = 0.95+ si clair, 0.7-0.95 si ambigu, <0.7 si incertain
7. Signale les anomalies : quantité=0, unité incohérente, description tronquée`;

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file size (20MB max)
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 20MB." },
        { status: 400 }
      );
    }

    // Determine file type
    const fileName = file.name.toLowerCase();
    let sourceType: string;
    if (fileName.endsWith(".pdf")) sourceType = "pdf";
    else if (fileName.endsWith(".xlsx")) sourceType = "xlsx";
    else if (fileName.endsWith(".xls")) sourceType = "xls";
    else if (fileName.endsWith(".csv")) sourceType = "csv";
    else {
      return NextResponse.json(
        { error: "Unsupported file format. Use PDF, XLSX, XLS, or CSV." },
        { status: 400 }
      );
    }

    let result: ExtractionResult;

    if (sourceType === "pdf") {
      result = await extractFromPDF(file, startTime);
    } else if (sourceType === "csv") {
      result = await extractFromCSV(file, startTime);
    } else {
      // xlsx or xls
      result = await extractFromExcel(file, startTime);
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("[submissions/extract] Error:", error);
    const status = error?.status || error?.error?.status;
    const isOverloaded = status === 529 || error?.error?.type === "overloaded_error";

    if (isOverloaded) {
      return NextResponse.json(
        { error: "Le service IA est temporairement surchargé. Veuillez réessayer dans quelques secondes." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Extraction failed" },
      { status: 500 }
    );
  }
}

async function extractFromPDF(
  file: File,
  startTime: number
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  // Convert file to base64
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  // Use Claude API for PDF extraction — model fallback chain
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  // Try models in order: Haiku 4.5 (fast, lighter) → Sonnet 4 (more capable)
  const MODELS = [
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-20250514",
  ];
  const MAX_RETRIES = 2;
  let response: any;
  let lastError: any;

  for (const model of MODELS) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[submissions/extract] Trying ${model} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        response = await client.messages.create({
          model,
          max_tokens: 16384,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "document",
                  source: {
                    type: "base64",
                    media_type: "application/pdf",
                    data: base64,
                  },
                },
                {
                  type: "text",
                  text: EXTRACTION_PROMPT,
                },
              ],
            },
          ],
        });
        console.log(`[submissions/extract] Success with ${model}`);
        break; // success
      } catch (err: any) {
        lastError = err;
        const status = err?.status || err?.error?.status;
        const isOverloaded = status === 529 || err?.error?.type === "overloaded_error";
        const isRateLimited = status === 429;

        if ((isOverloaded || isRateLimited) && attempt < MAX_RETRIES) {
          const delay = (attempt + 1) * 3000; // 3s, 6s
          console.log(`[submissions/extract] Retry ${attempt + 1}/${MAX_RETRIES} with ${model} after ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // If overloaded after all retries, try next model
        if (isOverloaded || isRateLimited) {
          console.log(`[submissions/extract] ${model} overloaded, trying next model...`);
          break;
        }

        throw err;
      }
    }
    if (response) break; // got a successful response, stop trying models
  }

  if (!response) {
    throw lastError || new Error("All models overloaded");
  }

  const textContent = response.content.find((c: any) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const parsed = parseClaudeResponse(textContent.text);
  const extractionTime = Date.now() - startTime;

  return {
    positions: parsed.positions.map((p: any) => ({
      position_number: p.position_number || "",
      can_code: p.can_code || null,
      description: p.description || "",
      quantity: p.quantity ?? null,
      unit: p.unit || "",
      unit_price: p.unit_price ?? null,
      total: p.total ?? null,
      confidence: p.confidence ?? 0.8,
      flags: detectFlags(p),
    })),
    metadata: {
      source_type: "pdf",
      total_positions: parsed.positions.length,
      flagged_positions: parsed.positions.filter(
        (p: any) => detectFlags(p).length > 0
      ).length,
      extraction_time_ms: extractionTime,
      project_suggestion: parsed.metadata?.project_name || null,
      document_title: parsed.metadata?.document_title || null,
      cfc_chapter: parsed.metadata?.cfc_chapter || null,
      currency: parsed.metadata?.currency || "CHF",
    },
  };
}

async function extractFromExcel(
  file: File,
  startTime: number
): Promise<ExtractionResult> {
  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  return parseTabularData(data, file.name.endsWith(".xls") ? "xls" : "xlsx", startTime);
}

async function extractFromCSV(
  file: File,
  startTime: number
): Promise<ExtractionResult> {
  const text = await file.text();
  const Papa = await import("papaparse");
  const parsed = Papa.default.parse(text, { header: false, skipEmptyLines: true });
  const data: any[][] = parsed.data as any[][];

  return parseTabularData(data, "csv", startTime);
}

function parseTabularData(
  data: any[][],
  sourceType: string,
  startTime: number
): ExtractionResult {
  if (data.length === 0) {
    return {
      positions: [],
      metadata: {
        source_type: sourceType,
        total_positions: 0,
        flagged_positions: 0,
        extraction_time_ms: Date.now() - startTime,
        project_suggestion: null,
        document_title: null,
        cfc_chapter: null,
        currency: "CHF",
      },
    };
  }

  // Try to detect header row
  const headerRow = data[0];
  const headerStr = headerRow.map((h: any) => String(h || "").toLowerCase()).join(" ");

  // Common header patterns for construction submissions
  const hasPositionHeader = headerStr.match(
    /pos|position|nr|num|code|npk|can/i
  );
  const startRow = hasPositionHeader ? 1 : 0;

  // Try to detect column mapping
  const colMap = detectColumns(headerRow);

  const positions: ExtractedPosition[] = [];

  for (let i = startRow; i < data.length; i++) {
    const row = data[i];
    if (!row || row.every((cell: any) => !cell && cell !== 0)) continue;

    const pos = extractPositionFromRow(row, colMap);
    if (pos) {
      positions.push(pos);
    }
  }

  const extractionTime = Date.now() - startTime;

  return {
    positions,
    metadata: {
      source_type: sourceType,
      total_positions: positions.length,
      flagged_positions: positions.filter((p) => p.flags.length > 0).length,
      extraction_time_ms: extractionTime,
      project_suggestion: null,
      document_title: null,
      cfc_chapter: null,
      currency: "CHF",
    },
  };
}

interface ColumnMap {
  position: number;
  canCode: number;
  description: number;
  quantity: number;
  unit: number;
  unitPrice: number;
  total: number;
}

function detectColumns(headerRow: any[]): ColumnMap {
  const headers = headerRow.map((h: any) => String(h || "").toLowerCase());
  const defaultMap: ColumnMap = {
    position: 0,
    canCode: -1,
    description: 1,
    quantity: 2,
    unit: 3,
    unitPrice: 4,
    total: 5,
  };

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h.match(/pos|position|nr\b|num|n°/i)) defaultMap.position = i;
    else if (h.match(/can|npk|code\s*can/i)) defaultMap.canCode = i;
    else if (h.match(/desc|texte?|bezeichnung|leistung|prestation/i))
      defaultMap.description = i;
    else if (h.match(/quantit|menge|qte|qt[eé]/i)) defaultMap.quantity = i;
    else if (h.match(/unit|einheit|unite/i)) defaultMap.unit = i;
    else if (h.match(/prix\s*unit|einheitspreis|ep|up|unit\s*price/i))
      defaultMap.unitPrice = i;
    else if (h.match(/total|montant|betrag|amount|gesamt/i))
      defaultMap.total = i;
  }

  return defaultMap;
}

function extractPositionFromRow(
  row: any[],
  colMap: ColumnMap
): ExtractedPosition | null {
  const posNum = String(row[colMap.position] || "").trim();
  const desc = String(row[colMap.description] || "").trim();

  // Skip empty rows or rows without position number or description
  if (!posNum && !desc) return null;
  if (desc.length < 2 && !posNum) return null;

  const quantity = parseNumber(row[colMap.quantity]);
  const unitPrice = parseNumber(row[colMap.unitPrice]);
  const total = parseNumber(row[colMap.total]);
  const canCode =
    colMap.canCode >= 0 ? String(row[colMap.canCode] || "").trim() : null;
  const unit = String(row[colMap.unit] || "").trim();

  const position: ExtractedPosition = {
    position_number: posNum,
    can_code: canCode || null,
    description: desc,
    quantity,
    unit,
    unit_price: unitPrice,
    total,
    confidence: 0.9,
    flags: [],
  };

  position.flags = detectFlags(position);

  return position;
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const str = String(value)
    .replace(/['\s]/g, "")
    .replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function detectFlags(pos: any): string[] {
  const flags: string[] = [];
  if (pos.quantity === 0) flags.push("zero_quantity");
  if (pos.description && pos.description.length < 5)
    flags.push("short_description");
  if (pos.confidence !== undefined && pos.confidence < 0.7)
    flags.push("low_confidence");
  return flags;
}

function parseClaudeResponse(text: string): any {
  // Try to parse JSON from Claude's response
  // Claude might wrap it in ```json ... ```
  let jsonStr = text.trim();

  // Remove markdown code blocks
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Extract JSON object if surrounded by text
  const objectMatch = jsonStr.match(/\{[\s\S]*/);
  if (objectMatch) {
    jsonStr = objectMatch[0];
  }

  // Try direct parse first
  try {
    return JSON.parse(jsonStr);
  } catch {
    // JSON is likely truncated — try to repair it
    console.log("[parseClaudeResponse] Direct parse failed, attempting repair...");
    return repairTruncatedJSON(jsonStr);
  }
}

/**
 * Attempt to repair truncated JSON from Claude.
 * When max_tokens is hit, the JSON gets cut mid-stream.
 * We try to close open arrays/objects and parse what we have.
 */
function repairTruncatedJSON(jsonStr: string): any {
  // Find the positions array — that's what we care about
  const positionsMatch = jsonStr.match(/"positions"\s*:\s*\[/);
  if (!positionsMatch) {
    throw new Error("Failed to parse AI response: no positions array found");
  }

  // Strategy: find the last complete object in the positions array
  // Look for the last complete "}" that closes a position object
  const posArrayStart = jsonStr.indexOf(positionsMatch[0]) + positionsMatch[0].length;

  // Find all complete position objects by matching balanced braces
  const positions: any[] = [];
  let depth = 0;
  let objectStart = -1;

  for (let i = posArrayStart; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (ch === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objectStart >= 0) {
        const objectStr = jsonStr.substring(objectStart, i + 1);
        try {
          positions.push(JSON.parse(objectStr));
        } catch {
          // Skip malformed object
        }
        objectStart = -1;
      }
    }
  }

  if (positions.length === 0) {
    throw new Error("Failed to parse AI response: no valid positions found");
  }

  // Try to extract metadata if present
  let metadata: any = {};
  const metadataMatch = jsonStr.match(/"metadata"\s*:\s*(\{[^}]*\})/);
  if (metadataMatch) {
    try {
      metadata = JSON.parse(metadataMatch[1]);
    } catch {
      // ignore
    }
  }

  console.log(`[parseClaudeResponse] Repaired: extracted ${positions.length} positions from truncated JSON`);

  return { positions, metadata };
}
