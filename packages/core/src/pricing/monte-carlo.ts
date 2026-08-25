// ============================================================
// Monte Carlo corrélé — simulation budgétaire
// ============================================================
//
// AUDIT 08/2026 — l'implémentation embarquée dans MonteCarloChart.tsx tire
// chaque poste INDÉPENDAMMENT : or les prix de construction bougent ensemble
// (conjoncture, matières premières, tension du marché local). Sous
// indépendance, les écarts se compensent par moyenne et la queue de la
// distribution est écrasée → P80/P95 systématiquement SOUS-ESTIMÉS, précisément
// les chiffres vendus comme "prudent" et "worst case".
//
// Ce module ajoute un FACTEUR DE MARCHÉ COMMUN (corrélation ρ ≈ 0.4 entre
// postes) : tirage_prix = ρ_part × facteur_marché + bruit idiosyncratique,
// via la décomposition gaussienne standard z_i = √ρ·M + √(1−ρ)·ε_i qui donne
// corr(z_i, z_j) = ρ. Un seed optionnel rend la simulation reproductible.
//
// CONTRAT DE SORTIE : identique à la SimulationResult consommée par
// MonteCarloChart.tsx (histogram/p10/p50/p80/p95/mean/stdDev/topContributors)
// — le composant (gelé au moment de l'audit) pourra remplacer son
// `runSimulation` interne par cet export sans rien changer d'autre.

export interface MonteCarloItem {
  item_id?: string;
  item_number?: string | null;
  description: string;
  prix_median: number;
  prix_min: number;
  prix_max: number;
  quantity: number | null;
  source: string;
  variance?: {
    std_dev_prix: number;
    std_dev_quantite: number;
  };
  market_benchmark?: {
    p25: number;
    p75: number;
  };
}

export interface MonteCarloResult {
  histogram: { bin: number; count: number; label: string }[];
  p10: number;
  p50: number;
  p80: number;
  p95: number;
  mean: number;
  stdDev: number;
  topContributors: {
    description: string;
    source: string;
    varianceContribution: number;
    percentOfTotal: number;
  }[];
}

export interface MonteCarloOptions {
  iterations?: number;
  /**
   * Corrélation inter-postes des prix (0 = indépendant, 1 = tout bouge
   * ensemble). Défaut 0.4 — ordre de grandeur des corrélations observées
   * entre lots d'un même chantier.
   */
  correlation?: number;
  /** Seed déterministe optionnel — même seed + mêmes items = même résultat. */
  seed?: number;
}

// ── PRNG déterministe (mulberry32) ─────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller sur un uniforme injectable (Math.random ou PRNG seedé). */
function makeStandardNormal(rand: () => number): () => number {
  return function () {
    let u1 = 0;
    let u2 = 0;
    while (u1 === 0) u1 = rand();
    while (u2 === 0) u2 = rand();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };
}

// ── Std dev par source (aligné sur MonteCarloChart.tsx) ────────

