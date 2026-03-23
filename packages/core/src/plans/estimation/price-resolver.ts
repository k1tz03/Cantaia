// Résolveur de prix — hiérarchie stricte des sources
// 1. Historique interne (offer_line_items de l'org) — par CFC + par description
// 2. Données ingérées (mv_reference_prices — prix agrégés)
// 3. Fallback textuel (ingested_offer_lines par description)
// 4. Benchmark Cantaia (market_benchmarks cross-tenant)
// 5. Référentiel CFC statique (CRB 2025)
// 6. Non disponible

import type { PrixUnitaire } from './types';
import { CFC_REFERENCE_PRICES } from './reference-data/cfc-prices';
import { REGIONAL_COEFFICIENTS } from './reference-data/regional-coefficients';

interface PriceResolverParams {
  cfc_code: string;
  description: string;
  unite: string;
  region: string;
  quarter: string;
  org_id: string;
  supabase: any; // SupabaseClient — type générique pour éviter la dépendance
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - idx) + sorted[upper] * (idx - lower);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// Plafond de prix unitaire par type d'unité (CHF) — filtre les forfaits contaminants
function getMaxUnitPrice(unite: string): number {
  switch (unite?.toLowerCase()) {
    case 'm²': case 'm2': return 2000;
    case 'm³': case 'm3': return 1500;
    case 'kg': return 20;
    case 'ml': case 'm': return 500;
    case 'h': return 250;
    default: return 10000;
  }
}

