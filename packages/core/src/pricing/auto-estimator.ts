// ============================================================
// Cantaia — Auto Estimator (Chiffrage automatique)
// Estimates construction costs from plan analysis quantities
// using historical DB prices + Claude AI fallback
// ============================================================

import {
  buildPriceEstimatePrompt,
  type PriceEstimateContext,
} from "../ai/prompts";
import type {
  EstimateConfig,
  EstimatedLineItem,
  EstimateResult,
  EstimateSource,
  MarginLevel,
} from "@cantaia/database";

// ---------- Interfaces ----------

export interface QuantityInput {
  category: string;
  item: string;
  quantity: number | null;
  unit: string;
  specification?: string | null;
  confidence: "high" | "medium" | "low";
}

export interface EstimateOptions {
  quantities: QuantityInput[];
  config: EstimateConfig;
  organizationId: string;
  anthropicApiKey: string;
  supabase: any; // admin client — bypasses RLS
  onUsage?: (usage: { input_tokens: number; output_tokens: number }) => void;
}

// ---------- Constants ----------

const MARGIN_MULTIPLIERS: Record<MarginLevel, number> = {
  tight: 1.05,
  standard: 1.12,
  comfortable: 1.20,
};

const TRANSPORT_BASE_CHF = 500;
const TRANSPORT_PER_KM_CHF = 2;

const AI_MODEL = "claude-sonnet-4-5-20250929";

// ---------- Helpers ----------

/**
 * Normalize a description for fuzzy matching:
 * lowercase, trim, strip accents, remove special chars, collapse whitespace.
 */
export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ") // remove special chars
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

/**
 * Extract meaningful keywords from a normalized description.
 * Filters out very short words (<=2 chars) to avoid noisy matches.
 */
function extractKeywords(normalized: string): string[] {
  return normalized
    .split(" ")
    .filter((w) => w.length > 2);
}

/**
 * Compute the median of a numeric array.
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Round to 2 decimal places (CHF cents).
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- DB Price Lookup ----------

interface DbPriceMatch {
  unit_price: number;
  count: number;
  min: number;
  max: number;
  median: number;
  cfc_code?: string;
}

/**
 * Query offer_line_items for historical price data matching an item.
 * Tries normalized_description ILIKE keywords, then cfc_subcode.
 */