function computeItemStdDevPrix(item: MonteCarloItem): number {
  if (item.variance?.std_dev_prix && item.variance.std_dev_prix > 0) {
    return item.variance.std_dev_prix;
  }

  const { source, prix_median, prix_min, prix_max, market_benchmark } = item;

  if (source === "historique_interne" && market_benchmark?.p25 && market_benchmark?.p75) {
    return (market_benchmark.p75 - market_benchmark.p25) / 1.35;
  }

  if (source === "referentiel_crb") {
    const range = prix_max - prix_min;
    return range > 0 ? range / 4 : prix_median * 0.15;
  }

  if (source === "estimation_ia" || source === "non_estime") {
    return prix_median * 0.20;
  }

  const range = prix_max - prix_min;
  return range > 0 ? range / 4 : prix_median * 0.15;
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function formatCompactCHF(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toFixed(0);
}

// ── Simulation ─────────────────────────────────────────────────

export function runCorrelatedMonteCarlo(
  items: MonteCarloItem[],
  options: MonteCarloOptions = {}
): MonteCarloResult {
  const iterations = options.iterations ?? 10000;
  const rho = Math.min(1, Math.max(0, options.correlation ?? 0.4));
  const rand = options.seed !== undefined ? mulberry32(options.seed) : Math.random;
  const normal = makeStandardNormal(rand);

  const validItems = items.filter((i) => (i.quantity ?? 0) > 0 && i.prix_median > 0);

  if (validItems.length === 0) {
    return {
      histogram: [],
      p10: 0,
      p50: 0,
      p80: 0,
      p95: 0,
      mean: 0,
      stdDev: 0,
      topContributors: [],
    };
  }

  const itemParams = validItems.map((item) => ({
    item,
    prixMean: item.prix_median,
    prixStd: computeItemStdDevPrix(item),
    qtyMean: item.quantity ?? 0,
    qtyStd: (item.quantity ?? 0) * 0.10,
  }));

  const sqrtRho = Math.sqrt(rho);
  const sqrtOneMinusRho = Math.sqrt(1 - rho);

  const totals = new Float64Array(iterations);
  const itemVarianceAccum = new Float64Array(validItems.length);

  for (let iter = 0; iter < iterations; iter++) {
    // Facteur de marché COMMUN à tous les postes de ce scénario : c'est lui
    // qui empêche la compensation artificielle des écarts entre postes.
    const marketFactor = normal();

    let total = 0;
    for (let j = 0; j < itemParams.length; j++) {
      const p = itemParams[j];
      // z corrélé : √ρ·M + √(1−ρ)·ε  (corr(z_i, z_j) = ρ, Var(z) = 1)
      const zPrix = sqrtRho * marketFactor + sqrtOneMinusRho * normal();
      const sampledPrix = Math.max(0, p.prixMean + p.prixStd * zPrix);
      // La quantité reste idiosyncratique : une erreur de métré sur un poste
      // ne dit rien de l'erreur de métré des autres.
      const sampledQty = Math.max(0, p.qtyMean + p.qtyStd * normal());
      const itemTotal = sampledPrix * sampledQty;
      total += itemTotal;

      const expected = p.prixMean * p.qtyMean;
      itemVarianceAccum[j] += (itemTotal - expected) * (itemTotal - expected);
    }
    totals[iter] = total;
  }

  const sorted = Array.from(totals).sort((a, b) => a - b);

  const p10 = percentile(sorted, 10);
  const p50 = percentile(sorted, 50);
  const p80 = percentile(sorted, 80);
  const p95 = percentile(sorted, 95);

  let sum = 0;
  for (let i = 0; i < iterations; i++) sum += totals[i];
  const mean = sum / iterations;

  let sumSqDiff = 0;
  for (let i = 0; i < iterations; i++) {
    const d = totals[i] - mean;
    sumSqDiff += d * d;
  }
  const stdDev = Math.sqrt(sumSqDiff / iterations);

  // Histogramme (50 bins) — même forme que le composant.
  const NUM_BINS = 50;
  const histMin = sorted[0];
  const histMax = sorted[sorted.length - 1];
  const binWidth = (histMax - histMin) / NUM_BINS || 1;
  const bins = new Array(NUM_BINS).fill(0);

  for (let i = 0; i < iterations; i++) {
    const binIdx = Math.min(Math.floor((totals[i] - histMin) / binWidth), NUM_BINS - 1);
    bins[binIdx]++;
  }

  const histogram = bins.map((count, i) => ({
    bin: histMin + (i + 0.5) * binWidth,
    count,
    label: formatCompactCHF(histMin + (i + 0.5) * binWidth),
  }));

  const totalVariance = itemVarianceAccum.reduce((s, v) => s + v, 0);
  const topContributors = itemParams
    .map((p, i) => ({
      description: p.item.description,
      source: p.item.source,
      varianceContribution: itemVarianceAccum[i] / iterations,
      percentOfTotal: totalVariance > 0 ? (itemVarianceAccum[i] / totalVariance) * 100 : 0,
    }))
    .sort((a, b) => b.percentOfTotal - a.percentOfTotal)
    .slice(0, 3);

  return {
    histogram,
    p10,
    p50,
    p80,
    p95,
    mean,
    stdDev,
    topContributors,
  };
}
