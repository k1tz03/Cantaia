import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODEL_FOR_TASK, classifyAIError } from "@cantaia/core/ai";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { trackApiUsage } from "@cantaia/core/tracking";

/**
 * POST /api/submissions/[id]/filter-items
 * AI-powered filtering: separates items that need a price request from those that don't.
 * Items like crane rental, driver services, general labor, etc. typically don't need
 * a formal price request to suppliers.
 *
 * Body: { items: Array<{ id, description, unit, cfc_code, material_group }> }
 * Returns: { excluded: Array<{ id, reason }>, cached?: boolean }
 *
 * M6: the client calls this on every mount of the "Demandes de prix" tab. The
 * result is now cached in `submissions.item_filter_cache`, keyed by a hash of the
 * item id set, so Claude is only called when the item list actually changes.
 * The call is also metered through checkUsageLimit like every other AI route.
 */

/** Stable fingerprint of the item set the exclusions were computed for. */
function hashItemIds(items: Array<{ id?: string }>): string {
  const ids = items
    .map((i) => String(i?.id ?? ""))
    .filter(Boolean)
    .sort();
  return createHash("sha256").update(ids.join("|")).digest("hex").slice(0, 32);
}

/** JSON-only instruction replacing the former assistant prefill. */
const JSON_ONLY_SYSTEM =
  "Réponds UNIQUEMENT avec un objet JSON de la forme " +
  '{"excluded":[{"id":"<uuid>","reason":"<raison courte>"}]}. ' +
  "Aucun texte avant ou après, pas de bloc de code markdown, pas de commentaire.";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: submissionId } = await params;
  const admin = createAdminClient();

  // Verify submission belongs to user's org
  const { data: userProfile } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userProfile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const { data: submission } = await (admin as any)
    .from("submissions")
    .select("id, project_id, item_filter_cache, projects!inner(organization_id)")
    .eq("id", submissionId)
    .maybeSingle();

  if (!submission || submission.projects?.organization_id !== userProfile.organization_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const items = body.items;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ excluded: [] });
  }

  // ── M6: serve from cache when the item set is unchanged ──────────────────
  const itemsHash = hashItemIds(items);
  const cache = (submission as any).item_filter_cache;
  if (cache?.hash === itemsHash && Array.isArray(cache.excluded)) {
    return NextResponse.json({ excluded: cache.excluded, cached: true });
  }

  // ── M6: this route calls Claude — meter it like every other AI route ─────
  const { data: orgData } = await (admin as any)
    .from("organizations")
    .select("subscription_plan")
    .eq("id", userProfile.organization_id)
    .maybeSingle();

  const usageCheck = await checkUsageLimit(
    admin,
    userProfile.organization_id,
    orgData?.subscription_plan || "trial",
    "submission_filter_items"
  );
  if (!usageCheck.allowed) {
    // Non-blocking feature: return an empty exclusion list rather than breaking
    // the price-request tab, but surface the quota state to the client.
    return NextResponse.json(
      {
        excluded: [],
        usage_limit_reached: true,
        // Surfaced (not a 402) so the tab keeps working: the client can show a
        // "top up to get AI filtering" hint without the paywall interrupting a
        // flow the user did not explicitly ask for.
        insufficient_credits: usageCheck.insufficient_credits,
        current: usageCheck.current,
        limit: usageCheck.limit,
        required_plan: usageCheck.requiredPlan,
      },
      { status: 200 }
    );
  }

  // Build compact item list for AI
  const itemLines = items.map((item: any, i: number) => {
    return `${i + 1}. [${item.id}] ${item.description} | unit: ${item.unit || "—"} | cfc: ${item.cfc_code || "—"} | group: ${item.material_group || "—"}`;
  }).join("\n");

  const prompt = `Tu es un expert en construction suisse. Analyse cette liste de postes d'une soumission et identifie ceux qui ne nécessitent PAS de demande de prix à un fournisseur.

Critères d'exclusion (postes à NE PAS envoyer aux fournisseurs) :
- Location de matériel avec chauffeur (ex: "Camion grue avec chauffeur", "Grue à tour")
- Main d'œuvre et heures de travail (ex: "Heures de manœuvre", "Main d'œuvre auxiliaire")
- Frais de chantier généraux (ex: "Installation de chantier", "Nettoyage final")
- Transports et déplacements (ex: "Transport sur site", "Déplacement de machines")
- Prestations internes qui ne s'achètent pas (ex: "Contrôle qualité", "Coordination")
- Postes forfaitaires très généraux sans matériau identifiable

ATTENTION : les postes de FOURNITURE de matériaux nécessitent TOUJOURS une demande de prix, même si "et pose" est mentionné. Seuls les postes qui sont UNIQUEMENT de la main d'œuvre/service/location doivent être exclus.

POSTES :
${itemLines}

Réponds UNIQUEMENT en JSON. Pour chaque poste à exclure, donne l'id et la raison courte (max 50 chars, en français).`;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 30_000,
    });

    // No assistant prefill — JSON-only output is requested via the system prompt
    // and the response goes through the tolerant parser below.
    const response = await anthropic.messages.create({
      model: MODEL_FOR_TASK.task_extraction, // Haiku — fast and cheap
      max_tokens: 2048,
      system: JSON_ONLY_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    // The route debits `submission_filter_items` but wrote no api_usage_logs
    // row, so its Haiku spend was invisible in every cost dashboard.
    trackApiUsage({
      supabase: admin,
      userId: user.id,
      organizationId: userProfile.organization_id,
      actionType: "submission_filter_items" as any,
      apiProvider: "anthropic",
      model: MODEL_FOR_TASK.task_extraction,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      metadata: { submission_id: submission.id, item_count: items.length },
    }).catch(() => {});

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";

    // Robust JSON parsing — tolerates markdown fences and stray preamble now that
    // the response is not forced to start with '{"excluded": ['.
    let result: { excluded: Array<{ id: string; reason: string }> };
    let cleaned = rawText
      .replace(/```(?:json)?/gi, "")
      .replace(/,\s*([\]}])/g, "$1")
      .trim();

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace > 0) {
      cleaned = lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned.slice(firstBrace);
    }

    try {
      result = JSON.parse(cleaned);
    } catch {
      let fixed = cleaned;
      if (!fixed.endsWith("}")) fixed += "}";
      if (!fixed.includes("]}")) fixed = fixed.replace(/\]?\s*\}?\s*$/, "]}");
      try {
        result = JSON.parse(fixed);
      } catch {
        // Regex extraction fallback
        const objects: Array<{ id: string; reason: string }> = [];
        const regex = /\{[^{}]*"id"\s*:\s*"[^"]*"[^{}]*\}/g;
        let match;
        while ((match = regex.exec(rawText)) !== null) {
          try {
            objects.push(JSON.parse(match[0]));
          } catch { /* skip */ }
        }
        result = { excluded: objects };
      }
    }

    // Validate: only keep IDs that exist in the input
    const validIds = new Set(items.map((i: any) => i.id));
    const excluded = (result.excluded || []).filter(
      (e) => e.id && e.reason && validIds.has(e.id)
    );

    // ── M6: persist the result so the next mount is served from cache ───────
    const { error: cacheError } = await (admin as any)
      .from("submissions")
      .update({
        item_filter_cache: {
          hash: itemsHash,
          excluded,
          computed_at: new Date().toISOString(),
        },
      })
      .eq("id", submissionId);

    if (cacheError) {
      console.warn(
        "[submissions/filter-items] cache not persisted " +
        "(apply migration 083_submission_items_reconcile.sql):",
        cacheError.message
      );
    }

    return NextResponse.json({ excluded, cached: false });
  } catch (err: any) {
    console.error("[submissions/filter-items] AI error:", err?.message);
    const aiErr = classifyAIError(err);
    return NextResponse.json({ error: aiErr.message, excluded: [] }, { status: aiErr.status });
  }
}
