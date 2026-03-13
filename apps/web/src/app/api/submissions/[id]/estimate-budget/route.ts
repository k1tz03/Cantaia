import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

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

    // Get submission items
    const { data: items } = await (admin as any)
      .from("submission_items")
      .select("id, item_number, description, unit, quantity, cfc_code, material_group, product_name")
      .eq("submission_id", id)
      .order("item_number");

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items to estimate" }, { status: 400 });
    }

    // ── Step 1: Match CFC reference prices ──
    const { CFC_REFERENCE_PRICES } = await import("@cantaia/core/plans/estimation/reference-data/cfc-prices");

    const estimates: any[] = [];
    const unmatchedItems: any[] = [];

    for (const item of items) {
      const cfcMatch = item.cfc_code
        ? CFC_REFERENCE_PRICES.find(
            (ref) =>
              ref.cfc_code === item.cfc_code ||
              ref.cfc_code.startsWith(item.cfc_code + ".") ||
              item.cfc_code.startsWith(ref.cfc_code)
          )
        : null;

      if (cfcMatch && cfcMatch.unite === item.unit) {
        estimates.push({
          item_id: item.id,
          item_number: item.item_number,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          material_group: item.material_group,
          prix_min: cfcMatch.prix_min,
          prix_median: cfcMatch.prix_median,
          prix_max: cfcMatch.prix_max,
          confidence: 0.85,
          source: "referentiel_crb",
        });
      } else {
        unmatchedItems.push(item);
      }
    }

    // ── Step 2: AI estimation for unmatched items ──
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
          // Fix trailing commas + close truncated
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

    const result = {
      estimates,
      total_min: Math.round(total_min),
      total_median: Math.round(total_median),
      total_max: Math.round(total_max),
      crb_count: estimates.filter((e: any) => e.source === "referentiel_crb").length,
      ai_count: estimates.filter((e: any) => e.source === "estimation_ia").length,
      unestimated_count: estimates.filter((e: any) => e.source === "non_estime").length,
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
