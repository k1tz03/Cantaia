// Calculateur de confiance dynamique
// Intègre les bonus de calibration dans le score de confiance

import type {
  Passe4Result,
  ConsensusResult,
  DynamicConfidenceFactors,
  ConfidenceLevel,
  PriceSource,
} from './types';
import { getQuantityCalibration, getPriceCalibration, getBureauProfile } from './calibration-engine';
import { verifyCrossPlan, getCrossPlanBonus } from './cross-plan-verification';

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

function getConfidenceLabel(score: number): string {
  if (score >= 0.90) return 'Estimation haute fiabilité — données réelles majoritaires';
  if (score >= 0.80) return 'Estimation fiable — calibrée sur l\'historique';
  if (score >= 0.70) return 'Estimation solide — quelques postes à confirmer';
  if (score >= 0.60) return 'Estimation indicative — historique en construction';
  if (score >= 0.50) return 'Estimation préliminaire — à consolider avec des devis';
  return 'Pré-estimation — données insuffisantes';
}

export async function calculateDynamicConfidence(params: {
  estimation: Passe4Result;
  consensus: ConsensusResult;
  org_id: string;
  project_id: string;
  discipline: string;
  bureau_auteur: string | null;
  region: string;
  supabase: any;
}): Promise<{
  postes: Array<{
    cfc_code: string;
    description: string;
    factors: DynamicConfidenceFactors;
  }>;
  score_global: number;
  label_global: string;
  evolution: {
    score_sans_calibration: number;
    score_avec_calibration: number;
    gain: number;
    explication: string;
  };
}> {
  const { estimation, consensus, org_id, project_id, discipline, bureau_auteur, region, supabase } = params;

  // Récupérer le profil bureau
  const bureauResult = await getBureauProfile({ org_id, bureau_nom: bureau_auteur || '', supabase });

  // Récupérer la vérification croisée
  let crossPlanBonus = 0;
  let crossPlanSource: string | null = null;
  try {
    const crossResult = await verifyCrossPlan({ project_id, org_id, supabase });
    if (crossResult.verifications.length > 0) {
      crossPlanBonus = getCrossPlanBonus(crossResult.score_coherence_projet);
      crossPlanSource = `Score cohérence inter-plans: ${crossResult.score_coherence_projet}/100`;
    }
  } catch {
    // Non bloquant
  }

  // Calculer pour chaque poste
  const allPostes = estimation.estimation_par_cfc.flatMap((c) => c.postes);
  const posteResults: Array<{ cfc_code: string; description: string; factors: DynamicConfidenceFactors }> = [];

  let totalWeightedScore = 0;
  let totalWeightedScoreNoCalib = 0;
  let totalWeight = 0;
  let totalQtyCorrections = 0;
  let totalPriceCalibrations = 0;

  const totalMedian = allPostes.reduce((s, p) => s + (p.total.median ?? 0), 0);

  for (const poste of allPostes) {
    const montant = poste.total.median ?? 0;
    const poids = totalMedian > 0 ? montant / totalMedian : 1 / allPostes.length;

    // Score de base (sans calibration)
    const consensusPoste = consensus.postes.find((cp) => cp.cfc_code === poste.cfc_code);
    const consensusConfidence = consensusPoste
      ? ({ high: 0.9, medium: 0.7, low: 0.4, flag: 0.2 }[consensusPoste.confiance_consensus] ?? 0.5)
      : 0.5;

    const sourceScore = SOURCE_SCORES[poste.prix_unitaire.source] ?? 0;
    const qtyScore = QUANTITE_SCORES[poste.confiance_quantite] ?? 0.5;
    const baseScore = consensusConfidence * sourceScore * qtyScore;

    // Bonus calibration quantités
    const qtyCal = await getQuantityCalibration({
      org_id,
      cfc_code: poste.cfc_code,
      discipline,
      bureau_auteur,
      supabase,
    });

    if (qtyCal.nb_corrections > 0) totalQtyCorrections += qtyCal.nb_corrections;

    // Bonus calibration prix
    const priceCal = await getPriceCalibration({
      org_id,
      cfc_code: poste.cfc_code,
      region,
      supabase,
    });

    if (priceCal.nb_calibrations > 0) totalPriceCalibrations += priceCal.nb_calibrations;

    // Score final plafonné à 0.95
    const scoreFinal = Math.min(
      0.95,
      baseScore + qtyCal.confidence_bonus + priceCal.confidence_bonus + bureauResult.confidence_bonus + crossPlanBonus
    );

    const factors: DynamicConfidenceFactors = {
      base_consensus_score: Math.round(baseScore * 100) / 100,
      calibration_qty_bonus: qtyCal.confidence_bonus,
      calibration_qty_source: qtyCal.nb_corrections > 0
        ? `${qtyCal.nb_corrections} corrections sur CFC ${poste.cfc_code}, discipline ${discipline}`
        : 'Aucune correction disponible',
      calibration_price_bonus: priceCal.confidence_bonus,
      calibration_price_source: priceCal.nb_calibrations > 0
        ? `${priceCal.nb_calibrations} prix réels pour CFC ${poste.cfc_code}`
        : 'Aucune calibration disponible',
      bureau_bonus: bureauResult.confidence_bonus,
      bureau_source: bureau_auteur ? `Bureau ${bureau_auteur}, ${bureauResult.profile?.nb_plans_analyses ?? 0} plans analysés` : null,
      cross_plan_bonus: crossPlanBonus,
      cross_plan_source: crossPlanSource,
      score_final: Math.round(scoreFinal * 100) / 100,
      label: getConfidenceLabel(scoreFinal),
      details: `Base: ${(baseScore * 100).toFixed(0)}% + Qty: +${(qtyCal.confidence_bonus * 100).toFixed(0)}% + Prix: +${(priceCal.confidence_bonus * 100).toFixed(0)}% + Bureau: +${(bureauResult.confidence_bonus * 100).toFixed(0)}% + Cross: +${(crossPlanBonus * 100).toFixed(0)}%`,
    };

    posteResults.push({ cfc_code: poste.cfc_code, description: poste.description, factors });

    totalWeightedScore += poids * scoreFinal;
    totalWeightedScoreNoCalib += poids * baseScore;
    totalWeight += poids;
  }

  const scoreGlobal = totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) : 0;
  const scoreSansCalib = totalWeight > 0 ? Math.round((totalWeightedScoreNoCalib / totalWeight) * 100) : 0;
  const gain = scoreGlobal - scoreSansCalib;

  let explication = '';
  if (gain > 0) {
    const parts: string[] = [];
    if (totalPriceCalibrations > 0) parts.push(`${totalPriceCalibrations} prix réels`);
    if (totalQtyCorrections > 0) parts.push(`${totalQtyCorrections} corrections de quantités`);
    if (bureauResult.confidence_bonus > 0) parts.push('profil bureau connu');
    if (crossPlanBonus > 0) parts.push('vérification inter-plans');
    explication = `La calibration a amélioré le score de ${gain} points grâce à ${parts.join(', ')}`;
  } else {
    explication = 'Aucune donnée de calibration disponible — le score augmentera avec les corrections et prix réels';
  }

  return {
    postes: posteResults,
    score_global: scoreGlobal,
    label_global: getConfidenceLabel(scoreGlobal / 100),
    evolution: {
      score_sans_calibration: scoreSansCalib,
      score_avec_calibration: scoreGlobal,
      gain,
      explication,
    },
  };
}
