// Résolveur de prix — hiérarchie stricte des sources
// 1. Historique interne (offer_line_items de l'org)
// 2. Données ingérées (mv_reference_prices — 2500+ prix réels)
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

export async function resolvePrice(params: PriceResolverParams): Promise<PrixUnitaire> {
  const { cfc_code, description, unite, region, quarter, org_id, supabase } = params;

  // 1. Historique interne (offres fournisseurs de cette org)
  try {
    const { data: internal } = await supabase
      .from('offer_line_items')
      .select('unit_price, created_at, supplier_offers!inner(org_id)')
      .eq('supplier_offers.org_id', org_id)
      .or(`cfc_code.eq.${cfc_code},description_normalized.ilike.%${cfc_code}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (internal && internal.length >= 2) {
      const prices = internal.map((d: any) => Number(d.unit_price)).filter((p: number) => p > 0);
      if (prices.length >= 2) {
        return {
          min: Math.round(percentile(prices, 0.25) * 100) / 100,
          median: Math.round(percentile(prices, 0.50) * 100) / 100,
          max: Math.round(percentile(prices, 0.75) * 100) / 100,
          source: 'historique_interne',
          detail_source: `${prices.length} offres internes, dernière : ${internal[0].created_at?.slice(0, 10)}`,
          date_reference: internal[0].created_at?.slice(0, 10) ?? quarter,
          ajustements: [],
        };
      }
    }
  } catch {
    // Continuer vers la source suivante
  }

  // 2. Données ingérées — mv_reference_prices (2500+ prix réels fournisseurs)
  try {
    // 2a. Match exact par code CFC
    const { data: mvExact } = await supabase
      .from('mv_reference_prices')
      .select('cfc_code, prix_p25, prix_median, prix_p75, nb_datapoints, nb_fournisseurs, derniere_offre')
      .eq('cfc_code', cfc_code)
      .order('nb_datapoints', { ascending: false })
      .limit(1)
      .single();

    if (mvExact) {
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
      prefixes.push(`${cfcParts[0]}.0`); // ex: "215.0"
    }
    prefixes.push(cfcParts[0]); // ex: "215"

    for (const prefix of prefixes) {
      const { data: mvPrefix } = await supabase
        .from('mv_reference_prices')
        .select('cfc_code, prix_p25, prix_median, prix_p75, nb_datapoints, nb_fournisseurs, derniere_offre')
        .like('cfc_code', `${prefix}%`)
        .order('nb_datapoints', { ascending: false })
        .limit(1)
        .single();

      if (mvPrefix) {
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
    // Continuer vers la source suivante
  }

  // 3. Fallback textuel — recherche par description dans ingested_offer_lines
  try {
    // Extraire le mot-clé principal de la description (≥ 4 caractères)
    const keywords = description
      .toLowerCase()
      .split(/[\s,;()\/\-]+/)
      .filter((w) => w.length >= 4)
      .slice(0, 3);

    if (keywords.length > 0) {
      const searchTerm = keywords[0];
      const { data: textMatches } = await supabase
        .from('ingested_offer_lines')
        .select('cfc_code, prix_unitaire_ht')
        .ilike('description', `%${searchTerm}%`)
        .gt('prix_unitaire_ht', 0)
        .limit(50);

      if (textMatches && textMatches.length >= 2) {
        const prices = textMatches.map((r: any) => Number(r.prix_unitaire_ht)).filter((p: number) => p > 0).sort((a: number, b: number) => a - b);
        if (prices.length >= 2) {
          const cfcFound = textMatches[0].cfc_code ?? 'N/A';
          return {
            min: Math.round(percentile(prices, 0.25) * 100) / 100,
            median: Math.round(percentile(prices, 0.50) * 100) / 100,
            max: Math.round(percentile(prices, 0.75) * 100) / 100,
            source: 'historique_interne',
            detail_source: `${prices.length} offres réelles (recherche texte: "${searchTerm}", CFC ${cfcFound})`,
            date_reference: quarter,
            ajustements: [`Recherche textuelle: "${searchTerm}"`, `Confiance réduite (match par description)`],
          };
        }
      }
    }
  } catch {
    // Continuer vers la source suivante
  }

  // 4. Benchmark Cantaia (Couche 2, données agrégées cross-tenant)
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
    // Continuer vers la source suivante
  }

  // 5. Référentiel CFC (données statiques)
  const coeff = REGIONAL_COEFFICIENTS[region.toLowerCase()] ?? 1.0;

  // Chercher par code exact
  let ref = CFC_REFERENCE_PRICES.find((r) => r.cfc_code === cfc_code);

  // Si pas trouvé, chercher par préfixe (ex: "215" si "215.3" pas trouvé)
  if (!ref) {
    const prefix = cfc_code.split('.')[0];
    ref = CFC_REFERENCE_PRICES.find((r) => r.cfc_code.startsWith(prefix) && r.unite === unite);
  }

  // Chercher aussi par description normalisée
  if (!ref) {
    const descLower = description.toLowerCase();
    ref = CFC_REFERENCE_PRICES.find((r) =>
      r.description.toLowerCase().includes(descLower) ||
      descLower.includes(r.description.toLowerCase())
    );
  }

  if (ref) {
    return {
      min: Math.round(ref.prix_min * coeff * 100) / 100,
      median: Math.round(ref.prix_median * coeff * 100) / 100,
      max: Math.round(ref.prix_max * coeff * 100) / 100,
      source: 'referentiel_crb',
      detail_source: `Référentiel CRB ${ref.periode}, coefficient ${region}: ${coeff}`,
      date_reference: ref.periode,
      ajustements: coeff !== 1.0 ? [`Coefficient régional ${region}: ${coeff}`] : [],
    };
  }

  // 6. Aucun prix trouvé
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
