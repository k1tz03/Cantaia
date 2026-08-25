// ============================================================
// Custom Tool Handlers — Server-side execution of Cantaia custom tools
// Called by the stream route when the agent invokes a custom tool.
// Each handler accesses Supabase via admin client (bypass RLS).
//
// SECURITY: Never trust agent-supplied user_id or organization_id.
//           Always use ctx.userId / ctx.organizationId (from auth).
//           Always verify org ownership before reads AND writes.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentType } from "@cantaia/core/agents";
import { AI_MODELS, callAnthropicWithRetry } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";

interface ToolContext {
  userId: string;
  organizationId: string;
  sessionId: string; // Internal DB session ID
  admin: SupabaseClient;
}

/**
 * Execute a custom tool and return the result string.
 * This is the single dispatch point for all custom tools across all agents.
 */
export async function executeCustomTool(
  _agentType: AgentType,
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string | Record<string, unknown>> {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    return { error: true, message: `Unknown custom tool: ${toolName}` };
  }
  return handler(input, ctx);
}

// ── SSRF Protection — only allow Supabase storage URLs ──────

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) return false;
    // Strict hostname EQUALITY (not endsWith): "evil-<ref>.supabase.co" would
    // pass a suffix test against "<ref>.supabase.co".
    const allowedHost = new URL(base).hostname;
    return parsed.protocol === "https:" && parsed.hostname === allowedHost;
  } catch {
    return false;
  }
}

// ── Org ownership helpers ─────────────────────────────────

type ToolError = { error: true; message: string };

/**
 * AGT.H1 — UNCONDITIONAL org ownership check for a submission.
 *
 * A submission reaches an organization only through its project. A submission
 * with a NULL project_id therefore cannot be proven to belong to the caller's
 * org, so access is denied (same rule as SEC2.FIX11 on
 * /api/submissions/[id]/analyze). Never make this check conditional.
 */
async function checkSubmissionAccess(
  ctx: ToolContext,
  submission: { project_id?: string | null } | null,
  projectColumns = "organization_id"
): Promise<{ allowed: false; error: ToolError } | { allowed: true; project: any }> {
  if (!submission) {
    return { allowed: false, error: { error: true, message: "Submission not found" } };
  }

  if (!submission.project_id) {
    return {
      allowed: false,
      error: {
        error: true,
        message: "Access denied: submission is not attached to a project",
      },
    };
  }

  const { data: project } = await (ctx.admin as any)
    .from("projects")
    .select(projectColumns.includes("organization_id") ? projectColumns : `${projectColumns}, organization_id`)
    .eq("id", submission.project_id)
    .maybeSingle();

  if (!project || project.organization_id !== ctx.organizationId) {
    return { allowed: false, error: { error: true, message: "Access denied" } };
  }

  return { allowed: true, project };
}

/**
 * AGT.H2 — Storage path guard.
 *
 * Every Cantaia storage convention puts the organization id in the first or
 * second path segment:
 *   submissions      → {orgId}/{projectId}/{file}
 *   plans            → {orgId}/{projectId}/{file}  |  price-imports/{orgId}/…
 *   audio            → photos/{orgId}/…  |  closure/{orgId}/…  |  reports/{orgId}/…
 *   support          → {orgId}/{ticketId}/{file}
 *   chat-attachments → {orgId}/{conversationId}/{file}
 *
 * Anything else is rejected: without this, an agent could read any object of
 * any organization by guessing a path.
 */
function isOwnStoragePath(objectPath: string, organizationId: string): boolean {
  if (!organizationId) return false;
  const segments = objectPath.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  // Only the first two segments may carry the org id — deeper matches would
  // let "otherOrg/…/{ourOrgId}" style paths through.
  return segments.slice(0, 2).includes(organizationId);
}

/**
 * Extract the in-bucket object path from a Supabase Storage URL.
 * Supports /storage/v1/object/{public|sign|authenticated}/{bucket}/{path}.
 * Returns null when the URL is not a storage object URL.
 */
function extractStorageObjectPath(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const match = pathname.match(
      /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?[^/]+\/(.+)$/
    );
    if (!match) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Agents send structured payloads as JSON *strings* (the tool schemas declare
 * `type: "string"`), but a model occasionally sends the parsed value instead.
 * Accept both, and never throw: a malformed field degrades to the fallback.
 */
function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[tool-handlers] Invalid JSON array, using []:", value.slice(0, 160));
    return [];
  }
}

/**
 * Map the plan-estimator agent's JSON onto the `EstimationPipelineResult`
 * shape the rest of the product reads.
 *
 * Why here and not only in the prompt: the registry prompt was asking for
 * `passe1.title_block` / `passe1.discipline` and a flat
 * `consensus_metrage.postes`, while every consumer (plan detail, scene
 * extraction, calibration) reads `passe1.classification`,
 * `consensus_metrage.metrage_fusionne` and `passe3`. The prompt has been
 * corrected too, but a prompt is a request, not a guarantee — a model that
 * drifts one field would silently produce an unreadable estimation. This
 * normaliser accepts BOTH shapes and always emits the canonical one, so the
 * stored row is valid whatever the model returned.
 */
function normalizeAgentEstimation(
  raw: any,
  ids: { planId: string; projectId: string; orgId: string }
): any {
  const passe1Raw = raw.passe1 || {};
  const titleBlock = passe1Raw.title_block || passe1Raw.cartouche || {};

  const passe1 = {
    cartouche: {
      numero_plan: titleBlock.numero ?? titleBlock.numero_plan ?? null,
      indice_revision: titleBlock.indice ?? titleBlock.indice_revision ?? null,
      date: titleBlock.date ?? null,
      auteur_bureau: titleBlock.company ?? titleBlock.author ?? titleBlock.auteur_bureau ?? null,
      projet: titleBlock.titre ?? titleBlock.projet ?? null,
      echelle: titleBlock.scale ?? titleBlock.echelle ?? null,
    },
    // The field every consumer keys on. Built from the agent's flat fields
    // when it did not nest them itself.
    classification: passe1Raw.classification ?? {
      discipline: normalizeDiscipline(passe1Raw.discipline),
      type_plan: normalizePlanType(passe1Raw.plan_type),
      phase_sia: passe1Raw.phase_sia ?? "projet",
      vues_presentes: Array.isArray(passe1Raw.vues_presentes) ? passe1Raw.vues_presentes : [],
    },
    contexte_metrage: passe1Raw.contexte_metrage ?? {
      echelle_detectee: titleBlock.scale ?? titleBlock.echelle ?? "inconnue",
      echelle_fiable: !!(titleBlock.scale || titleBlock.echelle),
      cotations_presentes: passe1Raw.cotations_presentes ?? false,
      legende_presente: passe1Raw.legende_presente ?? false,
      qualite_image: mapImageQuality(passe1Raw.image_quality ?? passe1Raw.qualite_image),
      zones_illisibles: [],
    },
    avertissements: Array.isArray(passe1Raw.avertissements) ? passe1Raw.avertissements : [],
  };

  const consensusRaw = raw.consensus_metrage || {};
  const postes = Array.isArray(consensusRaw.postes) ? consensusRaw.postes : [];

  // `metrage_fusionne` is a full Passe2Result. The single-model agent has no
  // per-zone breakdown, so the fused métré is one synthetic zone plus the
  // per-CFC totals derived from the consensus postes.
  const metrageFusionne = consensusRaw.metrage_fusionne ?? {
    metrage_par_zone: [
      {
        zone: "Plan complet",
        dimensions_zone: {
          longueur: null,
          largeur: null,
          hauteur: null,
          surface: null,
          source_mesure: "echelle",
        },
        postes: postes.map((p: any) => ({
          cfc_code: p.cfc_code ?? "",
          cfc_libelle: p.cfc_libelle ?? p.description ?? "",
          description_detaillee: p.description ?? p.cfc_libelle ?? "",
          quantite: Number(p.quantite_consensuelle ?? p.quantite ?? 0),
          unite: p.unite ?? "",
          methode_mesure: p.methode_consensus ?? "detection_unique",
          vue_source: "plan",
          confiance: p.confiance_consensus ?? "medium",
          hypotheses: p.note ? [p.note] : [],
          decomposition: [],
        })),
      },
    ],
    elements_hors_plan: [],
    totaux_par_cfc: aggregateTotalsByCfc(postes),
    avertissements_metrage: Array.isArray(consensusRaw.avertissements_metrage)
      ? consensusRaw.avertissements_metrage
      : [],
    surface_reference: consensusRaw.surface_reference ?? {
      surface_brute_plancher: null,
      surface_nette_plancher: null,
      surface_facade: null,
      volume_bati: null,
      source: "non_determinee",
    },
  };

  const consensus_metrage = {
    postes,
    modeles_utilises: consensusRaw.modeles_utilises ?? ["claude"],
    modeles_en_erreur: consensusRaw.modeles_en_erreur ?? [],
    stats: consensusRaw.stats ?? {
      total_postes: postes.length,
      concordance_forte_pct: 0,
      concordance_partielle_pct: 0,
      divergence_pct: 0,
      score_consensus_global: 0.6,
    },
    metrage_fusionne: metrageFusionne,
  };

  const passe3Raw = raw.passe3 || {};
  const passe3 = {
    verification_ratios: passe3Raw.verification_ratios ?? [],
    alertes_coherence: passe3Raw.alertes_coherence ?? [],
    doublons_potentiels: passe3Raw.doublons_potentiels ?? [],
    elements_probablement_manquants: passe3Raw.elements_probablement_manquants ?? [],
    score_fiabilite_metrage: passe3Raw.score_fiabilite_metrage ?? {
      score: Number(raw.confidence?.score_global) || 0.6,
      facteurs_positifs: [],
      facteurs_negatifs: [],
      recommandation: raw.confidence?.recommandation_globale ?? "Estimation préliminaire",
    },
  };

  return {
    plan_id: ids.planId,
    project_id: ids.projectId,
    org_id: ids.orgId,
    created_at: new Date().toISOString(),
    passe1,
    consensus_metrage,
    passe3,
    passe4: raw.passe4 ?? null,
    pipeline_stats: raw.pipeline_stats ?? {
      total_duration_ms: 0,
      passe1_duration_ms: 0,
      passe2_duration_ms: 0,
      consensus_duration_ms: 0,
      passe3_duration_ms: 0,
      passe4_duration_ms: 0,
      total_tokens: 0,
      total_cost_usd: 0,
      models_used: ["claude"],
    },
    // Marks the row as agent-produced (single model, no real consensus).
    source: "managed-agent",
  };
}

function aggregateTotalsByCfc(postes: any[]): any[] {
  const byCfc = new Map<string, any>();
  for (const p of postes) {
    const code = p.cfc_code ?? "";
    const entry = byCfc.get(code) || {
      cfc_code: code,
      cfc_libelle: p.cfc_libelle ?? p.description ?? "",
      quantite_totale: 0,
      unite: p.unite ?? "",
      nb_zones: 1,
      confiance_moyenne: p.confiance_consensus ?? "medium",
    };
    entry.quantite_totale += Number(p.quantite_consensuelle ?? p.quantite ?? 0);
    byCfc.set(code, entry);
  }
  return Array.from(byCfc.values());
}

const DISCIPLINE_MAP: Record<string, string> = {
  architecture: "architecture",
  structure: "structure",
  cvc: "cvcs",
  cvcs: "cvcs",
  "cvc/s": "cvcs",
  electricite: "electricite",
  "électricité": "electricite",
  sanitaire: "sanitaire",
  facades: "facades",
  "façades": "facades",
  amenagement_exterieur: "amenagement_exterieur",
  demolition: "demolition",
};

function normalizeDiscipline(value: unknown): string {
  const key = String(value ?? "").toLowerCase().trim();
  return DISCIPLINE_MAP[key] ?? "architecture";
}

const PLAN_TYPE_MAP: Record<string, string> = {
  "plan d'étage": "plan_etage",
  "plan d'etage": "plan_etage",
  plan_etage: "plan_etage",
  coupe: "coupe",
  facade: "facade",
  "façade": "facade",
  detail: "detail",
  "détail": "detail",
  situation: "situation",
  schema_principe: "schema_principe",
  plan_toiture: "plan_toiture",
  plan_fondation: "plan_fondation",
};

