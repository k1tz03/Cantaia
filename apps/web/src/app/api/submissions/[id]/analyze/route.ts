import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ANALYSIS_PROMPT = `Tu es un expert en soumissions de construction suisse (CFC / NPK).

Analyse ce document et extrais TOUS les postes du descriptif/soumission.

## Format de sortie STRICT (JSON uniquement)

Retourne UNIQUEMENT un JSON valide :

{
  "items": [
    {
      "item_number": "string — numéro de poste (ex: 1.1, 2.3.4, 211.111)",
      "description": "string — description complète de la prestation",
      "unit": "string — m2, m3, ml, m, kg, pce, forfait, gl, h, j, t, etc.",
      "quantity": number | null,
      "cfc_code": "string | null — code CFC estimé (ex: 211, 241, 271)",
      "material_group": "string — groupe de matériaux (ex: Graves, Béton, Plantations, Maçonnerie, Caniveaux, Équipements de jeux, Étanchéité, Revêtements, Terrassement, Coffrage, Ferraillage, Isolation, etc.)"
    }
  ]
}

## Règles
1. Extrais CHAQUE ligne avec un numéro de position
2. Unités suisses : m2, m3, m, m', ml, pce, kg, t, h, j, fft (forfait), gl (global)
3. Estime le code CFC basé sur la description (classification suisse)
4. Regroupe par material_group cohérent (sera utilisé pour les demandes de prix)
5. Si le document est en allemand, traduis les descriptions en français
6. Sois exhaustif — n'omets aucun poste`;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Get submission (cast to any — migration 049 schema differs from TS types)
    const { data: submissionRow } = await admin
      .from("submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!submissionRow) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    const submission = submissionRow as any;

    // Mark as analyzing
    await (admin as any).from("submissions").update({
      analysis_status: "analyzing",
      analysis_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    try {
      // Resolve file URL — migration 012 uses source_file_url, migration 049 uses file_url
      const fileUrl = submission.file_url || submission.source_file_url;
      const fileName = submission.file_name || submission.source_file_name;

      if (!fileUrl) {
        console.error("[analyze] No file URL found for submission", id, { file_url: submission.file_url, source_file_url: submission.source_file_url });
        await (admin as any).from("submissions").update({
          analysis_status: "error",
          analysis_error: "Fichier non trouvé — veuillez re-télécharger le document",
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        return NextResponse.json({ error: "Fichier non trouvé" }, { status: 400 });
      }

      // Determine file type — fallback to extension if file_type column is missing
      const fileType = submission.file_type || (fileName?.toLowerCase().endsWith(".pdf") ? "pdf" : "excel");

      let textContent: string;

      if (fileType === "pdf") {
        textContent = await extractPdfText(admin, fileUrl);
      } else {
        textContent = await extractExcelText(admin, fileUrl);
      }

      if (!textContent || textContent.length < 50) {
        console.error("[analyze] Document empty or too short", { id, fileUrl, textLength: textContent?.length ?? 0 });
        await (admin as any).from("submissions").update({
          analysis_status: "error",
          analysis_error: "Document vide ou illisible",
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        return NextResponse.json({ error: "Document vide ou illisible" }, { status: 400 });
      }

      // Call Claude for extraction
      const items = await analyzeWithClaude(textContent, fileType === "pdf" ? submission : null);

      if (!items || items.length === 0) {
        await (admin as any).from("submissions").update({
          analysis_status: "error",
          analysis_error: "Aucun poste détecté dans le document",
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        return NextResponse.json({ error: "No items detected" }, { status: 400 });
      }

      // Delete existing items (re-analysis)
      await (admin as any).from("submission_items").delete().eq("submission_id", id);

      // Insert items
      const rows = items.map((item: any) => ({
        submission_id: id,
        project_id: submission.project_id,
        item_number: item.item_number || null,
        description: item.description || "",
        unit: item.unit || null,
        quantity: item.quantity ?? null,
        cfc_code: item.cfc_code || null,
        material_group: item.material_group || "Divers",
        status: "pending",
      }));

      const { error: insertError } = await (admin.from("submission_items") as any).insert(rows);
      if (insertError) {
        console.error("[analyze] Insert error:", insertError);
        await (admin as any).from("submissions").update({
          analysis_status: "error",
          analysis_error: insertError.message,
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      // Mark as done
      await (admin as any).from("submissions").update({
        analysis_status: "done",
        analysis_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);

      return NextResponse.json({
        success: true,
        items_count: items.length,
        material_groups: [...new Set(items.map((i: any) => i.material_group))],
      });

    } catch (analysisError: any) {
      console.error("[analyze] Analysis failed:", analysisError);
      await (admin as any).from("submissions").update({
        analysis_status: "error",
        analysis_error: analysisError.message || "Analysis failed",
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      return NextResponse.json({ error: analysisError.message }, { status: 500 });
    }

  } catch (err: any) {
    console.error("[analyze] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function extractPdfText(admin: ReturnType<typeof createAdminClient>, fileUrl: string): Promise<string> {
  const { data, error } = await admin.storage.from("submissions").download(fileUrl);
  if (error) {
    console.error("[analyze] PDF download failed:", { fileUrl, error: error.message });
    return "";
  }
  if (!data) return "";
  const buffer = Buffer.from(await data.arrayBuffer());
  const pdfParseModule = await import("pdf-parse");
  const pdfParse = (pdfParseModule as any).default || pdfParseModule;
  const pdf = await pdfParse(buffer);
  return pdf.text;
}

async function extractExcelText(admin: ReturnType<typeof createAdminClient>, fileUrl: string): Promise<string> {
  const { data, error } = await admin.storage.from("submissions").download(fileUrl);
  if (error) {
    console.error("[analyze] Excel download failed:", { fileUrl, error: error.message });
    return "";
  }
  if (!data) return "";

  const buffer = Buffer.from(await data.arrayBuffer());
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    // Try structured parsing first (first row = headers)
    let rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

    // If structured parsing yields nothing, try raw row-based parsing
    // (handles sheets where first row isn't a clean header)
    if (rows.length === 0) {
      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
      // Filter out completely empty rows
      const nonEmpty = rawRows.filter((r: any[]) => r.some((c: any) => c !== null && c !== ""));
      if (nonEmpty.length > 0) {
        parts.push(
          `Feuille: ${name}\n` +
          nonEmpty.map((r: any[]) => r.join(" | ")).join("\n")
        );
      }
      continue;
    }

    const headers = Object.keys(rows[0] as Record<string, unknown>);
    parts.push(
      `Feuille: ${name}\nColonnes: ${headers.join(" | ")}\n` +
      rows.map((r: any) => Object.values(r).join(" | ")).join("\n")
    );
  }

  if (parts.length === 0) {
    console.warn("[analyze] Excel file has no non-empty sheets:", { fileUrl, sheetNames: workbook.SheetNames });
  }

  return parts.join("\n\n");
}

async function analyzeWithClaude(textContent: string, _pdfSubmission: any | null): Promise<any[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, timeout: 120_000 });

  // For PDFs stored in Supabase, use text extraction result
  // For very large documents, truncate to avoid token limits
  const truncated = textContent.length > 100_000
    ? textContent.slice(0, 100_000) + "\n\n[Document tronqué à 100k caractères]"
    : textContent;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 16384,
    system: ANALYSIS_PROMPT,
    messages: [
      {
        role: "user",
        content: `Analyse ce document de soumission et extrais tous les postes :\n\n${truncated}`,
      },
    ],
  });

  const text = response.content.find((c: any) => c.type === "text");
  if (!text || text.type !== "text") throw new Error("No text response from Claude");

  return parseJsonResponse(text.text);
}

function parseJsonResponse(text: string): any[] {
  let jsonStr = text.trim();

  // Remove markdown code blocks
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  // Extract JSON object
  const objectMatch = jsonStr.match(/\{[\s\S]*/);
  if (objectMatch) jsonStr = objectMatch[0];

  try {
    const parsed = JSON.parse(jsonStr);
    return parsed.items || parsed.positions || [];
  } catch {
    // Try to repair truncated JSON — extract complete objects
    const items: any[] = [];
    let depth = 0;
    let objectStart = -1;

    for (let i = 0; i < jsonStr.length; i++) {
      if (jsonStr[i] === "{") {
        if (depth === 0) objectStart = i;
        depth++;
      } else if (jsonStr[i] === "}") {
        depth--;
        if (depth === 0 && objectStart >= 0) {
          try {
            const obj = JSON.parse(jsonStr.substring(objectStart, i + 1));
            if (obj.description || obj.item_number) items.push(obj);
          } catch { /* skip malformed */ }
          objectStart = -1;
        }
      }
    }

    if (items.length === 0) throw new Error("Failed to parse AI response");
    console.log(`[analyze] Repaired truncated JSON: ${items.length} items`);
    return items;
  }
}
