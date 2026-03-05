// Orchestrateur du pipeline d'estimation 4 passes
// Coordonne : identification → métré multi-modèle → consensus → vérification → chiffrage

import type {
  Passe1Result,
  Passe2Result,
  Passe3Result,
  Passe4Result,
  ModelMetrage,
  ModelProvider,
  PosteChiffre,
  EstimationPipelineResult,
  ConsensusResult,
} from './types';
import { callClaudeVision, callClaudeText, callGPT4oVision, callGeminiVision } from './ai-clients';
import {
  getPasse1SystemPrompt, getPasse1UserPrompt,
  getPasse2SystemPrompt, getPasse2UserPrompt,
  getPasse3SystemPrompt, getPasse3UserPrompt,
} from './prompts';
import { buildConsensus } from './consensus-engine';
import { resolvePrice } from './price-resolver';
import { calculateGlobalScore, calculateSourceDistribution, combinedConfidenceLabel, getScoreLabel } from './confidence-calculator';
import { RATIOS_M2_SBP } from './reference-data/regional-coefficients';

export interface PipelineParams {
  plan_id: string;
  project_id: string;
  org_id: string;
  image_base64: string;
  media_type: string;
  region: string;
  type_batiment: string;
  acces_chantier: 'normal' | 'difficile' | 'tres_difficile';
  periode_travaux: string;
  supabase: any;
  // Calibration optionnelle (phase 17)
  bureauEnrichment?: string;
  modelWeights?: Record<ModelProvider, number>;
  qtyCalibrations?: Map<string, number>;
  priceCalibrations?: Map<string, number>;
}

