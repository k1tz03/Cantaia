// Calcul du score de fiabilité de l'estimation
// Formule : score_global = Σ (poids_poste × score_source × score_quantite) / Σ poids_poste

import type { PosteChiffre, PriceSource, ConfidenceLevel } from './types';

const SOURCE_SCORES: Record<PriceSource, number> = {
  historique_interne: 1.0,
  benchmark_cantaia: 0.85,
  referentiel_crb: 0.70,
  consensus_multi_ia: 0.45,
  ratio_estimation: 0.45,
  estimation_ia: 0.25,
  prix_non_disponible: 0.0,
};

const QUANTITE_SCORES: Record<ConfidenceLevel, number> = {
  high: 1.0,
  medium: 0.80,
  low: 0.50,
  assumption: 0.30,
};

export function calculateGlobalScore(postes: PosteChiffre[]): number {
  if (postes.length === 0) return 0;

  const totalMedian = postes.reduce((s, p) => s + (p.total.median ?? 0), 0);
  if (totalMedian === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const poste of postes) {
    const montant = poste.total.median ?? 0;
    const poids = montant / totalMedian;
    const scoreSrc = SOURCE_SCORES[poste.prix_unitaire.source] ?? 0;
    const scoreQty = QUANTITE_SCORES[poste.confiance_quantite] ?? 0.5;

    weightedSum += poids * scoreSrc * scoreQty;
    totalWeight += poids;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100);
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return 'Estimation haute fiabilité';
  if (score >= 60) return 'Estimation fiable — quelques postes à confirmer';
  if (score >= 40) return 'Estimation indicative — à consolider';
  return 'Pré-estimation — plans complémentaires nécessaires';
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 60) return 'blue';
  if (score >= 40) return 'orange';
  return 'red';
}

// Calcul de la répartition des sources (en % du montant total)
export function calculateSourceDistribution(postes: PosteChiffre[]): Record<string, number> {
  const totalMedian = postes.reduce((s, p) => s + (p.total.median ?? 0), 0);
  if (totalMedian === 0) {
    return {
      historique_interne_pct: 0,
      benchmark_cantaia_pct: 0,
      referentiel_crb_pct: 0,
      ratio_estimation_pct: 0,
      estimation_ia_pct: 0,
      consensus_multi_ia_pct: 0,
      prix_non_disponible_pct: 0,
    };
  }

  const buckets: Record<PriceSource, number> = {
    historique_interne: 0,
    benchmark_cantaia: 0,
    referentiel_crb: 0,
    ratio_estimation: 0,
    estimation_ia: 0,
    consensus_multi_ia: 0,
    prix_non_disponible: 0,
  };

  for (const poste of postes) {
    buckets[poste.prix_unitaire.source] += poste.total.median ?? 0;
  }

  return {
    historique_interne_pct: Math.round((buckets.historique_interne / totalMedian) * 100),
    benchmark_cantaia_pct: Math.round((buckets.benchmark_cantaia / totalMedian) * 100),
    referentiel_crb_pct: Math.round((buckets.referentiel_crb / totalMedian) * 100),
    ratio_estimation_pct: Math.round((buckets.ratio_estimation / totalMedian) * 100),
    estimation_ia_pct: Math.round((buckets.estimation_ia / totalMedian) * 100),
    consensus_multi_ia_pct: Math.round((buckets.consensus_multi_ia / totalMedian) * 100),
    prix_non_disponible_pct: Math.round((buckets.prix_non_disponible / totalMedian) * 100),
  };
}

// Score de confiance combiné lisible
export function combinedConfidenceLabel(
  confianceQuantite: ConfidenceLevel,
  confiancePrix: string
): string {
  const qScore = QUANTITE_SCORES[confianceQuantite] ?? 0.5;
  const pScore = confiancePrix === 'high' ? 1.0 : confiancePrix === 'medium' ? 0.7 : confiancePrix === 'low' ? 0.4 : 0.2;
  const combined = qScore * pScore;

  if (combined >= 0.8) return `quantité ${confianceQuantite} × prix ${confiancePrix} = fiabilité haute`;
  if (combined >= 0.5) return `quantité ${confianceQuantite} × prix ${confiancePrix} = fiabilité bonne`;
  if (combined >= 0.3) return `quantité ${confianceQuantite} × prix ${confiancePrix} = fiabilité moyenne`;
  return `quantité ${confianceQuantite} × prix ${confiancePrix} = fiabilité faible`;
}
