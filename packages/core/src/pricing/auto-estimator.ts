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
  supabase: any; // admin client — bypasses RLS
  onUsage?: (usage: { input_tokens: number; output_tokens: number }) => void;
}

// ---------- Constants ----------

const MARGIN_MULTIPLIERS: Record<string, number> = {
  tight: 1.05,
  standard: 1.12,
  comfortable: 1.20,
  custom: 1.15, // default fallback, overridden by custom_margin_percent
};

const TRANSPORT_BASE_CHF = 500;
const TRANSPORT_PER_KM_CHF = 2;

const AI_MODEL = "claude-sonnet-4-5-20250929";

// ---------- Construction Translations (DE/EN → FR) ----------

const CONSTRUCTION_TRANSLATIONS: Record<string, string[]> = {
  // DE → FR
  'kies': ['gravier', 'grave'], 'beton': ['béton'], 'schalung': ['coffrage'],
  'bewehrung': ['ferraillage', 'armature'], 'armierung': ['ferraillage', 'armature'],
  'fenster': ['fenêtre'], 'tür': ['porte'], 'fassade': ['façade'],
  'dach': ['toiture', 'toit'], 'abdichtung': ['étanchéité'],
  'mauerwerk': ['maçonnerie'], 'heizung': ['chauffage'], 'lüftung': ['ventilation'],
  'sanitär': ['sanitaire'], 'elektro': ['électricité'],
  'boden': ['sol', 'chape'], 'decke': ['dalle', 'plafond'],
  'wand': ['mur', 'paroi'], 'stahl': ['acier'], 'holz': ['bois'],
  'glas': ['verre', 'vitrage'], 'geotextil': ['géotextile'],
  'kanalisation': ['canalisation'], 'rohre': ['tuyau', 'tube'],
  'isolierung': ['isolation'], 'putz': ['crépi', 'enduit'],
  'estrich': ['chape'], 'platten': ['dalle', 'carrelage'],
  'fundament': ['fondation'], 'aushub': ['terrassement', 'excavation'],
  'hinterfüllung': ['remblai'], 'schotter': ['gravier', 'ballast'],
  // EN → FR
  'concrete': ['béton'], 'formwork': ['coffrage'],
  'reinforcement': ['ferraillage'], 'window': ['fenêtre'],
  'door': ['porte'], 'roof': ['toiture'], 'wall': ['mur'],
  'floor': ['sol', 'dalle'], 'steel': ['acier'], 'wood': ['bois'],
  'glass': ['verre'], 'gravel': ['gravier', 'grave'], 'sand': ['sable'],
  'waterproofing': ['étanchéité'], 'insulation': ['isolation'],
  'painting': ['peinture'], 'tiling': ['carrelage'],
  'foundation': ['fondation'], 'excavation': ['terrassement'],
  'drainage': ['drainage'], 'plumbing': ['sanitaire'],
  'geotextile': ['géotextile'], 'backfill': ['remblai'],
};

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
 * Extract search terms from a raw description for fuzzy DB matching.
 * Preserves accented chars and special patterns (e.g. "0/45") for ILIKE.
 * Filters stop words common in Swiss construction descriptions.
 */
