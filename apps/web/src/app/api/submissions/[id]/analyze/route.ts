import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkUsageLimit } from "@cantaia/config/plan-features";

// ── Architecture: client-driven chunked analysis ─────────────
//
// The client calls this route in two modes:
//
//  1. PREPARE (no body or empty body):
//     • Clears existing items, sets status = "analyzing"
//     • For Excel / text-PDFs: runs full analysis + returns {done:true}
//     • For scanned PDFs: counts pages, returns {done:false, totalChunks, pageCount}
//
//  2. CHUNK ({chunkIndex, totalChunks, pageCount}):
//     • Downloads the mini-PDF pre-extracted by PREPARE (5 pages, ~1 MB)
//     • Runs one Claude Vision call on those 5 pages (~25s)
//     • Appends items to DB; last chunk sets status = "done"
//
// Each request completes in ~37s, safely under 58s client timeout / 60s Vercel limit.
// The client orchestrates the loop and shows a progress bar.
// No after(), no watchdog, no 300s dependency.
//
export const maxDuration = 300;

// Pages processed per chunk call.
// 5 pages → 1 Vision batch (no parallelism needed) → ~25s Vision + ~12s overhead ≈ 37s per chunk.
// Previously 10 pages (2 batches in parallel) exceeded the 58s client timeout in practice.
const PAGES_PER_CHUNK = 5;

// Pages per single Claude Vision call.
// 5 pages: a scanned A4 page ≈ 2 MB → 5 pages ≈ 10 MB PDF → ~13 MB base64,
// safely under Anthropic's 32 MB inline-base64 limit.
const VISION_PAGES_PER_BATCH = 5;

// pdfjs is now tried on ALL PDFs regardless of size (no threshold).
// Fall through to Vision chunking only if pdfjs finds < 100 meaningful chars (truly scanned).

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
- "Sika 101" = "Sikaflex-101" → product_name: "Sika 101"
- "Weber.tec" → product_name: "Weber.tec"
- "Hilti HIT-RE 500" → product_name: "Hilti HIT-RE 500"
- "Geberit Silent-db20" → product_name: "Geberit Silent-db20"
- Si pas de marque spécifique, product_name: null