function normalizePlanType(value: unknown): string {
  const key = String(value ?? "").toLowerCase().trim();
  return PLAN_TYPE_MAP[key] ?? "plan_etage";
}

function mapImageQuality(value: unknown): string {
  const key = String(value ?? "").toLowerCase().trim();
  if (key.startsWith("haut") || key === "high" || key === "bonne") return "haute";
  if (key.startsWith("bas") || key === "low" || key === "mauvaise") return "basse";
  return "moyenne";
}

/** Verify a project belongs to the caller's org before reading or writing it. */
async function checkProjectAccess(
  ctx: ToolContext,
  projectId: string | null | undefined,
  columns = "id, name, code, status, organization_id"
): Promise<{ allowed: false; error: ToolError } | { allowed: true; project: any }> {
  if (!projectId) {
    return { allowed: false, error: { error: true, message: "project_id is required" } };
  }
  const { data: project } = await (ctx.admin as any)
    .from("projects")
    .select(columns.includes("organization_id") ? columns : `${columns}, organization_id`)
    .eq("id", projectId)
    .maybeSingle();

  if (!project || project.organization_id !== ctx.organizationId) {
    return { allowed: false, error: { error: true, message: "Project not found or access denied" } };
  }
  return { allowed: true, project };
}

// ── Tool Handler Registry ─────────────────────────────────

