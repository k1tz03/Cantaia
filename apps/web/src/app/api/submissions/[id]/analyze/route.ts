import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkUsageLimit } from "@cantaia/config/plan-features";

// Allow up to 300s on Vercel serverless (Pro plan) — 60s for Hobby
export const maxDuration = 300;

const ANALYSIS_PROMPT = `Tu es un expert en soumissions de construction suisse (normes CFC/NPK). Extrais TOUS les postes du document fourni.

# FORMAT DE SORTIE
JSON uniquement — aucun texte avant ou après.
{"items":[{"item_number":"1.1","description":"...","unit":"m²","quantity":10,"cfc_code":"211","material_group":"Béton armé","product_name":"Sika 101","confidence":85}]}

# CHAMPS PAR POSTE
- item_number: numéro de poste tel qu'il apparaît dans le document (ex: "1.1", "2.3.1", "401")
- description: description complète de la prestation, traduite en français si nécessaire
- unit: unité normalisée (voir table ci-dessous)
- quantity: nombre extrait. null si absent. NE PAS inventer de quantité.
- cfc_code: code CFC suisse estimé (voir table ci-dessous)
- material_group: groupe de matériaux (voir liste ci-dessous)
- product_name: nom de produit/marque spécifique si mentionné. null si générique.
- confidence: score de confiance 0-100 pour cet item. 100 = données clairement lisibles et sans ambiguïté. 50 = interprétation incertaine. 0 = deviné. Facteurs: lisibilité du texte, ambiguïté du CFC, quantité explicite vs déduite.

# NORMALISATION DES UNITÉS
| Document        | Normalisé |
|-----------------|-----------|
| m, ml, lfm, Lfm| ml        |
| m², qm, Qm     | m²        |
| m³, cbm, Cbm   | m³        |
| pce, pièce, St, St., Stk, Stück | pce |
| forfait, fft, gl, Psch, Pauschale, global | fft |
| kg, Kg          | kg        |
| t, to, To       | t         |
| h, Std, Stunde  | h         |
| j, jour, Tag    | j         |
Ignore les cellules qui contiennent uniquement une unité sans quantité associée.

# DOCUMENTS MULTILINGUES (FR/DE/IT)
Les documents suisses mélangent souvent français, allemand et italien. Traduis TOUTES les descriptions en français.
Termes courants DE→FR:
- Schalung/Schalen → Coffrage
- Bewehrung/Armierung → Ferraillage/Armature
- Beton/Ortbeton → Béton/Béton coulé en place
- Mauerwerk/Backsteinmauerwerk → Maçonnerie/Maçonnerie en briques
- Abdichtung/Bauwerksabdichtung → Étanchéité/Imperméabilisation
- Wärmedämmung/Isolation → Isolation thermique
- Fenster → Fenêtres
- Türen → Portes
- Fassade/Aussenwandbekleidung → Façade/Revêtement extérieur
- Dach/Bedachung → Toiture
- Bodenbelag → Revêtement de sol
- Wandbelag → Revêtement mural
- Anstrich/Malerarbeiten → Peinture
- Elektro/Elektroinstallation → Électricité
- Heizung → Chauffage
- Sanitär → Sanitaire/Plomberie
- Lüftung/Lüftungsanlage → Ventilation
- Aushub/Erdarbeiten → Terrassement/Excavation
- Fundament/Fundation → Fondations
- Gipserarbeiten → Plâtrerie
- Schreinerarbeiten → Menuiserie
- Metallbau/Stahlbau → Construction métallique

# CODES CFC SUISSES — TABLE DE RÉFÉRENCE
| CFC   | Description                                      |
|-------|--------------------------------------------------|
| 113   | Installations de chantier                        |
| 117   | Terrassement, excavation, déblais                |
| 151   | Canalisations, drainage                          |
| 211   | Béton armé (fourniture + coulage uniquement)     |
| 211.1 | Coffrage (séparé du béton !)                     |
| 211.2 | Ferraillage, armature (séparé du béton !)        |
| 213   | Éléments préfabriqués en béton                   |
| 214   | Maçonnerie, briques, blocs                       |
| 215   | Imperméabilisation, étanchéité souterraine       |
| 221   | Fenêtres et portes extérieures                   |
| 222   | Portes intérieures                               |
| 224   | Ferblanterie, zinguerie                          |
| 225   | Couverture, toiture                              |
| 227   | Façades, revêtements extérieurs                  |
| 228   | Stores, protections solaires                     |
| 231   | Électricité courant fort                         |
| 232   | Installations électriques (courant faible, comm) |
| 234   | Ascenseurs, monte-charges                        |
| 241   | Chauffage, production de chaleur                 |
| 242   | Installations de chauffage (distribution)        |
| 244   | Ventilation, climatisation                       |
| 245   | Installations frigorifiques                      |
| 251   | Sanitaire, plomberie, conduites d'eau            |
| 261   | Plâtrerie, cloisons sèches                       |
| 271   | Étanchéité, imperméabilisation (superstructure)  |
| 273   | Isolation thermique                              |
| 281   | Revêtements de sols (carrelage, parquet, etc.)   |
| 283   | Revêtements muraux                               |
| 285   | Faux plafonds                                    |
| 286   | Peinture, tapisserie                             |
| 291   | Menuiserie intérieure, agencement                |
| 311   | Aménagements extérieurs, espaces verts           |
| 421   | Cuisine (appareils et agencement)                |

ATTENTION :
- CFC 211 = UNIQUEMENT le béton (fourniture + coulage). NE PAS y mettre coffrage ni ferraillage.
- CFC 211.1 = coffrage → toujours séparé du béton armé
- CFC 211.2 = ferraillage/armature → toujours séparé du béton armé
- CFC 271 = étanchéité en SUPERSTRUCTURE (toitures, terrasses). CFC 215 = étanchéité SOUTERRAINE.
- CFC 231/232 = électricité. CFC 241/242 = chauffage. NE PAS confondre.
- En cas de doute, attribue le code CFC le plus précis possible. Ne laisse jamais cfc_code vide si tu peux deviner la discipline.

# GROUPES DE MATÉRIAUX
Utilise UNIQUEMENT ces groupes (en français) :
Terrassement, Fondations, Béton armé, Coffrage, Ferraillage, Maçonnerie, Étanchéité, Isolation thermique, Fenêtres/Portes, Façades, Toiture, Ferblanterie, Électricité, CVC/Chauffage, Sanitaire/Plomberie, Ventilation, Revêtements sols, Revêtements murs, Peinture, Plâtrerie, Menuiserie intérieure, Faux plafonds, Construction métallique, Aménagements extérieurs, Ascenseurs, Installations de chantier, Divers

# VALIDATION DES QUANTITÉS
- REJETTE les cellules qui ressemblent à des numéros de page (1, 2, 3... en séquence)
- REJETTE les valeurs > 100'000 (ce sont probablement des montants monétaires, pas des quantités)
- SIGNALE les quantités de 0 ou négatives en mettant quantity: null
- Si une cellule combine quantité et unité (ex: "150 m²"), extrais quantity=150 et unit="m²"
- Les sous-totaux et totaux NE SONT PAS des postes — ne les inclus pas

# EXTRACTION DE NOMS DE PRODUITS
Cherche les marques/produits spécifiques et normalise :
- "Sika 101" = "Sika® 101" = "Sikaflex-101" → product_name: "Sika 101"
- "Weber.tec" = "Webertec" → product_name: "Weber.tec"
- "Hilti HIT-RE 500" = "HILTI HIT RE500" → product_name: "Hilti HIT-RE 500"
- "Geberit Silent-db20" → product_name: "Geberit Silent-db20"
- Si pas de marque spécifique, product_name: null

# RÈGLES FINALES
1. Extrais CHAQUE poste du document — sois exhaustif, ne saute aucune ligne
2. En cas de doute sur le CFC, attribue celui qui correspond le mieux à la discipline
3. Traduis systématiquement DE/IT → FR pour les descriptions
4. Regroupe les postes par material_group cohérent
5. Conserve les numéros de poste originaux du document`;

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

    // Get submission
    const { data: submissionRow } = await admin
      .from("submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!submissionRow) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    const submission = submissionRow as any;

    // Verify submission's project belongs to user's org — mandatory (no project_id = forbidden)
    if (!submission.project_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data: projCheck } = await (admin as any)
      .from("projects")
      .select("organization_id")
      .eq("id", submission.project_id)
      .maybeSingle();
    if (!projCheck || projCheck.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check AI usage limit
    const { data: orgData } = await (admin as any)
      .from("organizations")
      .select("subscription_plan")
      .eq("id", userProfile.organization_id)
      .single();

    const usageCheck = await checkUsageLimit(admin, userProfile.organization_id, orgData?.subscription_plan || "trial");
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
        { status: 429 }
      );
    }

    // Mark as analyzing BEFORE returning — also clear stale budget_estimate
    // (re-analysis creates new items with new UUIDs, old budget references old IDs)
    await (admin as any).from("submissions").update({
      analysis_status: "analyzing",
      analysis_error: null,
      budget_estimate: null,
      budget_estimated_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    // Schedule the analysis to run AFTER the response is sent.
    // This ensures the client gets an immediate 202 response.
    // The function stays alive for up to maxDuration (300s).
    after(async () => {
      await performAnalysis(id, submission);
    });

    // Return immediately — client should poll GET /api/submissions/[id] for status
    return NextResponse.json({ status: "analyzing" }, { status: 202 });

  } catch (err: any) {
    console.error("[analyze] Fatal error:", err);
    try {
      const adminFallback = createAdminClient();
      await (adminFallback as any).from("submissions").update({
        analysis_status: "error",
        analysis_error: err.message || "Unexpected error",
        updated_at: new Date().toISOString(),
      }).eq("id", id);
    } catch { /* best effort */ }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── Background analysis (runs after response is sent) ────────

async function performAnalysis(id: string, submission: any) {
  const admin = createAdminClient();
  try {
    console.time("[ANALYZE] total");

    const fileUrl = submission.file_url || submission.source_file_url;
    const fileName = submission.file_name || submission.source_file_name;

    if (!fileUrl) {
      console.error("[ANALYZE] No file URL for submission", id);
      await setAnalysisError(admin, id, "Fichier non trouvé — veuillez re-télécharger le document");
      return;
    }

    const fileType = submission.file_type || (fileName?.toLowerCase().endsWith(".pdf") ? "pdf" : "excel");
    console.log(`[ANALYZE] File: ${fileName} (${fileType}), URL: ${fileUrl}`);

    // ── Step 1: Download & parse ──
    console.time("[ANALYZE] download + parse");
    let textContent: string;
    if (fileType === "pdf") {
      textContent = await extractPdfText(admin, fileUrl);
    } else {
      textContent = await extractExcelText(admin, fileUrl);
    }
    console.timeEnd("[ANALYZE] download + parse");
    console.log(`[ANALYZE] Extracted text: ${textContent.length} chars`);

    if (!textContent || textContent.length < 50) {
      console.error("[ANALYZE] Document empty or too short", { id, fileUrl, textLength: textContent?.length ?? 0 });
      await setAnalysisError(admin, id,
        `Document vide ou illisible — le texte extrait est trop court (${textContent?.length ?? 0} caractères). ` +
        `Vérifiez que le fichier contient bien du texte (pas une image scannée sans OCR) et re-uploadez si nécessaire.`
      );
      return;
    }

    // ── Step 2: Claude extraction ──
    console.time("[ANALYZE] claude call");
    const items = await analyzeWithClaude(textContent);
    console.timeEnd("[ANALYZE] claude call");
    console.log(`[ANALYZE] Claude returned ${items.length} items`);

    if (!items || items.length === 0) {
      await setAnalysisError(admin, id, "Aucun poste détecté dans le document");
      return;
    }

    // ── Step 3: Save to DB ──
    console.time("[ANALYZE] db insert");
    await (admin as any).from("submission_items").delete().eq("submission_id", id);

    const rows = items.map((item: any) => ({
      submission_id: id,
      project_id: submission.project_id,
      item_number: item.item_number || null,      // migration 067 column
      description: item.description || "",
      unit: item.unit || null,
      quantity: item.quantity ?? null,
      cfc_subcode: item.cfc_code || null,         // cfc_code from AI → maps to existing cfc_subcode column
      material_group: item.material_group || "Divers", // migration 067 column
      product_name: item.product_name || null,
      status: "pending",                          // migration 067 column
      metadata: {                                 // migration 067 column (JSONB)
        ai_confidence: typeof item.confidence === "number" ? item.confidence : null,
        extraction_model: "claude-haiku-4-5-20251001",
        extracted_at: new Date().toISOString(),
      },
    }));

    const { error: insertError } = await (admin.from("submission_items") as any).insert(rows);
    console.timeEnd("[ANALYZE] db insert");

    if (insertError) {
      console.error("[ANALYZE] Insert error:", insertError);
      await setAnalysisError(admin, id, insertError.message);
      return;
    }

    // ── Success ──
    await (admin as any).from("submissions").update({
      analysis_status: "done",
      analysis_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    console.timeEnd("[ANALYZE] total");
    console.log(`[ANALYZE] Success: ${items.length} items, ${[...new Set(items.map((i: any) => i.material_group))].length} groups`);

  } catch (err: any) {
    console.error("[ANALYZE] Analysis failed:", err?.message, err?.stack);
    const userMessage = err.message === "Failed to parse AI response"
      ? "Erreur de parsing — l'IA n'a pas retourné un format exploitable. Réessayez."
      : (err.message || "Analysis failed");
    await setAnalysisError(admin, id, userMessage).catch(() => {});
  }
}

async function setAnalysisError(admin: ReturnType<typeof createAdminClient>, id: string, error: string) {
  await (admin as any).from("submissions").update({
    analysis_status: "error",
    analysis_error: error,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
}

// ── File extraction helpers ─────────────────────────────────

async function extractPdfText(admin: ReturnType<typeof createAdminClient>, fileUrl: string): Promise<string> {
  // ── Step 1: Download file from storage ──
  console.time("[ANALYZE] storage download");
  const { data, error } = await admin.storage.from("submissions").download(fileUrl);
  console.timeEnd("[ANALYZE] storage download");

  if (error) {
    console.error("[ANALYZE] PDF download failed:", { fileUrl, error: error.message, errorName: error.name });
    const isNotFound = error.message?.toLowerCase().includes("not found") || error.message?.includes("404");
    if (isNotFound) {
      throw new Error(
        `Fichier introuvable dans le stockage — veuillez supprimer cette soumission et re-télécharger le fichier. (path: ${fileUrl})`
      );
    }
    throw new Error(`Erreur de téléchargement du fichier PDF : ${error.message} (path: ${fileUrl})`);
  }

  if (!data) {
    throw new Error(`Le fichier PDF est vide ou inaccessible (path: ${fileUrl})`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  console.log(`[ANALYZE] PDF buffer: ${(buffer.length / 1024).toFixed(1)} KB`);

  if (buffer.length < 100) {
    throw new Error(`Le fichier PDF est trop petit (${buffer.length} bytes) — fichier corrompu ou vide`);
  }

  // ── Step 2a: Try pdfjs-dist first (fast, free, works for text-based PDFs) ──
  // Same library used successfully in /api/chat/upload — declared serverExternalPackages in next.config.ts
  let pdfText = "";
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = (pdfjsLib as any).getDocument({ data: new Uint8Array(buffer) });
    const doc = await loadingTask.promise;
    const textParts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ");
      if (pageText.trim()) textParts.push(pageText);
    }
    pdfText = textParts.join("\n");
    console.log(`[ANALYZE] pdfjs extracted: ${pdfText.length} chars from ${doc.numPages} pages`);
  } catch (pdfErr: any) {
    console.warn("[ANALYZE] pdfjs extraction failed, will try Claude Vision:", pdfErr.message);
  }

  // If pdfjs got meaningful text, use it directly (no API cost, faster)
  if (pdfText.length >= 200) {
    return pdfText;
  }

  // ── Step 2b: Fallback — Claude Vision (for scanned/image PDFs with little/no embedded text) ──
  console.log(`[ANALYZE] pdfjs text too short (${pdfText.length} chars), falling back to Claude Vision`);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurée");

  const AnthropicModule = await import("@anthropic-ai/sdk");
  const Anthropic = (AnthropicModule as any).default || AnthropicModule;
  const client = new Anthropic({ apiKey, timeout: 120_000 });

  // Claude Vision document block has a 32 MB limit; warn if close
  const base64 = buffer.toString("base64");
  const base64SizeMB = (base64.length / 1024 / 1024).toFixed(1);
  console.log(`[ANALYZE] Sending PDF to Claude Vision: ${base64SizeMB} MB base64`);

  if (buffer.length > 28 * 1024 * 1024) {
    throw new Error(
      `Le fichier PDF est trop volumineux pour l'extraction IA (${(buffer.length / 1024 / 1024).toFixed(1)} MB, max ~28 MB). ` +
      `Essayez de compresser le PDF ou de l'exporter en plusieurs fichiers.`
    );
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 16000,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          } as any,
          {
            type: "text",
            text: "Extrais TOUT le texte de ce document PDF de construction/soumission. Retourne le texte brut complet et fidèle avec : numéros de poste, descriptions complètes, unités, quantités. Conserve la structure et l'ordre du document. Ne résume rien, copie le texte intégralement.",
          },
        ],
      }],
    });

    const text = (response.content[0] as any)?.text || "";
    console.log(`[ANALYZE] Claude Vision extraction: ${text.length} chars`);

    if (!text || text.length < 20) {
      throw new Error(
        "Le PDF ne contient pas de texte exploitable — " +
        "le document est peut-être une image scannée sans OCR, ou protégé par mot de passe."
      );
    }

    return text;
  } catch (e: any) {
    // Re-throw specific errors as-is
    if (e.message?.startsWith("Le PDF") || e.message?.startsWith("Fichier") || e.message?.startsWith("Erreur") || e.message?.startsWith("Le fichier")) {
      throw e;
    }
    console.error("[ANALYZE] Claude Vision error:", e.message, e.status);
    const statusMsg = e.status ? ` (HTTP ${e.status})` : "";
    throw new Error(`Erreur lors de la lecture du PDF par l'IA${statusMsg} : ${e.message}`);
  }
}

