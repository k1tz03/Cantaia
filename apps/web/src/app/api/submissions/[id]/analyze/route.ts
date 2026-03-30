import { NextRequest, NextResponse, after } from "next/server";
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

    // Return 202 immediately — analysis runs inside after() which keeps the Vercel
    // function alive until it completes (up to maxDuration=300s) even though the
    // HTTP response has already been sent. The client is fire-and-forget and polls
    // analysis_status in the DB, so it never waits for this response anyway.
    //
    // Why after() matters here:
    //   • Without after(), a synchronous analysis holds the HTTP connection open for
    //     ~180s. If Vercel's infrastructure decides to recycle the request context
    //     (e.g. due to idle detection or memory pressure), the function is killed
    //     mid-analysis without any chance to write the error to the DB.
    //   • after() decouples execution from the HTTP lifecycle: the 202 closes the
    //     connection immediately and after() gets a dedicated budget up to maxDuration.
    after(async () => {
      await performAnalysis(id, submission);
    });

    return NextResponse.json({ success: true }, { status: 202 });

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

// ── PDF Vision helpers ──────────────────────────────────────

// Max pages per Claude Vision call.
// 5 pages per batch: a 74-page scanned PDF at ~150 MB total → ~10 MB per 5-page sub-PDF
// → ~13 MB base64, safely under Anthropic's 32 MB inline-base64 limit.
// 10-page batches (previous value) were pushing 18–36 MB base64 for heavy scans,
// which caused Anthropic to return 413/overload errors (silently caught → empty text
// for every batch → combined text < 20 chars → final "Impossible d'extraire" error).
// Trade-off: ceil(74/5)=15 batches in 5 groups-of-3 × ~20s/group ≈ 100s — well within 300s.
const VISION_PAGES_PER_BATCH = 5;

// PDFs larger than this threshold are almost certainly scanned images — skip pdfjs
// text extraction entirely (it would return < 100 meaningful chars anyway) and go
// straight to Vision. This avoids loading the full PDF twice into memory:
// pdfjs + pdf-lib simultaneously on a 100 MB file = ~500 MB peak → OOM risk.
const SKIP_PDFJS_THRESHOLD_BYTES = 2 * 1024 * 1024; // 2 MB

/** Process a large PDF by splitting it into batches and running Claude Vision on each.
 *
 *  Strategy: load the source PDF ONCE, extract batch sub-PDFs sequentially (CPU-bound, fast),
 *  then fire Vision API calls in groups of MAX_CONCURRENT (I/O-bound).
 *
 *  Why groups instead of all-parallel:
 *    • Reduces peak base64-string memory: 3 × 25 MB instead of N × 25 MB
 *    • Guards against hitting Anthropic's per-minute rate limit on concurrent requests
 *    • Worst-case timing: ceil(N/3) groups × ~75 s/group — well within 300 s for ≤ 200 pages
 *
 *  Why NOT load PDF per-batch inside Promise.all:
 *    • That was the original bug: N parallel PDFDocument.load() calls on a large scanned PDF
 *      consumed N × PDF_size of memory simultaneously → OOM → Vercel process killed silently
 */
