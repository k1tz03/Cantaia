// ═══════════════════════════════════════════════════
// Types pour le pipeline d'estimation 4 passes
// ═══════════════════════════════════════════════════

// ─── Passe 1 : Identification ───

export interface Passe1Result {
  cartouche: {
    numero_plan: string | null;
    indice_revision: string | null;
    date: string | null;
    auteur_bureau: string | null;
    projet: string | null;
    echelle: string | null;
  };
  classification: {
    discipline: 'architecture' | 'structure' | 'cvcs' | 'electricite' | 'sanitaire' | 'facades' | 'amenagement_exterieur' | 'demolition';
    type_plan: 'plan_etage' | 'coupe' | 'facade' | 'detail' | 'situation' | 'schema_principe' | 'plan_toiture' | 'plan_fondation';
    phase_sia: 'esquisse' | 'avant-projet' | 'projet' | 'execution' | 'mise_a_jour';
    vues_presentes: string[];
  };
  contexte_metrage: {
    echelle_detectee: string;
    echelle_fiable: boolean;
    cotations_presentes: boolean;
    legende_presente: boolean;
    qualite_image: 'haute' | 'moyenne' | 'basse';
    zones_illisibles: string[];
  };
  avertissements: string[];
}

// ─── Passe 2 : Métré ───

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'assumption';
export type PriceSource = 'historique_interne' | 'benchmark_cantaia' | 'referentiel_crb' | 'ratio_estimation' | 'estimation_ia' | 'consensus_multi_ia' | 'prix_non_disponible';

export interface SousPoste {
  sous_poste: string;
  quantite: number;
  unite: string;
  ratio_utilise: string | null;
  source_ratio: string;
}

export interface PosteMetrage {
  cfc_code: string;
  cfc_libelle: string;
  description_detaillee: string;
  quantite: number;
  unite: string;
  methode_mesure: string;
  vue_source: string;
  confiance: ConfidenceLevel;
  hypotheses: string[];
  decomposition: SousPoste[];
}

export interface ZoneMetrage {
  zone: string;
  dimensions_zone: {
    longueur: number | null;
    largeur: number | null;
    hauteur: number | null;
    surface: number | null;
    source_mesure: 'cotation' | 'echelle' | 'proportion';
  };
  postes: PosteMetrage[];
}

export interface Passe2Result {
  metrage_par_zone: ZoneMetrage[];
  elements_hors_plan: Array<{
    description: string;
    raison: string;
    plan_requis: string;
  }>;
  totaux_par_cfc: Array<{
    cfc_code: string;
    cfc_libelle: string;
    quantite_totale: number;
    unite: string;
    nb_zones: number;
    confiance_moyenne: ConfidenceLevel;
  }>;
  avertissements_metrage: string[];
  surface_reference: {
    surface_brute_plancher: number | null;
    surface_nette_plancher: number | null;
    surface_facade: number | null;
    volume_bati: number | null;
    source: string;
  };
}

// ─── Consensus multi-modèle ───

export type ModelProvider = 'claude' | 'gpt4o' | 'gemini';

export interface ModelMetrage {
  provider: ModelProvider;
  result: Passe2Result;
  latency_ms: number;
  tokens_used: number;
  error: string | null;
}

export interface PosteConsensus {
  cfc_code: string;
  description: string;
  quantite_consensuelle: number;
  unite: string;
  confiance_consensus: 'high' | 'medium' | 'low' | 'flag';
  valeurs_par_modele: Array<{
    provider: ModelProvider;
    quantite: number;
    ecart_vs_median_pct: number;
  }>;
  methode_consensus: 'concordance_forte' | 'concordance_partielle' | 'divergence' | 'detection_unique' | 'detection_double';
  outlier: ModelProvider | null;
  note: string | null;
}

export interface ConsensusResult {
  postes: PosteConsensus[];
  modeles_utilises: ModelProvider[];
  modeles_en_erreur: Array<{ provider: ModelProvider; error: string }>;
  stats: {
    total_postes: number;
    concordance_forte_pct: number;
    concordance_partielle_pct: number;
    divergence_pct: number;
    score_consensus_global: number;
  };
  metrage_fusionne: Passe2Result;
}

// ─── Passe 3 : Vérification ───