async function extractExcelText(admin: ReturnType<typeof createAdminClient>, fileUrl: string): Promise<string> {
  console.time("[ANALYZE] storage download");
  const { data, error } = await admin.storage.from("submissions").download(fileUrl);
  console.timeEnd("[ANALYZE] storage download");

  if (error) {
    console.error("[ANALYZE] Excel download failed:", { fileUrl, error: error.message });
    const isNotFound = error.message?.toLowerCase().includes("not found") || error.message?.includes("404");
    if (isNotFound) {
      throw new Error(
        `Fichier introuvable dans le stockage — le document a peut-être été uploadé avant la configuration du bucket. ` +
        `Veuillez supprimer cette soumission et re-télécharger le fichier. (path: ${fileUrl})`
      );
    }
    throw new Error(`Erreur de téléchargement du fichier Excel : ${error.message} (path: ${fileUrl})`);
  }

  if (!data) {
    throw new Error(`Le fichier Excel est vide ou inaccessible (path: ${fileUrl})`);
  }

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
        const compacted = nonEmpty.map((r: any[]) => {
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
      return nonEmpty.length > rows.length * 0.2;
    });

    const finalHeaders = usefulHeaders.length > 0 ? usefulHeaders : headers;

    const compactRows = rows.map((r: any) => {
      return finalHeaders.map(h => {
        const v = (r as Record<string, unknown>)[h];
        return v !== null && v !== undefined && v !== "" ? String(v) : "";
      }).join(" | ");
    }).filter(line => {
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

// ── Claude analysis ─────────────────────────────────────────

async function analyzeWithClaude(textContent: string): Promise<any[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, timeout: 180_000 });

  const MAX_CHUNK_CHARS = 80_000;

  if (textContent.length <= MAX_CHUNK_CHARS) {
    return analyzeChunk(client, textContent);
  }

  // Split into chunks by lines
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

  // Process chunks in parallel (max 3 concurrent to avoid rate limits)
  const MAX_CONCURRENT = 3;
  const allItems: any[] = [];
  for (let batch = 0; batch < chunks.length; batch += MAX_CONCURRENT) {
    const batchChunks = chunks.slice(batch, batch + MAX_CONCURRENT);
    console.log(`[ANALYZE] Processing batch ${Math.floor(batch / MAX_CONCURRENT) + 1}: chunks ${batch + 1}-${batch + batchChunks.length}`);
    const results = await Promise.all(
      batchChunks.map((chunk, i) => analyzeChunk(client, chunk, batch + i + 1, chunks.length))
    );
    allItems.push(...results.flat());
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

  const chunkNote = totalChunks && totalChunks > 1
    ? `\n\n[Partie ${chunkIndex}/${totalChunks} du document]`
    : "";

  // Use assistant prefill to force JSON output + prompt caching for multi-chunk
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 16384,
    system: [{ type: "text" as const, text: ANALYSIS_PROMPT, cache_control: { type: "ephemeral" as const } }],
    messages: [
      {
        role: "user",
        content: `Analyse ce document de soumission et extrais tous les postes :\n\n${text}${chunkNote}`,
      },
      {
        role: "assistant",
        content: '{"items": [',
      },
    ],
  });

  const textBlock = response.content.find((c: any) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");

  // Reconstruct full JSON: prefill + continuation
  const fullJson = '{"items": [' + textBlock.text;
  console.log(`[ANALYZE] Claude response${chunkLabel}: ${fullJson.length} chars, stop_reason=${response.stop_reason}`);
  console.log(`[ANALYZE] Response preview${chunkLabel}: ${fullJson.substring(0, 300)}...`);

  return parseJsonResponse(fullJson);
}

function parseJsonResponse(text: string): any[] {
  let jsonStr = text.trim();

  // Remove markdown code blocks if present
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

  // Remove any leading text before the first {
  const firstBrace = jsonStr.indexOf("{");
  if (firstBrace > 0) jsonStr = jsonStr.substring(firstBrace);

  // ── Strategy 1: Direct JSON.parse ──
  try {
    const parsed = JSON.parse(jsonStr);
    const items = parsed.items || parsed.positions || (Array.isArray(parsed) ? parsed : []);
    if (items.length > 0) {
      console.log(`[ANALYZE] Parsed JSON directly: ${items.length} items`);
      return items;
    }
  } catch {
    console.log("[ANALYZE] Direct JSON.parse failed, trying repairs...");
  }

  // ── Strategy 2: Fix trailing commas + close truncated JSON ──
  try {
    let repaired = jsonStr;
    // Remove trailing commas before ] or }
    repaired = repaired.replace(/,\s*([\]}])/g, "$1");
    // If truncated, try closing the array and object
    if (!repaired.endsWith("}")) {
      // Find if we're inside the items array — close it
      repaired = repaired.replace(/,?\s*$/, "") + "]}";
    }
    const parsed = JSON.parse(repaired);
    const items = parsed.items || parsed.positions || (Array.isArray(parsed) ? parsed : []);
    if (items.length > 0) {
      console.log(`[ANALYZE] Parsed with trailing-comma/close fix: ${items.length} items`);
      return items;
    }
  } catch {
    console.log("[ANALYZE] Trailing-comma fix failed, trying object extraction...");
  }

  // ── Strategy 3: Extract individual item objects (depth=1 inside items array) ──
  const items: any[] = [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];

    // Track string boundaries (skip { } inside strings)
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === "{") {
      depth++;
      // Capture objects at depth 2 (inside {"items": [HERE]})
      // OR at depth 1 if the outer wrapper is missing
      if ((depth === 2) || (depth === 1 && i > 0)) {
        objectStart = i;
      }
    } else if (ch === "}") {
      depth--;
      if ((depth === 1 || depth === 0) && objectStart >= 0) {
        try {
          const obj = JSON.parse(jsonStr.substring(objectStart, i + 1));
          if (obj.description || obj.item_number) {
            items.push(obj);
          }
        } catch { /* skip malformed object */ }
        objectStart = -1;
      }
    }
  }

  if (items.length > 0) {
    console.log(`[ANALYZE] Extracted individual objects: ${items.length} items`);
    return items;
  }

  // ── Strategy 4: Regex extraction as last resort ──
  const objectRegex = /\{[^{}]*"(?:item_number|description)"[^{}]*\}/g;
  let match;
  while ((match = objectRegex.exec(jsonStr)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.description || obj.item_number) items.push(obj);
    } catch { /* skip */ }
  }

  if (items.length > 0) {
    console.log(`[ANALYZE] Regex-extracted objects: ${items.length} items`);
    return items;
  }

  // Log what we received for debugging
  console.error("[ANALYZE] Failed to parse. Response preview:", jsonStr.substring(0, 500));
  throw new Error("Failed to parse AI response");
}