async function lookupHistoricalPrice(
  supabase: any,
  organizationId: string,
  item: QuantityInput
): Promise<DbPriceMatch | null> {
  const normalized = normalizeDescription(item.item);
  const keywords = extractKeywords(normalized);

  if (keywords.length === 0) return null;

  // Build ILIKE filter: match ANY keyword in normalized_description
  // Use the longest keyword for the best specificity
  const sortedByLength = [...keywords].sort((a, b) => b.length - a.length);
  const primaryKeyword = sortedByLength[0];

  let query = supabase
    .from("offer_line_items")
    .select("unit_price, cfc_subcode")
    .eq("organization_id", organizationId)
    .ilike("normalized_description", `%${primaryKeyword}%`);

  // If we have a secondary keyword, add it for tighter matching
  if (sortedByLength.length > 1) {
    query = query.ilike("normalized_description", `%${sortedByLength[1]}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`[auto-estimator] DB lookup error for "${item.item}":`, error.message);
    return null;
  }

  if (data && data.length > 0) {
    return buildPriceMatch(data);
  }

  // Fallback: try matching by cfc_subcode if the item's specification
  // looks like a CFC code (3-digit pattern)
  if (item.specification) {
    const cfcMatch = item.specification.match(/\b(\d{3})\b/);
    if (cfcMatch) {
      const { data: cfcData, error: cfcError } = await supabase
        .from("offer_line_items")
        .select("unit_price, cfc_subcode")
        .eq("organization_id", organizationId)
        .eq("cfc_subcode", cfcMatch[1]);

      if (!cfcError && cfcData && cfcData.length > 0) {
        return buildPriceMatch(cfcData);
      }
    }
  }

  return null;
}

function buildPriceMatch(
  rows: { unit_price: number; cfc_subcode: string | null }[]
): DbPriceMatch {
  const prices = rows.map((r) => Number(r.unit_price));
  const sorted = [...prices].sort((a, b) => a - b);
  const med = median(prices);
  // Pick the most common CFC code
  const cfcCodes = rows
    .map((r) => r.cfc_subcode)
    .filter((c): c is string => c !== null);
  const cfc = cfcCodes.length > 0 ? cfcCodes[0] : undefined;

  return {
    unit_price: med,
    count: rows.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: med,
    cfc_code: cfc,
  };
}

// ---------- AI Batch Estimation ----------

interface AiEstimateItem {
  index: number; // index into the original remainingItems array
  item: QuantityInput;
}

interface AiPriceResult {
  index: number;
  unit_price: number;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  cfc_code?: string;
  price_range?: { min: number; max: number };
}

/**
 * Batch-estimate prices for items with no DB match using Claude AI.
 */
async function estimateWithAI(
  items: AiEstimateItem[],
  config: EstimateConfig,
  anthropicApiKey: string,
  onUsage?: EstimateOptions["onUsage"]
): Promise<Map<number, AiPriceResult>> {
  const results = new Map<number, AiPriceResult>();

  if (items.length === 0) return results;

  const promptCtx: PriceEstimateContext = {
    items: items.map((ai) => ({
      item: ai.item.item,
      unit: ai.item.unit,
      quantity: ai.item.quantity,
      specification: ai.item.specification ?? null,
      category: ai.item.category,
    })),
    location: config.site_location || "Suisse romande",
    hourly_rate: config.hourly_rate,
    year: new Date().getFullYear(),
    scope: config.scope,
    precision_context: config.precision_context,
  };

  const prompt = buildPriceEstimatePrompt(promptCtx);

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    // Report usage
    try {
      onUsage?.({
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
      });
    } catch {
      /* tracking must never fail */
    }

    // Extract text content
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[auto-estimator] No text content in AI response");
      return results;
    }

    // Parse JSON (handle markdown code blocks)
    let jsonStr = textBlock.text.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    if (parsed.estimates && Array.isArray(parsed.estimates)) {
      for (const est of parsed.estimates) {
        const originalIndex = items[est.index]?.index;
        if (originalIndex === undefined) continue;

        results.set(originalIndex, {
          index: originalIndex,
          unit_price: Number(est.unit_price) || 0,
          confidence: est.confidence || "low",
          reasoning: est.reasoning || "",
          cfc_code: est.cfc_code || undefined,
          price_range: est.price_range
            ? { min: Number(est.price_range.min), max: Number(est.price_range.max) }
            : undefined,
        });
      }
    }
  } catch (error: any) {
    console.error("[auto-estimator] AI estimation error:", error?.message || error);
  }

  return results;
}

// ---------- Transport Cost ----------

/**
 * Estimate transport cost based on site and departure locations.
 * Simple formula: flat base + per-km rate.
 * Returns 0 if either location is missing.
 */
function estimateTransportCost(config: EstimateConfig): number {
  if (!config.site_location || !config.departure_location) return 0;
  if (config.site_location.trim() === "" || config.departure_location.trim() === "") return 0;

  // When both locations are provided, apply the flat formula.
  // A more precise calculation would use a geocoding API,
  // but for now we use a reasonable Swiss average estimate.
  // Typical intra-cantonal distance: ~30-50 km
  const estimatedKm = 40; // conservative Swiss average
  return TRANSPORT_BASE_CHF + estimatedKm * TRANSPORT_PER_KM_CHF;
}

// ---------- Main Entry Point ----------

/**
 * Estimate costs from plan analysis quantities.
 *
 * Pipeline:
 * 1. Filter excluded items
 * 2. Look up historical prices in offer_line_items (DB)
 * 3. Batch-estimate remaining items with Claude AI
 * 4. Apply margin multiplier
 * 5. Calculate totals and confidence
 *
 * @returns EstimateResult with all line items, totals, and metadata
 */
export async function estimateFromPlanAnalysis(
  options: EstimateOptions
): Promise<EstimateResult> {
  const {
    quantities,
    config,
    organizationId,
    anthropicApiKey,
    supabase,
    onUsage,
  } = options;

  console.log(`[auto-estimator] Starting estimation for ${quantities.length} quantities`);
  console.log(`[auto-estimator] Config: margin=${config.margin_level}, scope=${config.scope}, hourly_rate=${config.hourly_rate} CHF/h`);

  const marginMultiplier = MARGIN_MULTIPLIERS[config.margin_level];

  // ------ Step 1: Filter exclusions ------
  const exclusionsNormalized = (config.exclusions || []).map(normalizeDescription);

  const filteredQuantities = quantities.filter((q) => {
    const normalized = normalizeDescription(q.item);
    return !exclusionsNormalized.some(
      (excl) => normalized.includes(excl) || excl.includes(normalized)
    );
  });

  console.log(
    `[auto-estimator] After exclusions: ${filteredQuantities.length}/${quantities.length} items`
  );

  // ------ Step 2: DB lookup for each item ------
  const lineItems: EstimatedLineItem[] = [];
  const itemsNeedingAI: AiEstimateItem[] = [];

  for (let i = 0; i < filteredQuantities.length; i++) {
    const q = filteredQuantities[i];

    try {
      const dbMatch = await lookupHistoricalPrice(supabase, organizationId, q);

      if (dbMatch && dbMatch.count >= 1) {
        const basePrice = dbMatch.median;
        const marginAmount = round2(basePrice * (marginMultiplier - 1));
        const unitPriceWithMargin = round2(basePrice + marginAmount);
        const totalPrice = q.quantity !== null
          ? round2(unitPriceWithMargin * q.quantity)
          : 0;

        lineItems.push({
          category: q.category,
          item: q.item,
          quantity: q.quantity,
          unit: q.unit,
          unit_price: unitPriceWithMargin,
          total_price: totalPrice,
          confidence: q.confidence,
          source: "db_historical" as EstimateSource,
          source_detail: `${dbMatch.count} offre(s) historique(s) — médiane ${round2(dbMatch.median)} CHF/${q.unit}`,
          db_matches: dbMatch.count,
          price_range: {
            min: round2(dbMatch.min),
            max: round2(dbMatch.max),
            median: round2(dbMatch.median),
          },
          cfc_code: dbMatch.cfc_code,
          margin_applied: round2(marginAmount),
        });
      } else {
        // No DB match — queue for AI estimation
        itemsNeedingAI.push({ index: i, item: q });
      }
    } catch (err: any) {
      console.error(
        `[auto-estimator] Error looking up "${q.item}":`,
        err?.message || err
      );
      // On error, fall back to AI
      itemsNeedingAI.push({ index: i, item: q });
    }
  }

  console.log(
    `[auto-estimator] DB matches: ${lineItems.length}, needs AI: ${itemsNeedingAI.length}`
  );

  // ------ Step 3: Batch AI estimation ------
  const aiResults = await estimateWithAI(
    itemsNeedingAI,
    config,
    anthropicApiKey,
    onUsage
  );

  for (const aiItem of itemsNeedingAI) {
    const q = aiItem.item;
    const aiResult = aiResults.get(aiItem.index);

    if (aiResult && aiResult.unit_price > 0) {
      const basePrice = aiResult.unit_price;
      const marginAmount = round2(basePrice * (marginMultiplier - 1));
      const unitPriceWithMargin = round2(basePrice + marginAmount);
      const totalPrice = q.quantity !== null
        ? round2(unitPriceWithMargin * q.quantity)
        : 0;

      lineItems.push({
        category: q.category,
        item: q.item,
        quantity: q.quantity,
        unit: q.unit,
        unit_price: unitPriceWithMargin,
        total_price: totalPrice,
        confidence: aiResult.confidence,
        source: "ai_knowledge" as EstimateSource,
        source_detail: aiResult.reasoning || "Estimation IA basée sur les prix du marché suisse",
        db_matches: 0,
        price_range: aiResult.price_range
          ? { min: round2(aiResult.price_range.min), max: round2(aiResult.price_range.max), median: round2(basePrice) }
          : undefined,
        cfc_code: aiResult.cfc_code,
        margin_applied: round2(marginAmount),
      });
    } else {
      // AI also failed — add with zero price and low confidence
      lineItems.push({
        category: q.category,
        item: q.item,
        quantity: q.quantity,
        unit: q.unit,
        unit_price: 0,
        total_price: 0,
        confidence: "low",
        source: "ai_knowledge" as EstimateSource,
        source_detail: "Estimation non disponible — prix à vérifier manuellement",
        db_matches: 0,
        margin_applied: 0,
      });
    }
  }

  // ------ Step 4: Transport cost ------
  const transportCost = estimateTransportCost(config);

  // ------ Step 5: Calculate totals ------
  const subtotal = round2(
    lineItems.reduce((sum, li) => sum + li.total_price, 0)
  );

  const marginTotal = round2(
    lineItems.reduce((sum, li) => sum + li.margin_applied * (li.quantity ?? 0), 0)
  );

  const installationCost = 0; // reserved for future use

  const grandTotal = round2(subtotal + transportCost + installationCost);

  // ------ Step 6: Confidence & coverage ------
  const dbMatchedCount = lineItems.filter(
    (li) => li.source === "db_historical"
  ).length;
  const dbCoveragePercent =
    lineItems.length > 0
      ? round2((dbMatchedCount / lineItems.length) * 100)
      : 0;

  const confidenceSummary = {
    high: lineItems.filter((li) => li.confidence === "high").length,
    medium: lineItems.filter((li) => li.confidence === "medium").length,
    low: lineItems.filter((li) => li.confidence === "low").length,
  };

  console.log(
    `[auto-estimator] Result: ${lineItems.length} items, subtotal=${subtotal} CHF, ` +
      `margin=${marginTotal} CHF, transport=${transportCost} CHF, grand_total=${grandTotal} CHF`
  );
  console.log(
    `[auto-estimator] Coverage: ${dbCoveragePercent}% from DB, confidence: ` +
      `high=${confidenceSummary.high} medium=${confidenceSummary.medium} low=${confidenceSummary.low}`
  );

  return {
    line_items: lineItems,
    subtotal,
    margin_total: marginTotal,
    transport_cost: transportCost,
    installation_cost: installationCost,
    grand_total: grandTotal,
    currency: "CHF",
    confidence_summary: confidenceSummary,
    db_coverage_percent: dbCoveragePercent,
    generated_at: new Date().toISOString(),
    config_used: config,
  };
}