// Sanitize pour PostgREST — supprime caractères spéciaux qui casseraient le filtre .or()
function sanitizeForFilter(val: string): string {
  return val.replace(/[%_,().\\'"]/g, '');
}

// Extraction de mots-clés pertinents depuis une description
// Retourne les mots les plus longs (= les plus discriminants) en premier
const STOP_WORDS = new Set([
  'pour', 'dans', 'avec', 'sans', 'sous', 'type', 'selon', 'compris',
  'fourniture', 'mise', 'place', 'pose', 'travaux', 'incl', 'inclus',
  'environ', 'conf', 'norme', 'normes', 'plan', 'plans', 'detail',
  'comme', 'suivant', 'existant', 'existante', 'nouveau', 'nouvelle',
  'tout', 'toute', 'tous', 'toutes', 'plus', 'moins', 'entre',
  'y.c.', 'y.c', 'resp', 'bzw', 'inkl', 'gemäss', 'laut',
]);

function extractKeywords(description: string): string[] {
  if (!description) return [];
  return description
    .toLowerCase()
    .replace(/[,;()\/\-:."'«»]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
    .sort((a, b) => b.length - a.length) // Mots les plus longs = les plus discriminants
    .slice(0, 5);
}

// Calcul de score de similarité par mots-clés entre deux descriptions
function keywordOverlap(desc1: string, desc2: string): number {
  const kw1 = new Set(extractKeywords(desc1));
  const kw2 = new Set(extractKeywords(desc2));
  if (kw1.size === 0 || kw2.size === 0) return 0;
  let matches = 0;
  for (const w of kw1) {
    for (const w2 of kw2) {
      if (w === w2 || w.includes(w2) || w2.includes(w)) {
        matches++;
        break;
      }
    }
  }
  return matches / Math.min(kw1.size, kw2.size);
}

// ══════════════════════════════════════════════════════
// V3 — Multi-criteria scoring + inflation adjustment
// ══════════════════════════════════════════════════════

interface PriceCandidate {
  prix_unitaire: number;
  cfc_code?: string;
  description?: string;
  unite?: string;
  region?: string;
  date?: string; // ISO date
}

function normalizeUnit(u: string): string {
  return u
    .toLowerCase()
    .replace(/m2/g, 'm²')
    .replace(/m3/g, 'm³')
    .replace(/pce/g, 'pièce')
    .replace(/ml/g, 'm')
    .trim();
}

function scorePriceCandidate(
  candidate: PriceCandidate,
  query: { cfc_code?: string; description: string; unite?: string; region?: string },
  inflationRate: number = 0.028
): { score: number; adjusted_price: number } {
  let score = 0;

  // CFC matching (40 exact, 25 prefix)
  if (candidate.cfc_code && query.cfc_code) {
    if (candidate.cfc_code === query.cfc_code) score += 40;
    else if (
      candidate.cfc_code.startsWith(query.cfc_code.split('.')[0]) ||
      query.cfc_code.startsWith(candidate.cfc_code.split('.')[0])
    )
      score += 25;
  }

  // Keyword overlap (20 if ≥60%, 10 if ≥30%)
  const candidateKw = extractKeywords(candidate.description || '');
  const queryKw = extractKeywords(query.description);
  if (candidateKw.length > 0 && queryKw.length > 0) {
    const overlap = candidateKw.filter((k) =>
      queryKw.some((q) => q.includes(k) || k.includes(q))
    ).length;
    const ratio = overlap / Math.max(candidateKw.length, queryKw.length);
    if (ratio >= 0.6) score += 20;
    else if (ratio >= 0.3) score += 10;
  }

  // Unit match (10)
  if (
    candidate.unite &&
    query.unite &&
    normalizeUnit(candidate.unite) === normalizeUnit(query.unite)
  ) {
    score += 10;
  }

  // Region match (5)
  if (candidate.region && query.region && candidate.region === query.region) {
    score += 5;
  }

  // Temporal decay + inflation
  let adjustedPrice = candidate.prix_unitaire;
  if (candidate.date) {
    const ageMs = Date.now() - new Date(candidate.date).getTime();
    const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30);
    const ageYears = ageMonths / 12;

    if (ageMonths > 12) score = Math.round(score * 0.6);
    else if (ageMonths > 6) score = Math.round(score * 0.8);

    // Inflation adjustment
    adjustedPrice =
      candidate.prix_unitaire * Math.pow(1 + inflationRate, ageYears);
  }

  return { score, adjusted_price: Math.round(adjustedPrice * 100) / 100 };
}

function weightedPercentiles(
  scored: { score: number; adjusted_price: number }[]
): { p25: number; median: number; p75: number } {
  if (scored.length === 0) return { p25: 0, median: 0, p75: 0 };

  const sorted = [...scored].sort((a, b) => a.adjusted_price - b.adjusted_price);
  if (sorted.length === 1) {
    return {
      p25: sorted[0].adjusted_price,
      median: sorted[0].adjusted_price,
      p75: sorted[0].adjusted_price,
    };
  }

  const totalWeight = sorted.reduce((s, c) => s + c.score, 0);
  if (totalWeight === 0) {
    const prices = sorted.map((s) => s.adjusted_price);
    return {
      p25: prices[Math.floor(prices.length * 0.25)],
      median: prices[Math.floor(prices.length * 0.5)],
      p75: prices[Math.floor(prices.length * 0.75)],
    };
  }

  function getPercentile(target: number): number {
    let cumWeight = 0;
    for (const item of sorted) {
      cumWeight += item.score;
      if (cumWeight / totalWeight >= target) return item.adjusted_price;
    }
    return sorted[sorted.length - 1].adjusted_price;
  }

  return {
    p25: getPercentile(0.25),
    median: getPercentile(0.5),
    p75: getPercentile(0.75),
  };
}

// ══════════════════════════════════════════════════════

interface PriceResolverParamsV3 extends PriceResolverParams {
  inflation_rate?: number;
  project_id?: string; // Scope tier 1 to same project only
}

export async function resolvePrice(params: PriceResolverParamsV3): Promise<PrixUnitaire> {
  const { cfc_code, description, unite, region, quarter, org_id, supabase, inflation_rate = 0.028, project_id } = params;

  const keywords = extractKeywords(description);
  const hasCfcCode = Boolean(cfc_code && cfc_code.trim().length >= 2);
  const maxPrice = getMaxUnitPrice(unite);

  // ══════════════════════════════════════════════════════
  // 1. Historique interne (offer_line_items de cette org)
  // Colonnes: organization_id, cfc_subcode, normalized_description,
  //           supplier_description, unit_price, unit_normalized, created_at
  // V3: multi-criteria scoring, up to 100 candidates, weighted percentiles
  // ══════════════════════════════════════════════════════
  try {
    let rawCandidates: any[] = [];

    // If project_id is provided, scope tier 1 to offers from same project's submissions only
    let projectSubmissionIds: string[] | null = null;
    if (project_id) {
      const { data: projectSubs } = await supabase
        .from('submissions')
        .select('id')
        .eq('project_id', project_id);
      if (projectSubs && projectSubs.length > 0) {
        projectSubmissionIds = projectSubs.map((s: any) => s.id);
        // Get offer IDs from those submissions
        const { data: projectOffers } = await supabase
          .from('supplier_offers')
          .select('id')
          .in('submission_id', projectSubmissionIds);
        if (projectOffers && projectOffers.length > 0) {
          const offerIds = projectOffers.map((o: any) => o.id);
          // Only query offer_line_items from this project's offers
          // Use helper to build scoped queries
          const scopeFilter = (query: any) => query.in('offer_id', offerIds);

          // 1a. Par code CFC (si disponible)
          if (hasCfcCode) {
            const safeCfc = sanitizeForFilter(cfc_code);
            const cfcPrefix = sanitizeForFilter(cfc_code.split('.')[0]);
            let q = supabase
              .from('offer_line_items')
              .select('unit_price, cfc_subcode, normalized_description, supplier_description, unit_normalized, created_at, offer_id')
              .eq('organization_id', org_id)
              .or(`cfc_subcode.eq.${safeCfc},cfc_subcode.like.${cfcPrefix}%`)
              .gt('unit_price', 0)
              .lt('unit_price', maxPrice)
              .order('created_at', { ascending: false })
              .limit(100);
            q = scopeFilter(q);
            const { data } = await q;
            if (data && data.length > 0) rawCandidates = rawCandidates.concat(data);
          }

          // 1b/1c. Par mots-clés
          if (keywords.length > 0) {
            for (let ki = 0; ki < Math.min(keywords.length, 2); ki++) {
              const kw = sanitizeForFilter(keywords[ki]);
              if (kw.length >= 4) {
                let q = supabase
                  .from('offer_line_items')
                  .select('unit_price, cfc_subcode, normalized_description, supplier_description, unit_normalized, created_at, offer_id')
                  .eq('organization_id', org_id)
                  .or(`normalized_description.ilike.%${kw}%,supplier_description.ilike.%${kw}%`)
                  .gt('unit_price', 0)
                  .lt('unit_price', maxPrice)
                  .order('created_at', { ascending: false })
                  .limit(100);
                q = scopeFilter(q);
                const { data } = await q;
                if (data && data.length > 0) rawCandidates = rawCandidates.concat(data);
              }
            }
          }
        }
        // If no offers exist for this project, rawCandidates stays empty → falls through to tiers 2-6
      }
    }

    // Fallback: only use org-wide search if NO project_id was provided
    // When project_id is set, skip org-wide tier 1 entirely to avoid cross-project contamination
    if (!project_id) {
    // 1a. Par code CFC (si disponible)
    if (hasCfcCode) {
      const safeCfc = sanitizeForFilter(cfc_code);
      const cfcPrefix = sanitizeForFilter(cfc_code.split('.')[0]);
      const { data } = await supabase
        .from('offer_line_items')
        .select('unit_price, cfc_subcode, normalized_description, supplier_description, unit_normalized, created_at')
        .eq('organization_id', org_id)
        .or(`cfc_subcode.eq.${safeCfc},cfc_subcode.like.${cfcPrefix}%`)
        .gt('unit_price', 0)
        .lt('unit_price', maxPrice)
        .order('created_at', { ascending: false })
        .limit(100);

      if (data && data.length > 0) {
        rawCandidates = rawCandidates.concat(data);
      }
    }

    // 1b. Par mots-clés de description
    if (keywords.length > 0) {
      const mainKeyword = sanitizeForFilter(keywords[0]);
      if (mainKeyword.length >= 4) {
        const { data } = await supabase
          .from('offer_line_items')
          .select('unit_price, cfc_subcode, normalized_description, supplier_description, unit_normalized, created_at')
          .eq('organization_id', org_id)
          .or(`normalized_description.ilike.%${mainKeyword}%,supplier_description.ilike.%${mainKeyword}%`)
          .gt('unit_price', 0)
          .lt('unit_price', maxPrice)
          .order('created_at', { ascending: false })
          .limit(100);

        if (data && data.length > 0) {
          rawCandidates = rawCandidates.concat(data);
        }
      }

      // 1c. Essayer avec le 2e mot-clé
      if (keywords.length >= 2) {
        const secondKeyword = sanitizeForFilter(keywords[1]);
        if (secondKeyword.length >= 4) {
          const { data } = await supabase
            .from('offer_line_items')
            .select('unit_price, cfc_subcode, normalized_description, supplier_description, unit_normalized, created_at')
            .eq('organization_id', org_id)
            .or(`normalized_description.ilike.%${secondKeyword}%,supplier_description.ilike.%${secondKeyword}%`)
            .gt('unit_price', 0)
            .lt('unit_price', maxPrice)
            .order('created_at', { ascending: false })
            .limit(100);

          if (data && data.length > 0) {
            rawCandidates = rawCandidates.concat(data);
          }
        }
      }
    }
    } // end if (!project_id || rawCandidates.length === 0)

    if (rawCandidates.length >= 2) {
      // Deduplicate by (unit_price, created_at)
      const seen = new Set<string>();
      const unique = rawCandidates.filter((d: any) => {
        const key = `${d.unit_price}::${d.created_at}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Score each candidate
      const scored = unique
        .map((d: any) => {
          const candidate: PriceCandidate = {
            prix_unitaire: Number(d.unit_price),
            cfc_code: d.cfc_subcode,
            description: d.normalized_description || d.supplier_description,
            unite: d.unit_normalized,
            date: d.created_at,
          };
          return scorePriceCandidate(candidate, { cfc_code, description, unite, region }, inflation_rate);
        })
        .filter((s) => s.score >= 35 && s.adjusted_price > 0 && s.adjusted_price <= maxPrice)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30);

      if (scored.length >= 2) {
        const wp = weightedPercentiles(scored);
        const latestDate = rawCandidates[0].created_at?.slice(0, 10);
        return {
          min: round2(wp.p25),
          median: round2(wp.median),
          max: round2(wp.p75),
          source: 'historique_interne',
          detail_source: `${scored.length} offres internes (scoring V3), dernière : ${latestDate}`,
          date_reference: latestDate ?? quarter,
          ajustements: [],
        };
      }

      // Fallback: score too low — accept >= 1 with no threshold if we have enough raw prices
      const prices = unique
        .map((d: any) => Number(d.unit_price))
        .filter((p: number) => p > 0 && p <= maxPrice);
      if (prices.length >= 2) {
        return {
          min: round2(percentile(prices, 0.25)),
          median: round2(percentile(prices, 0.50)),
          max: round2(percentile(prices, 0.75)),
          source: 'historique_interne',
          detail_source: `${prices.length} offres internes, dernière : ${rawCandidates[0].created_at?.slice(0, 10)}`,
          date_reference: rawCandidates[0].created_at?.slice(0, 10) ?? quarter,
          ajustements: ['Confiance réduite (score scoring < 35)'],
        };
      }
    }
  } catch (e: any) {
    console.warn('[price-resolver] Tier 1 (offer_line_items) error:', e?.message ?? e);
  }

  // ══════════════════════════════════════════════════════
  // 2. Données ingérées — mv_reference_prices (vue matérialisée)
  // ══════════════════════════════════════════════════════
  if (hasCfcCode) {
    try {
      // 2a. Match exact par code CFC
      const { data: mvExact } = await supabase
        .from('mv_reference_prices')
        .select('cfc_code, prix_p25, prix_median, prix_p75, nb_datapoints, nb_fournisseurs, derniere_offre')
        .eq('cfc_code', cfc_code)
        .order('nb_datapoints', { ascending: false })
        .limit(1)
        .single();

      if (mvExact && mvExact.prix_median <= maxPrice) {
        return {
          min: mvExact.prix_p25,
          median: mvExact.prix_median,
          max: mvExact.prix_p75,
          source: 'historique_interne',
          detail_source: `${mvExact.nb_datapoints} offres réelles, ${mvExact.nb_fournisseurs} fournisseurs, dernière: ${mvExact.derniere_offre?.slice(0, 10) ?? 'N/A'}`,
          date_reference: mvExact.derniere_offre?.slice(0, 10) ?? quarter,
          ajustements: [],
        };
      }

      // 2b. Match par préfixe CFC (ex: "215.3" → "215.0" → "215")
      const cfcParts = cfc_code.split('.');
      const prefixes: string[] = [];
      if (cfcParts.length >= 2) {
        prefixes.push(`${cfcParts[0]}.0`);
      }
      prefixes.push(cfcParts[0]);

      for (const prefix of prefixes) {
        const { data: mvPrefix } = await supabase
          .from('mv_reference_prices')
          .select('cfc_code, prix_p25, prix_median, prix_p75, nb_datapoints, nb_fournisseurs, derniere_offre')
          .like('cfc_code', `${prefix}%`)
          .order('nb_datapoints', { ascending: false })
          .limit(1)
          .single();

        if (mvPrefix && mvPrefix.prix_median <= maxPrice) {
          return {
            min: mvPrefix.prix_p25,
            median: mvPrefix.prix_median,
            max: mvPrefix.prix_p75,
            source: 'historique_interne',
            detail_source: `${mvPrefix.nb_datapoints} offres réelles (match partiel ${mvPrefix.cfc_code}), ${mvPrefix.nb_fournisseurs} fournisseurs, dernière: ${mvPrefix.derniere_offre?.slice(0, 10) ?? 'N/A'}`,
            date_reference: mvPrefix.derniere_offre?.slice(0, 10) ?? quarter,
            ajustements: [`Match partiel CFC: ${cfc_code} → ${mvPrefix.cfc_code}`],
          };
        }
      }
    } catch {
      // Table mv_reference_prices peut ne pas exister encore — continuer
    }
  }

  // ══════════════════════════════════════════════════════
  // 3. Fallback textuel — ingested_offer_lines par description
  // Colonnes: org_id, cfc_code, description, prix_unitaire_ht, unite
  // NOTE: pas de colonne is_forfait dans cette table
  // V3: scoring sur les candidats textuels + inflation
  // ══════════════════════════════════════════════════════
  try {
    if (keywords.length > 0) {
      const searchTerm = sanitizeForFilter(keywords[0]);
      if (searchTerm.length >= 4) {
        const { data: textMatches } = await supabase
          .from('ingested_offer_lines')
          .select('cfc_code, prix_unitaire_ht, description, unite, date_offre')
          .ilike('description', `%${searchTerm}%`)
          .gt('prix_unitaire_ht', 0)
          .lt('prix_unitaire_ht', maxPrice)
          .limit(100);

        if (textMatches && textMatches.length >= 2) {
          const scored: Array<{ score: number; adjusted_price: number; cfc_code: string | null }> = textMatches
            .map((r: any) => {
              const candidate: PriceCandidate = {
                prix_unitaire: Number(r.prix_unitaire_ht),
                cfc_code: r.cfc_code,
                description: r.description,
                unite: r.unite,
                date: r.date_offre,
              };
              const sc = scorePriceCandidate(candidate, { cfc_code, description, unite, region }, inflation_rate);
              return { ...sc, cfc_code: (r.cfc_code as string | null) };
            })
            .filter((s: { score: number; adjusted_price: number }) => s.score >= 10 && s.adjusted_price > 0 && s.adjusted_price <= maxPrice)
            .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
            .slice(0, 30);

          if (scored.length >= 2) {
            const wp = weightedPercentiles(scored);
            const cfcFound = scored[0].cfc_code ?? 'N/A';
            return {
              min: round2(wp.p25),
              median: round2(wp.median),
              max: round2(wp.p75),
              source: 'historique_interne',
              detail_source: `${scored.length} offres réelles (recherche texte: "${searchTerm}", CFC ${cfcFound})`,
              date_reference: quarter,
              ajustements: [`Recherche textuelle: "${searchTerm}"`, `Confiance réduite (match par description)`],
            };
          }

          // Fallback sans seuil de score
          const prices = textMatches
            .map((r: any) => Number(r.prix_unitaire_ht))
            .filter((p: number) => p > 0 && p <= maxPrice)
            .sort((a: number, b: number) => a - b);
          if (prices.length >= 2) {
            const cfcFound = textMatches[0].cfc_code ?? 'N/A';
            return {
              min: round2(percentile(prices, 0.25)),
              median: round2(percentile(prices, 0.50)),
              max: round2(percentile(prices, 0.75)),
              source: 'historique_interne',
              detail_source: `${prices.length} offres réelles (recherche texte: "${searchTerm}", CFC ${cfcFound})`,
              date_reference: quarter,
              ajustements: [`Recherche textuelle: "${searchTerm}"`, `Confiance réduite (match par description)`],
            };
          }
        }
      }
    }
  } catch (e: any) {
    console.warn('[price-resolver] Tier 3 (ingested_offer_lines) error:', e?.message ?? e);
  }

  // ══════════════════════════════════════════════════════
  // 4. Benchmark Cantaia (Couche 2, données agrégées cross-tenant)
  // ══════════════════════════════════════════════════════
  if (hasCfcCode) {
    try {
      const { data: benchmark } = await supabase
        .from('market_benchmarks')
        .select('*')
        .eq('cfc_code', cfc_code)
        .eq('region', region)
        .eq('quarter', quarter)
        .gte('contributor_count', 3)
        .single();

      if (benchmark) {
        return {
          min: benchmark.price_p25,
          median: benchmark.price_median,
          max: benchmark.price_p75,
          source: 'benchmark_cantaia',
          detail_source: `Benchmark Cantaia, ${region}, ${quarter}, ${benchmark.contributor_count} contributeurs`,
          date_reference: quarter,
          ajustements: [],
        };
      }
    } catch {
      // Pas de benchmark — continuer
    }
  }

  // ══════════════════════════════════════════════════════
  // 5. Référentiel CFC (données statiques CRB 2025)
  // ══════════════════════════════════════════════════════
  const coeff = REGIONAL_COEFFICIENTS[region.toLowerCase()] ?? 1.0;

  // 5a. Match exact par code CFC
  let ref = hasCfcCode
    ? CFC_REFERENCE_PRICES.find((r) => r.cfc_code === cfc_code)
    : undefined;

  // 5b. Match par préfixe CFC + même unité
  if (!ref && hasCfcCode) {
    const prefix = cfc_code.split('.')[0];
    ref = CFC_REFERENCE_PRICES.find((r) => r.cfc_code.startsWith(prefix) && r.unite === unite);
  }

  // 5c. Match par mots-clés de description (au moins 2 mots-clés en commun)
  if (!ref && keywords.length >= 1) {
    let bestMatch: (typeof CFC_REFERENCE_PRICES)[0] | undefined;
    let bestScore = 0;

    for (const r of CFC_REFERENCE_PRICES) {
      const score = keywordOverlap(description, r.description);
      if (score > bestScore && score >= 0.4) { // Au moins 40% de mots-clés en commun
        bestScore = score;
        bestMatch = r;
      }
    }

    if (bestMatch) {
      ref = bestMatch;
    }
  }

  if (ref) {
    // V3: apply inflation adjustment — CRB prices are dated, adjust to today
    const refYear = parseInt(ref.periode?.replace(/[^0-9]/g, '').slice(0, 4) || '2025', 10);
    const ageYears = Math.max(0, new Date().getFullYear() - refYear + (new Date().getMonth() / 12));
    const inflFactor = Math.pow(1 + inflation_rate, ageYears);
    const ajustements: string[] = [];
    if (coeff !== 1.0) ajustements.push(`Coefficient régional ${region}: ${coeff}`);
    if (ageYears > 0) ajustements.push(`Ajustement inflation ${(inflation_rate * 100).toFixed(1)}%/an × ${ageYears.toFixed(1)} ans`);

    return {
      min: round2(ref.prix_min * coeff * inflFactor),
      median: round2(ref.prix_median * coeff * inflFactor),
      max: round2(ref.prix_max * coeff * inflFactor),
      source: 'referentiel_crb',
      detail_source: `Référentiel CRB ${ref.periode}, coefficient ${region}: ${coeff}${ageYears > 0 ? `, inflation ×${inflFactor.toFixed(3)}` : ''}`,
      date_reference: ref.periode,
      ajustements,
    };
  }

  // ══════════════════════════════════════════════════════
  // 6. Aucun prix trouvé
  // ══════════════════════════════════════════════════════
  return {
    min: null,
    median: null,
    max: null,
    source: 'prix_non_disponible',
    detail_source: 'Aucune référence de prix trouvée — demander un devis fournisseur',
    date_reference: quarter,
    ajustements: [],
  };
}

// Résolution batch pour tous les postes d'un métré
export async function resolvePricesBatch(
  postes: Array<{ cfc_code: string; description: string; unite: string }>,
  region: string,
  quarter: string,
  org_id: string,
  supabase: any
): Promise<Map<string, PrixUnitaire>> {
  const results = new Map<string, PrixUnitaire>();

  // Résoudre tous les prix en parallèle
  const promises = postes.map(async (p) => {
    const prix = await resolvePrice({
      cfc_code: p.cfc_code,
      description: p.description,
      unite: p.unite,
      region,
      quarter,
      org_id,
      supabase,
    });
    results.set(`${p.cfc_code}::${p.unite}`, prix);
  });

  await Promise.all(promises);
  return results;
}
