// Résolveur de prix — hiérarchie stricte des sources
// 1. Historique interne → 2. Benchmark Cantaia → 3. Référentiel CFC → 4. Non disponible

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

  // 2. Benchmark Cantaia (Couche 2, données agrégées cross-tenant)
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

  // 3. Référentiel CFC (données statiques)
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

  // 4. Aucun prix trouvé
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