function extractSearchTerms(description: string): string[] {
  const stopWords = new Set([
    'de', 'du', 'le', 'la', 'les', 'un', 'une', 'des', 'en', 'et',
    'ou', 'pour', 'avec', 'sans', 'par', 'sur', 'sous', 'dans',
    'mm', 'cm', 'nr', 'type', 'selon', 'anneau', 'externe', 'interne',
    'coeur', 'zone', 'partie', 'environ', 'env', 'inclus', 'compris',
    'the', 'and', 'for', 'bis', 'von', 'und', 'mit', 'aus',
  ]);

  const raw = description
    .toLowerCase()
    .replace(/[^a-zàâäéèêëïîôùûüç0-9/.\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 5);

  // Auto-translate DE/EN → FR using construction dictionary
  const translated: string[] = [];
  for (const term of raw) {
    translated.push(term);
    const frTerms = CONSTRUCTION_TRANSLATIONS[term];
    if (frTerms) {
      translated.push(...frTerms);
    }
  }

  // Deduplicate and limit
  return [...new Set(translated)].slice(0, 8);
}

/**
 * Generate search variants for a term.
 * Granulometry patterns like "0/22" produce ["0/22", "0-22", "0/22."]
 * so we can try each explicitly with ILIKE.
 */
function getSearchVariants(term: string): string[] {
  const match = term.match(/^(\d+)[\/\-.](\d+)/);
  if (!match) return [term];
  const [, a, b] = match;
  return [`${a}/${b}`, `${a}-${b}`, `${a}/${b}.`];
}

/**
 * Normalize a unit string to a canonical form for comparison.
 */
function normalizeUnit(u: string): string {
  const s = u?.toLowerCase().trim() ?? '';
  if (s === 'm2' || s === 'm²') return 'm²';
  if (s === 'm3' || s === 'm³') return 'm³';
  if (s === 'ml' || s === 'm\'' || s === 'lm') return 'ml';
  if (s === 'h' || s === 'heure' || s === 'std') return 'h';
  if (s === 'kg' || s === 'kilo') return 'kg';
  if (s === 't' || s === 'tonne' || s === 'to') return 't';
  if (s === 'l' || s === 'litre') return 'l';
  if (s === 'pce' || s === 'pcs' || s === 'stk' || s === 'piece' || s === 'stück') return 'pce';
  if (s === 'ens' || s === 'ensemble' || s === 'gl' || s === 'forfait' || s === 'fs') return 'ens';
  return s;
}

/** Unit conversion factors: [fromUnit][toUnit] = multiplier */
const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  'm³': { 't': 1.8 },   // 1 m³ grave ≈ 1.8 t
  't':  { 'm³': 1 / 1.8 },
  'ml': { 'm': 1, 'm\'': 1 },
  'm':  { 'ml': 1 },
};

/**
 * Check if two units are compatible and return a conversion factor.
 * Returns null if incompatible.
 */