export interface Passe3Result {
  verification_ratios: Array<{
    ratio_teste: string;
    valeur_calculee: number;
    plage_reference: string;
    verdict: 'conforme' | 'attention' | 'anomalie';
    commentaire: string;
  }>;
  alertes_coherence: Array<{
    severite: 'critique' | 'attention' | 'info';
    poste_concerne: string;
    probleme: string;
    suggestion: string;
  }>;
  doublons_potentiels: Array<{
    poste_1: string;
    poste_2: string;
    raison_suspicion: string;
  }>;
  elements_probablement_manquants: Array<{
    cfc_code: string;
    description: string;
    raison: string;
    impact_estimation: 'faible' | 'moyen' | 'significatif';
    quantite_estimee: string | null;
  }>;
  score_fiabilite_metrage: {
    score: number;
    facteurs_positifs: string[];
    facteurs_negatifs: string[];
    recommandation: string;
  };
}

// ─── Passe 4 : Chiffrage ───

export interface PrixUnitaire {
  min: number | null;
  median: number | null;
  max: number | null;
  source: PriceSource;
  detail_source: string;
  date_reference: string;
  ajustements: string[];
}

export interface PosteChiffre {
  cfc_code: string;
  cfc_libelle: string;
  description: string;
  quantite: number;
  unite: string;
  prix_unitaire: PrixUnitaire;
  total: { min: number | null; median: number | null; max: number | null };
  confiance_quantite: ConfidenceLevel;
  confiance_prix: 'high' | 'medium' | 'low' | 'estimation';
  confiance_combinee: string;
  note: string | null;
}

export interface Passe4Result {
  parametres_estimation: {
    region: string;
    coefficient_regional: number;
    type_batiment: string;
    periode: string;
    ajustements_appliques: Array<{
      type: string;
      coefficient: number;
      justification: string;
    }>;
  };
  estimation_par_cfc: Array<{
    cfc_code: string;
    cfc_libelle: string;
    postes: PosteChiffre[];
    sous_total_cfc: { min: number; median: number; max: number };
  }>;
  recapitulatif: {
    sous_total_travaux: { min: number; median: number; max: number };
    frais_generaux: { pourcentage: number; montant_median: number; justification: string };
    benefice_risques: { pourcentage: number; montant_median: number; justification: string };
    divers_imprevus: { pourcentage: number; montant_median: number; justification: string };
    total_estimation: { min: number; median: number; max: number };
    prix_au_m2_sbp: { min: number; median: number; max: number };
    plage_reference_m2_sbp: { min: number; max: number; source: string };
  };
  analyse_fiabilite: {
    score_global: number;
    repartition_sources: {
      historique_interne_pct: number;
      benchmark_cantaia_pct: number;
      referentiel_crb_pct: number;
      ratio_estimation_pct: number;
      estimation_ia_pct: number;
      consensus_multi_ia_pct: number;
      prix_non_disponible_pct: number;
    };
    postes_a_risque: Array<{
      poste: string;
      montant_median: number;
      raison_risque: string;
      action_recommandee: string;
    }>;
    recommandation_globale: string;
    prochaines_etapes: string[];
  };
  comparaison_marche: {
    prix_m2_estime: number;
    prix_m2_marche_bas: number;
    prix_m2_marche_median: number;
    prix_m2_marche_haut: number;
    position: 'sous_marche' | 'dans_marche' | 'au_dessus_marche';
    commentaire: string;
  };
}

// ─── Pipeline complet ───

/**
 * Optional Passe 5 (Topology) output embedded in the pipeline result.
 *
 * Shape intentionally re-declared as a structural type (not importing
 * `BuildingScene` from the scene module) so existing callers of the
 * estimation pipeline do not acquire an unintended dependency on the scene
 * package. The concrete runtime value IS a `BuildingScene` — the scene
 * module's types are a superset of this declaration.
 *
 * ABSENT (not just `undefined`) from the pipeline result when Passe 5 is
 * disabled — enforced by conditional spread in `runEstimationPipeline`.
 * See regression test in __tests__/pipeline-passe5-regression.test.ts.
 */
export interface Passe5PipelineOutput {
  /** `null` when Passe 5 was enabled but the extraction failed (non-fatal). */
  scene: unknown | null;
  tokens_used: number;
  duration_ms: number;
  model_divergence: number;
  error: string | null;
}