async function processLargePdf(
  pdfBytes: Buffer,
  pagesHint: number,           // page count from pdfjs (may differ from pdf-lib's count)
  pagesPerBatch: number,
  client: any,
): Promise<string> {
  const MAX_CONCURRENT = 3;

  const { PDFDocument } = await import("pdf-lib");
  const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  // Use pdf-lib's authoritative page count — pdfjs may count differently
  const totalPages = srcDoc.getPageCount();
  if (totalPages !== pagesHint) {
    console.warn(`[ANALYZE] Page count mismatch: pdfjs=${pagesHint}, pdf-lib=${totalPages} — using pdf-lib`);
  }

  const batchCount = Math.ceil(totalPages / pagesPerBatch);
  console.log(`[ANALYZE] Large PDF: ${totalPages} pages → ${batchCount} batches × ${pagesPerBatch}, groups of ${MAX_CONCURRENT}`);

  const orderedResults: string[] = new Array(batchCount).fill("");
  // Collect errors from individual batches — shown in the final error message if all batches fail,
  // so the user (and developer) can see the real Anthropic error instead of the generic fallback.
  const batchErrors: string[] = [];

  for (let groupStart = 0; groupStart < batchCount; groupStart += MAX_CONCURRENT) {
    const groupEnd = Math.min(groupStart + MAX_CONCURRENT, batchCount);

    // ── Phase A: extract this group's sub-PDFs sequentially (single srcDoc, CPU-bound) ──
    const groupBatches: { idx: number; buf: Buffer; label: string }[] = [];
    for (let i = groupStart; i < groupEnd; i++) {
      const startPage = i * pagesPerBatch;
      const endPage = Math.min(startPage + pagesPerBatch - 1, totalPages - 1);
      const newDoc = await PDFDocument.create();
      const indices = Array.from({ length: endPage - startPage + 1 }, (_, j) => startPage + j);
      const copied = await newDoc.copyPages(srcDoc, indices);
      copied.forEach(p => newDoc.addPage(p));
      const buf = Buffer.from(await newDoc.save());
      const label = `batch ${i + 1}/${batchCount} (pages ${startPage + 1}–${endPage + 1})`;
      groupBatches.push({ idx: i, buf, label });
      console.log(`[ANALYZE] Extracted ${label}: ${(buf.length / 1024).toFixed(0)} KB (base64: ~${((buf.length * 4) / 3 / 1024).toFixed(0)} KB)`);
    }

    // ── Phase B: fire this group's Vision calls in parallel (I/O-bound) ──
    await Promise.all(groupBatches.map(async ({ idx, buf, label }) => {
      try {
        const batchText = await claudeVisionOnPdfBuffer(client, buf, label);
        console.log(`[ANALYZE] ${label}: ${batchText.length} chars extracted`);
        orderedResults[idx] = batchText;
      } catch (batchErr: any) {
        const errDetail = `${label}: ${batchErr.message}${batchErr.status ? ` (HTTP ${batchErr.status})` : ""}`;
        console.error(`[ANALYZE] Vision error — ${errDetail}`);
        batchErrors.push(errDetail);
        // Leave orderedResults[idx] = "" — partial text is better than nothing
      }
    }));

    console.log(`[ANALYZE] Group ${Math.floor(groupStart / MAX_CONCURRENT) + 1}/${Math.ceil(batchCount / MAX_CONCURRENT)} complete`);
  }

  const combined = orderedResults.filter(t => t.length > 0).join("\n\n");
  if (combined.length < 20) {
    // Surface the first batch error so the user sees the real cause, not the generic fallback.
    const firstErr = batchErrors[0] ? ` Erreur Vision: ${batchErrors[0]}` : "";
    throw new Error(
      `Impossible d'extraire le texte de ce PDF (${totalPages} pages, ${batchCount} batches).${firstErr} ` +
      "Le document est peut-être protégé par mot de passe, corrompu, ou composé d'images sans couche texte."
    );
  }

  console.log(`[ANALYZE] Vision batching complete: ${combined.length} chars from ${batchCount} batches`);
  return combined;
}

/** Call Claude Vision on a single PDF buffer (base64) and return extracted text */
async function claudeVisionOnPdfBuffer(
  client: any,
  pdfBuffer: Buffer,
  batchLabel: string
): Promise<string> {
  const base64 = pdfBuffer.toString("base64");
  console.log(`[ANALYZE] Claude Vision ${batchLabel}: ${(pdfBuffer.length / 1024).toFixed(0)} KB`);

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

  return (response.content[0] as any)?.text || "";
}

