// ============================================================
// Cantaia — Auto Estimator (Chiffrage automatique)
// 3-pass pipeline: CFC lookup → AI CFC normalization → AI estimation
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
  projectId?: string;
  anthropicApiKey: string;
  supabase: any;
  onUsage?: (usage: { input_tokens: number; output_tokens: number }) => void;
}

// ---------- Constants ----------

const MARGIN_MULTIPLIERS: Record<string, number> = {
  tight: 1.05,
  standard: 1.12,
  comfortable: 1.20,
  custom: 1.15,
};

const TRANSPORT_BASE_CHF = 500;
const TRANSPORT_PER_KM_CHF = 2;

const AI_MODEL = "claude-sonnet-4-5-20250929";

// Sanity ranges per unit [min, max] in CHF
const PRICE_RANGES: Record<string, [number, number]> = {
  'm²': [0.50, 2000], 'm2': [0.50, 2000],
  'm³': [5, 1500], 'm3': [5, 1500],
  'kg': [0.10, 20],
  'ml': [0.50, 500], 'm': [0.50, 500],
  't': [10, 1000],
  'h': [50, 250], 'heure': [50, 250],
  'pce': [1, 50000], 'pcs': [1, 50000], 'stk': [1, 50000],
  'ens': [10, 100000], 'gl': [10, 100000], 'forfait': [10, 100000],
  'l': [0.50, 50],
};

// ---------- Helpers ----------