export interface EstimationPipelineResult {
  plan_id: string;
  project_id: string;
  org_id: string;
  created_at: string;
  passe1: Passe1Result;
  consensus_metrage: ConsensusResult;
  passe3: Passe3Result;
  passe4: Passe4Result;
  /**
   * Present ONLY when Passe 5 is enabled (via `enablePasse5: true` AND
   * `DISABLE_PASSE5 !== "1"`). Absent otherwise — regression test guarantees
   * the 4-pass result shape is byte-identical to pre-Passe-5 production.
   */
  passe5?: Passe5PipelineOutput;
  pipeline_stats: {
    total_duration_ms: number;
    passe1_duration_ms: number;
    passe2_duration_ms: number;
    consensus_duration_ms: number;
    passe3_duration_ms: number;
    passe4_duration_ms: number;
    /** Present only when Passe 5 ran. */
    passe5_duration_ms?: number;
    total_tokens: number;
    total_cost_usd: number;
    models_used: ModelProvider[];
  };
}

// ═══════════════════════════════════════════════════
// Types pour le système de calibration et apprentissage
// ═══════════════════════════════════════════════════

// ─── Corrections quantités (plans) ───

export interface QuantityCorrection {
  id: string;
  org_id: string;
  plan_id: string;
  estimation_id: string;
  cfc_code: string;
  description: string;
  discipline: string;
  type_plan: string;
  bureau_auteur: string | null;
  echelle: string | null;
  qualite_image: 'haute' | 'moyenne' | 'basse';
  quantite_estimee: number;
  quantite_corrigee: number;
  unite: string;
  ecart_pct: number;
  methode_mesure_originale: string;
  modele_plus_proche: ModelProvider | null;
  modele_plus_eloigne: ModelProvider | null;
  valeurs_par_modele: Record<ModelProvider, number>;
  raison: 'erreur_lecture' | 'mauvaise_echelle' | 'double_comptage' | 'element_manque' | 'element_en_trop' | 'mauvaise_unite' | 'autre';
  commentaire: string | null;
  created_at: string;
}

// ─── Calibration prix ───

export interface PriceCalibration {
  id: string;
  org_id: string;
  cfc_code: string;
  description_normalized: string;
  unite: string;
  region: string;
  estimation_id: string;
  prix_estime_median: number;
  source_estimation: PriceSource;
  prix_reel: number;
  source_prix_reel: 'offre_fournisseur' | 'decompte_final' | 'correction_manuelle';
  fournisseur_hash: string | null;
  coefficient: number;
  ecart_pct: number;
  created_at: string;
}

// ─── Profil d'erreur par modèle ───

export interface ModelErrorProfile {
  provider: ModelProvider;
  discipline: string;
  type_element_cfc: string;
  nb_corrections: number;
  ecart_moyen_pct: number;
  ecart_median_pct: number;
  ecart_stddev_pct: number;
  tendance: 'surestime' | 'sous_estime' | 'neutre';
  coefficient_correction: number;
  fiabilite: number;
  derniere_maj: string;
}

// ─── Profil de bureau d'études ───

export interface BureauProfile {
  bureau_nom_hash: string;
  bureau_nom_display: string;
  org_id: string;
  nb_plans_analyses: number;
  conventions: {
    position_cartouche: 'bas_droite' | 'bas_gauche' | 'haut_droite' | 'autre';
    style_cotation: 'interieur' | 'exterieur' | 'mixte';
    echelle_favorite: string;
    format_numero_plan: string | null;
    hachures_beton: string | null;
    epaisseur_traits: 'fin' | 'standard' | 'epais';
  };
  erreurs_frequentes: Array<{
    type: string;
    description: string;
    frequence_pct: number;
  }>;
  performance_par_discipline: Record<string, {
    nb_plans: number;
    ecart_moyen_pct: number;
    score_confiance_moyen: number;
  }>;
  derniere_maj: string;
}

// ─── Vérification croisée inter-plans ───

export interface CrossPlanVerification {
  project_id: string;
  plans_compares: Array<{
    plan_id: string;
    discipline: string;
    numero: string;
  }>;
  verifications: Array<{
    element: string;
    cfc_code: string;
    unite: string;
    valeurs_par_plan: Array<{
      plan_id: string;
      discipline: string;
      quantite: number;
    }>;
    ecart_max_pct: number;
    coherent: boolean;
    note: string;
  }>;
  score_coherence_projet: number;
  alertes: string[];
}

// ─── Score de confiance dynamique ───

export interface DynamicConfidenceFactors {
  base_consensus_score: number;
  calibration_qty_bonus: number;
  calibration_qty_source: string;
  calibration_price_bonus: number;
  calibration_price_source: string;
  bureau_bonus: number;
  bureau_source: string | null;
  cross_plan_bonus: number;
  cross_plan_source: string | null;
  score_final: number;
  label: string;
  details: string;
}
