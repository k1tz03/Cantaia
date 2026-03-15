import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

// Normalisation d'unités : ASCII → unicode CFC standard
const UNIT_NORMALIZATIONS: Record<string, string> = {
  "m2": "m²", "M2": "m²", "qm": "m²", "m 2": "m²",
  "m3": "m³", "M3": "m³", "m 3": "m³",
  "pcs": "pce", "Pcs": "pce", "pièce": "pce", "piece": "pce", "St": "pce", "st": "pce", "Stk": "pce",
  "u": "pce", "U": "pce", "unité": "pce", "unite": "pce",
  "ens": "fft", "Ens": "fft", "ENS": "fft", "glob": "fft", "Glob": "fft", "forfait": "fft",
  "ml": "m", "ML": "m", "lm": "m",
  "Kg": "kg", "KG": "kg",
  "m2 SBP": "m² SBP", "m2 sbp": "m² SBP", "m² sbp": "m² SBP",
};

function normalizeUnit(unit: string | null): string {
  if (!unit) return "";
  const trimmed = unit.trim();
  return UNIT_NORMALIZATIONS[trimmed] ?? trimmed;
}

// Trimestre courant (ex: "2025-Q1")
function currentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

const BUDGET_PROMPT = `Expert métreur suisse. Estime le prix unitaire HT pour chaque poste de construction.
Contexte: marché suisse 2025. Monnaie: CHF.

JSON uniquement: {"estimates":[{"item_number":"1.1","prix_min":10,"prix_median":15,"prix_max":22,"confidence":0.8}]}

- confidence: 0.0-1.0 (1.0 = prix très fiable, 0.5 = estimation approximative)
- Utilise ta connaissance des prix CFC suisses (CRB)
- Les prix sont unitaires HT en CHF`;

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

    // Verify org
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Verify org ownership
    const { data: submission } = await (admin as any)
      .from("submissions")
      .select("project_id")
      .eq("id", id)
      .maybeSingle();

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const { data: projCheck } = await admin
      .from("projects")
      .select("organization_id, city")
      .eq("id", submission.project_id)
      .maybeSingle();

    if (!projCheck || projCheck.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get submission items
    const { data: items } = await (admin as any)
      .from("submission_items")
      .select("id, item_number, description, unit, quantity, cfc_code, material_group, product_name")
      .eq("submission_id", id)
      .order("item_number");

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items to estimate" }, { status: 400 });
    }

    // ── Step 1: Resolve prices via the 6-tier price resolver ──
    // Uses: historique_interne → données ingérées → fallback textuel → benchmark → CRB → non disponible
    const { resolvePrice } = await import("@cantaia/core/plans/estimation");

    const region = (projCheck as any).city?.toLowerCase() || "zurich";
    const quarter = currentQuarter();
    const orgId = userProfile.organization_id;

    const estimates: any[] = [];
    const unmatchedItems: any[] = [];

    // Resolve all items in parallel (batches of 10 to avoid overloading DB)
    const BATCH_SIZE = 10;
    const sourceLog: Record<string, number> = {};

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (item: any) => {
          const normalizedUnit = normalizeUnit(item.unit);
          // Use cfc_code or cfc_subcode (migration 012 column name)
          const cfcCode = item.cfc_code || item.cfc_subcode || "";
          const description = item.description || "";

          try {
            const prix = await resolvePrice({
              cfc_code: cfcCode,
              description,
              unite: normalizedUnit,
              region,
              quarter,
              org_id: orgId,
              supabase: admin,
            });

            sourceLog[prix.source] = (sourceLog[prix.source] || 0) + 1;

            if (prix.source !== "prix_non_disponible" && prix.median !== null) {
              const confidence =
                prix.source === "historique_interne" ? 0.95 :
                prix.source === "benchmark_cantaia" ? 0.85 :
                prix.source === "referentiel_crb" ? 0.80 :
                0.70;

              return {
                resolved: true,
                estimate: {
                  item_id: item.id,
                  item_number: item.item_number,
                  description: item.description,
                  unit: item.unit,
                  quantity: item.quantity,
                  material_group: item.material_group,
                  prix_min: prix.min ?? 0,
                  prix_median: prix.median ?? 0,
                  prix_max: prix.max ?? 0,
                  confidence,
                  source: prix.source,
                  detail_source: prix.detail_source,
                  ajustements: prix.ajustements,
                },
              };
            }
          } catch (e: any) {
            console.warn(`[BUDGET] resolvePrice failed for "${description.slice(0, 50)}":`, e?.message ?? e);
          }

          return { resolved: false, item };
        })
      );

      for (const r of results) {
        if (r.resolved) {
          estimates.push(r.estimate);
        } else {
          unmatchedItems.push(r.item);
        }
      }
    }

    console.log(`[BUDGET] Resolved ${estimates.length}/${items.length} items via price resolver (${unmatchedItems.length} unmatched → AI). Sources:`, JSON.stringify(sourceLog));

    // ── Step 2: AI estimation for truly unresolved items ──
    if (unmatchedItems.length > 0) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey, timeout: 90_000 });

      const itemsList = unmatchedItems.map((i: any) =>
        `${i.item_number || "?"}: ${i.description} [${i.unit || "?"}] (CFC: ${i.cfc_code || "?"})`
      ).join("\n");

      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        system: [{ type: "text" as const, text: BUDGET_PROMPT, cache_control: { type: "ephemeral" as const } }],
        messages: [
          { role: "user", content: `Estime les prix unitaires pour ces ${unmatchedItems.length} postes:\n\n${itemsList}` },
          { role: "assistant", content: '{"estimates": [' },
        ],
      });

      const textBlock = response.content.find((c: any) => c.type === "text");
      if (textBlock && textBlock.type === "text") {
        const fullJson = '{"estimates": [' + textBlock.text;
        try {
          let jsonStr = fullJson.trim();
          jsonStr = jsonStr.replace(/,\s*([\]}])/g, "$1");
          if (!jsonStr.endsWith("}")) jsonStr = jsonStr.replace(/,?\s*$/, "") + "]}";
          const parsed = JSON.parse(jsonStr);
          const aiEstimates = parsed.estimates || [];

          for (const ai of aiEstimates) {
            const matchedItem = unmatchedItems.find(
              (i: any) => i.item_number === ai.item_number
            );
            if (matchedItem) {
              estimates.push({
                item_id: matchedItem.id,
                item_number: matchedItem.item_number,
                description: matchedItem.description,
                unit: matchedItem.unit,
                quantity: matchedItem.quantity,
                material_group: matchedItem.material_group,
                prix_min: ai.prix_min ?? 0,
                prix_median: ai.prix_median ?? 0,
                prix_max: ai.prix_max ?? 0,
                confidence: ai.confidence ?? 0.5,
                source: "estimation_ia",
              });
            }
          }
        } catch (e) {
          console.error("[BUDGET] Failed to parse AI estimates:", e);
        }
      }

      // Add remaining unmatched items with zero prices
      for (const item of unmatchedItems) {
        if (!estimates.find((e: any) => e.item_id === item.id)) {
          estimates.push({
            item_id: item.id,
            item_number: item.item_number,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            material_group: item.material_group,
            prix_min: 0,
            prix_median: 0,
            prix_max: 0,
            confidence: 0,
            source: "non_estime",
          });
        }
      }
    }

    // ── Step 3: Calculate totals ──
    let total_min = 0, total_median = 0, total_max = 0;
    for (const est of estimates) {
      const qty = est.quantity ?? 0;
      total_min += qty * (est.prix_min ?? 0);
      total_median += qty * (est.prix_median ?? 0);
      total_max += qty * (est.prix_max ?? 0);
    }

    const sourceCounts = {
      historique_interne: estimates.filter((e: any) => e.source === "historique_interne").length,
      benchmark_cantaia: estimates.filter((e: any) => e.source === "benchmark_cantaia").length,
      referentiel_crb: estimates.filter((e: any) => e.source === "referentiel_crb").length,
      estimation_ia: estimates.filter((e: any) => e.source === "estimation_ia").length,
      non_estime: estimates.filter((e: any) => e.source === "non_estime").length,
    };

    const result = {
      estimates,
      total_min: Math.round(total_min),
      total_median: Math.round(total_median),
      total_max: Math.round(total_max),
      crb_count: sourceCounts.historique_interne + sourceCounts.benchmark_cantaia + sourceCounts.referentiel_crb,
      ai_count: sourceCounts.estimation_ia,
      unestimated_count: sourceCounts.non_estime,
      source_breakdown: sourceCounts,
    };

    // Save to submission
    await (admin as any).from("submissions").update({
      budget_estimate: result,
      budget_estimated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    return NextResponse.json({ success: true, ...result });

  } catch (err: any) {
    console.error("[BUDGET] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