export function normalizeDescription(desc: string): string {
  return desc.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function priceIsValid(price: number, unit: string): boolean {
  const key = unit?.toLowerCase().trim();
  const range = PRICE_RANGES[key];
  if (!range) return price > 0 && price <= 50000;
  return price >= range[0] && price <= range[1];
}

interface PriceResult {
  prix: number;
  source: "bd" | "ia";
  source_detail: string;
  cfc_code?: string;
  confidence: "high" | "medium" | "low";
  price_range?: { min: number; max: number; median: number };
}

// ══════════════════════════════════════════════════════════════
// PASS 1 — CFC Lookup (free, instant)
// ══════════════════════════════════════════════════════════════

async function lookupByCFC(
  supabase: any,
  cfcCode: string,
  unit: string
): Promise<PriceResult | null> {
  if (!cfcCode) return null;

  try {
    // 1a. Exact CFC match
    const { data: exact } = await supabase
      .from("mv_reference_prices")
      .select("cfc_code, prix_p25, prix_median, prix_p75, nb_datapoints, nb_fournisseurs, derniere_offre")
      .eq("cfc_code", cfcCode)
      .limit(1)
      .maybeSingle();

    if (exact && exact.prix_median > 0 && priceIsValid(exact.prix_median, unit)) {
      console.log(`[ESTIMATOR] Pass 1: CFC ${cfcCode} exact → ${exact.prix_median} CHF/${unit} (${exact.nb_datapoints} datapoints)`);
      return {
        prix: exact.prix_median,
        source: "bd",
        source_detail: `CFC ${cfcCode} — ${exact.nb_datapoints} offres réelles, ${exact.nb_fournisseurs} fournisseurs`,
        cfc_code: cfcCode,
        confidence: exact.nb_datapoints >= 5 ? "high" : "medium",
        price_range: { min: exact.prix_p25, max: exact.prix_p75, median: exact.prix_median },
      };
    }

    // 1b. CFC prefix match (e.g. "215.3" → "215")
    const prefix = cfcCode.split('.')[0];
    if (prefix !== cfcCode) {
      const { data: prefixMatch } = await supabase
        .from("mv_reference_prices")
        .select("cfc_code, prix_p25, prix_median, prix_p75, nb_datapoints, nb_fournisseurs")
        .like("cfc_code", `${prefix}%`)
        .order("nb_datapoints", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prefixMatch && prefixMatch.prix_median > 0 && priceIsValid(prefixMatch.prix_median, unit)) {
        console.log(`[ESTIMATOR] Pass 1: CFC prefix ${prefix}* → ${prefixMatch.cfc_code} at ${prefixMatch.prix_median} CHF/${unit}`);
        return {
          prix: prefixMatch.prix_median,
          source: "bd",
          source_detail: `CFC ${prefixMatch.cfc_code} (match partiel ${cfcCode}→${prefixMatch.cfc_code}) — ${prefixMatch.nb_datapoints} offres`,
          cfc_code: prefixMatch.cfc_code,
          confidence: "medium",
          price_range: { min: prefixMatch.prix_p25, max: prefixMatch.prix_p75, median: prefixMatch.prix_median },
        };
      }
    }
  } catch { /* continue */ }

  return null;
}

// ══════════════════════════════════════════════════════════════
// PASS 2 — AI CFC Normalization (batch, ~$0.005)
// ══════════════════════════════════════════════════════════════

interface CfcAssignment {
  index: number;
  cfc_code: string;
  cfc_description: string;
}

async function normalizeCFCWithAI(
  items: Array<{ index: number; description: string; unit: string }>,
  anthropicApiKey: string
): Promise<CfcAssignment[]> {
  if (items.length === 0) return [];

  const itemList = items
    .map((it) => `${it.index}. "${it.description}" (${it.unit})`)
    .join('\n');

  const prompt = `Tu es un métreur suisse expert en codes CFC (Classification des Frais de Construction, norme CRB suisse).

Attribue à chaque poste le code CFC le plus approprié.
La description peut être en français, allemand ou anglais — traduis mentalement.

${itemList}

Réponds UNIQUEMENT en JSON valide (tableau) :
[{"index":1,"cfc_code":"215.0","cfc_description":"Béton armé"},...]

Codes CFC courants :
111 Démolition / 113 Échafaudages / 117 Installations de chantier
151 Transport / 162 Canalisations
211 Terrassement / 212 Travaux spéciaux de fondation
214 Béton maigre, fondations / 215 Béton armé / 216 Maçonnerie
221 Fenêtres / 222 Serrurerie / 224 Isolation thermique
225 Étanchéité / 227 Couverture de toiture
232 Électricité / 241 Chauffage / 242 Ventilation / 243 Climatisation
251 Sanitaire / 261 Ascenseurs
271 Chapes / 273 Carrelage / 274 Parquet / 275 Peinture
276 Plâtrerie / 281 Menuiserie intérieure
291 Essais / 421 Plantations / 422 Aménagements extérieurs
281.0 Géotextiles et nattes / 211.1 Remblais et graves`;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 30_000 });

    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return [];

    let jsonStr = textBlock.text.trim();
    const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonStr = codeBlock[1].trim();

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    const results: CfcAssignment[] = [];
    for (const entry of parsed) {
      if (entry.index != null && entry.cfc_code) {
        results.push({
          index: Number(entry.index),
          cfc_code: String(entry.cfc_code),
          cfc_description: String(entry.cfc_description ?? ''),
        });
      }
    }

    console.log(`[ESTIMATOR] Pass 2: AI assigned CFC codes to ${results.length}/${items.length} items`);
    return results;
  } catch (err: any) {
    console.error("[ESTIMATOR] Pass 2 CFC normalization error:", err?.message || err);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// PASS 3 — AI Pure Estimation (last resort)
// ══════════════════════════════════════════════════════════════

interface AiEstimateItem {
  index: number;
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
    const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 60_000 });

    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    try {
      onUsage?.({
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
      });
    } catch { /* tracking must never fail */ }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return results;

    let jsonStr = textBlock.text.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

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

function estimateTransportCost(config: EstimateConfig): number {
  if (!config.site_location || !config.departure_location) return 0;
  if (config.site_location.trim() === "" || config.departure_location.trim() === "") return 0;
  const estimatedKm = 40;
  return TRANSPORT_BASE_CHF + estimatedKm * TRANSPORT_PER_KM_CHF;
}

// ══════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ══════════════════════════════════════════════════════════════