# RÈGLES FINALES
1. Extrais CHAQUE poste du document — sois exhaustif, ne saute aucune ligne
2. En cas de doute sur le CFC, attribue celui qui correspond le mieux à la discipline
3. Traduis systématiquement DE/IT → FR pour les descriptions
4. Regroupe les postes par material_group cohérent
5. Conserve les numéros de poste originaux du document`;

// ── POST handler ─────────────────────────────────────────────

export async function POST(
  request: NextRequest,
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

    // Check AI usage limit (only in prepare mode — chunks are part of the same analysis)
    let body: any = {};
    try { body = await request.json(); } catch {}

    const isChunkMode = typeof body.chunkIndex === "number";

    if (!isChunkMode) {
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
    }

    // Route to the correct handler
    if (isChunkMode) {
      return handleChunk(id, submission, admin, body.chunkIndex, body.totalChunks, body.pageCount);
    }
    return handlePrepare(id, submission, admin);

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

// ── PREPARE: initialize + fast-path for Excel / text PDFs ────

async function handlePrepare(
  id: string,
  submission: any,
  admin: ReturnType<typeof createAdminClient>
) {
  // Clear stale items and budget, mark as analyzing
  await (admin as any).from("submission_items").delete().eq("submission_id", id);
  await (admin as any).from("submissions").update({
    analysis_status: "analyzing",
    analysis_error: null,
    budget_estimate: null,
    budget_estimated_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  const fileUrl = submission.file_url || submission.source_file_url;
  const fileName = submission.file_name || submission.source_file_name;

  if (!fileUrl) {
    await setAnalysisError(admin, id, "Fichier non trouvé — veuillez re-télécharger le document");
    return NextResponse.json({ error: "Fichier non trouvé" }, { status: 404 });
  }

  const fileType = submission.file_type || (fileName?.toLowerCase().endsWith(".pdf") ? "pdf" : "excel");
  console.log(`[PREPARE] submission=${id} file=${fileName} type=${fileType}`);

  // ── Excel / non-PDF: full analysis in this single request (~15-30s) ──
  if (fileType !== "pdf") {
    try {
      const text = await extractExcelText(admin, fileUrl);
      if (!text || text.length < 50) {
        await setAnalysisError(admin, id, "Document vide ou illisible (moins de 50 caractères extraits)");
        return NextResponse.json({ error: "Document vide ou illisible" }, { status: 422 });
      }
      const items = await analyzeWithClaude(text);
      if (!items || items.length === 0) {
        await setAnalysisError(admin, id, "Aucun poste détecté dans le document");
        return NextResponse.json({ error: "Aucun poste détecté" }, { status: 422 });
      }
      await saveItems(admin, id, submission.project_id, items);
      await (admin as any).from("submissions").update({
        analysis_status: "done",
        analysis_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      console.log(`[PREPARE] Excel done: ${items.length} items`);
      return NextResponse.json({ success: true, done: true, itemsCount: items.length });
    } catch (err: any) {
      await setAnalysisError(admin, id, err.message || "Erreur analyse Excel").catch(() => {});
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // ── PDF: download ──
  const { data: pdfData, error: pdfError } = await admin.storage.from("submissions").download(fileUrl);
  if (pdfError || !pdfData) {
    const isNotFound = pdfError?.message?.toLowerCase().includes("not found") || pdfError?.message?.includes("404");
    const msg = isNotFound
      ? `Fichier introuvable dans le stockage — veuillez re-télécharger. (path: ${fileUrl})`
      : `Erreur de téléchargement: ${pdfError?.message} (path: ${fileUrl})`;
    await setAnalysisError(admin, id, msg);
    return NextResponse.json({ error: msg }, { status: 404 });
  }

  const buffer = Buffer.from(await pdfData.arrayBuffer());
  console.log(`[PREPARE] PDF: ${(buffer.length / 1024).toFixed(1)} KB`);

  if (buffer.length < 100) {
    const msg = `PDF trop petit (${buffer.length} bytes) — fichier corrompu ou vide`;
    await setAnalysisError(admin, id, msg);
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  // ── Try pdfjs on ALL PDFs first (text-based: fast, no Vision cost) ──
  // Even large PDFs (>2 MB) can be native-text (e.g. exported from CAD/Excel).
  // pdfjs extraction takes ~2-10s; analyzeWithClaude (Haiku) ~20-35s → done in PREPARE.
  // Fall through to Vision chunking only if pdfjs finds < 100 meaningful chars (truly scanned).
  try {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = (pdfjsLib as any).getDocument({ data: new Uint8Array(buffer) });
    const doc = await loadingTask.promise;
    const textParts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => (item as any).str || "")
        .join(" ")
        .trim();
      if (pageText.length > 0) textParts.push(pageText);
    }
    const pdfText = textParts.join("\n");
    const meaningfulChars = (pdfText.match(/[a-zA-Z0-9àâäéèêëîïôöùûüçæœÀÂÄÉÈÊËÎÏÔÖÙÛÜÇÆŒ]/g) || []).length;
    console.log(`[PREPARE] pdfjs: ${pdfText.length} chars, ${meaningfulChars} meaningful`);

    if (meaningfulChars >= 100) {
      // Text-based PDF: full analysis here (~20-35s total, well within maxDuration=300)
      const items = await analyzeWithClaude(pdfText);
      if (!items || items.length === 0) {
        await setAnalysisError(admin, id, "Aucun poste détecté dans le document");
        return NextResponse.json({ error: "Aucun poste détecté" }, { status: 422 });
      }
      await saveItems(admin, id, submission.project_id, items);
      await (admin as any).from("submissions").update({
        analysis_status: "done",
        analysis_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      console.log(`[PREPARE] Text PDF done: ${items.length} items`);
      return NextResponse.json({ success: true, done: true, itemsCount: items.length });
    }
    console.log(`[PREPARE] pdfjs insufficient (${meaningfulChars} meaningful chars) — scanned PDF, switching to Vision chunking`);
  } catch (e: any) {
    console.warn("[PREPARE] pdfjs failed:", e.message);
  }

  // ── Scanned PDF: count pages, pre-extract mini-PDFs, return chunk plan ──
  // We keep srcDoc alive after the try-catch so we can reuse it for pre-extraction.
  let srcDoc: any;
  let PDFDocumentCls: any;
  try {
    const pdfLib = await import("pdf-lib");
    PDFDocumentCls = pdfLib.PDFDocument;
    srcDoc = await PDFDocumentCls.load(buffer, { ignoreEncryption: true });
  } catch (e: any) {
    const msg = `Impossible d'ouvrir le PDF: ${e.message}`;
    await setAnalysisError(admin, id, msg);
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const pageCount: number = srcDoc.getPageCount();
  if (pageCount === 0) {
    await setAnalysisError(admin, id, "Le PDF est vide (0 pages)");
    return NextResponse.json({ error: "PDF vide" }, { status: 422 });
  }

  const totalChunks = Math.ceil(pageCount / PAGES_PER_CHUNK);
  console.log(`[PREPARE] Scanned PDF: ${pageCount} pages → ${totalChunks} chunks of ${PAGES_PER_CHUNK} pages`);

  // Pre-extract each chunk as a mini-PDF and upload while the full PDF is in memory.
  // Each CHUNK then downloads only ~2-3 MB instead of ~15 MB, saving ~12s per chunk.
  //
  // KEY FIX: fire each upload as a background Promise while extraction continues.
  // Sequential extraction (single srcDoc, ~16s) now OVERLAPS with uploads (~2s parallel)
  // instead of stacking sequentially (which would add ~16s and cause a 504 on PREPARE).
  // Total PREPARE time: ~36s instead of ~52s.
  console.time("[PREPARE] chunk pre-extraction");
  const uploadPromises: Promise<void>[] = [];
  for (let ci = 0; ci < totalChunks; ci++) {
    const cStart = ci * PAGES_PER_CHUNK;
    const cEnd = Math.min(cStart + PAGES_PER_CHUNK - 1, pageCount - 1);
    try {
      const chunkDoc = await PDFDocumentCls.create();
      const indices = Array.from({ length: cEnd - cStart + 1 }, (_: unknown, j: number) => cStart + j);
      const copied = await chunkDoc.copyPages(srcDoc, indices);
      copied.forEach((p: any) => chunkDoc.addPage(p));
      const chunkBuf = Buffer.from(await chunkDoc.save());
      const path = `chunks/${id}/chunk_${ci}.pdf`;
      const sizeKb = (chunkBuf.length / 1024).toFixed(0);
      console.log(`[PREPARE] chunk_${ci}.pdf extracted: ${sizeKb} KB (pages ${cStart + 1}–${cEnd + 1}), uploading…`);
      // Fire-and-forget upload — runs in parallel while we extract the next chunk
      uploadPromises.push(
        admin.storage.from("submissions").upload(path, chunkBuf, {
          contentType: "application/pdf",
          upsert: true,
        }).then(({ error }) => {
          if (error) {
            console.warn(`[PREPARE] chunk_${ci}.pdf upload failed: ${error.message} — CHUNK will fall back to full PDF`);
          } else {
            console.log(`[PREPARE] chunk_${ci}.pdf uploaded ✓`);
          }
        }).catch((e: any) => {
          console.warn(`[PREPARE] chunk_${ci}.pdf upload threw: ${e.message}`);
        })
      );
    } catch (e: any) {
      console.warn(`[PREPARE] chunk_${ci}.pdf extraction failed: ${e.message} — CHUNK will fall back to full PDF`);
    }
  }
  // Wait for all in-flight uploads before returning (so CHUNKs can immediately read them)
  await Promise.allSettled(uploadPromises);
  console.timeEnd("[PREPARE] chunk pre-extraction");

  return NextResponse.json({ success: true, done: false, totalChunks, pageCount });
}