function unitConversionFactor(wantedUnit: string, dbUnit: string): number | null {
  const a = normalizeUnit(wantedUnit);
  const b = normalizeUnit(dbUnit);
  if (a === b) return 1;
  return UNIT_CONVERSIONS[a]?.[b] ?? null;
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

/**
 * Plafond de prix unitaire par type d'unité (CHF).
 * Filtre les forfaits et prix aberrants qui contaminent les médianes.
 */
function getMaxUnitPrice(unit: string): number {
  switch (unit?.toLowerCase()) {
    case 'm²': case 'm2': return 2000;
    case 'm³': case 'm3': return 1500;
    case 'kg': return 20;
    case 'ml': return 500;
    case 'h': case 'heure': return 250;
    case 't': return 1000;
    default: return 5000;
  }
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
 * Query historical prices from multiple sources in priority order:
 * Pass 1: offer_line_items — project-specific (if projectId provided)
 * Pass 2: offer_line_items — org-wide
 * Pass 3: ingested_offer_lines — 2500+ real supplier prices (description + CFC)
 * Pass 4: mv_reference_prices — aggregated view by CFC code
 * If all fail → returns null → caller falls back to AI
 */
async function lookupHistoricalPrice(
  supabase: any,
  organizationId: string,
  item: QuantityInput,
  projectId?: string,
  anthropicApiKey?: string
): Promise<DbPriceMatch | null> {
  const normalized = normalizeDescription(item.item);
  const keywords = extractKeywords(normalized);
  const sortedByLength = keywords.length > 0
    ? [...keywords].sort((a, b) => b.length - a.length)
    : [];
  const primaryKeyword = sortedByLength[0] ?? '';

  // Extract CFC code from specification if present (3-digit pattern)
  const cfcCode = item.specification?.match(/\b(\d{3}(?:\.\d+)?)\b/)?.[1] ?? null;

  // ── Pass 1: offer_line_items — project-specific ──
  if (projectId && primaryKeyword) {
    try {
      let pQuery = supabase
        .from("offer_line_items")
        .select("unit_price, cfc_subcode")
        .eq("organization_id", organizationId)
        .eq("project_id", projectId)
        .ilike("normalized_description", `%${primaryKeyword}%`);
      if (sortedByLength.length > 1) {
        pQuery = pQuery.ilike("normalized_description", `%${sortedByLength[1]}%`);
      }
      const { data: pData, error: pError } = await pQuery;
      if (!pError && pData && pData.length > 0) {
        const match = buildPriceMatch(pData, item.unit);
        if (match) return match;
      }
    } catch { /* continue */ }
  }

  // ── Pass 2: offer_line_items — org-wide ──
  if (primaryKeyword) {
    try {
      let query = supabase
        .from("offer_line_items")
        .select("unit_price, cfc_subcode")
        .eq("organization_id", organizationId)
        .ilike("normalized_description", `%${primaryKeyword}%`);
      if (sortedByLength.length > 1) {
        query = query.ilike("normalized_description", `%${sortedByLength[1]}%`);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const match = buildPriceMatch(data, item.unit);
        if (match) return match;
      }
    } catch { /* continue */ }
  }

  // ── Pass 3: ingested_offer_lines — 2500+ real supplier prices ──
  let pass3Result: DbPriceMatch | null = null;
  try {
    const terms = extractSearchTerms(item.item);
    const maxPrice = getMaxUnitPrice(item.unit);

    if (terms.length > 0) {
      // Separate granulometry terms from text terms
      const granuloTerms = terms.filter((t) => /^\d+[\/\-.]?\d+/.test(t));
      const textTerms = terms.filter((t) => !/^\d+[\/\-.]?\d+/.test(t));
      const rankedText = [...textTerms].sort((a, b) => b.length - a.length);

      // Build top2: always include granulometry if present
      let top2: string[];
      if (granuloTerms.length > 0 && rankedText.length > 0) {
        top2 = [rankedText[0], granuloTerms[0]];
      } else {
        const ranked = [...rankedText, ...granuloTerms];
        top2 = ranked.slice(0, 2);
      }

      const hasGranulo = top2.findIndex((t) => /^\d+[\/\-.]?\d+/.test(t));

      console.log(`[ESTIMATOR] Searching "${item.item}" → terms: ${JSON.stringify(terms)}, top2: ${JSON.stringify(top2)}, hasGranulo: ${hasGranulo >= 0 ? top2[hasGranulo] : 'none'}`);

      // Helper: run a single ILIKE query against ingested_offer_lines
      const queryIngested = async (ilikeTerms: string[]): Promise<any[] | null> => {
        let q = supabase
          .from("ingested_offer_lines")
          .select("prix_unitaire_ht, unite, description, cfc_code, date_offre")
          .eq("is_forfait", false)
          .gt("prix_unitaire_ht", 0)
          .lte("prix_unitaire_ht", maxPrice);
        for (const t of ilikeTerms) {
          q = q.ilike("description", `%${t}%`);
        }
        const { data } = await q.order("date_offre", { ascending: false }).limit(30);
        return data && data.length > 0 ? data : null;
      };

      if (hasGranulo >= 0) {
        // Try each granulometry variant explicitly
        const granuloTerm = top2[hasGranulo];
        const otherTerms = top2.filter((_, i) => i !== hasGranulo);
        const variants = getSearchVariants(granuloTerm);

        for (const variant of variants) {
          const data = await queryIngested([...otherTerms, variant]);
          if (data) {
            pass3Result = filterByUnitAndBuild(data, item.unit, cfcCode, terms);
            if (pass3Result) break;
          }
        }

        // Broader: just the non-granulo keyword
        if (!pass3Result && otherTerms.length > 0) {
          const data = await queryIngested(otherTerms);
          if (data) {
            pass3Result = filterByUnitAndBuild(data, item.unit, cfcCode, terms);
          }
        }
      } else {
        // No granulometry — standard 2-keyword then 1-keyword search
        const data2 = await queryIngested(top2);
        if (data2) {
          pass3Result = filterByUnitAndBuild(data2, item.unit, cfcCode, terms);
        }
        if (!pass3Result && top2.length > 1) {
          const data1 = await queryIngested([top2[0]]);
          if (data1) {
            pass3Result = filterByUnitAndBuild(data1, item.unit, cfcCode, terms);
          }
        }
      }
    }

    // 3c: search by CFC code if available
    if (!pass3Result && cfcCode) {
      const { data: cfcIngest } = await supabase
        .from("ingested_offer_lines")
        .select("prix_unitaire_ht, unite, description, cfc_code, date_offre")
        .eq("is_forfait", false)
        .gt("prix_unitaire_ht", 0)
        .lte("prix_unitaire_ht", maxPrice)
        .eq("cfc_code", cfcCode)
        .order("date_offre", { ascending: false })
        .limit(20);

      if (cfcIngest && cfcIngest.length > 0) {
        pass3Result = filterByUnitAndBuild(cfcIngest, item.unit, cfcCode, terms);
      }
    }
  } catch { /* continue */ }

  // ── Pass 3b: AI-assisted matching from DB candidates ──
  // Triggered when Pass 3 found nothing OR found a suspect price
  const SUSPECT_FLOOR: Record<string, number> = { 'm²': 1.0, 'm³': 5.0, 'ml': 1.0, 'h': 30.0 };
  const floor = SUSPECT_FLOOR[normalizeUnit(item.unit)] ?? 0;
  const pass3IsSuspect = pass3Result && floor > 0 && pass3Result.median < floor;
  const needPass3b = !pass3Result || pass3IsSuspect;

  if (needPass3b && anthropicApiKey) {
    try {
      const maxPrice = getMaxUnitPrice(item.unit);
      const terms = extractSearchTerms(item.item);
      // Get broad candidates: first significant keyword only
      const broadKeyword = terms.find((t) => !/^\d+[\/\-.]?\d+$/.test(t) && t.length >= 4) ?? terms[0] ?? '';

      const candidates: AiMatchCandidate[] = [];

      // Fetch ~30 rows from ingested_offer_lines with a broad search
      if (broadKeyword) {
        const { data: broadData } = await supabase
          .from("ingested_offer_lines")
          .select("description, prix_unitaire_ht, unite")
          .eq("is_forfait", false)
          .gt("prix_unitaire_ht", 0)
          .lte("prix_unitaire_ht", maxPrice)
          .ilike("description", `%${broadKeyword}%`)
          .order("date_offre", { ascending: false })
          .limit(30);

        if (broadData) {
          for (const r of broadData) {
            candidates.push({
              description: r.description,
              prix_unitaire_ht: Number(r.prix_unitaire_ht),
              unite: r.unite ?? '',
            });
          }
        }
      }

      // Also fetch from mv_reference_prices if CFC available
      if (cfcCode) {
        const cfcPrefix = cfcCode.split('.')[0];
        const { data: mvRows } = await supabase
          .from("mv_reference_prices")
          .select("cfc_code, prix_median, unite")
          .like("cfc_code", `${cfcPrefix}%`)
          .order("nb_datapoints", { ascending: false })
          .limit(5);

        if (mvRows) {
          for (const r of mvRows) {
            candidates.push({
              description: `CFC ${r.cfc_code} (prix agrégé)`,
              prix_unitaire_ht: Number(r.prix_median),
              unite: r.unite ?? item.unit,
            });
          }
        }
      }

      if (candidates.length > 0) {
        // Deduplicate by description
        const seen = new Set<string>();
        const uniqueCandidates = candidates.filter((c) => {
          const key = `${c.description}::${c.prix_unitaire_ht}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 35);

        console.log(`[ESTIMATOR] Pass 3b: sending ${uniqueCandidates.length} candidates to AI for "${item.item}"`);
        const aiMatch = await matchPriceWithAI(item.item, item.unit, uniqueCandidates, anthropicApiKey);
        if (aiMatch) return aiMatch;
      }
    } catch (err: any) {
      console.error(`[ESTIMATOR] Pass 3b error:`, err?.message || err);
    }
  }

  // ── Pass 4: mv_reference_prices — aggregated view by CFC code ──
  let pass4Result: DbPriceMatch | null = null;
  if (cfcCode) {
    try {
      const maxPrice = getMaxUnitPrice(item.unit);
      const { data: mvData, error: mvError } = await supabase
        .from("mv_reference_prices")
        .select("cfc_code, prix_p25, prix_median, prix_p75, nb_datapoints, nb_fournisseurs")
        .eq("cfc_code", cfcCode)
        .limit(1)
        .maybeSingle();

      if (!mvError && mvData && mvData.prix_median > 0 && mvData.prix_median <= maxPrice) {
        pass4Result = {
          unit_price: mvData.prix_median,
          count: mvData.nb_datapoints ?? 1,
          min: mvData.prix_p25 ?? mvData.prix_median,
          max: mvData.prix_p75 ?? mvData.prix_median,
          median: mvData.prix_median,
          cfc_code: mvData.cfc_code,
        };
      }

      // 4b: try CFC prefix (e.g. "215.3" → "215")
      if (!pass4Result) {
        const cfcPrefix = cfcCode.split('.')[0];
        if (cfcPrefix !== cfcCode) {
          const { data: mvPrefix, error: mvPrefixErr } = await supabase
            .from("mv_reference_prices")
            .select("cfc_code, prix_p25, prix_median, prix_p75, nb_datapoints, nb_fournisseurs")
            .like("cfc_code", `${cfcPrefix}%`)
            .order("nb_datapoints", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!mvPrefixErr && mvPrefix && mvPrefix.prix_median > 0 && mvPrefix.prix_median <= maxPrice) {
            pass4Result = {
              unit_price: mvPrefix.prix_median,
              count: mvPrefix.nb_datapoints ?? 1,
              min: mvPrefix.prix_p25 ?? mvPrefix.prix_median,
              max: mvPrefix.prix_p75 ?? mvPrefix.prix_median,
              median: mvPrefix.prix_median,
              cfc_code: mvPrefix.cfc_code,
            };
          }
        }
      }
    } catch { /* continue */ }
  }

  // ── Cross-check: if Pass 3 price is suspiciously low, prefer Pass 4 ──
  if (pass3Result && pass4Result) {
    if (pass3Result.median < floor && pass4Result.median >= floor) {
      console.log(`[ESTIMATOR] "${item.item}" → Pass 3 suspect (${pass3Result.median} CHF/${item.unit}), using Pass 4 (${pass4Result.median} CHF/${item.unit})`);
      return pass4Result;
    }
    // If both valid, take the higher (more realistic for construction)
    if (pass3Result.median < floor) {
      console.log(`[ESTIMATOR] "${item.item}" → Pass 3: ${pass3Result.median} (suspect) → Pass 4: ${pass4Result.median}`);
      return pass4Result;
    }
    console.log(`[ESTIMATOR] "${item.item}" → Pass 3: ${pass3Result.median} (${pass3Result.count} matches) → Pass 4: ${pass4Result.median} → using Pass 3`);
    return pass3Result;
  }

  if (pass3Result) {
    // If Pass 3 price is suspect and no Pass 4 to cross-check, reject it
    if (floor > 0 && pass3Result.median < floor) {
      console.log(`[ESTIMATOR] "${item.item}" → Pass 3: ${pass3Result.median} CHF/${item.unit} REJECTED (< floor ${floor}), no Pass 4 available, falling back to AI`);
      return null;
    }
    console.log(`[ESTIMATOR] "${item.item}" → Pass 3: ${pass3Result.median} CHF/${item.unit} (${pass3Result.count} matches)`);
    return pass3Result;
  }

  if (pass4Result) {
    console.log(`[ESTIMATOR] "${item.item}" → Pass 4: ${pass4Result.median} CHF/${item.unit} (CFC ${cfcCode})`);
    return pass4Result;
  }

  console.log(`[ESTIMATOR] "${item.item}" → no DB match, falling back to AI`);
  return null;
}

/**
 * Filter ingested_offer_lines results by unit compatibility,
 * then narrow by significant numbers from the search description.
 *
 * Example: searching "STRATEX NT 200" with results containing
 * both "Stratex Premium 200" and "Stratex NT 150":
 * → "200" is a significant number → keep only rows containing "200"
 * → median is computed only on the relevant product variant.
 */
function filterByUnitAndBuild(
  data: any[] | null,
  wantedUnit: string,
  cfcCode: string | null,
  searchTerms?: string[]
): DbPriceMatch | null {
  if (!data || data.length === 0) return null;

  // Step 1: filter by unit compatibility and apply conversion
  const compatible: { unit_price: number; cfc_subcode: string | null; description: string }[] = [];
  for (const r of data) {
    const price = Number(r.prix_unitaire_ht);
    if (!(price > 0)) continue;

    const dbUnit = r.unite ?? '';
    const factor = unitConversionFactor(wantedUnit, dbUnit);
    if (factor === null) continue;

    compatible.push({
      unit_price: price * factor,
      cfc_subcode: r.cfc_code ?? null,
      description: (r.description ?? '').toLowerCase(),
    });
  }

  if (compatible.length === 0) return null;

  // Step 2: if the search has significant numbers (≥3 digits), filter results that contain them
  let filtered = compatible;
  if (searchTerms && searchTerms.length > 0) {
    const significantNumbers = searchTerms.filter((t) => /^\d{3,}$/.test(t));
    if (significantNumbers.length > 0) {
      const narrowed = compatible.filter((r) =>
        significantNumbers.some((n) => r.description.includes(n))
      );
      if (narrowed.length > 0) {
        filtered = narrowed;
      }
    }
  }

  const rows = filtered.map((r) => ({ unit_price: r.unit_price, cfc_subcode: r.cfc_subcode }));
  const match = buildPriceMatch(rows, wantedUnit);
  if (match) {
    match.cfc_code = match.cfc_code || (cfcCode ?? undefined);
  }
  return match;
}

function buildPriceMatch(
  rows: { unit_price: number; cfc_subcode: string | null }[],
  unit: string
): DbPriceMatch | null {
  const maxPrice = getMaxUnitPrice(unit);
  const prices = rows
    .map((r) => Number(r.unit_price))
    .filter((p) => p > 0 && p <= maxPrice);

  if (prices.length === 0) return null;

  const sorted = [...prices].sort((a, b) => a - b);
  const med = median(prices);
  // Pick the most common CFC code
  const cfcCodes = rows
    .map((r) => r.cfc_subcode)
    .filter((c): c is string => c !== null);
  const cfc = cfcCodes.length > 0 ? cfcCodes[0] : undefined;

  return {
    unit_price: med,
    count: prices.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: med,
    cfc_code: cfc,
  };
}

// ---------- AI Price Matcher (Pass 3b) ----------

interface AiMatchCandidate {
  description: string;
  prix_unitaire_ht: number;
  unite: string;
}

/**
 * Use Claude to find the best price match from DB candidates.
 * Unlike the batch AI estimation (Pass 5) which invents prices,
 * this function only SELECTS from real DB prices.
 * Cost: ~$0.002 per call (200 output tokens).
 */
async function matchPriceWithAI(
  description: string,
  unit: string,
  candidates: AiMatchCandidate[],
  anthropicApiKey: string
): Promise<DbPriceMatch | null> {
  if (candidates.length === 0) return null;

  const candidateList = candidates
    .map((c, i) => `${i + 1}. "${c.description}" — ${c.prix_unitaire_ht} CHF/${c.unite}`)
    .join('\n');

  const prompt = `Tu es un métreur suisse expérimenté (CFC/CRB).
Je cherche le prix unitaire pour : "${description}" (unité: ${unit})

Voici les prix disponibles dans ma base de données :
${candidateList}

Quel est le meilleur match ? Réponds UNIQUEMENT en JSON valide :
{"match_index":number ou null,"prix_adapte":number,"justification":"string courte"}

RÈGLES STRICTES :
- match_index est 1-based (1 = première ligne) ou null si aucun match pertinent
- Ne choisis un match que si le produit est RÉELLEMENT similaire (même matériau, même usage)
- Si l'unité est différente, convertis : 1 m³ grave ≈ 1.8 t, 1 ml ≈ 1 m
- prix_adapte = le prix du candidat choisi, converti dans l'unité ${unit} si nécessaire
- Si aucun match n'est pertinent, retourne {"match_index":null,"prix_adapte":0,"justification":"aucun match"}
- Ne PAS inventer de prix — uniquement choisir parmi la liste
- La description peut être en FR, DE ou EN. Les candidats sont en FR.
  Fais le matching CROSS-LANGUE (Kies=Gravier, Beton=Béton, etc.)`;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 15_000 });

    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 150,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    let jsonStr = textBlock.text.trim();
    const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonStr = codeBlock[1].trim();

    const parsed = JSON.parse(jsonStr);

    if (parsed.match_index == null || parsed.prix_adapte <= 0) {
      console.log(`[ESTIMATOR] Pass 3b: AI found no match for "${description}"`);
      return null;
    }

    const idx = parsed.match_index - 1; // 1-based → 0-based
    if (idx < 0 || idx >= candidates.length) return null;

    const matched = candidates[idx];
    const prix = Number(parsed.prix_adapte);
    const maxPrice = getMaxUnitPrice(unit);
    if (prix <= 0 || prix > maxPrice) return null;

    console.log(`[ESTIMATOR] Pass 3b: AI matched "${description}" → "${matched.description}" at ${prix} CHF/${unit} (${parsed.justification})`);

    return {
      unit_price: prix,
      count: 1,
      min: prix,
      max: prix,
      median: prix,
      cfc_code: undefined,
    };
  } catch (err: any) {
    console.error(`[ESTIMATOR] Pass 3b error for "${description}":`, err?.message || err);
    return null;
  }
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
    const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 60_000 });

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
    projectId,
    anthropicApiKey,
    supabase,
    onUsage,
  } = options;

  console.log(`[auto-estimator] Starting estimation for ${quantities.length} quantities`);
  console.log(`[auto-estimator] Config: margin=${config.margin_level}, scope=${config.scope}, hourly_rate=${config.hourly_rate} CHF/h`);

  // Handle custom margin: use custom_margin_percent if provided, else use predefined multipliers
  const marginMultiplier = config.margin_level === "custom" && (config as any).custom_margin_percent != null
    ? 1 + (config as any).custom_margin_percent / 100
    : (MARGIN_MULTIPLIERS[config.margin_level] || 1.12);

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
      const dbMatch = await lookupHistoricalPrice(supabase, organizationId, q, projectId, anthropicApiKey);

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

  // Sanity thresholds per unit type — applied to ALL prices (DB + AI)
  const SANITY_THRESHOLDS: Record<string, number> = {
    pce: 20000, pcs: 20000, stk: 20000, piece: 20000,
    m2: 500, "m²": 500,
    m3: 1000, "m³": 1000,
    ml: 500, m: 500,
    kg: 50, t: 50000,
    l: 50,
    h: 250, heure: 250,
    ens: 50000, ensemble: 50000,
    forfait: 100000, gl: 100000, fs: 100000,
  };

  for (const aiItem of itemsNeedingAI) {
    const q = aiItem.item;
    const aiResult = aiResults.get(aiItem.index);

    if (aiResult && aiResult.unit_price > 0) {
      let basePrice = aiResult.unit_price;
      let confidence = aiResult.confidence;

      // Sanity check: flag absurd prices as low confidence
      const unitKey = q.unit.toLowerCase().replace(/[^a-z0-9²³]/g, "");
      const threshold = SANITY_THRESHOLDS[unitKey];
      if (threshold && basePrice > threshold) {
        console.warn(`[auto-estimator] Absurd price flagged: ${q.item} = ${basePrice} CHF/${q.unit} (threshold: ${threshold})`);
        confidence = "low";
      }
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
        confidence: confidence,
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

  // ------ Step 3b: Final sanity check on ALL items (DB + AI) ------
  for (const li of lineItems) {
    const unitKey = li.unit.toLowerCase().replace(/[^a-z0-9²³]/g, "");
    const threshold = SANITY_THRESHOLDS[unitKey];
    const basePrice = li.unit_price / (marginMultiplier || 1);
    if (threshold && basePrice > threshold) {
      console.warn(
        `[auto-estimator] Absurd price rejected: ${li.item} = ${round2(basePrice)} CHF/${li.unit} (threshold: ${threshold}, source: ${li.source})`
      );
      li.unit_price = 0;
      li.total_price = 0;
      li.confidence = "low";
      li.margin_applied = 0;
      li.source_detail = `Prix rejeté (${round2(basePrice)} CHF/${li.unit} > seuil ${threshold}) — à vérifier manuellement`;
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
