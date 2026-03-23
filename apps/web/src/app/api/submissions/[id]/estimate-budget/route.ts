import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkUsageLimit } from "@cantaia/config/plan-features";

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

// ── Variance computation for Monte Carlo simulation ──

function computeStdDevPrix(item: {
  source: string;
  prix_median: number;
  prix_min: number;
  prix_max: number;
  market_benchmark?: { p25: number; p75: number } | null;
}): number {
  const { source, prix_median, prix_min, prix_max, market_benchmark } = item;

  // Historique interne with p25/p75 from C2 benchmarks
  if (source === "historique_interne" && market_benchmark?.p25 && market_benchmark?.p75) {
    return (market_benchmark.p75 - market_benchmark.p25) / 1.35;
  }

  // CRB reference: use min/max range
  if (source === "referentiel_crb") {
    const range = prix_max - prix_min;
    return range > 0 ? range / 4 : prix_median * 0.15;
  }

  // AI estimation or unestimated: high uncertainty (20%)
  if (source === "estimation_ia" || source === "non_estime") {
    return prix_median * 0.20;
  }

  // Default: use min/max range, fallback 15%
  const range = prix_max - prix_min;
  return range > 0 ? range / 4 : prix_median * 0.15;
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
              project_id: submission.project_id,
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

    // ── Step 2b: Annotate with C2 market benchmarks (opt-in) ──
    try {
      const { data: priceConsent } = await (admin as any)
        .from("aggregation_consent")
        .select("opted_in")
        .eq("organization_id", orgId)
        .eq("module", "prix")
        .maybeSingle();

      if (priceConsent?.opted_in === true) {
        for (const item of estimates) {
          const cfcCode = item.detail_source?.match(/cfc[:\s]+([^\s,]+)/i)?.[1]
            || items.find((i: any) => i.id === item.item_id)?.cfc_code
            || items.find((i: any) => i.id === item.item_id)?.cfc_subcode;

          if (cfcCode) {
            try {
              const { data: benchmark } = await (admin as any)
                .from("market_benchmarks")
                .select("median_price, p25_price, p75_price, contributors_count, region, quarter")
                .eq("cfc_code", cfcCode)
                .order("quarter", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (benchmark) {
                item.market_benchmark = {
                  p25: benchmark.p25_price,
                  median: benchmark.median_price,
                  p75: benchmark.p75_price,
                  contributors: benchmark.contributors_count,
                  region: benchmark.region,
                  quarter: benchmark.quarter,
                };
              }
            } catch (benchErr) {
              console.warn(`[BUDGET] market benchmark fetch failed for CFC ${cfcCode}:`, benchErr);
            }
          }
        }
      }
    } catch (c2Err) {
      console.warn("[BUDGET] C2 market annotation skipped (non-blocking):", c2Err);
    }

    // ── Step 2c: Compute variance for Monte Carlo simulation ──
    for (const est of estimates) {
      est.variance = {
        std_dev_prix: computeStdDevPrix({
          source: est.source,
          prix_median: est.prix_median,
          prix_min: est.prix_min,
          prix_max: est.prix_max,
          market_benchmark: est.market_benchmark ?? null,
        }),
        std_dev_quantite: (est.quantity ?? 0) * 0.10,
      };
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

    // ── Feedback stats (non-blocking) ──
    let feedback: {
      price_count: number;
      avg_accuracy: number | null;
      calibration_count: number;
      monthly_trend: { month: string; accuracy: number }[];
    } | null = null;
    try {
      const [priceCountResult, calibrationsResult] = await Promise.all([
        (admin as any)
          .from("offer_line_items")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId),
        (admin as any)
          .from("price_calibrations")
          .select("coefficient, created_at")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const priceCount: number = priceCountResult.count ?? 0;
      const calibrations: { coefficient: number; created_at: string }[] = calibrationsResult.data ?? [];

      const avgAccuracy: number | null = calibrations.length
        ? 1 - calibrations.reduce((sum, c) => sum + Math.abs(1 - c.coefficient), 0) / calibrations.length
        : null;

      // Group calibrations by month for trend chart
      const byMonth: Record<string, { sum: number; count: number }> = {};
      for (const c of calibrations) {
        const month = c.created_at.slice(0, 7); // "YYYY-MM"
        if (!byMonth[month]) byMonth[month] = { sum: 0, count: 0 };
        byMonth[month].sum += 1 - Math.abs(1 - c.coefficient);
        byMonth[month].count += 1;
      }
      const monthlyTrend = Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-6)
        .map(([month, { sum, count }]) => ({ month, accuracy: sum / count }));

      feedback = {
        price_count: priceCount,
        avg_accuracy: avgAccuracy,
        calibration_count: calibrations.length,
        monthly_trend: monthlyTrend,
      };
    } catch (fbErr) {
      console.warn("[BUDGET] feedback stats error (non-blocking):", fbErr);
    }

    return NextResponse.json({ success: true, ...result, feedback });

  } catch (err: any) {
    console.error("[BUDGET] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