type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext
) => Promise<string | Record<string, unknown>>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // ── Submission Analyzer Tools ──────────────────────────

  fetch_submission_file: async (input, ctx) => {
    const submissionId = input.submission_id as string;

    // Get submission (no join — avoids ambiguous FK with portal_submission_id)
    const { data: submission, error } = await (ctx.admin as any)
      .from("submissions")
      .select("id, title, file_url, file_name, file_type, project_id")
      .eq("id", submissionId)
      .maybeSingle();

    if (error || !submission) {
      console.error("[tool:fetch_submission_file] Query error:", error?.message);
      return { error: true, message: `Submission ${submissionId} not found` };
    }

    // IDOR check via project — UNCONDITIONAL (AGT.H1)
    const access = await checkSubmissionAccess(ctx, submission);
    if (!access.allowed) return access.error;

    if (!submission.file_url) {
      return { error: true, message: "No file attached to this submission" };
    }

    // Download file from Storage
    const bucket = "submissions";
    const filePath = submission.file_url.replace(/^.*\/submissions\//, "");

    const { data: fileData, error: dlError } = await ctx.admin.storage
      .from(bucket)
      .download(filePath);

    if (dlError || !fileData) {
      return { error: true, message: `Failed to download file: ${dlError?.message}` };
    }

    // Extract text based on file type
    // Prefer extension from filename (reliable), fall back to MIME type detection
    const ext = submission.file_name?.split(".").pop()?.toLowerCase() || "";
    const mime = (submission.file_type || "").toLowerCase();
    const buffer = Buffer.from(await fileData.arrayBuffer());

    let extractedText = "";

    if (ext === "xlsx" || ext === "xls" || mime.includes("spreadsheet") || mime.includes("excel")) {
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "buffer" });

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
          const lines = csv.split("\n").filter((l: string) => l.replace(/,/g, "").trim().length > 0);
          if (lines.length > 0) {
            extractedText += `\n=== Sheet: ${sheetName} ===\n${lines.join("\n")}`;
          }
        }
      } catch (e: any) {
        console.warn("[fetch_submission_file] Excel parse failed:", e.message);
      }
    } else if (ext === "pdf" || mime.includes("pdf")) {
      // Try pdfjs text extraction first (fast, no API cost)
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const textContent = await page.getTextContent();
          const text = textContent.items
            .map((item: any) => ("str" in item ? item.str : ""))
            .join(" ");
          if (text.trim()) pages.push(text);
        }
        extractedText = pages.join("\n\n");
      } catch (e: any) {
        console.warn("[fetch_submission_file] pdfjs parse failed:", e.message);
      }

      // Check if PDF is scanned (< 100 meaningful chars) → use Anthropic Vision OCR
      const meaningfulChars = (extractedText.match(/[a-zA-Z0-9àâäéèêëîïôöùûüçæœ]/gi) || []).length;
      if (meaningfulChars < 100) {
        console.log(`[fetch_submission_file] PDF has ${meaningfulChars} meaningful chars — using Vision OCR`);
        try {
          const Anthropic = (await import("@anthropic-ai/sdk")).default;
          // maxRetries:0 — retries owned by callAnthropicWithRetry (§8).
          const client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
            maxRetries: 0,
          });
          const visionModel = AI_MODELS.SONNET; // vision-capable
          const response = await callAnthropicWithRetry(() =>
            client.messages.create({
              model: visionModel,
              max_tokens: 16000,
              messages: [{
                role: "user",
                content: [
                  {
                    type: "document",
                    source: {
                      type: "base64",
                      media_type: "application/pdf",
                      data: buffer.toString("base64"),
                    },
                  } as any,
                  {
                    type: "text",
                    text: "Extrais TOUT le texte de ce document PDF de soumission de construction. Retourne uniquement le texte brut fidèlement, ligne par ligne, sans résumé ni reformulation. Inclus tous les numéros de postes, descriptions, unités et quantités.",
                  },
                ],
              }],
            })
          );
          // Track the OCR call — a full base64 PDF can be 100k+ input tokens
          // and was previously billed by Anthropic but invisible in our logs.
          trackApiUsage({
            supabase: ctx.admin as any,
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            actionType: "agent_submission_analysis_ocr" as any,
            apiProvider: "anthropic" as any,
            model: visionModel,
            inputTokens: response.usage?.input_tokens || 0,
            outputTokens: response.usage?.output_tokens || 0,
            metadata: { session_id: ctx.sessionId, phase: "vision_ocr" },
          }).catch(() => {});
          const visionText = response.content
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("\n");
          if (visionText.length > extractedText.length) {
            extractedText = visionText;
            console.log(`[fetch_submission_file] Vision OCR: ${visionText.length} chars extracted`);
          }
        } catch (e: any) {
          console.warn("[fetch_submission_file] Vision OCR failed:", e.message);
        }
      }
    } else {
      extractedText = buffer.toString("utf-8");
    }

    if (extractedText.length === 0) {
      return {
        error: true,
        message: `Le fichier "${submission.file_name}" n'a produit aucun texte extractible. Le document est peut-être vide ou dans un format non supporté.`,
      };
    }

    return {
      file_name: submission.file_name,
      file_type: ext || mime,
      text_length: extractedText.length,
      content: extractedText.slice(0, 200_000), // 200K chars max (~50K tokens)
    };
  },

  get_submission_context: async (input, ctx) => {
    const submissionId = input.submission_id as string;

    // Separate queries to avoid ambiguous FK (portal_submission_id)
    const { data: submission, error } = await (ctx.admin as any)
      .from("submissions")
      .select("id, title, reference, status, deadline, project_id")
      .eq("id", submissionId)
      .maybeSingle();

    if (error || !submission) {
      console.error("[tool:get_submission_context] Query error:", error?.message);
      return { error: true, message: "Submission not found" };
    }

    // Fetch project separately for IDOR check + context — UNCONDITIONAL (AGT.H1)
    const access = await checkSubmissionAccess(ctx, submission, "name, code, organization_id");
    if (!access.allowed) return access.error;
    const projectData: { name: string; code: string } = {
      name: access.project.name,
      code: access.project.code,
    };

    // Get existing items count
    const { count: itemsCount } = await (ctx.admin as any)
      .from("submission_items")
      .select("id", { count: "exact", head: true })
      .eq("submission_id", submissionId);

    // Get existing lots
    const { data: lots } = await (ctx.admin as any)
      .from("submission_lots")
      .select("id, title, lot_number, cfc_code")
      .eq("submission_id", submissionId);

    return {
      submission: {
        id: submission.id,
        title: submission.title,
        reference: submission.reference,
        status: submission.status,
        deadline: submission.deadline,
      },
      project: projectData || { name: "Unknown", code: "" },
      existing_items_count: itemsCount || 0,
      existing_lots: lots || [],
    };
  },

  save_analysis_result: async (input, ctx) => {
    const submissionId = input.submission_id as string;
    let items: any[];

    // ── Parse items — handle all possible agent output formats ──
    try {
      const raw = typeof input.items === "string" ? JSON.parse(input.items as string) : input.items;
      // Unwrap common agent wrappers: { items: [...] } or { data: [...] } or { results: [...] }
      if (Array.isArray(raw)) {
        items = raw;
      } else if (raw?.items && Array.isArray(raw.items)) {
        items = raw.items;
      } else if (raw?.data && Array.isArray(raw.data)) {
        items = raw.data;
      } else if (raw?.results && Array.isArray(raw.results)) {
        items = raw.results;
      } else {
        console.error("[tool:save_analysis_result] Unexpected items format:", typeof raw, JSON.stringify(raw).slice(0, 300));
        return { error: true, message: `Items is not an array. Received type: ${typeof raw}. Send items as a JSON array: [{...}, {...}]` };
      }
    } catch (e: any) {
      console.error("[tool:save_analysis_result] JSON parse error:", e.message, "Raw:", String(input.items).slice(0, 200));
      return { error: true, message: `Invalid items JSON: ${e.message}. Send items as a JSON string array.` };
    }

    if (items.length === 0) {
      return { error: true, message: "Items array is empty — no items to save." };
    }

    console.log(`[tool:save_analysis_result] Received ${items.length} items for submission ${submissionId}`);

    // ── Verify org ownership ──
    const { data: submission } = await (ctx.admin as any)
      .from("submissions")
      .select("id, project_id")
      .eq("id", submissionId)
      .maybeSingle();

    // UNCONDITIONAL org check (AGT.H1) — a project-less submission cannot be
    // attributed to the caller's org, so writing to it is denied.
    const access = await checkSubmissionAccess(ctx, submission);
    if (!access.allowed) return access.error;

    // ── Map agent fields to DB columns ──
    // Column names MUST match DB schema: cfc_subcode (NOT cfc_code), project_id required
    const dbItems = items.map((item: any, idx: number) => ({
      submission_id: submissionId,
      project_id: submission.project_id,
      item_number: item.item_number || item.numero || String(idx + 1),
      description: item.designation || item.description || item.libelle || "",
      unit: item.unit || item.unite || null,
      quantity: item.quantity != null ? Number(item.quantity) : (item.quantite != null ? Number(item.quantite) : null),
      cfc_subcode: item.cfc_code || item.cfc_subcode || item.code_cfc || null,
      material_group: item.material_group || item.groupe || "Divers",
      product_name: item.product_name || null,
      status: "pending",
      metadata: {
        lot_number: item.lot_number || item.lot || null,
        lot_title: item.lot_title || null,
        chapter_number: item.chapter_number || item.chapter || null,
        chapter_title: item.chapter_title || null,
        source: "managed-agent",
      },
    }));

    // ── Snapshot the existing item ids BEFORE inserting ──
    // Insert-then-delete (§8): the previous analysis is only removed once the
    // new items are safely written. Deleting first meant a failed insert wiped
    // the prior analysis and left the submission in analysis_status='error'
    // with no items at all.
    const { data: previousItems, error: prevError } = await (ctx.admin as any)
      .from("submission_items")
      .select("id")
      .eq("submission_id", submissionId);
    if (prevError) {
      console.warn(
        "[tool:save_analysis_result] Could not list previous items:",
        prevError.message
      );
    }
    const previousItemIds: string[] = (previousItems || []).map((r: any) => r.id);

    // ── Insert — with fallback if optional columns don't exist yet ──
    let insertError: any = null;
    let insertedCount = dbItems.length;

    const { error: err1 } = await (ctx.admin as any)
      .from("submission_items")
      .insert(dbItems);

    if (err1) {
      console.warn(`[tool:save_analysis_result] Full insert failed: ${err1.message}. Trying minimal columns...`);

      // Fallback: insert with only guaranteed columns (pre-migration-067)
      const minimalItems = dbItems.map((item: any) => ({
        submission_id: item.submission_id,
        project_id: item.project_id,
        description: item.description || "",
        unit: item.unit,
        quantity: item.quantity,
        cfc_subcode: item.cfc_subcode,
      }));

      const { error: err2 } = await (ctx.admin as any)
        .from("submission_items")
        .insert(minimalItems);

      if (err2) {
        console.error(`[tool:save_analysis_result] Minimal insert also failed: ${err2.message}`);
        insertError = err2;
        insertedCount = 0;
      } else {
        console.log(`[tool:save_analysis_result] Minimal insert succeeded: ${minimalItems.length} items`);
      }
    }

    if (insertError) {
      await (ctx.admin as any)
        .from("submissions")
        .update({
          analysis_status: "error",
          analysis_error: `Sauvegarde échouée: ${insertError.message}`,
        })
        .eq("id", submissionId);
      return { error: true, message: `Insert failed: ${insertError.message}` };
    }

    // ── Insert succeeded → now remove the previous analysis's items ──
    if (previousItemIds.length > 0) {
      const { error: delError } = await (ctx.admin as any)
        .from("submission_items")
        .delete()
        .in("id", previousItemIds);
      if (delError) {
        // Non-fatal: the new items are already saved. Worst case a few stale
        // rows linger, which is far better than losing the analysis entirely.
        console.warn(
          "[tool:save_analysis_result] Stale item cleanup failed (non-fatal):",
          delError.message
        );
      }
    }

    // ── Mark submission as done ──
    await (ctx.admin as any)
      .from("submissions")
      .update({
        analysis_status: "done",
        analysis_error: null,
        budget_estimate: null,
        budget_estimated_at: null,
      })
      .eq("id", submissionId);

    console.log(`[tool:save_analysis_result] SUCCESS: ${insertedCount} items saved for ${submissionId}`);

    return {
      success: true,
      items_saved: insertedCount,
      total: items.length,
      message: `${insertedCount} postes sauvegardés pour la soumission ${submissionId}`,
    };
  },

  // ── Briefing Generator Tools ────────────────────────────

  fetch_cantaia_context: async (_input, ctx) => {
    // FIX #4: Never trust agent-supplied user_id/organization_id
    const userId = ctx.userId;
    const orgId = ctx.organizationId;
    const today = new Date().toISOString().slice(0, 10);

    // Parallel fetch of all context sources
    const [emailsRes, tasksRes, meetingsRes, projectsRes, submissionsRes] =
      await Promise.all([
        // Unread/action-required emails from last 24h
        (ctx.admin as any)
          .from("email_records")
          .select("id, subject, sender_name, sender_email, classification, ai_summary, received_at")
          .eq("user_id", userId)
          .in("classification", ["action_required", "urgent"])
          .gte("received_at", new Date(Date.now() - 86400000).toISOString())
          .order("received_at", { ascending: false })
          .limit(20),

        // Open tasks (created by OR assigned to user) — all priorities for accurate stats
        (ctx.admin as any)
          .from("tasks")
          .select("id, title, status, priority, due_date, project_id")
          .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
          .in("status", ["todo", "in_progress", "waiting"])
          .order("due_date", { ascending: true })
          .limit(50),

        // FIX #11: Today's meetings — scoped to org via project join
        (ctx.admin as any)
          .from("meetings")
          .select("id, title, meeting_date, location, projects!inner(name, organization_id)")
          .eq("projects.organization_id", orgId)
          .gte("meeting_date", `${today}T00:00:00`)
          .lte("meeting_date", `${today}T23:59:59`)
          .limit(10),

        // Active projects
        (ctx.admin as any)
          .from("projects")
          .select("id, name, code, status, client_name, city")
          .eq("organization_id", orgId)
          .in("status", ["active", "planning"])
          .limit(20),

        // Submission deadlines in the next 7 days — scoped to org
        (ctx.admin as any)
          .from("submissions")
          .select("id, title, deadline, status, projects!inner(name, organization_id)")
          .eq("projects.organization_id", orgId)
          .gte("deadline", today)
          .lte("deadline", new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
          .in("status", ["draft", "sent", "responses"])
          .limit(10),
      ]);

    return {
      date: today,
      emails: emailsRes.data || [],
      urgent_tasks: tasksRes.data || [],
      meetings_today: meetingsRes.data || [],
      active_projects: projectsRes.data || [],
      upcoming_submission_deadlines: submissionsRes.data || [],
    };
  },

  save_briefing: async (input, ctx) => {
    // FIX #4: Never trust agent-supplied user_id
    const userId = ctx.userId;
    const orgId = ctx.organizationId;
    const briefingDate = input.briefing_date as string;
    let content: any;

    try {
      content = typeof input.content === "string" ? JSON.parse(input.content as string) : input.content;
    } catch {
      return { error: true, message: "Invalid content JSON" };
    }

    // Ensure mode is set to "ai" for agent-generated briefings
    if (content && typeof content === "object") {
      content.mode = "ai";
    }

    const { error } = await (ctx.admin as any)
      .from("daily_briefings")
      .upsert(
        {
          user_id: userId,
          organization_id: orgId,
          briefing_date: briefingDate,
          content,
          mode: "ai",
          is_sent: false,
        },
        { onConflict: "user_id,briefing_date" }
      );

    if (error) {
      return { error: true, message: `Save failed: ${error.message}` };
    }

    return { success: true, message: `Briefing saved for ${briefingDate}` };
  },

  // ── Email Classifier Tools ──────────────────────────────

  get_projects_list: async (_input, ctx) => {
    // FIX #4: Never trust agent-supplied organization_id
    const orgId = ctx.organizationId;

    const { data: projects, error } = await (ctx.admin as any)
      .from("projects")
      .select("id, name, code, email_keywords, email_senders, client_name, status")
      .eq("organization_id", orgId)
      .in("status", ["active", "planning"]);

    if (error) {
      console.error("[tool:get_projects_list] Query error:", error.message);
      return { error: true, message: "Failed to load projects", projects: [] };
    }
    return { projects: projects || [] };
  },

  fetch_emails_batch: async (input, ctx) => {
    // FIX #4: Never trust agent-supplied user_id
    const userId = ctx.userId;
    const batchSize = Math.min(Number(input.batch_size) || 50, 200);
    const mode = (input.mode as string) || "pending";

    let query = (ctx.admin as any)
      .from("email_records")
      .select("id, subject, sender_email, sender_name, recipients, received_at, body_preview, body_text, has_attachments, classification, classification_status")
      .eq("user_id", userId)
      .order("received_at", { ascending: false })
      .limit(batchSize);

    // "pending" mode: only unclassified emails; "all" mode: ALL recent emails (for reclassification)
    if (mode !== "all") {
      query = query.or("classification_status.is.null,classification_status.eq.pending");
    }

    const { data: emails, error } = await query;

    if (error) {
      console.error("[tool:fetch_emails_batch] Query error:", error.message);
      return { error: true, message: "Failed to load emails", emails: [], count: 0, mode };
    }
    return {
      emails: emails || [],
      count: emails?.length || 0,
      mode,
    };
  },

  save_classifications: async (input, ctx) => {
    let classifications: any[];
    try {
      classifications = typeof input.classifications === "string"
        ? JSON.parse(input.classifications as string)
        : input.classifications;
    } catch {
      return { error: true, message: "Invalid classifications JSON" };
    }

    if (!Array.isArray(classifications)) {
      return { error: true, message: "Classifications must be an array" };
    }

    let saved = 0;
    let errors = 0;

    for (const c of classifications) {
      const { error } = await (ctx.admin as any)
        .from("email_records")
        .update({
          project_id: c.project_id || null,
          classification: c.classification,
          ai_classification_confidence: c.confidence,
          ai_summary: c.ai_summary,
          ai_reasoning: c.ai_reasoning,
          classification_status: "classified",
          is_processed: true,
        })
        .eq("id", c.email_id)
        .eq("user_id", ctx.userId); // Scoped to auth user

      if (error) errors++;
      else saved++;
    }

    return { success: true, saved, errors, total: classifications.length };
  },

  // ── Plan Estimator Tools ────────────────────────────────

  fetch_plan_image: async (input, ctx) => {
    const planId = input.plan_id as string;

    // FIX #7: Order plan_versions by version_number DESC to get latest
    // NOTE: Do NOT filter on is_current_version — that flag marks the plan_registry
    // record itself as current vs superseded, not the version. Filtering on it would
    // silently reject valid plans. The version selection is handled by ORDER BY below.
    const { data: plan } = await (ctx.admin as any)
      .from("plan_registry")
      .select("id, plan_title, organization_id, plan_versions(file_url, file_type, version_number)")
      .eq("id", planId)
      .order("version_number", { referencedTable: "plan_versions", ascending: false })
      .maybeSingle();

    if (!plan || plan.organization_id !== ctx.organizationId) {
      return { error: true, message: "Plan not found or access denied" };
    }

    const version = plan.plan_versions?.[0];
    if (!version?.file_url) {
      return { error: true, message: "No file for this plan version" };
    }

    // Download from storage — use robust URL parsing (same pattern as fetch_file_content)
    let bucket = "plans";
    let objectPath = version.file_url;
    const PLAN_BUCKETS = ["submissions", "plans", "audio"];
    for (const b of PLAN_BUCKETS) {
      if (version.file_url.includes(`/${b}/`) || version.file_url.startsWith(`${b}/`)) {
        bucket = b;
        const idx = version.file_url.indexOf(`${b}/`);
        objectPath = version.file_url.slice(idx + b.length + 1);
        break;
      }
    }

    const { data: fileData, error: dlError } = await ctx.admin.storage
      .from(bucket)
      .download(objectPath);

    if (dlError || !fileData) {
      return { error: true, message: `Download failed (bucket=${bucket}): ${dlError?.message}` };
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const base64 = buffer.toString("base64");

    // Detect MIME type from file_type field or filename extension
    const ft = (version.file_type || "").toLowerCase();
    let mimeType = "image/jpeg"; // safe default for Claude Vision
    if (ft.includes("png")) mimeType = "image/png";
    else if (ft.includes("gif")) mimeType = "image/gif";
    else if (ft.includes("webp")) mimeType = "image/webp";
    else if (ft.includes("pdf")) mimeType = "application/pdf";

    return {
      plan_title: plan.plan_title,
      image_base64: `data:${mimeType};base64,${base64}`,
      file_type: version.file_type,
    };
  },

  query_reference_prices: async (_input, ctx) => {
    // FIX #4: Never trust agent-supplied organization_id
    const orgId = ctx.organizationId;
    let items: any[];

    try {
      items = typeof _input.items === "string" ? JSON.parse(_input.items as string) : _input.items;
    } catch {
      return { error: true, message: "Invalid items JSON" };
    }

    // Import the price resolver from core
    const { resolvePrice } = await import("@cantaia/core/plans/estimation");

    const currentQuarter = `${new Date().getFullYear()}-Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;

    const results = await Promise.all(
      items.map(async (item: any) => {
        try {
          const price = await resolvePrice({
            cfc_code: item.cfc_code || "",
            description: item.description || "",
            unite: item.unit || "",
            region: item.region || "Genève",
            quarter: currentQuarter,
            org_id: orgId,
            supabase: ctx.admin,
          });
          return { ...item, price };
        } catch (err) {
          return { ...item, price: null, error: err instanceof Error ? err.message : "Unknown" };
        }
      })
    );

    return { prices: results };
  },

  save_estimation: async (input, ctx) => {
    const planId = input.plan_id as string;
    let result: any;

    try {
      result = typeof input.result === "string" ? JSON.parse(input.result as string) : input.result;
    } catch {
      return { error: true, message: "Invalid result JSON" };
    }
    if (!result || typeof result !== "object") {
      return { error: true, message: "result must be a JSON object" };
    }

    // FIX #1: IDOR check — verify org ownership before writing.
    // `project_id` is read here too: plan_estimates.project_id and
    // .organization_id are NOT NULL (migration 022), so the previous insert
    // — which sent neither — failed with a 23502 on every single run. The
    // agent reported success (the error was returned but never surfaced) and
    // no estimation was ever persisted.
    const { data: plan } = await (ctx.admin as any)
      .from("plan_registry")
      .select("id, organization_id, project_id, plan_title")
      .eq("id", planId)
      .maybeSingle();

    if (!plan || plan.organization_id !== ctx.organizationId) {
      return { error: true, message: "Plan not found or access denied" };
    }
    if (!plan.project_id) {
      return {
        error: true,
        message:
          "Ce plan n'est rattaché à aucun projet — l'estimation ne peut pas être enregistrée.",
      };
    }

    // Normalise the agent's JSON to the EstimationPipelineResult shape the
    // downstream consumers read (`passe1.classification`,
    // `consensus_metrage.metrage_fusionne`, `passe3`).
    const normalized = normalizeAgentEstimation(result, {
      planId,
      projectId: plan.project_id,
      orgId: ctx.organizationId,
    });

    const { data: inserted, error } = await (ctx.admin as any)
      .from("plan_estimates")
      .insert({
        plan_id: planId,
        project_id: plan.project_id,
        organization_id: ctx.organizationId,
        // plan_analysis_id is nullable since migration 084 (standalone V2 runs)
        plan_analysis_id: null,
        config: { source: "managed-agent", agent_session_id: ctx.sessionId },
        estimate_result: normalized,
        grand_total: Number(result.grand_total) || 0,
        confidence_summary: result.confidence || normalized.passe4?.analyse_fiabilite || {},
        items_count: normalized.consensus_metrage.postes.length,
        status: "completed",
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[tool:save_estimation]", error.message);
      return { error: true, message: `Save failed: ${error.message}` };
    }

    return {
      success: true,
      estimate_id: inserted?.id ?? null,
      postes: normalized.consensus_metrage.postes.length,
      grand_total: Number(result.grand_total) || 0,
      message: `Estimation enregistrée pour "${plan.plan_title || planId}"`,
    };
  },

  // ── Price Extractor Tools ───────────────────────────────

  fetch_file_content: async (input, ctx) => {
    const fileUrl = input.file_url as string;
    const fileType = input.file_type as string;

    // Download from Supabase Storage or URL
    let buffer: Buffer;

    if (fileUrl.startsWith("http")) {
      // FIX #2: SSRF protection — only allow Supabase storage URLs
      if (!isAllowedUrl(fileUrl)) {
        return { error: true, message: "URL not in allowed domains. Use Supabase storage paths instead." };
      }
      // AGT.H2 — a public Supabase URL still points at a bucket object: apply
      // the same org scoping as the storage-path branch.
      const urlObjectPath = extractStorageObjectPath(fileUrl);
      if (!urlObjectPath || !isOwnStoragePath(urlObjectPath, ctx.organizationId)) {
        console.warn(
          `[tool:fetch_file_content] Denied URL outside org ${ctx.organizationId}: ${fileUrl.slice(0, 200)}`
        );
        return {
          error: true,
          message: "Access denied: this file does not belong to your organization.",
        };
      }
      const response = await fetch(fileUrl);
      if (!response.ok) {
        return { error: true, message: `Download failed: ${response.status}` };
      }
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      // Storage path — detect bucket from path segment.
      // NOTE: "price-imports" is NOT a bucket — it's a path prefix inside the "plans" bucket.
      // Paths from upload-for-extraction look like: "plans/price-imports/{orgId}/{batchId}/{file}"
      const KNOWN_BUCKETS = ["submissions", "plans", "audio", "support", "chat-attachments"];
      let bucket = "plans"; // default fallback
      let objectPath = fileUrl;

      for (const b of KNOWN_BUCKETS) {
        if (fileUrl.includes(`/${b}/`) || fileUrl.startsWith(`${b}/`)) {
          bucket = b;
          // Extract the path AFTER the bucket name
          const idx = fileUrl.indexOf(`${b}/`);
          objectPath = fileUrl.slice(idx + b.length + 1);
          break;
        }
      }

      // AGT.H2 — Security: the object path MUST be scoped to the caller's org.
      // Previously only "price-imports/" was checked, which let the agent read
      // ANY object of the submissions/plans/audio/support/chat-attachments
      // buckets, i.e. cross-org Storage reads.
      if (objectPath.includes("..") || !isOwnStoragePath(objectPath, ctx.organizationId)) {
        console.warn(
          `[tool:fetch_file_content] Denied path outside org ${ctx.organizationId}: ${bucket}/${objectPath}`
        );
        return {
          error: true,
          message:
            "Access denied: file path is not scoped to your organization. Expected a path of the form {organization_id}/... or {prefix}/{organization_id}/...",
        };
      }

      const { data, error } = await ctx.admin.storage.from(bucket).download(objectPath);
      if (error || !data) {
        return { error: true, message: `Storage download failed (bucket=${bucket}): ${error?.message}` };
      }
      buffer = Buffer.from(await data.arrayBuffer());
    }

    // Parse based on type — normalize MIME types to extensions
    const ft = (fileType || "").toLowerCase();
    let text = "";

    switch (true) {
      case ft === "pdf" || ft.includes("pdf"): {
        try {
          const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
          const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
          const pages: string[] = [];
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            pages.push(content.items.map((item: any) => item.str || "").join(" "));
          }
          text = pages.join("\n\n");
        } catch (e: any) {
          console.warn("[fetch_file_content] pdfjs parse failed:", e.message);
        }
        break;
      }
      case ft === "xlsx" || ft === "xls" || ft.includes("spreadsheet") || ft.includes("excel"): {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buffer, { type: "buffer" });
        for (const name of wb.SheetNames) {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
          const lines = csv.split("\n").filter((l: string) => l.replace(/,/g, "").trim());
          if (lines.length > 1) text += `\n=== ${name} ===\n${lines.join("\n")}`;
        }
        break;
      }
      case ft === "msg": {
        const { default: MsgReader } = await import("@kenjiuno/msgreader");
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        const reader = new MsgReader(arrayBuffer as ArrayBuffer);
        const msg = reader.getFileData();
        text = `From: ${(msg as any).senderName} <${(msg as any).senderEmail}>\nSubject: ${(msg as any).subject}\n\n${(msg as any).body || ""}`;
        break;
      }
      default:
        text = buffer.toString("utf-8");
    }

    return {
      file_type: fileType,
      text_length: text.length,
      content: text.slice(0, 200_000),
    };
  },

  save_extracted_prices: async (input, ctx) => {
    // FIX #4: Never trust agent-supplied organization_id
    const orgId = ctx.organizationId;
    let prices: any[];

    try {
      prices = typeof input.prices === "string" ? JSON.parse(input.prices as string) : input.prices;
    } catch {
      return { error: true, message: "Invalid prices JSON" };
    }

    // Deduplication: fetch existing entries for this org to skip duplicates.
    // Match on (supplier_name, normalized_description, unit) — same price from same supplier = duplicate.
    // NOTE: Cap at 20K rows. For orgs with >20K ingested lines, some duplicates may slip through.
    // A DB-level unique constraint would be more robust but requires a migration.
    let existingKeys = new Set<string>();
    try {
      const { data: existing } = await (ctx.admin as any)
        .from("ingested_offer_lines")
        .select("supplier_name, normalized_description, unit")
        .eq("organization_id", orgId)
        .limit(20_000);
      if (existing?.length) {
        existingKeys = new Set(
          existing.map((e: any) =>
            `${(e.supplier_name || "").toLowerCase()}|${e.normalized_description || ""}|${(e.unit || "").toLowerCase()}`
          )
        );
      }
    } catch {
      // Non-fatal: proceed without dedup if query fails
    }

    const rows = prices
      .map((p: any) => ({
        organization_id: orgId,
        supplier_name: p.supplier_name,
        description: p.description,
        normalized_description: p.description?.toLowerCase().trim(),
        unit: p.unit,
        quantity: p.quantity,
        unit_price: p.unit_price,
        total_price: p.total_price,
        cfc_code: p.cfc_code,
        source: "managed_agent",
        source_file: p.source_file,
        imported_at: new Date().toISOString(),
      }))
      .filter((row: any) => {
        const key = `${(row.supplier_name || "").toLowerCase()}|${row.normalized_description || ""}|${(row.unit || "").toLowerCase()}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key); // Also dedup within the current batch
        return true;
      });

    if (rows.length === 0) {
      return { success: true, saved: 0, skipped_duplicates: prices.length };
    }

    const { error } = await (ctx.admin as any)
      .from("ingested_offer_lines")
      .insert(rows);

    if (error) {
      return { error: true, message: `Insert failed: ${error.message}` };
    }

    const skipped = prices.length - rows.length;
    return { success: true, saved: rows.length, ...(skipped > 0 ? { skipped_duplicates: skipped } : {}) };
  },

  // ── Email Drafter Tools ─────────────────────────────────

  fetch_emails_needing_response: async (input, ctx) => {
    const limit = Math.min(Number(input.limit) || 20, 50);

    // Emails classified as action_required/urgent, not yet drafted, received in last 3 days
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

    const { data: emails, error } = await (ctx.admin as any)
      .from("email_records")
      .select("id, subject, sender_name, sender_email, body_preview, body_text, classification, received_at, project_id")
      .eq("user_id", ctx.userId)
      .in("classification", ["action_required", "urgent"])
      .is("response_drafted_at", null)
      .gte("received_at", threeDaysAgo)
      .order("received_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[tool:fetch_emails_needing_response]", error.message);
      return { error: true, message: error.message };
    }

    // Filter out emails that already have a pending draft
    const emailIds = (emails || []).map((e: any) => e.id);
    let existingDraftIds = new Set<string>();
    if (emailIds.length > 0) {
      const { data: drafts } = await (ctx.admin as any)
        .from("email_drafts")
        .select("email_record_id")
        .in("email_record_id", emailIds)
        .eq("status", "pending");
      existingDraftIds = new Set((drafts || []).map((d: any) => d.email_record_id));
    }

    const needingResponse = (emails || []).filter((e: any) => !existingDraftIds.has(e.id));

    return {
      emails: needingResponse,
      count: needingResponse.length,
      total_action_emails: (emails || []).length,
      already_drafted: existingDraftIds.size,
    };
  },

  fetch_email_thread: async (input, ctx) => {
    const emailId = input.email_record_id as string;

    // Fetch the email record
    const { data: email, error } = await (ctx.admin as any)
      .from("email_records")
      .select("id, subject, sender_name, sender_email, recipients, body_text, body_html, body_preview, received_at, outlook_message_id, project_id, user_id")
      .eq("id", emailId)
      .maybeSingle();

    if (error || !email) {
      return { error: true, message: "Email not found" };
    }

    // Verify ownership
    if (email.user_id !== ctx.userId) {
      return { error: true, message: "Access denied" };
    }

    // Try to find thread messages (same conversation)
    const threadMessages: any[] = [];
    if (email.subject) {
      // Get recent emails from same sender/recipient with related subjects
      const baseSubject = email.subject.replace(/^(RE|FW|FWD|AW|WG):\s*/gi, "").trim();
      const { data: related } = await (ctx.admin as any)
        .from("email_records")
        .select("id, subject, sender_name, sender_email, body_text, body_preview, received_at")
        .eq("user_id", ctx.userId)
        .ilike("subject", `%${baseSubject.slice(0, 60)}%`)
        .order("received_at", { ascending: true })
        .limit(10);

      if (related) threadMessages.push(...related);
    }

    // If no thread found, just return the single email
    if (threadMessages.length === 0) {
      threadMessages.push(email);
    }

    return {
      email_id: email.id,
      project_id: email.project_id,
      thread: threadMessages.map((m: any) => ({
        sender: m.sender_name || m.sender_email,
        date: m.received_at,
        body: m.body_text || m.body_preview || "",
      })),
    };
  },

  fetch_project_context: async (input, ctx) => {
    const projectId = input.project_id as string;

    const { data: project, error } = await (ctx.admin as any)
      .from("projects")
      .select("id, name, code, client_name, city, status, description, organization_id")
      .eq("id", projectId)
      .maybeSingle();

    if (error || !project || project.organization_id !== ctx.organizationId) {
      return { error: true, message: "Project not found or access denied" };
    }

    // Fetch recent tasks and submission deadlines in parallel
    const [tasksRes, submissionsRes, membersRes] = await Promise.all([
      (ctx.admin as any)
        .from("tasks")
        .select("title, status, priority, due_date")
        .eq("project_id", projectId)
        .in("status", ["todo", "in_progress", "waiting"])
        .order("due_date", { ascending: true })
        .limit(10),
      (ctx.admin as any)
        .from("submissions")
        .select("title, deadline, status")
        .eq("project_id", projectId)
        .in("status", ["draft", "sent", "responses"])
        .limit(5),
      (ctx.admin as any)
        .from("project_members")
        .select("user_id, role, users(first_name, last_name, email)")
        .eq("project_id", projectId)
        .limit(10),
    ]);

    return {
      project: {
        name: project.name,
        code: project.code,
        client: project.client_name,
        city: project.city,
        status: project.status,
      },
      open_tasks: tasksRes.data || [],
      active_submissions: submissionsRes.data || [],
      team_members: (membersRes.data || []).map((m: any) => ({
        name: `${m.users?.first_name || ""} ${m.users?.last_name || ""}`.trim(),
        email: m.users?.email,
        role: m.role,
      })),
    };
  },

  save_email_draft: async (input, ctx) => {
    const emailId = input.email_record_id as string;
    const subject = input.subject as string;
    const draftBody = input.draft_body as string;
    const confidence = parseFloat(input.confidence as string) || 0.80;
    let contextUsed = {};
    try {
      contextUsed = input.context_used
        ? (typeof input.context_used === "string" ? JSON.parse(input.context_used as string) : input.context_used)
        : {};
    } catch { /* use empty object */ }

    // Verify email exists and belongs to user
    const { data: email } = await (ctx.admin as any)
      .from("email_records")
      .select("id, project_id, user_id")
      .eq("id", emailId)
      .maybeSingle();

    if (!email || email.user_id !== ctx.userId) {
      return { error: true, message: "Email not found or access denied" };
    }

    // Insert draft
    const { error } = await (ctx.admin as any)
      .from("email_drafts")
      .insert({
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
        email_record_id: emailId,
        project_id: email.project_id,
        subject,
        draft_body: draftBody,
        confidence,
        context_used: contextUsed,
        status: "pending",
        agent_session_id: ctx.sessionId,
      });

    if (error) {
      return { error: true, message: `Save failed: ${error.message}` };
    }

    // Mark email as drafted
    await (ctx.admin as any)
      .from("email_records")
      .update({ response_drafted_at: new Date().toISOString() })
      .eq("id", emailId);

    return { success: true, message: `Draft saved for email ${emailId}` };
  },

  // ── Followup Engine Tools ───────────────────────────────

  scan_overdue_items: async (_input, ctx) => {
    const orgId = ctx.organizationId;
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const results: any[] = [];
    // supabase-js does not throw: a query error lands in {error}, not the
    // catch. Track it so the agent/notification does not report "nothing
    // overdue" when a scan actually failed.
    let partial = false;

    // 1. Price requests without response (> 7 days)
    try {
      const { data: priceRequests, error: prErr } = await (ctx.admin as any)
        .from("submission_price_requests")
        .select("id, submission_id, supplier_id, status, sent_at, submissions!inner(title, deadline, project_id, projects!inner(name, organization_id)), suppliers(company_name, contact_name, email)")
        .eq("submissions.projects.organization_id", orgId)
        .eq("status", "sent")
        .lt("sent_at", sevenDaysAgo);
      if (prErr) { partial = true; console.warn("[scan_overdue_items] Price requests error:", prErr.message); }

      for (const pr of priceRequests || []) {
        const daysSent = Math.floor((Date.now() - new Date(pr.sent_at).getTime()) / 86400000);
        results.push({
          followup_type: "price_request_no_response",
          // source_id is the PRICE REQUEST itself, so the "send" action can
          // resolve and remind exactly this supplier. It used to be the
          // submission id, which made deliverFollowup re-scan the submission
          // and sometimes remind the wrong supplier.
          source_type: "price_request",
          source_id: pr.id,
          submission_id: pr.submission_id, // metadata for the agent's context
          project_id: pr.submissions?.project_id,
          supplier_id: pr.supplier_id,
          title: `Prix sans réponse : ${pr.suppliers?.company_name || "Fournisseur"}`,
          description: `Demande de prix pour "${pr.submissions?.title}" envoyée il y a ${daysSent} jours`,
          days_overdue: daysSent - 7,
          recipient_email: pr.suppliers?.email,
          recipient_name: pr.suppliers?.contact_name || pr.suppliers?.company_name,
          project_name: pr.submissions?.projects?.name,
          submission_title: pr.submissions?.title,
          submission_deadline: pr.submissions?.deadline,
        });
      }
    } catch (e: any) {
      console.warn("[scan_overdue_items] Price requests scan failed:", e.message);
    }

    // 2. Overdue tasks
    try {
      const { data: tasks, error: tasksErr } = await (ctx.admin as any)
        .from("tasks")
        .select("id, title, status, priority, due_date, project_id, assigned_to, projects!inner(name, organization_id)")
        .eq("projects.organization_id", orgId)
        .in("status", ["todo", "in_progress", "waiting"])
        .lt("due_date", today)
        .order("due_date", { ascending: true })
        .limit(30);
      if (tasksErr) { partial = true; console.warn("[scan_overdue_items] Tasks error:", tasksErr.message); }

      for (const task of tasks || []) {
        const daysOver = Math.floor((Date.now() - new Date(task.due_date).getTime()) / 86400000);
        results.push({
          followup_type: "overdue_task",
          source_type: "task",
          source_id: task.id,
          project_id: task.project_id,
          title: `Tâche en retard : ${task.title}`,
          description: `En retard de ${daysOver} jour(s), priorité ${task.priority}`,
          days_overdue: daysOver,
          project_name: task.projects?.name,
          priority: task.priority,
        });
      }
    } catch (e: any) {
      console.warn("[scan_overdue_items] Tasks scan failed:", e.message);
    }

    // 3. Submission deadlines approaching (< 7 days)
    try {
      const { data: submissions, error: subErr } = await (ctx.admin as any)
        .from("submissions")
        .select("id, title, deadline, status, project_id, projects!inner(name, organization_id)")
        .eq("projects.organization_id", orgId)
        .in("status", ["draft", "sent", "responses"])
        .gte("deadline", today)
        .lte("deadline", sevenDaysFromNow);
      if (subErr) { partial = true; console.warn("[scan_overdue_items] Submissions error:", subErr.message); }

      for (const sub of submissions || []) {
        const daysRemaining = Math.floor((new Date(sub.deadline).getTime() - Date.now()) / 86400000);
        results.push({
          followup_type: "submission_deadline",
          source_type: "submission",
          source_id: sub.id,
          project_id: sub.project_id,
          title: `Deadline soumission : ${sub.title}`,
          description: `Deadline dans ${daysRemaining} jour(s) — statut: ${sub.status}`,
          days_overdue: -daysRemaining, // negative = not yet overdue
          project_name: sub.projects?.name,
        });
      }
    } catch (e: any) {
      console.warn("[scan_overdue_items] Submissions scan failed:", e.message);
    }

    // 4. Reserves without deadline (if tables exist)
    try {
      const { data: reserves } = await (ctx.admin as any)
        .from("reception_reserves")
        .select("id, description, severity, status, deadline, project_receptions!inner(project_id, projects!inner(name, organization_id))")
        .eq("project_receptions.projects.organization_id", orgId)
        .is("deadline", null)
        .in("status", ["open", "in_progress"]);

      for (const res of reserves || []) {
        results.push({
          followup_type: "reserve_no_deadline",
          source_type: "reserve",
          source_id: res.id,
          project_id: res.project_receptions?.project_id,
          title: `Réserve sans deadline : ${(res.description || "").slice(0, 80)}`,
          description: `Sévérité: ${res.severity}, projet: ${res.project_receptions?.projects?.name}`,
          days_overdue: 0,
          project_name: res.project_receptions?.projects?.name,
        });
      }
    } catch (e: any) {
      // Table may not exist — non-fatal
      console.warn("[scan_overdue_items] Reserves scan skipped:", e.message);
    }

    // `partial: true` tells the agent one or more scans failed, so it must not
    // conclude "nothing is overdue" from an incomplete result set.
    return { items: results, total: results.length, partial };
  },

  fetch_item_context: async (input, ctx) => {
    const sourceType = input.source_type as string;
    const sourceId = input.source_id as string;

    if (sourceType === "price_request") {
      const { data: pr } = await (ctx.admin as any)
        .from("submission_price_requests")
        .select("id, submission_id, status, sent_at, material_group, tracking_code, relance_count, last_relance_at, supplier_id, suppliers(company_name, email, contact_name), submissions!inner(title, deadline, status, project_id, projects!inner(name, code, client_name, organization_id))")
        .eq("id", sourceId)
        .maybeSingle();

      if (!pr || pr.submissions?.projects?.organization_id !== ctx.organizationId) {
        return { error: true, message: "Not found or access denied" };
      }

      return {
        type: "price_request",
        price_request: {
          status: pr.status,
          sent_at: pr.sent_at,
          material_group: pr.material_group,
          tracking_code: pr.tracking_code,
          relance_count: pr.relance_count,
          last_relance_at: pr.last_relance_at,
          supplier: pr.suppliers?.company_name,
          email: pr.suppliers?.email,
          contact: pr.suppliers?.contact_name,
        },
        submission: { title: pr.submissions?.title, deadline: pr.submissions?.deadline, status: pr.submissions?.status },
        project: { name: pr.submissions?.projects?.name, code: pr.submissions?.projects?.code, client: pr.submissions?.projects?.client_name },
      };
    }

    if (sourceType === "submission") {
      const { data: sub } = await (ctx.admin as any)
        .from("submissions")
        .select("id, title, reference, deadline, status, project_id, projects!inner(name, code, client_name, organization_id)")
        .eq("id", sourceId)
        .maybeSingle();

      if (!sub || sub.projects?.organization_id !== ctx.organizationId) {
        return { error: true, message: "Not found or access denied" };
      }

      // Get price request details
      const { data: requests } = await (ctx.admin as any)
        .from("submission_price_requests")
        .select("id, status, sent_at, supplier_id, suppliers(company_name, email, contact_name)")
        .eq("submission_id", sourceId);

      return {
        type: "submission",
        submission: { title: sub.title, reference: sub.reference, deadline: sub.deadline, status: sub.status },
        project: { name: sub.projects?.name, code: sub.projects?.code, client: sub.projects?.client_name },
        price_requests: (requests || []).map((r: any) => ({
          status: r.status,
          sent_at: r.sent_at,
          supplier: r.suppliers?.company_name,
          email: r.suppliers?.email,
          contact: r.suppliers?.contact_name,
        })),
      };
    }

    if (sourceType === "task") {
      const { data: task } = await (ctx.admin as any)
        .from("tasks")
        .select("id, title, description, status, priority, due_date, project_id, projects!inner(name, organization_id)")
        .eq("id", sourceId)
        .maybeSingle();

      if (!task || task.projects?.organization_id !== ctx.organizationId) {
        return { error: true, message: "Not found or access denied" };
      }

      return {
        type: "task",
        task: { title: task.title, description: task.description, status: task.status, priority: task.priority, due_date: task.due_date },
        project: { name: task.projects?.name },
      };
    }

    return { error: true, message: `Unsupported source_type: ${sourceType}` };
  },

  save_followup_items: async (input, ctx) => {
    let items: any[];
    try {
      items = typeof input.items === "string" ? JSON.parse(input.items as string) : input.items;
    } catch {
      return { error: true, message: "Invalid items JSON" };
    }

    if (!Array.isArray(items) || items.length === 0) {
      return { success: true, saved: 0, message: "No followup items to save" };
    }

    const rows = items.map((item: any) => ({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      followup_type: item.followup_type,
      source_type: item.source_type,
      source_id: item.source_id || null,
      project_id: item.project_id || null,
      supplier_id: item.supplier_id || null,
      title: item.title,
      description: item.description || null,
      urgency: item.urgency || "medium",
      suggested_action: item.suggested_action || null,
      draft_email_subject: item.draft_email_subject || null,
      draft_email_body: item.draft_email_body || null,
      recipient_email: item.recipient_email || null,
      recipient_name: item.recipient_name || null,
      days_overdue: item.days_overdue || null,
      status: "pending",
      agent_session_id: ctx.sessionId,
    }));

    // ── Dedup against the PARTIAL unique index (migration 104) ──
    // The index is (organization_id, followup_type, source_id)
    // WHERE status IN ('pending','snoozed') — ON CONFLICT cannot infer a
    // partial index (42P10), so this handler NEVER uses upsert: it pre-checks
    // the existing rows and inserts plainly, treating 23505 as a concurrent-run
    // skip. Existing rows are handled explicitly:
    //   • still pending                        → refresh the mutable fields
    //   • snoozed / approved                   → left untouched
    //   • sent > 5 days ago                    → re-detect (insert a new item)
    //   • dismissed > 14 days ago              → re-detect (insert a new item)
    //   • sent/dismissed more recently         → skip (still fresh in memory)
    //   • unknown                              → inserted
    const RESURFACE_AFTER_SENT_MS = 5 * 86400000;
    const RESURFACE_AFTER_DISMISSED_MS = 14 * 86400000;

    const sourceIds = Array.from(
      new Set(rows.map((r) => r.source_id).filter(Boolean))
    ) as string[];

    // Several rows per key can exist now (handled history + one open item).
    const existingByKey = new Map<string, any[]>();
    if (sourceIds.length > 0) {
      // select("*") on purpose: sent_at only exists from migration 099 on, and
      // naming it explicitly would fail the whole query on an older database.
      const { data: existing, error: existingError } = await (ctx.admin as any)
        .from("followup_items")
        .select("*")
        .eq("organization_id", ctx.organizationId)
        .in("source_id", sourceIds);

      if (existingError) {
        console.warn("[save_followup_items] existing lookup failed:", existingError.message);
      }
      for (const row of existing || []) {
        const key = `${row.source_id}|${row.followup_type}`;
        const list = existingByKey.get(key) || [];
        list.push(row);
        existingByKey.set(key, list);
      }
    }

    const newRows: typeof rows = [];
    const queuedKeys = new Set<string>();
    let refreshed = 0;
    let skipped = 0;

    for (const row of rows) {
      const key = row.source_id ? `${row.source_id}|${row.followup_type}` : null;
      const existingList = key ? existingByKey.get(key) || [] : [];

      const openItem = existingList.find(
        (e) => e.status === "pending" || e.status === "snoozed"
      );

      if (openItem) {
        if (openItem.status === "snoozed") {
          skipped++; // deliberately postponed by a human — do not touch
          continue;
        }
        // pending → refresh the mutable fields
        const { error: updateError } = await (ctx.admin as any)
          .from("followup_items")
          .update({
            title: row.title,
            description: row.description,
            urgency: row.urgency,
            suggested_action: row.suggested_action,
            draft_email_subject: row.draft_email_subject,
            draft_email_body: row.draft_email_body,
            recipient_email: row.recipient_email,
            recipient_name: row.recipient_name,
            days_overdue: row.days_overdue,
            project_id: row.project_id,
            supplier_id: row.supplier_id,
            agent_session_id: row.agent_session_id,
          })
          .eq("id", openItem.id);

        if (updateError) {
          console.warn("[save_followup_items] Refresh failed:", updateError.message);
        } else {
          refreshed++;
        }
        continue;
      }

      if (existingList.length > 0) {
        // Only handled items exist — the most recent one decides re-detection.
        const latest = existingList.reduce((a, b) =>
          String(a.updated_at || a.created_at || "") >= String(b.updated_at || b.created_at || "")
            ? a
            : b
        );
        const referenceTs = new Date(
          latest.sent_at || latest.updated_at || latest.created_at || 0
        ).getTime();
        const age = Date.now() - (Number.isFinite(referenceTs) ? referenceTs : 0);

        const canResurface =
          (latest.status === "sent" && age > RESURFACE_AFTER_SENT_MS) ||
          (latest.status === "dismissed" && age > RESURFACE_AFTER_DISMISSED_MS);

        if (!canResurface) {
          skipped++; // recently handled — do not resurrect yet
          continue;
        }
      }

      // Guard against the model listing the same source twice in one batch.
      if (key) {
        if (queuedKeys.has(key)) {
          skipped++;
          continue;
        }
        queuedKeys.add(key);
      }
      newRows.push(row);
    }

    let saved = 0;
    if (newRows.length > 0) {
      const { data: inserted, error } = await (ctx.admin as any)
        .from("followup_items")
        .insert(newRows)
        .select("id");

      if (error && error.code === "23505") {
        // Concurrent run won the race on some rows: retry one by one and skip
        // the conflicting ones (a batch insert is all-or-nothing).
        for (const row of newRows) {
          const { error: rowError } = await (ctx.admin as any)
            .from("followup_items")
            .insert(row);
          if (!rowError) {
            saved++;
          } else if (rowError.code === "23505") {
            skipped++;
          } else {
            console.warn("[save_followup_items] row insert failed:", rowError.message);
          }
        }
      } else if (error) {
        console.error("[save_followup_items]", error.message);
        return { error: true, message: error.message };
      } else {
        saved = inserted?.length ?? newRows.length;
      }
    }

    return {
      success: true,
      saved,
      refreshed,
      skipped_already_handled: skipped,
      total: items.length,
    };
  },

  // ── Supplier Monitor Tools ──────────────────────────────

  fetch_all_suppliers_data: async (_input, ctx) => {
    const orgId = ctx.organizationId;

    const { data: suppliers, error } = await (ctx.admin as any)
      .from("suppliers")
      .select("id, company_name, contact_name, email, phone, specialties, cfc_codes, response_rate, reliability_score, overall_score, supplier_type, last_monitored_at, created_at")
      .eq("organization_id", orgId)
      .order("overall_score", { ascending: true })
      .limit(100);

    if (error) {
      return { error: true, message: error.message };
    }

    // Enrich with recent activity
    const supplierIds = (suppliers || []).map((s: any) => s.id);
    let recentOffers: any[] = [];
    let pendingRequests: any[] = [];

    if (supplierIds.length > 0) {
      // supabase-js does not throw — the error is in {error}, not the catch.
      const { data: offers, error: offersErr } = await (ctx.admin as any)
        .from("supplier_offers")
        .select("id, supplier_id, total_amount, status, submitted_at")
        .in("supplier_id", supplierIds)
        .order("submitted_at", { ascending: false })
        .limit(200);
      if (offersErr) {
        console.warn("[fetch_all_suppliers_data] Offers error (non-fatal):", offersErr.message);
      }
      recentOffers = offers || [];

      const { data: requests, error: reqErr } = await (ctx.admin as any)
        .from("submission_price_requests")
        .select("id, supplier_id, status, sent_at")
        .in("supplier_id", supplierIds)
        .order("sent_at", { ascending: false })
        .limit(200);
      if (reqErr) {
        console.warn("[fetch_all_suppliers_data] Requests error (non-fatal):", reqErr.message);
      }
      pendingRequests = requests || [];
    }

    // Build per-supplier metrics
    const enriched = (suppliers || []).map((s: any) => {
      const offers = recentOffers.filter((o: any) => o.supplier_id === s.id);
      const requests = pendingRequests.filter((r: any) => r.supplier_id === s.id);
      const pending = requests.filter((r: any) => r.status === "sent");

      return {
        ...s,
        total_offers: offers.length,
        pending_requests: pending.length,
        last_offer_date: offers[0]?.submitted_at || null,
        avg_response_days: pending.length > 0
          ? Math.round(pending.reduce((sum: number, r: any) => sum + (Date.now() - new Date(r.sent_at).getTime()) / 86400000, 0) / pending.length)
          : null,
      };
    });

    return { suppliers: enriched, count: enriched.length };
  },

  fetch_supplier_history: async (input, ctx) => {
    const supplierId = input.supplier_id as string;

    // Verify ownership
    const { data: supplier } = await (ctx.admin as any)
      .from("suppliers")
      .select("id, company_name, organization_id")
      .eq("id", supplierId)
      .maybeSingle();

    if (!supplier || supplier.organization_id !== ctx.organizationId) {
      return { error: true, message: "Supplier not found or access denied" };
    }

    // Fetch offers history
    const { data: offers, error: offersErr } = await (ctx.admin as any)
      .from("supplier_offers")
      .select("id, total_amount, status, submitted_at, submission_id")
      .eq("supplier_id", supplierId)
      .order("submitted_at", { ascending: false })
      .limit(50);
    if (offersErr) {
      console.warn("[fetch_supplier_history] Offers error (non-fatal):", offersErr.message);
    }

    // Fetch price request history
    const { data: requests, error: reqErr } = await (ctx.admin as any)
      .from("submission_price_requests")
      .select("id, status, sent_at, responded_at")
      .eq("supplier_id", supplierId)
      .order("sent_at", { ascending: false })
      .limit(50);
    if (reqErr) {
      console.warn("[fetch_supplier_history] Requests error (non-fatal):", reqErr.message);
    }

    // Calculate trends
    const offerAmounts = (offers || [])
      .filter((o: any) => o.total_amount)
      .map((o: any) => ({ date: o.submitted_at, amount: o.total_amount }));

    const responseTimes = (requests || [])
      .filter((r: any) => r.responded_at && r.sent_at)
      .map((r: any) => ({
        date: r.sent_at,
        days: Math.round((new Date(r.responded_at).getTime() - new Date(r.sent_at).getTime()) / 86400000),
      }));

    return {
      supplier_name: supplier.company_name,
      offers: offerAmounts,
      response_times: responseTimes,
      total_offers: (offers || []).length,
      total_requests: (requests || []).length,
    };
  },

  save_supplier_alerts: async (input, ctx) => {
    let alerts: any[];
    try {
      alerts = typeof input.alerts === "string" ? JSON.parse(input.alerts as string) : input.alerts;
    } catch {
      return { error: true, message: "Invalid alerts JSON" };
    }

    if (!Array.isArray(alerts) || alerts.length === 0) {
      return { success: true, saved: 0, message: "No alerts to save" };
    }

    // ── AGT.M1: verify EVERY supplier_id belongs to the caller's org ──
    // Both the INSERT into supplier_alerts and the UPDATE on suppliers below
    // are driven by agent-supplied ids: without this check they can target
    // another organization's suppliers.
    const claimedSupplierIds = Array.from(
      new Set(alerts.map((a: any) => a.supplier_id).filter(Boolean))
    ) as string[];

    if (claimedSupplierIds.length === 0 || alerts.some((a: any) => !a.supplier_id)) {
      return {
        error: true,
        message: "Each alert must carry a supplier_id returned by fetch_all_suppliers_data",
      };
    }

    const { data: ownedSuppliers, error: ownershipError } = await (ctx.admin as any)
      .from("suppliers")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .in("id", claimedSupplierIds);

    if (ownershipError) {
      return { error: true, message: `Supplier ownership check failed: ${ownershipError.message}` };
    }

    const ownedIds = new Set<string>((ownedSuppliers || []).map((s: any) => s.id));
    const foreignIds = claimedSupplierIds.filter((id) => !ownedIds.has(id));

    if (foreignIds.length > 0) {
      console.warn(
        `[tool:save_supplier_alerts] Denied ${foreignIds.length} supplier(s) outside org ${ctx.organizationId}`
      );
      return {
        error: true,
        message: `Access denied: ${foreignIds.length} supplier_id(s) do not belong to your organization. Only suppliers returned by fetch_all_suppliers_data can be used.`,
      };
    }

    // Resolve previous active alerts for same supplier+category
    const supplierCategories = alerts.map((a: any) => `${a.supplier_id}|${a.category}`);
    const uniquePairs = Array.from(new Set(supplierCategories));

    for (const pair of uniquePairs) {
      const [supplierId, category] = pair.split("|");
      await (ctx.admin as any)
        .from("supplier_alerts")
        .update({ status: "resolved", updated_at: new Date().toISOString() })
        .eq("organization_id", ctx.organizationId)
        .eq("supplier_id", supplierId)
        .eq("category", category)
        .eq("status", "active");
    }

    // Insert new alerts
    const rows = alerts.map((a: any) => ({
      organization_id: ctx.organizationId,
      supplier_id: a.supplier_id,
      alert_type: a.alert_type,
      category: a.category,
      title: a.title,
      description: a.description,
      data: a.data || {},
      recommended_action: a.recommended_action || null,
      status: "active",
      agent_session_id: ctx.sessionId,
    }));

    const { error } = await (ctx.admin as any)
      .from("supplier_alerts")
      .insert(rows);

    if (error) {
      return { error: true, message: error.message };
    }

    // Update last_monitored_at on suppliers (org-scoped, defense in depth)
    await (ctx.admin as any)
      .from("suppliers")
      .update({ last_monitored_at: new Date().toISOString() })
      .eq("organization_id", ctx.organizationId)
      .in("id", claimedSupplierIds);

    return { success: true, saved: rows.length, total: alerts.length };
  },

  // ── Project Memory Tools (AGT.C1 — were missing entirely) ──
  //
  // The "project-memory" agent declared these three tools in the registry but
  // no handler existed, so every call returned "Unknown custom tool": the loop
  // burned its Sonnet iterations per org per run and `project_memory` was
  // never written. That is why its schedule was pulled from vercel.json.

  fetch_org_projects: async (_input, ctx) => {
    const { data: projects, error } = await (ctx.admin as any)
      .from("projects")
      .select("id, name, code, status, client_name, city, start_date, end_date, updated_at")
      .eq("organization_id", ctx.organizationId)
      .in("status", ["planning", "active", "paused", "on_hold", "closing"])
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[tool:fetch_org_projects]", error.message);
      return { error: true, message: error.message };
    }

    // Tell the agent which projects already have a memory snapshot and how
    // old it is, so it can prioritise instead of redoing everything.
    const ids = (projects || []).map((p: any) => p.id);
    const memoryAge: Record<string, string | null> = {};
    if (ids.length > 0) {
      const { data: memories } = await (ctx.admin as any)
        .from("project_memory")
        .select("project_id, generated_at")
        .eq("organization_id", ctx.organizationId)
        .in("project_id", ids);
      for (const m of memories || []) memoryAge[m.project_id] = m.generated_at;
    }

    return {
      projects: (projects || []).map((p: any) => ({
        ...p,
        memory_generated_at: memoryAge[p.id] || null,
      })),
      count: projects?.length || 0,
    };
  },

  fetch_project_full_state: async (input, ctx) => {
    const projectId = input.project_id as string;

    const access = await checkProjectAccess(
      ctx,
      projectId,
      "id, name, code, status, client_name, city, description, budget_total, start_date, end_date"
    );
    if (!access.allowed) return access.error;
    const project = access.project;

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    // Every source is independently tolerant: a module whose migration is not
    // applied yet must not abort the whole snapshot.
    const [
      emailsRes,
      tasksRes,
      submissionsRes,
      meetingsRes,
      plansRes,
      reportsRes,
      visitsRes,
      planningRes,
      reservesRes,
    ] = await Promise.allSettled([
      (ctx.admin as any)
        .from("email_records")
        .select("id, subject, sender_name, classification, ai_summary, received_at, is_processed")
        .eq("project_id", projectId)
        .gte("received_at", sevenDaysAgo)
        .order("received_at", { ascending: false })
        .limit(30),

      (ctx.admin as any)
        .from("tasks")
        .select("id, title, status, priority, due_date, lot_code, assigned_to, created_at")
        .eq("project_id", projectId)
        .in("status", ["todo", "in_progress", "waiting"])
        .order("due_date", { ascending: true })
        .limit(50),

      (ctx.admin as any)
        .from("submissions")
        .select("id, title, reference, status, deadline, product_name, created_at")
        .eq("project_id", projectId)
        .in("status", ["draft", "sent", "responses", "comparing"])
        .order("deadline", { ascending: true })
        .limit(20),

      (ctx.admin as any)
        .from("meetings")
        .select("id, title, meeting_number, meeting_date, status")
        .eq("project_id", projectId)
        .order("meeting_date", { ascending: false })
        .limit(10),

      (ctx.admin as any)
        .from("plan_registry")
        .select("id, plan_number, plan_title, discipline, status, updated_at")
        .eq("project_id", projectId)
        .eq("organization_id", ctx.organizationId)
        .order("updated_at", { ascending: false })
        .limit(20),

      (ctx.admin as any)
        .from("site_reports")
        .select("id, report_date, status, submitted_by_name, weather, remarks")
        .eq("project_id", projectId)
        .order("report_date", { ascending: false })
        .limit(15),

      (ctx.admin as any)
        .from("client_visits")
        .select("id, title, client_name, visit_date, transcription_status")
        .eq("project_id", projectId)
        .eq("organization_id", ctx.organizationId)
        .order("visit_date", { ascending: false })
        .limit(10),

      (ctx.admin as any)
        .from("planning_tasks")
        .select("id, name, cfc_code, start_date, end_date, progress, is_milestone, ai_risks, project_plannings!inner(project_id, organization_id)")
        .eq("project_plannings.project_id", projectId)
        .eq("project_plannings.organization_id", ctx.organizationId)
        .order("end_date", { ascending: true })
        .limit(60),

      (ctx.admin as any)
        .from("reception_reserves")
        .select("id, description, severity, status, deadline, location")
        .eq("project_id", projectId)
        .eq("organization_id", ctx.organizationId)
        .in("status", ["open", "in_progress", "disputed"])
        .limit(40),
    ]);

    const unwrap = (r: PromiseSettledResult<any>, label: string): any[] => {
      if (r.status === "rejected") {
        console.warn(`[tool:fetch_project_full_state] ${label} failed:`, r.reason?.message);
        return [];
      }
      if (r.value?.error) {
        console.warn(`[tool:fetch_project_full_state] ${label}:`, r.value.error.message);
        return [];
      }
      return r.value?.data || [];
    };

    const tasks = unwrap(tasksRes, "tasks");
    const planningTasks = unwrap(planningRes, "planning");
    const reports = unwrap(reportsRes, "site_reports");

    const overdueTasks = tasks.filter(
      (t: any) => t.due_date && t.due_date < today
    );
    const latePlanningTasks = planningTasks.filter(
      (t: any) => t.end_date && t.end_date < today && (t.progress ?? 0) < 1
    );

    return {
      project: {
        id: project.id,
        name: project.name,
        code: project.code,
        status: project.status,
        client: project.client_name,
        city: project.city,
        budget_total: project.budget_total,
        start_date: project.start_date,
        end_date: project.end_date,
      },
      recent_emails: unwrap(emailsRes, "emails"),
      open_tasks: tasks,
      overdue_tasks: overdueTasks,
      active_submissions: unwrap(submissionsRes, "submissions"),
      recent_meetings: unwrap(meetingsRes, "meetings"),
      plans: unwrap(plansRes, "plans"),
      // Reports are summarised: the agent needs signal, not 15 full forms.
      site_reports_summary: {
        total: reports.length,
        drafts: reports.filter((r: any) => r.status === "draft").length,
        last_report_date: reports[0]?.report_date || null,
        recent_remarks: reports
          .filter((r: any) => r.remarks)
          .slice(0, 5)
          .map((r: any) => ({ date: r.report_date, remark: String(r.remarks).slice(0, 200) })),
      },
      recent_visits: unwrap(visitsRes, "visits"),
      planning: {
        total_tasks: planningTasks.length,
        late_tasks: latePlanningTasks.map((t: any) => ({
          name: t.name,
          cfc_code: t.cfc_code,
          end_date: t.end_date,
          progress: t.progress,
          ai_risks: t.ai_risks || [],
        })),
        milestones: planningTasks
          .filter((t: any) => t.is_milestone)
          .map((t: any) => ({ name: t.name, date: t.start_date })),
      },
      open_reserves: unwrap(reservesRes, "reserves"),
      scanned_at: new Date().toISOString(),
    };
  },

  save_project_memory: async (input, ctx) => {
    const projectId = input.project_id as string;

    const access = await checkProjectAccess(ctx, projectId, "id, organization_id");
    if (!access.allowed) return access.error;

    const now = new Date().toISOString();

    // `supplier_status` is a JSONB *object* in the schema but the tool asks
    // the agent for an array — normalise so the shape in DB stays stable.
    const supplierArray = parseJsonArray(input.supplier_status);
    const supplierStatus: Record<string, unknown> = {};
    for (const s of supplierArray) {
      const key = s?.supplier_name || s?.name;
      if (!key) continue;
      supplierStatus[String(key)] = {
        name: key,
        last_contact: s.last_interaction ?? s.last_contact ?? null,
        pending_items: Array.isArray(s.pending_items) ? s.pending_items.length : 0,
        score: s.score ?? null,
        status: s.status ?? null,
        notes: s.notes ?? null,
      };
    }

    const row = {
      organization_id: ctx.organizationId,
      project_id: projectId,
      summary: typeof input.summary === "string" ? input.summary : null,
      key_facts: parseJsonArray(input.key_facts).slice(0, 50),
      active_risks: parseJsonArray(input.active_risks).slice(0, 10),
      pending_decisions: parseJsonArray(input.pending_decisions).slice(0, 10),
      open_items: parseJsonArray(input.open_items).slice(0, 30),
      supplier_status: supplierStatus,
      timeline_events: parseJsonArray(input.timeline_events).slice(0, 30),
      last_emails_scan: now,
      last_tasks_scan: now,
      last_submissions_scan: now,
      last_meetings_scan: now,
      last_plans_scan: now,
      last_reports_scan: now,
      agent_session_id: ctx.sessionId,
      generated_at: now,
      // A snapshot older than 7 days is stale for meeting prep.
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    };

    // Unique index is on (project_id) — migration 075.
    const { error } = await (ctx.admin as any)
      .from("project_memory")
      .upsert(row, { onConflict: "project_id" });

    if (error) {
      console.error("[tool:save_project_memory]", error.message);
      return { error: true, message: `Save failed: ${error.message}` };
    }

    return {
      success: true,
      project_id: projectId,
      key_facts: row.key_facts.length,
      active_risks: row.active_risks.length,
      open_items: row.open_items.length,
      message: `Mémoire projet mise à jour pour ${projectId}`,
    };
  },

  // ── Meeting Prep Tools (AGT.C1 — were missing entirely) ────

  fetch_meetings_needing_prep: async (input, ctx) => {
    const hoursAhead = Math.min(Math.max(Number(input.hours_ahead) || 3, 1), 48);
    const now = new Date();
    const horizon = new Date(now.getTime() + hoursAhead * 3600_000);

    const { data: events, error } = await (ctx.admin as any)
      .from("calendar_events")
      .select("id, title, description, location, event_type, start_at, end_at, project_id, user_id, ai_prep_status")
      .eq("organization_id", ctx.organizationId)
      .gte("start_at", now.toISOString())
      .lte("start_at", horizon.toISOString())
      .neq("status", "cancelled")
      // 'pending' is the only queued value — 'failed' is not in the CHECK
      // constraint of migration 075 and would make this filter reject rows.
      .eq("ai_prep_status", "pending")
      .order("start_at", { ascending: true })
      .limit(20);

    if (error) {
      console.error("[tool:fetch_meetings_needing_prep]", error.message);
      return { error: true, message: error.message };
    }

    const rows = events || [];
    if (rows.length === 0) {
      return { meetings: [], count: 0, message: "Aucune réunion à préparer" };
    }

    // Enrich with project name + attendees so the agent can decide what to
    // fetch next without a round-trip per meeting.
    const projectIds = Array.from(
      new Set(rows.map((e: any) => e.project_id).filter(Boolean))
    ) as string[];
    const projectMap: Record<string, any> = {};
    if (projectIds.length > 0) {
      const { data: projects } = await (ctx.admin as any)
        .from("projects")
        .select("id, name, code")
        .eq("organization_id", ctx.organizationId)
        .in("id", projectIds);
      for (const p of projects || []) projectMap[p.id] = p;
    }

    const eventIds = rows.map((e: any) => e.id);
    const invitationsByEvent: Record<string, any[]> = {};
    const { data: invitations } = await (ctx.admin as any)
      .from("calendar_invitations")
      .select("event_id, attendee_email, attendee_name, response_status, is_organizer")
      .in("event_id", eventIds);
    for (const inv of invitations || []) {
      (invitationsByEvent[inv.event_id] ||= []).push(inv);
    }

    return {
      meetings: rows.map((e: any) => ({
        event_id: e.id,
        title: e.title,
        description: e.description,
        location: e.location,
        event_type: e.event_type,
        start_at: e.start_at,
        end_at: e.end_at,
        duration_min: Math.round(
          (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 60000
        ),
        project_id: e.project_id,
        project_name: e.project_id ? projectMap[e.project_id]?.name || null : null,
        attendees: invitationsByEvent[e.id] || [],
      })),
      count: rows.length,
    };
  },

  fetch_project_memory_for_prep: async (input, ctx) => {
    const projectId = input.project_id as string;
    if (!projectId) return { memory: null, message: "Aucun projet lié à cette réunion" };

    const access = await checkProjectAccess(ctx, projectId, "id, name, organization_id");
    if (!access.allowed) return access.error;

    const { data: memory, error } = await (ctx.admin as any)
      .from("project_memory")
      .select("summary, key_facts, active_risks, pending_decisions, open_items, supplier_status, timeline_events, generated_at, expires_at")
      .eq("project_id", projectId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();

    if (error) {
      console.error("[tool:fetch_project_memory_for_prep]", error.message);
      return { error: true, message: error.message };
    }

    if (!memory) {
      return {
        memory: null,
        project_name: access.project.name,
        message:
          "Aucune mémoire projet — base-toi uniquement sur fetch_meeting_specific_data.",
      };
    }

    const generatedAt = memory.generated_at ? new Date(memory.generated_at) : null;
    const ageHours = generatedAt
      ? Math.round((Date.now() - generatedAt.getTime()) / 3600_000)
      : null;

    return {
      memory,
      project_name: access.project.name,
      age_hours: ageHours,
      // The agent must not present a week-old snapshot as current state.
      is_stale: ageHours !== null && ageHours > 168,
    };
  },

  fetch_meeting_specific_data: async (input, ctx) => {
    const eventId = input.event_id as string;

    // IDOR: the event must belong to the caller's org.
    const { data: event } = await (ctx.admin as any)
      .from("calendar_events")
      .select("id, organization_id, project_id, title, start_at, end_at, event_type, location")
      .eq("id", eventId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();

    if (!event) {
      return { error: true, message: "Calendar event not found or access denied" };
    }

    // The agent may pass a project_id; only the event's own link is trusted.
    const projectId: string | null = event.project_id || null;

    const { data: invitations } = await (ctx.admin as any)
      .from("calendar_invitations")
      .select("attendee_email, attendee_name, response_status, is_organizer")
      .eq("event_id", eventId);

    const attendeeEmails = (invitations || [])
      .map((i: any) => (i.attendee_email || "").toLowerCase())
      .filter(Boolean);

    // Resolve attendees against org members and suppliers for real context.
    const [orgMembersRes, suppliersRes] = await Promise.all([
      attendeeEmails.length
        ? (ctx.admin as any)
            .from("users")
            .select("email, first_name, last_name, role, job_title")
            .eq("organization_id", ctx.organizationId)
            .in("email", attendeeEmails)
        : Promise.resolve({ data: [] }),
      attendeeEmails.length
        ? (ctx.admin as any)
            .from("suppliers")
            .select("email, company_name, contact_name, overall_score")
            .eq("organization_id", ctx.organizationId)
            .in("email", attendeeEmails)
        : Promise.resolve({ data: [] }),
    ]);

    const memberByEmail: Record<string, any> = {};
    for (const m of orgMembersRes.data || []) {
      memberByEmail[(m.email || "").toLowerCase()] = m;
    }
    const supplierByEmail: Record<string, any> = {};
    for (const s of suppliersRes.data || []) {
      supplierByEmail[(s.email || "").toLowerCase()] = s;
    }

    const attendees = (invitations || []).map((i: any) => {
      const email = (i.attendee_email || "").toLowerCase();
      const member = memberByEmail[email];
      const supplier = supplierByEmail[email];
      return {
        name:
          i.attendee_name ||
          (member ? `${member.first_name || ""} ${member.last_name || ""}`.trim() : null) ||
          supplier?.contact_name ||
          email.split("@")[0],
        email: i.attendee_email,
        role: member?.job_title || member?.role || (supplier ? "fournisseur" : null),
        company: supplier?.company_name || null,
        supplier_score: supplier?.overall_score ?? null,
        response_status: i.response_status,
        is_organizer: i.is_organizer,
      };
    });

    if (!projectId) {
      return {
        event: {
          id: event.id,
          title: event.title,
          start_at: event.start_at,
          end_at: event.end_at,
          event_type: event.event_type,
          location: event.location,
        },
        project: null,
        unread_emails: [],
        overdue_tasks: [],
        open_reserves: [],
        pending_submissions: [],
        attendees,
        message: "Réunion sans projet lié — contexte limité aux participants.",
      };
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const [emailsRes, tasksRes, reservesRes, submissionsRes, projectRes] =
      await Promise.allSettled([
        (ctx.admin as any)
          .from("email_records")
          .select("id, subject, sender_name, sender_email, received_at, classification, ai_summary, body_preview")
          .eq("project_id", projectId)
          .in("classification", ["action_required", "urgent"])
          .eq("is_processed", false)
          .gte("received_at", sevenDaysAgo)
          .order("received_at", { ascending: false })
          .limit(10),

        (ctx.admin as any)
          .from("tasks")
          .select("id, title, status, priority, due_date, lot_code, assigned_to")
          .eq("project_id", projectId)
          .in("status", ["todo", "in_progress", "waiting"])
          .lt("due_date", today)
          .order("due_date", { ascending: true })
          .limit(20),

        (ctx.admin as any)
          .from("reception_reserves")
          .select("id, description, severity, status, location, deadline")
          .eq("project_id", projectId)
          .eq("organization_id", ctx.organizationId)
          .in("status", ["open", "in_progress", "disputed"])
          .limit(20),

        (ctx.admin as any)
          .from("submissions")
          .select("id, title, deadline, status")
          .eq("project_id", projectId)
          .in("status", ["sent", "responses", "comparing"])
          .order("deadline", { ascending: true })
          .limit(10),

        (ctx.admin as any)
          .from("projects")
          .select("id, name, code, client_name, city, status")
          .eq("id", projectId)
          .maybeSingle(),
      ]);

    const unwrap = (r: PromiseSettledResult<any>, label: string): any[] => {
      if (r.status === "rejected") {
        console.warn(`[tool:fetch_meeting_specific_data] ${label}:`, r.reason?.message);
        return [];
      }
      if (r.value?.error) return [];
      return r.value?.data || [];
    };

    const overdueTasks = unwrap(tasksRes, "tasks").map((t: any) => ({
      ...t,
      days_overdue: t.due_date
        ? Math.max(0, Math.floor((Date.now() - new Date(t.due_date).getTime()) / 86400000))
        : 0,
    }));

    // Offers received vs suppliers contacted, per submission.
    const submissions = unwrap(submissionsRes, "submissions");
    const submissionIds = submissions.map((s: any) => s.id);
    const offerCounts: Record<string, { received: number; requested: number }> = {};
    if (submissionIds.length > 0) {
      try {
        const { data: requests } = await (ctx.admin as any)
          .from("submission_price_requests")
          .select("submission_id, status")
          .in("submission_id", submissionIds);
        for (const r of requests || []) {
          const entry = (offerCounts[r.submission_id] ||= { received: 0, requested: 0 });
          entry.requested++;
          if (r.status === "responded" || r.status === "received") entry.received++;
        }
      } catch {
        /* non-fatal */
      }
    }

    const projectData =
      projectRes.status === "fulfilled" ? projectRes.value?.data || null : null;

    return {
      event: {
        id: event.id,
        title: event.title,
        start_at: event.start_at,
        end_at: event.end_at,
        event_type: event.event_type,
        location: event.location,
      },
      project: projectData,
      unread_emails: unwrap(emailsRes, "emails"),
      overdue_tasks: overdueTasks,
      open_reserves: unwrap(reservesRes, "reserves"),
      pending_submissions: submissions.map((s: any) => ({
        ...s,
        days_remaining: s.deadline
          ? Math.ceil((new Date(s.deadline).getTime() - Date.now()) / 86400000)
          : null,
        offers_received: offerCounts[s.id]?.received ?? 0,
        offers_expected: offerCounts[s.id]?.requested ?? 0,
      })),
      attendees,
    };
  },

  save_meeting_prep: async (input, ctx) => {
    const eventId = input.event_id as string;

    // IDOR: only an event of the caller's org can be prepared.
    const { data: event } = await (ctx.admin as any)
      .from("calendar_events")
      .select("id, organization_id, project_id, user_id, title")
      .eq("id", eventId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();

    if (!event) {
      return { error: true, message: "Calendar event not found or access denied" };
    }

    const prepPayload = {
      project_summary:
        typeof input.project_summary === "string" ? input.project_summary : null,
      unread_emails: parseJsonArray(input.unread_emails).slice(0, 10),
      overdue_tasks: parseJsonArray(input.overdue_tasks).slice(0, 20),
      open_reserves: parseJsonArray(input.open_reserves).slice(0, 20),
      pending_submissions: parseJsonArray(input.pending_submissions).slice(0, 10),
      key_points: parseJsonArray(input.key_points).slice(0, 15),
      suggested_agenda: parseJsonArray(input.suggested_agenda).slice(0, 8),
      attendee_context: parseJsonArray(input.attendee_context).slice(0, 20),
    };

    if (prepPayload.key_points.length === 0 && prepPayload.suggested_agenda.length === 0) {
      return {
        error: true,
        message:
          "key_points et suggested_agenda sont vides — une préparation sans contenu n'est pas sauvegardée.",
      };
    }

    // Unique index is (event_id, user_id) — migration 075. The prep belongs to
    // the event owner, not to the (cron) user running the agent.
    const ownerUserId = event.user_id || ctx.userId;

    const { error: prepError } = await (ctx.admin as any)
      .from("meeting_preparations")
      .upsert(
        {
          organization_id: ctx.organizationId,
          event_id: eventId,
          project_id: event.project_id || null,
          user_id: ownerUserId,
          ...prepPayload,
          status: "ready",
          agent_session_id: ctx.sessionId,
        },
        { onConflict: "event_id,user_id" }
      );

    if (prepError) {
      console.error("[tool:save_meeting_prep]", prepError.message);
      return { error: true, message: `Save failed: ${prepError.message}` };
    }

    // Flip the event out of the queue and mirror the prep so the calendar
    // panel can render it without a second query.
    const { error: eventError } = await (ctx.admin as any)
      .from("calendar_events")
      .update({
        ai_prep_status: "ready",
        ai_prep_data: prepPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .eq("organization_id", ctx.organizationId);

    if (eventError) {
      // The prep row exists; a stuck 'pending' would only cause a re-run.
      console.warn("[tool:save_meeting_prep] Event flag update failed:", eventError.message);
    }

    return {
      success: true,
      event_id: eventId,
      key_points: prepPayload.key_points.length,
      agenda_items: prepPayload.suggested_agenda.length,
      message: `Préparation enregistrée pour "${event.title}"`,
    };
  },
};