export async function runEstimationPipeline(params: PipelineParams): Promise<EstimationPipelineResult> {
  const pipelineStart = Date.now();
  let totalTokens = 0;

  // ═══ PASSE 1 — Identification (Claude seul) ═══
  console.log('[estimation] Passe 1 — Identification du plan...');
  const passe1Start = Date.now();

  const passe1Call = await callClaudeVision<Passe1Result>(
    params.image_base64,
    params.media_type,
    getPasse1SystemPrompt(),
    getPasse1UserPrompt()
  );

  const passe1Duration = Date.now() - passe1Start;
  totalTokens += passe1Call.tokens_used;

  if (!passe1Call.result) {
    throw new Error(`Passe 1 échouée : ${passe1Call.error}`);
  }

  const passe1 = passe1Call.result;
  console.log(`[estimation] Passe 1 terminée : ${passe1.classification.discipline} / ${passe1.classification.type_plan}`);

  // Avertissement qualité basse
  if (passe1.contexte_metrage.qualite_image === 'basse') {
    console.warn('[estimation] Qualité image basse — précision du métré réduite');
  }

  // ═══ PASSE 2 — Métré multi-modèle (3 modèles en parallèle) ═══
  console.log('[estimation] Passe 2 — Métré multi-modèle...');
  const passe2Start = Date.now();

  const sysPasse2 = getPasse2SystemPrompt();
  const userPasse2 = getPasse2UserPrompt(passe1, params.bureauEnrichment);

  const [claudeResult, gptResult, geminiResult] = await Promise.all([
    callClaudeVision<Passe2Result>(params.image_base64, params.media_type, sysPasse2, userPasse2),
    callGPT4oVision<Passe2Result>(params.image_base64, params.media_type, sysPasse2, userPasse2),
    callGeminiVision<Passe2Result>(params.image_base64, params.media_type, sysPasse2, userPasse2),
  ]);

  const passe2Duration = Date.now() - passe2Start;

  const metrages: ModelMetrage[] = [
    { provider: 'claude', result: claudeResult.result!, latency_ms: claudeResult.latency_ms, tokens_used: claudeResult.tokens_used, error: claudeResult.error },
    { provider: 'gpt4o', result: gptResult.result!, latency_ms: gptResult.latency_ms, tokens_used: gptResult.tokens_used, error: gptResult.error },
    { provider: 'gemini', result: geminiResult.result!, latency_ms: geminiResult.latency_ms, tokens_used: geminiResult.tokens_used, error: geminiResult.error },
  ];

  totalTokens += claudeResult.tokens_used + gptResult.tokens_used + geminiResult.tokens_used;

  const validModels = metrages.filter((m) => m.error === null);
  if (validModels.length === 0) {
    throw new Error('Passe 2 échouée — aucun modèle n\'a répondu correctement');
  }

  console.log(`[estimation] Passe 2 terminée : ${validModels.length}/3 modèles OK`);

  // ═══ CONSENSUS ═══
  console.log('[estimation] Consensus multi-modèle...');
  const consensusStart = Date.now();

  const consensus: ConsensusResult = buildConsensus(metrages, params.modelWeights);
  const consensusDuration = Date.now() - consensusStart;

  console.log(`[estimation] Consensus : ${consensus.stats.concordance_forte_pct}% concordance forte, score ${consensus.stats.score_consensus_global}`);

  // Appliquer les calibrations quantité si disponibles
  let metrageForVerification = consensus.metrage_fusionne;
  if (params.qtyCalibrations && params.qtyCalibrations.size > 0) {
    metrageForVerification = applyQuantityCalibrations(metrageForVerification, params.qtyCalibrations);
  }

  // ═══ PASSE 3 — Vérification (Claude seul, texte) ═══
  console.log('[estimation] Passe 3 — Vérification de cohérence...');
  const passe3Start = Date.now();

  const passe3Call = await callClaudeText<Passe3Result>(
    getPasse3SystemPrompt(),
    getPasse3UserPrompt(
      metrageForVerification,
      metrageForVerification.surface_reference.surface_brute_plancher,
      params.type_batiment
    )
  );

  const passe3Duration = Date.now() - passe3Start;
  totalTokens += passe3Call.tokens_used;

  const passe3: Passe3Result = passe3Call.result ?? {
    verification_ratios: [],
    alertes_coherence: [],
    doublons_potentiels: [],
    elements_probablement_manquants: [],
    score_fiabilite_metrage: {
      score: 50,
      facteurs_positifs: [],
      facteurs_negatifs: ['Vérification IA non disponible'],
      recommandation: 'Vérification manuelle recommandée',
    },
  };

  console.log(`[estimation] Passe 3 terminée : score métré ${passe3.score_fiabilite_metrage.score}/100`);

  // Ajouter les éléments manquants avec confiance "assumption"
  if (passe3.elements_probablement_manquants.length > 0) {
    for (const missing of passe3.elements_probablement_manquants) {
      if (missing.quantite_estimee) {
        metrageForVerification.metrage_par_zone[0]?.postes.push({
          cfc_code: missing.cfc_code,
          cfc_libelle: missing.description,
          description_detaillee: `${missing.description} (ajouté par vérification — ${missing.raison})`,
          quantite: parseFloat(missing.quantite_estimee) || 0,
          unite: 'm²',
          methode_mesure: 'Estimé par vérification de cohérence Passe 3',
          vue_source: 'analyse',
          confiance: 'assumption',
          hypotheses: [missing.raison],
          decomposition: [],
        });
      }
    }
  }

  // ═══ PASSE 4 — Chiffrage ═══
  console.log('[estimation] Passe 4 — Chiffrage...');
  const passe4Start = Date.now();

  // Résoudre les prix pour chaque poste (via resolvePrice qui consulte l'historique et benchmarks)
  const allPostes = metrageForVerification.metrage_par_zone.flatMap((z) => z.postes);
  const quarter = params.periode_travaux || `${new Date().getFullYear()}-Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;

  const postesChiffres: PosteChiffre[] = [];

  for (const poste of allPostes) {
    const prix = await resolvePrice({
      cfc_code: poste.cfc_code,
      description: poste.description_detaillee || poste.cfc_libelle,
      unite: poste.unite,
      region: params.region,
      quarter,
      org_id: params.org_id,
      supabase: params.supabase,
    });

    // Appliquer la calibration prix si disponible
    if (params.priceCalibrations) {
      const calKey = `${poste.cfc_code}::${params.region}`;
      const coeff = params.priceCalibrations.get(calKey);
      if (coeff && prix.min !== null && prix.median !== null && prix.max !== null) {
        prix.min = Math.round(prix.min * coeff * 100) / 100;
        prix.median = Math.round(prix.median * coeff * 100) / 100;
        prix.max = Math.round(prix.max * coeff * 100) / 100;
        prix.ajustements.push(`Calibration prix: ×${coeff.toFixed(3)}`);
      }
    }

    // Déterminer la confiance prix
    const confiancePrix = prix.source === 'historique_interne' ? 'high' as const
      : prix.source === 'benchmark_cantaia' ? 'medium' as const
      : prix.source === 'referentiel_crb' ? 'medium' as const
      : prix.source === 'prix_non_disponible' ? 'estimation' as const
      : 'low' as const;

    postesChiffres.push({
      cfc_code: poste.cfc_code,
      cfc_libelle: poste.cfc_libelle,
      description: poste.description_detaillee || poste.cfc_libelle,
      quantite: poste.quantite,
      unite: poste.unite,
      prix_unitaire: prix,
      total: {
        min: prix.min !== null ? Math.round(prix.min * poste.quantite * 100) / 100 : null,
        median: prix.median !== null ? Math.round(prix.median * poste.quantite * 100) / 100 : null,
        max: prix.max !== null ? Math.round(prix.max * poste.quantite * 100) / 100 : null,
      },
      confiance_quantite: poste.confiance,
      confiance_prix: confiancePrix,
      confiance_combinee: combinedConfidenceLabel(poste.confiance, confiancePrix),
      note: prix.source === 'prix_non_disponible' ? 'Demander un devis fournisseur pour ce poste' : null,
    });
  }

  // Calculer les totaux
  const sousTotal = {
    min: postesChiffres.reduce((s, p) => s + (p.total.min ?? 0), 0),
    median: postesChiffres.reduce((s, p) => s + (p.total.median ?? 0), 0),
    max: postesChiffres.reduce((s, p) => s + (p.total.max ?? 0), 0),
  };

  // Frais généraux, bénéfice, imprévus
  const fraisGeneraux = { pourcentage: 12, montant_median: Math.round(sousTotal.median * 0.12), justification: '12% standard entreprise générale Suisse' };
  const beneficeRisques = { pourcentage: 5, montant_median: Math.round(sousTotal.median * 0.05), justification: '5% marge et couverture risques' };

  const phaseSia = passe1.classification.phase_sia;
  const pctImprevus = phaseSia === 'esquisse' ? 10 : phaseSia === 'avant-projet' ? 7 : phaseSia === 'projet' ? 5 : 3;
  const diversImprevus = { pourcentage: pctImprevus, montant_median: Math.round(sousTotal.median * pctImprevus / 100), justification: `${pctImprevus}% phase ${phaseSia}` };

  const totalEstimation = {
    min: Math.round(sousTotal.min * (1 + (fraisGeneraux.pourcentage + beneficeRisques.pourcentage + pctImprevus) / 100)),
    median: Math.round(sousTotal.median + fraisGeneraux.montant_median + beneficeRisques.montant_median + diversImprevus.montant_median),
    max: Math.round(sousTotal.max * (1 + (fraisGeneraux.pourcentage + beneficeRisques.pourcentage + pctImprevus) / 100)),
  };

  const sbp = metrageForVerification.surface_reference.surface_brute_plancher || 1;
  const prixM2 = {
    min: Math.round(totalEstimation.min / sbp),
    median: Math.round(totalEstimation.median / sbp),
    max: Math.round(totalEstimation.max / sbp),
  };

  const ratioRef = RATIOS_M2_SBP[params.type_batiment] ?? { min: 3000, max: 6000, source: 'Estimation' };

  // Regrouper par CFC
  const cfcGroups = new Map<string, PosteChiffre[]>();
  for (const p of postesChiffres) {
    const prefix = p.cfc_code.split('.')[0];
    const key = prefix.substring(0, 3);
    const group = cfcGroups.get(key) ?? [];
    group.push(p);
    cfcGroups.set(key, group);
  }

  const estimationParCfc = Array.from(cfcGroups.entries()).map(([code, postes]) => ({
    cfc_code: code,
    cfc_libelle: postes[0].cfc_libelle,
    postes,
    sous_total_cfc: {
      min: postes.reduce((s, p) => s + (p.total.min ?? 0), 0),
      median: postes.reduce((s, p) => s + (p.total.median ?? 0), 0),
      max: postes.reduce((s, p) => s + (p.total.max ?? 0), 0),
    },
  }));

  // Score et répartition
  const scoreGlobal = calculateGlobalScore(postesChiffres);
  const repartition = calculateSourceDistribution(postesChiffres);

  // Postes à risque : montant élevé + faible confiance
  const postesRisque = postesChiffres
    .filter((p) => p.confiance_prix === 'estimation' || p.confiance_prix === 'low')
    .sort((a, b) => (b.total.median ?? 0) - (a.total.median ?? 0))
    .slice(0, 5)
    .map((p) => ({
      poste: `${p.cfc_code} — ${p.description}`,
      montant_median: p.total.median ?? 0,
      raison_risque: `Source: ${p.prix_unitaire.source}, confiance: ${p.confiance_prix}`,
      action_recommandee: p.prix_unitaire.source === 'prix_non_disponible'
        ? 'Demander un devis fournisseur'
        : 'Comparer avec un devis réel',
    }));

  // Comparaison marché
  const position = prixM2.median < ratioRef.min ? 'sous_marche' as const
    : prixM2.median > ratioRef.max ? 'au_dessus_marche' as const
    : 'dans_marche' as const;

  const passe4: Passe4Result = {
    parametres_estimation: {
      region: params.region,
      coefficient_regional: 1.0,
      type_batiment: params.type_batiment,
      periode: params.periode_travaux,
      ajustements_appliques: params.acces_chantier !== 'normal' ? [{
        type: 'acces_chantier',
        coefficient: params.acces_chantier === 'difficile' ? 1.10 : 1.15,
        justification: `Accès chantier ${params.acces_chantier}`,
      }] : [],
    },
    estimation_par_cfc: estimationParCfc,
    recapitulatif: {
      sous_total_travaux: sousTotal,
      frais_generaux: fraisGeneraux,
      benefice_risques: beneficeRisques,
      divers_imprevus: diversImprevus,
      total_estimation: totalEstimation,
      prix_au_m2_sbp: prixM2,
      plage_reference_m2_sbp: { min: ratioRef.min, max: ratioRef.max, source: ratioRef.source },
    },
    analyse_fiabilite: {
      score_global: scoreGlobal,
      repartition_sources: repartition as any,
      postes_a_risque: postesRisque,
      recommandation_globale: getScoreLabel(scoreGlobal),
      prochaines_etapes: generateNextSteps(scoreGlobal, postesRisque.length, passe3),
    },
    comparaison_marche: {
      prix_m2_estime: prixM2.median,
      prix_m2_marche_bas: ratioRef.min,
      prix_m2_marche_median: ratioRef.median,
      prix_m2_marche_haut: ratioRef.max,
      position,
      commentaire: position === 'dans_marche'
        ? 'L\'estimation est dans la plage de référence du marché'
        : position === 'sous_marche'
        ? 'L\'estimation est inférieure au marché — vérifier les quantités et les postes manquants'
        : 'L\'estimation est supérieure au marché — vérifier les prix unitaires et les doubles comptages',
    },
  };

  const passe4Duration = Date.now() - passe4Start;

  // ═══ Résultat final ═══
  const result: EstimationPipelineResult = {
    plan_id: params.plan_id,
    project_id: params.project_id,
    org_id: params.org_id,
    created_at: new Date().toISOString(),
    passe1,
    consensus_metrage: consensus,
    passe3,
    passe4,
    pipeline_stats: {
      total_duration_ms: Date.now() - pipelineStart,
      passe1_duration_ms: passe1Duration,
      passe2_duration_ms: passe2Duration,
      consensus_duration_ms: consensusDuration,
      passe3_duration_ms: passe3Duration,
      passe4_duration_ms: passe4Duration,
      total_tokens: totalTokens,
      total_cost_usd: estimateCost(totalTokens),
      models_used: consensus.modeles_utilises,
    },
  };

  // Sauvegarder le résultat
  try {
    await params.supabase.from('plan_analyses').upsert({
      plan_id: params.plan_id,
      organization_id: params.org_id,
      analysis_type: 'estimation_v2',
      result: result,
      confidence_score: scoreGlobal / 100,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[estimation] Erreur sauvegarde:', err);
  }

  console.log(`[estimation] Pipeline terminé en ${result.pipeline_stats.total_duration_ms}ms — score: ${scoreGlobal}/100`);
  return result;
}

// Applique les coefficients de calibration aux quantités
function applyQuantityCalibrations(metrage: Passe2Result, calibrations: Map<string, number>): Passe2Result {
  const result = structuredClone(metrage);
  for (const zone of result.metrage_par_zone) {
    for (const poste of zone.postes) {
      const key = `${poste.cfc_code}::${poste.unite}`;
      const coeff = calibrations.get(key);
      if (coeff) {
        poste.quantite = Math.round(poste.quantite * coeff * 100) / 100;
        poste.hypotheses.push(`Calibration quantité appliquée: ×${coeff.toFixed(3)}`);
      }
    }
  }
  return result;
}

function generateNextSteps(score: number, nbRisque: number, passe3: Passe3Result): string[] {
  const steps: string[] = [];

  if (passe3.elements_probablement_manquants.length > 0) {
    steps.push(`Vérifier ${passe3.elements_probablement_manquants.length} éléments probablement manquants détectés`);
  }
  if (nbRisque > 0) {
    steps.push(`Demander des devis fournisseurs pour les ${nbRisque} postes à risque`);
  }
  if (score < 60) {
    steps.push('Fournir des plans complémentaires pour améliorer la couverture');
  }
  if (passe3.doublons_potentiels.length > 0) {
    steps.push(`Vérifier ${passe3.doublons_potentiels.length} doublons potentiels`);
  }
  if (steps.length === 0) {
    steps.push('Estimation suffisamment fiable pour servir de base de discussion');
  }

  return steps;
}

function estimateCost(tokens: number): number {
  // Estimation approximative basée sur les tarifs moyens
  return Math.round(tokens * 0.000015 * 100) / 100;
}