// ── CHUNK: Vision extraction + analysis for one page range ───

async function handleChunk(
  id: string,
  submission: any,
  admin: ReturnType<typeof createAdminClient>,
  chunkIndex: number,
  totalChunks: number,
  pageCount: number
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await setAnalysisError(admin, id, "ANTHROPIC_API_KEY non configurée");
    return NextResponse.json({ error: "API key missing" }, { status: 500 });
  }

  const fileUrl = submission.file_url || submission.source_file_url;
  const isLastChunk = chunkIndex === totalChunks - 1;
  const startPage = chunkIndex * PAGES_PER_CHUNK;
  const endPage = Math.min(startPage + PAGES_PER_CHUNK - 1, pageCount - 1);

  console.log(`[CHUNK ${chunkIndex + 1}/${totalChunks}] Pages ${startPage + 1}–${endPage + 1}`);
  console.time(`[CHUNK ${chunkIndex + 1}/${totalChunks}]`);

  try {
    // ── Download PDF: mini-PDF fast path, full PDF fallback ──────────────
    // PREPARE pre-extracted each chunk as a mini-PDF (PAGES_PER_CHUNK pages).
    // Fast path: use mini-PDF directly — NO pdf-lib needed, saves ~6s per chunk.
    // Fallback: download full PDF + split with pdf-lib (slower but works if upload failed).
    const chunkPageCount = endPage - startPage + 1;
    const batchBuffers: { buf: Buffer; label: string }[] = [];

    const miniPdfPath = `chunks/${id}/chunk_${chunkIndex}.pdf`;
    const { data: miniData } = await admin.storage.from("submissions").download(miniPdfPath);

    if (miniData) {
      // Fast path: PREPARE already extracted exactly these pages as a mini-PDF.
      // With PAGES_PER_CHUNK == VISION_PAGES_PER_BATCH (both 5), the mini-PDF IS the
      // Vision batch — send it directly without any pdf-lib load/copy/save cycle.
      const miniBuf = Buffer.from(await miniData.arrayBuffer());
      const absEnd = Math.min(startPage + chunkPageCount - 1, pageCount - 1);
      const label = `chunk ${chunkIndex + 1}/${totalChunks} (pages ${startPage + 1}–${absEnd + 1})`;
      batchBuffers.push({ buf: miniBuf, label });
      console.log(`[CHUNK ${chunkIndex + 1}/${totalChunks}] Mini-PDF direct (${chunkPageCount} pages, ${(miniBuf.length / 1024).toFixed(0)} KB, no pdf-lib)`);
    } else {
      // Fallback: PREPARE didn't upload mini-PDFs — download the full PDF and split
      console.warn(`[CHUNK ${chunkIndex + 1}/${totalChunks}] Mini-PDF not found — falling back to full PDF`);
      const { PDFDocument } = await import("pdf-lib");
      const visionBatchCount = Math.ceil(chunkPageCount / VISION_PAGES_PER_BATCH);
      const { data: pdfData, error: pdfError } = await admin.storage.from("submissions").download(fileUrl);
      if (pdfError || !pdfData) {
        const msg = `Erreur download (chunk ${chunkIndex + 1}/${totalChunks}): ${pdfError?.message}`;
        await setAnalysisError(admin, id, msg).catch(() => {});
        return NextResponse.json({ error: msg }, { status: 500 });
      }
      const buffer = Buffer.from(await pdfData.arrayBuffer());
      const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });

      for (let b = 0; b < visionBatchCount; b++) {
        const bStart = startPage + b * VISION_PAGES_PER_BATCH;
        const bEnd = Math.min(bStart + VISION_PAGES_PER_BATCH - 1, endPage);
        const subDoc = await PDFDocument.create();
        const indices = Array.from({ length: bEnd - bStart + 1 }, (_: unknown, j: number) => bStart + j);
        const copied = await subDoc.copyPages(srcDoc, indices);
        copied.forEach((p: any) => subDoc.addPage(p));
        const buf = Buffer.from(await subDoc.save());
        const label = `chunk ${chunkIndex + 1}/${totalChunks} batch ${b + 1}/${visionBatchCount} (pages ${bStart + 1}–${bEnd + 1})`;
        batchBuffers.push({ buf, label });
        console.log(`[CHUNK] fallback batch ${label}: ${(buf.length / 1024).toFixed(0)} KB`);
      }
    }

    // Initialize Anthropic client (90s timeout — safe within maxDuration=300)
    const AnthropicModule = await import("@anthropic-ai/sdk");
    const Anthropic = (AnthropicModule as any).default || AnthropicModule;
    const client = new Anthropic({ apiKey, timeout: 90_000 });

    // ── Single-pass Vision+JSON extraction ──────────────────────────────────
    // One Vision call per chunk (5 pages = 1 batch).
    // Vision → JSON directly (~25s), no second Haiku round-trip.
    // With PAGES_PER_CHUNK=5 there is always exactly 1 batch, so Promise.all
    // is equivalent to a single call — kept for the fallback full-PDF path.
    const batchResults = await Promise.all(
      batchBuffers.map(({ buf, label }) =>
        claudeVisionExtractItems(client, buf, label).catch((err: any) => {
          console.error(`[CHUNK] Vision failed for ${label}:`, err.message);
          // Fatal API errors: abort immediately to avoid burning time + credits
          const msg = (err.message || "").toLowerCase();
          if (
            err.status === 400 || err.status === 401 || err.status === 403 ||
            msg.includes("credit") || msg.includes("billing") || msg.includes("unauthorized") ||
            msg.includes("invalid x-api-key")
          ) {
            throw err;
          }
          return [] as any[]; // Non-fatal: skip this batch, continue with others
        })
      )
    );

    const items: any[] = batchResults.flat();
    console.log(`[CHUNK ${chunkIndex + 1}/${totalChunks}] Vision+JSON: ${items.length} items`);

    if (items.length === 0) {
      // Blank or unreadable pages — skip silently
      console.log(`[CHUNK ${chunkIndex + 1}/${totalChunks}] No items — skipping (blank/unreadable pages)`);
      if (isLastChunk) {
        await (admin as any).from("submissions").update({
          analysis_status: "done",
          analysis_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", id);
      }
      console.timeEnd(`[CHUNK ${chunkIndex + 1}/${totalChunks}]`);
      return NextResponse.json({
        success: true,
        done: isLastChunk,
        itemsInChunk: 0,
        progress: Math.round((chunkIndex + 1) / totalChunks * 100),
      });
    }

    // Append items (items were cleared in prepare step — each chunk appends its share)
    if (items.length > 0) {
      await saveItems(admin, id, submission.project_id, items);
    }

    if (isLastChunk) {
      await (admin as any).from("submissions").update({
        analysis_status: "done",
        analysis_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      console.log(`[CHUNK] All chunks complete for submission ${id}`);

      // Clean up pre-extracted mini-PDFs (best-effort, don't fail analysis if this errors)
      const chunkPaths = Array.from(
        { length: totalChunks },
        (_: unknown, ci: number) => `chunks/${id}/chunk_${ci}.pdf`
      );
      admin.storage.from("submissions").remove(chunkPaths).catch((e: any) =>
        console.warn(`[CHUNK] Mini-PDF cleanup failed (non-fatal): ${e?.message}`)
      );
    }

    console.timeEnd(`[CHUNK ${chunkIndex + 1}/${totalChunks}]`);
    return NextResponse.json({
      success: true,
      done: isLastChunk,
      itemsInChunk: items.length,
      progress: Math.round((chunkIndex + 1) / totalChunks * 100),
    });

  } catch (err: any) {
    console.error(`[CHUNK ${chunkIndex + 1}/${totalChunks}] Failed:`, err.message);
    await setAnalysisError(
      admin,
      id,
      `Erreur analyse partie ${chunkIndex + 1}/${totalChunks}: ${err.message}`
    ).catch(() => {});
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── Save items to DB ─────────────────────────────────────────

async function saveItems(
  admin: ReturnType<typeof createAdminClient>,
  submissionId: string,
  projectId: string,
  items: any[]
) {
  const rows = items.map((item: any) => ({
    submission_id: submissionId,
    project_id: projectId,
    item_number: item.item_number || null,
    description: item.description || "",
    unit: item.unit || null,
    quantity: item.quantity ?? null,
    cfc_subcode: item.cfc_code || null,
    material_group: item.material_group || "Divers",
    product_name: item.product_name || null,
    status: "pending",
    metadata: {
      ai_confidence: typeof item.confidence === "number" ? item.confidence : null,
      extraction_model: "claude-haiku-4-5-20251001",
      extracted_at: new Date().toISOString(),
    },
  }));

  const { error } = await (admin.from("submission_items") as any).insert(rows);
  if (error) throw new Error(`DB insert error: ${error.message}`);
}

// ── Helpers ──────────────────────────────────────────────────

async function setAnalysisError(admin: ReturnType<typeof createAdminClient>, id: string, error: string) {
  await (admin as any).from("submissions").update({
    analysis_status: "error",
    analysis_error: error,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
}

/** Call Claude Vision on a PDF buffer and extract structured items directly as JSON.
 *
 * SINGLE-PASS approach: Vision reads the PDF AND outputs structured items in one call,
 * eliminating the separate Haiku text→JSON pass (~10s saved per chunk).
 *
 * Uses Sonnet — Haiku does NOT support the type:"document" source block.
 * ANALYSIS_PROMPT is sent as a cached system message (cache_control:"ephemeral")
 * so it doesn't add latency on repeated calls within the same session.
 */
async function claudeVisionExtractItems(
  client: any,
  pdfBuffer: Buffer,
  batchLabel: string
): Promise<any[]> {
  const base64 = pdfBuffer.toString("base64");
  console.log(`[VISION] ${batchLabel}: ${(pdfBuffer.length / 1024).toFixed(0)} KB → ${(base64.length / 1024).toFixed(0)} KB base64`);

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 16384,
    system: [
      { type: "text", text: ANALYSIS_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          } as any,
          {
            type: "text",
            text: "Extrais tous les postes de ce descriptif de soumission et retourne-les directement au format JSON demandé. Sois exhaustif — ne saute aucun poste.",
          },
        ],
      },
      // Assistant prefill forces JSON output without any preamble
      {
        role: "assistant",
        content: '{"items": [',
      },
    ],
  });

  const textBlock = response.content.find((c: any) => c.type === "text");
  const raw = '{"items": [' + ((textBlock as any)?.text || "");
  console.log(`[VISION] ${batchLabel}: stop=${response.stop_reason} raw=${raw.length} chars`);
  return parseJsonResponse(raw);
}

// ── Excel text extraction ─────────────────────────────────────

async function extractExcelText(admin: ReturnType<typeof createAdminClient>, fileUrl: string): Promise<string> {
  console.time("[EXCEL] download");
  const { data, error } = await admin.storage.from("submissions").download(fileUrl);
  console.timeEnd("[EXCEL] download");

  if (error) {
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
  console.log(`[EXCEL] buffer: ${(buffer.length / 1024).toFixed(1)} KB`);
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
        const compacted = nonEmpty
          .map((r: any[]) => {
            let lastNonEmpty = r.length - 1;
            while (lastNonEmpty >= 0 && (r[lastNonEmpty] === null || r[lastNonEmpty] === "")) lastNonEmpty--;
            return r.slice(0, lastNonEmpty + 1).map((c) => c ?? "").join(" | ");
          })
          .filter((line) => line.trim().length > 0);
        if (compacted.length > 0) {
          parts.push(`Feuille: ${name}\n${compacted.join("\n")}`);
        }
      }
      continue;
    }

    // Structured parsing: drop columns that are mostly empty (>80% null/empty)
    const headers = Object.keys(rows[0] as Record<string, unknown>);
    const usefulHeaders = headers.filter((h) => {
      const nonEmpty = rows.filter((r) => {
        const v = (r as Record<string, unknown>)[h];
        return v !== null && v !== undefined && v !== "";
      });
      return nonEmpty.length > rows.length * 0.2;
    });

    const finalHeaders = usefulHeaders.length > 0 ? usefulHeaders : headers;

    const compactRows = rows
      .map((r: any) => {
        return finalHeaders
          .map((h) => {
            const v = (r as Record<string, unknown>)[h];
            return v !== null && v !== undefined && v !== "" ? String(v) : "";
          })
          .join(" | ");
      })
      .filter((line) => {
        return line.replace(/\s*\|\s*/g, "").trim().length > 0;
      });

    if (compactRows.length > 0) {
      parts.push(
        `Feuille: ${name}\nColonnes: ${finalHeaders.join(" | ")}\n${compactRows.join("\n")}`
      );
    }
  }

  if (parts.length === 0) {
    console.warn("[EXCEL] No non-empty sheets:", { fileUrl, sheetNames: workbook.SheetNames });
  }

  const result = parts.join("\n\n");
  console.log(`[EXCEL] Extracted: ${result.length} chars from ${workbook.SheetNames.length} sheets`);
  return result;
}

