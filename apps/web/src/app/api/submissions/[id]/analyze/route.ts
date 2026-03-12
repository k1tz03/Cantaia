import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Allow up to 300s on Vercel serverless (Pro plan) — 60s for Hobby
export const maxDuration = 300;

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
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Verify user's organization
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Get submission (cast to any — migration 049 schema differs from TS types)
    const { data: submissionRow } = await admin
      .from("submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!submissionRow) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    const submission = submissionRow as any;

    // Verify submission's project belongs to user's org
    if (submission.project_id) {
      const { data: projCheck } = await (admin as any)
        .from("projects")
        .select("organization_id")
        .eq("id", submission.project_id)
        .maybeSingle();
      if (!projCheck || projCheck.organization_id !== userProfile.organization_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Mark as analyzing
    await (admin as any).from("submissions").update({
      analysis_status: "analyzing",
      analysis_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    try {
      console.time("[ANALYZE] total");

      // Resolve file URL — migration 012 uses source_file_url, migration 049 uses file_url
      const fileUrl = submission.file_url || submission.source_file_url;
      const fileName = submission.file_name || submission.source_file_name;

      if (!fileUrl) {
        console.error("[ANALYZE] No file URL found for submission", id, { file_url: submission.file_url, source_file_url: submission.source_file_url });
        await (admin as any).from("submissions").update({
          analysis_status: "error",
          analysis_error: "Fichier non trouvé — veuillez re-télécharger le document",
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        return NextResponse.json({ error: "Fichier non trouvé" }, { status: 400 });
      }

      // Determine file type — fallback to extension if file_type column is missing
      const fileType = submission.file_type || (fileName?.toLowerCase().endsWith(".pdf") ? "pdf" : "excel");
      console.log(`[ANALYZE] File: ${fileName} (${fileType}), URL: ${fileUrl}`);

      let textContent: string;

      console.time("[ANALYZE] download + parse");
      if (fileType === "pdf") {
        textContent = await extractPdfText(admin, fileUrl);
      } else {
        textContent = await extractExcelText(admin, fileUrl);
      }
      console.timeEnd("[ANALYZE] download + parse");
      console.log(`[ANALYZE] Extracted text: ${textContent.length} chars`);

      if (!textContent || textContent.length < 50) {
        console.error("[ANALYZE] Document empty or too short", { id, fileUrl, textLength: textContent?.length ?? 0 });
        await (admin as any).from("submissions").update({
          analysis_status: "error",
          analysis_error: "Document vide ou illisible",
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        console.timeEnd("[ANALYZE] total");
        return NextResponse.json({ error: "Document vide ou illisible" }, { status: 400 });
      }

      // Call Claude for extraction
      console.time("[ANALYZE] claude call");
      const items = await analyzeWithClaude(textContent);
      console.timeEnd("[ANALYZE] claude call");
      console.log(`[ANALYZE] Claude returned ${items.length} items`);

      if (!items || items.length === 0) {
        await (admin as any).from("submissions").update({
          analysis_status: "error",
          analysis_error: "Aucun poste détecté dans le document",
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        console.timeEnd("[ANALYZE] total");
        return NextResponse.json({ error: "No items detected" }, { status: 400 });
      }

      // Delete existing items (re-analysis)
      console.time("[ANALYZE] db insert");
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
      console.timeEnd("[ANALYZE] db insert");

      if (insertError) {
        console.error("[ANALYZE] Insert error:", insertError);
        await (admin as any).from("submissions").update({
          analysis_status: "error",
          analysis_error: insertError.message,
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        console.timeEnd("[ANALYZE] total");
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      // Mark as done
      await (admin as any).from("submissions").update({
        analysis_status: "done",
        analysis_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);

      console.timeEnd("[ANALYZE] total");
      console.log(`[ANALYZE] Success: ${items.length} items, ${[...new Set(items.map((i: any) => i.material_group))].length} groups`);

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
    console.error("[analyze] Fatal error:", err);
    // Attempt to set error status so client polling stops
    try {
      const adminFallback = createAdminClient();
      await (adminFallback as any).from("submissions").update({
        analysis_status: "error",
        analysis_error: err.message || "Erreur inattendue",
        updated_at: new Date().toISOString(),
      }).eq("id", id);
    } catch { /* best effort */ }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function extractPdfText(admin: ReturnType<typeof createAdminClient>, fileUrl: string): Promise<string> {
  console.time("[ANALYZE] storage download");
  const { data, error } = await admin.storage.from("submissions").download(fileUrl);
  console.timeEnd("[ANALYZE] storage download");
  if (error) {
    console.error("[ANALYZE] PDF download failed:", { fileUrl, error: error.message });
    return "";
  }
  if (!data) return "";
  const buffer = Buffer.from(await data.arrayBuffer());
  console.log(`[ANALYZE] PDF buffer: ${(buffer.length / 1024).toFixed(1)} KB`);
  const pdfParseModule = await import("pdf-parse");
  const pdfParse = (pdfParseModule as any).default || pdfParseModule;
  const pdf = await pdfParse(buffer);
  return pdf.text;
}

async function extractExcelText(admin: ReturnType<typeof createAdminClient>, fileUrl: string): Promise<string> {
  console.time("[ANALYZE] storage download");
  const { data, error } = await admin.storage.from("submissions").download(fileUrl);
  console.timeEnd("[ANALYZE] storage download");
  if (error) {
    console.error("[ANALYZE] Excel download failed:", { fileUrl, error: error.message });
    return "";
  }
  if (!data) return "";

  const buffer = Buffer.from(await data.arrayBuffer());
  console.log(`[ANALYZE] Excel buffer: ${(buffer.length / 1024).toFixed(1)} KB`);
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];

    // Try structured parsing first (first row = headers)
    let rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) {
      // Fallback: raw row-based parsing
      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const nonEmpty = rawRows.filter((r: any[]) => r.some((c: any) => c !== null && c !== ""));
      if (nonEmpty.length > 0) {
        // Compact: strip empty trailing cells, skip rows with only nulls
        const compacted = nonEmpty.map((r: any[]) => {
          // Trim trailing empty cells
          let lastNonEmpty = r.length - 1;
          while (lastNonEmpty >= 0 && (r[lastNonEmpty] === null || r[lastNonEmpty] === "")) lastNonEmpty--;
          return r.slice(0, lastNonEmpty + 1).map(c => c ?? "").join(" | ");
        }).filter(line => line.trim().length > 0);

        if (compacted.length > 0) {
          parts.push(`Feuille: ${name}\n${compacted.join("\n")}`);
        }
      }
      continue;
    }

    // Structured parsing: drop columns that are mostly empty (>80% null/empty)
    const headers = Object.keys(rows[0] as Record<string, unknown>);
    const usefulHeaders = headers.filter(h => {
      const nonEmpty = rows.filter(r => {
        const v = (r as Record<string, unknown>)[h];
        return v !== null && v !== undefined && v !== "";
      });
      return nonEmpty.length > rows.length * 0.2; // Keep columns with >20% fill rate
    });

    // Use useful headers or all if filtering removed everything
    const finalHeaders = usefulHeaders.length > 0 ? usefulHeaders : headers;

    const compactRows = rows.map((r: any) => {
      return finalHeaders.map(h => {
        const v = (r as Record<string, unknown>)[h];
        return v !== null && v !== undefined && v !== "" ? String(v) : "";
      }).join(" | ");
    }).filter(line => {
      // Skip rows where all values are empty
      return line.replace(/\s*\|\s*/g, "").trim().length > 0;
    });

    if (compactRows.length > 0) {
      parts.push(
        `Feuille: ${name}\nColonnes: ${finalHeaders.join(" | ")}\n${compactRows.join("\n")}`
      );
    }
  }

  if (parts.length === 0) {
    console.warn("[ANALYZE] Excel file has no non-empty sheets:", { fileUrl, sheetNames: workbook.SheetNames });
  }

  const result = parts.join("\n\n");
  console.log(`[ANALYZE] Excel text: ${result.length} chars from ${workbook.SheetNames.length} sheets`);
  return result;
}

async function analyzeWithClaude(textContent: string): Promise<any[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, timeout: 120_000 });

  const MAX_CHUNK_CHARS = 80_000; // ~20K tokens — Haiku handles this well within timeout

  // If document fits in one chunk, process directly
  if (textContent.length <= MAX_CHUNK_CHARS) {
    return analyzeChunk(client, textContent);
  }

  // Split into chunks by lines, respecting sheet boundaries
  console.log(`[ANALYZE] Large document (${textContent.length} chars), splitting into chunks`);
  const chunks: string[] = [];
  const lines = textContent.split("\n");
  let current = "";

  for (const line of lines) {
    if ((current.length + line.length + 1) > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(current);
      current = "";
    }
    current += (current ? "\n" : "") + line;
  }
  if (current.length > 0) chunks.push(current);

  console.log(`[ANALYZE] Split into ${chunks.length} chunks: ${chunks.map(c => c.length).join(", ")} chars`);

  // Process chunks sequentially (avoid API rate limits)
  const allItems: any[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[ANALYZE] Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
    const items = await analyzeChunk(client, chunks[i], i + 1, chunks.length);
    allItems.push(...items);
  }

  return allItems;
}

async function analyzeChunk(
  client: InstanceType<typeof import("@anthropic-ai/sdk").default>,
  text: string,
  chunkIndex?: number,
  totalChunks?: number
): Promise<any[]> {
  const estimatedTokens = Math.round(text.length / 4);
  const chunkLabel = chunkIndex ? ` (chunk ${chunkIndex}/${totalChunks})` : "";
  console.log(`[ANALYZE] tokens estimés${chunkLabel}: ${estimatedTokens} (${text.length} chars)`);

  // 120s timeout — works with maxDuration=300
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout: l'analyse a pris trop de temps (>120s). Réessayez ou réduisez la taille du document.")), 120_000)
  );

  const chunkNote = totalChunks && totalChunks > 1
    ? `\n\n[Partie ${chunkIndex}/${totalChunks} du document]`
    : "";

  const response = await Promise.race([
    client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16384,
      system: ANALYSIS_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyse ce document de soumission et extrais tous les postes :\n\n${text}${chunkNote}`,
        },
      ],
    }),
    timeoutPromise,
  ]);

  const textBlock = response.content.find((c: any) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");

  console.log(`[ANALYZE] Claude response${chunkLabel}: ${textBlock.text.length} chars`);

  return parseJsonResponse(textBlock.text);
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
    console.log(`[ANALYZE] Repaired truncated JSON: ${items.length} items`);
    return items;
  }
}