export async function estimateFromPlanAnalysis(
  options: EstimateOptions
): Promise<EstimateResult> {
  const { quantities, config, anthropicApiKey, supabase, onUsage } = options;

  console.log(`[auto-estimator] Starting estimation for ${quantities.length} quantities`);

  const marginMultiplier = config.margin_level === "custom" && (config as any).custom_margin_percent != null
    ? 1 + (config as any).custom_margin_percent / 100
    : (MARGIN_MULTIPLIERS[config.margin_level] || 1.12);

  // ------ Step 0: Filter exclusions ------
  const exclusionsNormalized = (config.exclusions || []).map(normalizeDescription);
  const filteredQuantities = quantities.filter((q) => {
    const normalized = normalizeDescription(q.item);
    return !exclusionsNormalized.some(
      (excl) => normalized.includes(excl) || excl.includes(normalized)
    );
  });

  console.log(`[auto-estimator] After exclusions: ${filteredQuantities.length}/${quantities.length} items`);

  // ------ PASS 1: CFC Lookup ------
  const lineItems: EstimatedLineItem[] = [];
  const needsCFC: Array<{ index: number; item: QuantityInput }> = [];

  for (let i = 0; i < filteredQuantities.length; i++) {
    const q = filteredQuantities[i];
    // Extract CFC from specification field
    const cfcCode = q.specification?.match(/\b(\d{3}(?:\.\d+)?)\b/)?.[1] ?? null;

    if (cfcCode) {
      const result = await lookupByCFC(supabase, cfcCode, q.unit);
      if (result) {
        const marginAmount = round2(result.prix * (marginMultiplier - 1));
        const unitPriceWithMargin = round2(result.prix + marginAmount);
        lineItems.push({
          category: q.category,
          item: q.item,
          quantity: q.quantity,
          unit: q.unit,
          unit_price: unitPriceWithMargin,
          total_price: q.quantity !== null ? round2(unitPriceWithMargin * q.quantity) : 0,
          confidence: result.confidence,
          source: "db_historical" as EstimateSource,
          source_detail: result.source_detail,
          db_matches: 1,
          price_range: result.price_range,
          cfc_code: result.cfc_code,
          margin_applied: round2(marginAmount),
        });
        continue;
      }
    }

    needsCFC.push({ index: i, item: q });
  }

  console.log(`[auto-estimator] Pass 1 (CFC lookup): ${lineItems.length} resolved, ${needsCFC.length} need CFC assignment`);

  // ------ PASS 2: AI CFC Normalization + Re-lookup ------
  const needsAI: AiEstimateItem[] = [];

  if (needsCFC.length > 0 && anthropicApiKey) {
    const cfcInput = needsCFC.map((n) => ({
      index: n.index + 1, // 1-based for the AI prompt
      description: n.item.item,
      unit: n.item.unit,
    }));

    const cfcAssignments = await normalizeCFCWithAI(cfcInput, anthropicApiKey);

    // Build a map: 1-based index → CFC code
    const cfcMap = new Map<number, CfcAssignment>();
    for (const a of cfcAssignments) {
      cfcMap.set(a.index, a);
    }

    // Re-lookup each item with AI-assigned CFC
    for (const n of needsCFC) {
      const assignment = cfcMap.get(n.index + 1);
      const q = n.item;

      if (assignment?.cfc_code) {
        const result = await lookupByCFC(supabase, assignment.cfc_code, q.unit);
        if (result) {
          const marginAmount = round2(result.prix * (marginMultiplier - 1));
          const unitPriceWithMargin = round2(result.prix + marginAmount);
          lineItems.push({
            category: q.category,
            item: q.item,
            quantity: q.quantity,
            unit: q.unit,
            unit_price: unitPriceWithMargin,
            total_price: q.quantity !== null ? round2(unitPriceWithMargin * q.quantity) : 0,
            confidence: "medium",
            source: "db_historical" as EstimateSource,
            source_detail: `${result.source_detail} (CFC attribué par IA: ${assignment.cfc_code} — ${assignment.cfc_description})`,
            db_matches: 1,
            price_range: result.price_range,
            cfc_code: assignment.cfc_code,
            margin_applied: round2(marginAmount),
          });
          console.log(`[ESTIMATOR] Pass 2: "${q.item}" → CFC ${assignment.cfc_code} → ${result.prix} CHF/${q.unit}`);
          continue;
        }
      }

      // CFC not found in DB — queue for AI estimation
      needsAI.push({ index: n.index, item: q });
    }
  } else {
    // No API key — all items go to AI
    for (const n of needsCFC) {
      needsAI.push({ index: n.index, item: n.item });
    }
  }

  console.log(`[auto-estimator] Pass 2 (CFC normalization): ${lineItems.length} total resolved, ${needsAI.length} need AI estimation`);

  // ------ PASS 3: AI Pure Estimation ------
  const aiResults = await estimateWithAI(needsAI, config, anthropicApiKey, onUsage);

  for (const aiItem of needsAI) {
    const q = aiItem.item;
    const aiResult = aiResults.get(aiItem.index);

    if (aiResult && aiResult.unit_price > 0) {
      let basePrice = aiResult.unit_price;
      let confidence = aiResult.confidence;

      // Sanity check
      if (!priceIsValid(basePrice, q.unit)) {
        console.warn(`[ESTIMATOR] Pass 3: "${q.item}" price ${basePrice} CHF/${q.unit} out of range → rejected`);
        basePrice = 0;
        confidence = "low";
      }

      const marginAmount = basePrice > 0 ? round2(basePrice * (marginMultiplier - 1)) : 0;
      const unitPriceWithMargin = round2(basePrice + marginAmount);
      lineItems.push({
        category: q.category,
        item: q.item,
        quantity: q.quantity,
        unit: q.unit,
        unit_price: unitPriceWithMargin,
        total_price: q.quantity !== null ? round2(unitPriceWithMargin * q.quantity) : 0,
        confidence,
        source: "ai_knowledge" as EstimateSource,
        source_detail: basePrice > 0
          ? (aiResult.reasoning || "Estimation IA — marché suisse")
          : "Prix hors range — à vérifier manuellement",
        db_matches: 0,
        price_range: aiResult.price_range
          ? { min: round2(aiResult.price_range.min), max: round2(aiResult.price_range.max), median: round2(basePrice) }
          : undefined,
        cfc_code: aiResult.cfc_code,
        margin_applied: marginAmount,
      });
    } else {
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

  // ------ Final sanity check on ALL items ------
  for (const li of lineItems) {
    const basePrice = li.unit_price / (marginMultiplier || 1);
    if (basePrice > 0 && !priceIsValid(basePrice, li.unit)) {
      console.warn(`[auto-estimator] Final sanity: "${li.item}" = ${round2(basePrice)} CHF/${li.unit} → rejected`);
      li.unit_price = 0;
      li.total_price = 0;
      li.confidence = "low";
      li.margin_applied = 0;
      li.source_detail = `Prix rejeté (${round2(basePrice)} CHF/${li.unit} hors range) — à vérifier`;
    }
  }

  // ------ Transport ------
  const transportCost = estimateTransportCost(config);

  // ------ Totals ------
  const subtotal = round2(lineItems.reduce((s, li) => s + li.total_price, 0));
  const marginTotal = round2(lineItems.reduce((s, li) => s + li.margin_applied * (li.quantity ?? 0), 0));
  const grandTotal = round2(subtotal + transportCost);

  const dbMatchedCount = lineItems.filter((li) => li.source === "db_historical").length;
  const dbCoveragePercent = lineItems.length > 0 ? round2((dbMatchedCount / lineItems.length) * 100) : 0;

  const confidenceSummary = {
    high: lineItems.filter((li) => li.confidence === "high").length,
    medium: lineItems.filter((li) => li.confidence === "medium").length,
    low: lineItems.filter((li) => li.confidence === "low").length,
  };

  console.log(`[auto-estimator] Result: ${lineItems.length} items, subtotal=${subtotal}, grand_total=${grandTotal} CHF`);
  console.log(`[auto-estimator] Coverage: ${dbCoveragePercent}% from DB (${dbMatchedCount}/${lineItems.length})`);

  return {
    line_items: lineItems,
    subtotal,
    margin_total: marginTotal,
    transport_cost: transportCost,
    installation_cost: 0,
    grand_total: grandTotal,
    currency: "CHF",
    confidence_summary: confidenceSummary,
    db_coverage_percent: dbCoveragePercent,
    generated_at: new Date().toISOString(),
    config_used: config,
  };
}
