// Moteur de consensus multi-modèle
// Compare les résultats de 3 modèles IA et produit un métré consensuel

import type {
  ModelMetrage,
  ModelProvider,
  PosteConsensus,
  ConsensusResult,
  Passe2Result,
  PosteMetrage,
  ZoneMetrage,
  ConfidenceLevel,
} from './types';

// ─── Seuils de concordance par discipline ───────────────────────────────────
// Les disciplines structurelles ont des tolérances plus faibles (béton, acier)
// car les quantités sont précisément mesurables. Les finitions ont des tolérances
// plus larges car elles dépendent du niveau de détail et des choix architecturaux.
const DISCIPLINE_THRESHOLDS: Record<string, { forte: number; partielle: number }> = {
  "beton":       { forte: 0.05, partielle: 0.10 },
  "acier":       { forte: 0.05, partielle: 0.10 },
  "structure":   { forte: 0.05, partielle: 0.10 },
  "maconnerie":  { forte: 0.05, partielle: 0.10 },
  "surfaces":    { forte: 0.08, partielle: 0.15 },
  "sols":        { forte: 0.08, partielle: 0.15 },
  "peinture":    { forte: 0.08, partielle: 0.15 },
  "revetement":  { forte: 0.08, partielle: 0.15 },
  "electricite": { forte: 0.12, partielle: 0.20 },
  "cvc":         { forte: 0.12, partielle: 0.20 },
  "chauffage":   { forte: 0.12, partielle: 0.20 },
  "ventilation": { forte: 0.12, partielle: 0.20 },
  "sanitaire":   { forte: 0.12, partielle: 0.20 },
  "finitions":   { forte: 0.15, partielle: 0.25 },
  "amenagement": { forte: 0.15, partielle: 0.25 },
};
const DEFAULT_THRESHOLDS = { forte: 0.10, partielle: 0.15 };

/**
 * Retourne les seuils de concordance adaptés à la discipline d'un poste.
 * La discipline est déduite du préfixe CFC ou de mots-clés dans la description.
 */
function getThresholds(cfcCode: string, description: string): { forte: number; partielle: number } {
  const desc = description.toLowerCase();
  const cfc = cfcCode.toLowerCase();

  // Détection par préfixe CFC (ex: "211" → béton)
  const cfcPrefix = cfc.split('.')[0];
  if (cfcPrefix === '211' || cfcPrefix === '212' || desc.includes('beton') || desc.includes('béton')) {
    return DISCIPLINE_THRESHOLDS['beton'];
  }
  if (cfcPrefix === '213' || cfcPrefix === '214' || desc.includes('acier') || desc.includes('armature')) {
    return DISCIPLINE_THRESHOLDS['acier'];
  }
  if (cfcPrefix === '215' || cfcPrefix === '216' || desc.includes('maconn') || desc.includes('maçonn') || desc.includes('brique')) {
    return DISCIPLINE_THRESHOLDS['maconnerie'];
  }
  if (cfcPrefix.startsWith('21') || desc.includes('structure') || desc.includes('fondation')) {
    return DISCIPLINE_THRESHOLDS['structure'];
  }
  if (desc.includes('peinture') || desc.includes('enduit')) {
    return DISCIPLINE_THRESHOLDS['peinture'];
  }
  if (desc.includes('carrelage') || desc.includes('revêtement') || desc.includes('revetement') || desc.includes('parquet')) {
    return DISCIPLINE_THRESHOLDS['revetement'];
  }
  if (desc.includes('sol ') || desc.includes('chape') || desc.includes('dalle')) {
    return DISCIPLINE_THRESHOLDS['sols'];
  }
  if (desc.includes('surface') || desc.includes('façade') || desc.includes('facade')) {
    return DISCIPLINE_THRESHOLDS['surfaces'];
  }
  if (desc.includes('électri') || desc.includes('electri') || desc.includes('câblage') || desc.includes('cablage')) {
    return DISCIPLINE_THRESHOLDS['electricite'];
  }
  if (desc.includes('chauffage') || desc.includes('chaudière') || desc.includes('chaudiere')) {
    return DISCIPLINE_THRESHOLDS['chauffage'];
  }
  if (desc.includes('ventilat')) {
    return DISCIPLINE_THRESHOLDS['ventilation'];
  }
  if (desc.includes('sanitaire') || desc.includes('plomberie') || desc.includes('tuyauterie')) {
    return DISCIPLINE_THRESHOLDS['sanitaire'];
  }
  if (desc.includes('cvc') || desc.includes('hvac') || desc.includes('climatisation')) {
    return DISCIPLINE_THRESHOLDS['cvc'];
  }
  if (desc.includes('aménagement') || desc.includes('amenagement') || desc.includes('menuiserie')) {
    return DISCIPLINE_THRESHOLDS['amenagement'];
  }
  if (desc.includes('finition') || desc.includes('plafond') || desc.includes('cloison')) {
    return DISCIPLINE_THRESHOLDS['finitions'];
  }

  return DEFAULT_THRESHOLDS;
}