// ── Claude text analysis ──────────────────────────────────────

async function analyzeWithClaude(textContent: string): Promise<any[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, timeout: 45_000 });

  const MAX_CHUNK_CHARS = 80_000;

  if (textContent.length <= MAX_CHUNK_CHARS) {
    return analyzeChunk(client, textContent);
  }

  // Split into chunks by lines
  console.log(`[ANALYZE] Large text (${textContent.length} chars), splitting into chunks`);
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

  console.log(`[ANALYZE] ${chunks.length} chunks: ${chunks.map((c) => c.length).join(", ")} chars`);

  // Process chunks in parallel (max 3 concurrent)
  const MAX_CONCURRENT = 3;
  const allItems: any[] = [];
  for (let batch = 0; batch < chunks.length; batch += MAX_CONCURRENT) {
    const batchChunks = chunks.slice(batch, batch + MAX_CONCURRENT);
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
  console.log(`[ANALYZE] ~${estimatedTokens} tokens${chunkLabel}`);

  const chunkNote = totalChunks && totalChunks > 1
    ? `\n\n[Partie ${chunkIndex}/${totalChunks} du document]`
    : "";

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

  const fullJson = '{"items": [' + textBlock.text;
  console.log(`[ANALYZE] Response${chunkLabel}: ${fullJson.length} chars, stop=${response.stop_reason}`);
  console.log(`[ANALYZE] Preview${chunkLabel}: ${fullJson.substring(0, 200)}...`);

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
      console.log(`[PARSE] Direct: ${items.length} items`);
      return items;
    }
  } catch {
    console.log("[PARSE] Direct failed, trying repairs...");
  }

  // ── Strategy 2: Fix trailing commas + close truncated JSON ──
  try {
    let repaired = jsonStr;
    repaired = repaired.replace(/,\s*([\]}])/g, "$1");
    if (!repaired.endsWith("}")) {
      repaired = repaired.replace(/,?\s*$/, "") + "]}";
    }
    const parsed = JSON.parse(repaired);
    const items = parsed.items || parsed.positions || (Array.isArray(parsed) ? parsed : []);
    if (items.length > 0) {
      console.log(`[PARSE] Trailing-comma fix: ${items.length} items`);
      return items;
    }
  } catch {
    console.log("[PARSE] Trailing-comma fix failed, trying object extraction...");
  }

  // ── Strategy 3: Extract individual item objects ──
  const items: any[] = [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === "{") {
      depth++;
      if ((depth === 2) || (depth === 1 && i > 0)) {
        objectStart = i;
      }
    } else if (ch === "}") {
      depth--;
      if ((depth === 1 || depth === 0) && objectStart >= 0) {
        try {
          const obj = JSON.parse(jsonStr.substring(objectStart, i + 1));
          if (obj.description || obj.item_number) items.push(obj);
        } catch { /* skip malformed object */ }
        objectStart = -1;
      }
    }
  }

  if (items.length > 0) {
    console.log(`[PARSE] Object extraction: ${items.length} items`);
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
    console.log(`[PARSE] Regex extraction: ${items.length} items`);
    return items;
  }

  console.error("[PARSE] Failed. Preview:", jsonStr.substring(0, 500));
  throw new Error("Failed to parse AI response");
}