// ── Main PDF extraction ─────────────────────────────────────

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

  if (!data) throw new Error(`Le fichier PDF est vide ou inaccessible (path: ${fileUrl})`);

  const buffer = Buffer.from(await data.arrayBuffer());
  console.log(`[ANALYZE] PDF buffer: ${(buffer.length / 1024).toFixed(1)} KB`);

  if (buffer.length < 100) {
    throw new Error(`Le fichier PDF est trop petit (${buffer.length} bytes) — fichier corrompu ou vide`);
  }

  // ── Step 2: Try pdfjs-dist (fast, free — works on text-based PDFs) ──
  // Skip entirely for large files: a construction soumission > 2 MB is almost
  // certainly a scanned image PDF (pdfjs would return < 100 meaningful chars anyway).
  // Skipping pdfjs on large files saves 100–300 MB of peak memory because pdfjs
  // and pdf-lib would otherwise both hold the full PDF in memory simultaneously.
  let pdfText = "";
  let totalPages = 0;

  if (buffer.length <= SKIP_PDFJS_THRESHOLD_BYTES) {
    try {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const loadingTask = (pdfjsLib as any).getDocument({ data: new Uint8Array(buffer) });
      const doc = await loadingTask.promise;
      totalPages = doc.numPages;
      const textParts: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        // Filter items that have actual alphanumeric content
        const pageText = content.items
          .map((item: any) => ("str" in item ? item.str : ""))
          .join(" ")
          .trim();
        if (pageText.length > 0) textParts.push(pageText);
      }
      pdfText = textParts.join("\n");
      // Count actual meaningful characters (alphanumeric, not just whitespace)
      const meaningfulChars = (pdfText.match(/[a-zA-Z0-9àâäéèêëîïôöùûüçæœÀÂÄÉÈÊËÎÏÔÖÙÛÜÇÆŒ]/g) || []).length;
      console.log(`[ANALYZE] pdfjs: ${pdfText.length} chars, ${meaningfulChars} meaningful, ${totalPages} pages`);

      // If pdfjs got real text content, use it directly (no API cost, no token limits)
      if (meaningfulChars >= 100) {
        console.log(`[ANALYZE] Using pdfjs text (${meaningfulChars} meaningful chars)`);
        return pdfText;
      }
      console.log(`[ANALYZE] pdfjs text insufficient (${meaningfulChars} meaningful chars) — scanned PDF, using Vision`);
    } catch (pdfErr: any) {
      console.warn("[ANALYZE] pdfjs extraction failed:", pdfErr.message);
    }
  } else {
    console.log(`[ANALYZE] Large PDF (${(buffer.length / 1024 / 1024).toFixed(1)} MB) — skipping pdfjs, going straight to Vision`);
  }

  // ── Step 3: Claude Vision — process in batches of 20 pages to stay under 200k token limit ──
  // pdf-lib (pure JS) lets us extract page subsets without native dependencies
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurée");

  const AnthropicModule = await import("@anthropic-ai/sdk");
  const Anthropic = (AnthropicModule as any).default || AnthropicModule;
  const client = new Anthropic({ apiKey, timeout: 120_000 });

  // Get total page count from pdf-lib if pdfjs didn't tell us
  if (totalPages === 0) {
    try {
      const { PDFDocument } = await import("pdf-lib");
      const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      totalPages = srcDoc.getPageCount();
    } catch {
      // If we can't even open it, just try sending the whole thing
      totalPages = 1;
    }
  }

  console.log(`[ANALYZE] Vision batching: ${totalPages} pages, ${VISION_PAGES_PER_BATCH} per batch`);

  // If small enough to send whole, send directly (avoid pdf-lib overhead)
  if (totalPages <= VISION_PAGES_PER_BATCH) {
    try {
      const text = await claudeVisionOnPdfBuffer(client, buffer, `full PDF (${totalPages} pages)`);
      if (text.length < 20) {
        throw new Error(
          "Le PDF ne contient pas de texte exploitable — " +
          "le document est peut-être une image scannée sans OCR, ou protégé par mot de passe."
        );
      }
      return text;
    } catch (e: any) {
      if (e.message?.startsWith("Le PDF")) throw e;
      console.error("[ANALYZE] Claude Vision single-batch error:", e.message, e.status);
      const statusMsg = e.status ? ` (HTTP ${e.status})` : "";
      throw new Error(`Erreur lors de la lecture du PDF par l'IA${statusMsg} : ${e.message}`);
    }
  }

  // Large PDF: delegate to processLargePdf which loads the source document once,
  // extracts batch sub-PDFs sequentially, and fires Vision calls in groups of 3.
  return processLargePdf(buffer, totalPages, VISION_PAGES_PER_BATCH, client);
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