// Identifiant unique d'un poste : cfc_code + unite
interface PosteKey {
  cfc_code: string;
  description: string;
  unite: string;
}

function posteKeyId(key: PosteKey): string {
  return `${key.cfc_code}::${key.unite}`;
}

// Extrait tous les postes d'un Passe2Result avec leurs quantités
function extractPostes(result: Passe2Result): Map<string, { key: PosteKey; quantite: number; poste: PosteMetrage }> {
  const map = new Map<string, { key: PosteKey; quantite: number; poste: PosteMetrage }>();

  for (const zone of result.metrage_par_zone) {
    for (const poste of zone.postes) {
      const key: PosteKey = {
        cfc_code: poste.cfc_code,
        description: poste.cfc_libelle || poste.description_detaillee,
        unite: poste.unite,
      };
      const id = posteKeyId(key);
      const existing = map.get(id);
      if (existing) {
        // Additionner les quantités de différentes zones
        existing.quantite += poste.quantite;
      } else {
        map.set(id, { key, quantite: poste.quantite, poste });
      }
    }
  }

  return map;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function buildConsensus(
  metrages: ModelMetrage[],
  modelWeights?: Record<ModelProvider, number>
): ConsensusResult {
  // Filtrer les modèles en erreur
  const valid = metrages.filter((m) => m.error === null && m.result !== null);
  const errors = metrages.filter((m) => m.error !== null);

  // Extraire les postes de chaque modèle
  const postesByModel = new Map<ModelProvider, Map<string, { key: PosteKey; quantite: number; poste: PosteMetrage }>>();
  for (const m of valid) {
    postesByModel.set(m.provider, extractPostes(m.result));
  }

  // Collecter tous les IDs de postes uniques
  const allPosteIds = new Set<string>();
  for (const postesMap of postesByModel.values()) {
    for (const id of postesMap.keys()) {
      allPosteIds.add(id);
    }
  }

  // Construire le consensus pour chaque poste
  const postes: PosteConsensus[] = [];
  let concordanceForte = 0;
  let concordancePartielle = 0;
  let divergence = 0;

  for (const posteId of allPosteIds) {
    // Collecter les valeurs de chaque modèle
    const valeurs: Array<{ provider: ModelProvider; quantite: number; poste: PosteMetrage }> = [];
    let key: PosteKey | null = null;

    for (const [provider, postesMap] of postesByModel) {
      const entry = postesMap.get(posteId);
      if (entry) {
        valeurs.push({ provider, quantite: entry.quantite, poste: entry.poste });
        if (!key) key = entry.key;
      }
    }

    if (!key) continue;

    const quantites = valeurs.map((v) => v.quantite);
    const med = median(quantites);

    // Calculer les écarts vs médiane
    const valeursAvecEcart = valeurs.map((v) => ({
      provider: v.provider,
      quantite: v.quantite,
      ecart_vs_median_pct: med !== 0 ? Math.abs((v.quantite - med) / med * 100) : 0,
    }));

    const nbModeles = valeurs.length;
    let methode: PosteConsensus['methode_consensus'];
    let confiance: PosteConsensus['confiance_consensus'];
    let quantite_consensuelle: number;
    let outlier: ModelProvider | null = null;
    let note: string | null = null;

    // Seuils adaptatifs selon la discipline du poste
    const thresholds = getThresholds(key.cfc_code, key.description);
    // Convertir en pourcentage pour la comparaison (les seuils sont stockés en décimaux 0–1)
    const seuilForte = thresholds.forte * 100;
    const seuilPartielle = thresholds.partielle * 100;

    if (nbModeles === 3) {
      const ecarts = valeursAvecEcart.map((v) => v.ecart_vs_median_pct);
      const maxEcart = Math.max(...ecarts);

      if (maxEcart < seuilForte) {
        // 3 modèles concordent dans le seuil discipline
        methode = 'concordance_forte';
        confiance = 'high';
        quantite_consensuelle = med;
        concordanceForte++;
      } else {
        // Vérifier si 2 sur 3 concordent
        const outlierIdx = ecarts.indexOf(maxEcart);
        const others = valeursAvecEcart.filter((_, i) => i !== outlierIdx);
        const ecartBetweenOthers = Math.abs(others[0].quantite - others[1].quantite);
        const othersMed = median(others.map((o) => o.quantite));
        const ecartOthersPct = othersMed !== 0 ? (ecartBetweenOthers / othersMed * 100) : 0;

        if (ecartOthersPct < seuilPartielle) {
          // 2 concordent, 1 diverge
          methode = 'concordance_partielle';
          confiance = 'medium';
          quantite_consensuelle = othersMed;
          outlier = valeursAvecEcart[outlierIdx].provider;
          note = `${outlier} diverge de ${Math.round(valeursAvecEcart[outlierIdx].ecart_vs_median_pct)}%`;
          concordancePartielle++;
        } else {
          // 3 divergent
          methode = 'divergence';
          confiance = 'low';
          quantite_consensuelle = med;
          note = 'Divergence entre les 3 modèles — vérification manuelle recommandée';
          divergence++;
        }
      }
    } else if (nbModeles === 2) {
      methode = 'detection_double';
      confiance = 'medium';
      quantite_consensuelle = mean(quantites);
    } else {
      methode = 'detection_unique';
      confiance = 'low';
      quantite_consensuelle = quantites[0];
      note = `Détecté uniquement par ${valeurs[0].provider}`;
    }

    // Appliquer les poids des modèles si fournis
    if (modelWeights && nbModeles >= 2) {
      let weightedSum = 0;
      let totalWeight = 0;
      for (const v of valeurs) {
        const w = modelWeights[v.provider] ?? 1;
        weightedSum += v.quantite * w;
        totalWeight += w;
      }
      if (totalWeight > 0) {
        quantite_consensuelle = weightedSum / totalWeight;
      }
    }

    postes.push({
      cfc_code: key.cfc_code,
      description: key.description,
      quantite_consensuelle: Math.round(quantite_consensuelle * 100) / 100,
      unite: key.unite,
      confiance_consensus: confiance,
      valeurs_par_modele: valeursAvecEcart,
      methode_consensus: methode,
      outlier,
      note,
    });
  }

  // Calculer les stats
  const total = postes.length;
  const stats = {
    total_postes: total,
    concordance_forte_pct: total > 0 ? Math.round((concordanceForte / total) * 100) : 0,
    concordance_partielle_pct: total > 0 ? Math.round((concordancePartielle / total) * 100) : 0,
    divergence_pct: total > 0 ? Math.round((divergence / total) * 100) : 0,
    score_consensus_global: 0,
  };

  // Score consensus global : pondéré par la confiance de chaque poste
  const confidenceScores = { high: 1, medium: 0.75, low: 0.4, flag: 0.2 };
  if (total > 0) {
    const sum = postes.reduce((acc, p) => acc + confidenceScores[p.confiance_consensus], 0);
    stats.score_consensus_global = Math.round((sum / total) * 100);
  }

  // Construire le métré fusionné
  const metrage_fusionne = buildFusedMetrage(postes, valid);

  return {
    postes,
    modeles_utilises: valid.map((m) => m.provider),
    modeles_en_erreur: errors.map((m) => ({ provider: m.provider, error: m.error! })),
    stats,
    metrage_fusionne,
  };
}

// Construit un Passe2Result fusionné à partir des postes consensuels
function buildFusedMetrage(postes: PosteConsensus[], valid: ModelMetrage[]): Passe2Result {
  // Utiliser la structure de zones du premier modèle valide comme base
  const baseResult = valid[0]?.result;

  // Regrouper les postes par CFC principal pour les totaux
  const cfcGroups = new Map<string, { cfc_code: string; cfc_libelle: string; quantite: number; unite: string; count: number; confs: ConfidenceLevel[] }>();

  const fusedZone: ZoneMetrage = {
    zone: 'Consensus multi-modèle',
    dimensions_zone: {
      longueur: null,
      largeur: null,
      hauteur: null,
      surface: baseResult?.surface_reference?.surface_brute_plancher ?? null,
      source_mesure: 'echelle',
    },
    postes: postes.map((p) => ({
      cfc_code: p.cfc_code,
      cfc_libelle: p.description,
      description_detaillee: `${p.description} (consensus ${p.methode_consensus})`,
      quantite: p.quantite_consensuelle,
      unite: p.unite,
      methode_mesure: `Consensus ${p.valeurs_par_modele.length} modèles`,
      vue_source: 'multi-modèle',
      confiance: p.confiance_consensus === 'flag' ? 'low' : p.confiance_consensus as ConfidenceLevel,
      hypotheses: p.note ? [p.note] : [],
      decomposition: [],
    })),
  };

  // Calculer les totaux par CFC
  for (const p of postes) {
    const prefix = p.cfc_code.split('.')[0];
    const existing = cfcGroups.get(prefix);
    if (existing && existing.unite === p.unite) {
      existing.quantite += p.quantite_consensuelle;
      existing.count++;
      existing.confs.push(p.confiance_consensus === 'flag' ? 'low' : p.confiance_consensus as ConfidenceLevel);
    } else if (!existing) {
      cfcGroups.set(`${prefix}::${p.unite}`, {
        cfc_code: prefix,
        cfc_libelle: p.description,
        quantite: p.quantite_consensuelle,
        unite: p.unite,
        count: 1,
        confs: [p.confiance_consensus === 'flag' ? 'low' : p.confiance_consensus as ConfidenceLevel],
      });
    }
  }

  const confOrder: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1, assumption: 0 };
  const avgConfidence = (confs: ConfidenceLevel[]): ConfidenceLevel => {
    if (confs.length === 0) return 'low';
    const avg = confs.reduce((s, c) => s + confOrder[c], 0) / confs.length;
    if (avg >= 2.5) return 'high';
    if (avg >= 1.5) return 'medium';
    return 'low';
  };

  return {
    metrage_par_zone: [fusedZone],
    elements_hors_plan: baseResult?.elements_hors_plan ?? [],
    totaux_par_cfc: Array.from(cfcGroups.values()).map((g) => ({
      cfc_code: g.cfc_code,
      cfc_libelle: g.cfc_libelle,
      quantite_totale: Math.round(g.quantite * 100) / 100,
      unite: g.unite,
      nb_zones: g.count,
      confiance_moyenne: avgConfidence(g.confs),
    })),
    avertissements_metrage: baseResult?.avertissements_metrage ?? [],
    surface_reference: baseResult?.surface_reference ?? {
      surface_brute_plancher: null,
      surface_nette_plancher: null,
      surface_facade: null,
      volume_bati: null,
      source: 'non disponible',
    },
  };
}
