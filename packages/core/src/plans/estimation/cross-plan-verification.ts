// Vérification croisée inter-plans
// Compare les quantités extraites de plusieurs plans du même projet

import type { CrossPlanVerification } from './types';

// Éléments communs entre disciplines
const CROSS_DISCIPLINE_ELEMENTS: Array<{
  disciplines: [string, string];
  elements: Array<{ cfc_prefix: string; description: string; unite: string }>;
}> = [
  {
    disciplines: ['architecture', 'structure'],
    elements: [
      { cfc_prefix: '215', description: 'Murs porteurs / voiles béton', unite: 'm²' },
      { cfc_prefix: '215', description: 'Dalles béton', unite: 'm²' },
      { cfc_prefix: '215', description: 'Poteaux béton', unite: 'pce' },
      { cfc_prefix: '216', description: 'Maçonnerie', unite: 'm²' },
    ],
  },
  {
    disciplines: ['architecture', 'facades'],
    elements: [
      { cfc_prefix: '221', description: 'Fenêtres', unite: 'm²' },
      { cfc_prefix: '224', description: 'Isolation façade', unite: 'm²' },
      { cfc_prefix: '225', description: 'Revêtement façade', unite: 'm²' },
    ],
  },
  {
    disciplines: ['structure', 'cvcs'],
    elements: [
      { cfc_prefix: '215', description: 'Réservations / trémies', unite: 'pce' },
    ],
  },
];

export async function verifyCrossPlan(params: {
  project_id: string;
  org_id: string;
  supabase: any;
}): Promise<CrossPlanVerification> {
  const { project_id, org_id, supabase } = params;

  // Récupérer toutes les analyses de plans du projet
  const { data: analyses } = await supabase
    .from('plan_analyses')
    .select('plan_id, result, plan_registry!inner(discipline, plan_number)')
    .eq('plan_registry.project_id', project_id)
    .eq('plan_registry.organization_id', org_id)
    .eq('analysis_type', 'estimation_v2')
    .order('created_at', { ascending: false });

  if (!analyses || analyses.length < 2) {
    return {
      project_id,
      plans_compares: [],
      verifications: [],
      score_coherence_projet: 100,
      alertes: ['Pas assez de plans analysés pour une vérification croisée (minimum 2)'],
    };
  }

  // Mapper les analyses par discipline
  const byDiscipline = new Map<string, { plan_id: string; numero: string; result: any }>();
  for (const a of analyses) {
    const disc = a.plan_registry?.discipline;
    if (disc && !byDiscipline.has(disc)) {
      byDiscipline.set(disc, {
        plan_id: a.plan_id,
        numero: a.plan_registry?.plan_number ?? '',
        result: a.result,
      });
    }
  }

  const plansCompares = Array.from(byDiscipline.entries()).map(([disc, data]) => ({
    plan_id: data.plan_id,
    discipline: disc,
    numero: data.numero,
  }));

  const verifications: CrossPlanVerification['verifications'] = [];
  const alertes: string[] = [];
  let totalChecks = 0;
  let coherentChecks = 0;

  // Pour chaque paire de disciplines ayant des éléments communs
  for (const crossDef of CROSS_DISCIPLINE_ELEMENTS) {
    const [disc1, disc2] = crossDef.disciplines;
    const data1 = byDiscipline.get(disc1);
    const data2 = byDiscipline.get(disc2);

    if (!data1 || !data2) continue;

    // Extraire les quantités par CFC de chaque plan
    const qtys1 = extractQuantities(data1.result);
    const qtys2 = extractQuantities(data2.result);

    for (const element of crossDef.elements) {
      const q1 = qtys1.get(`${element.cfc_prefix}::${element.unite}`);
      const q2 = qtys2.get(`${element.cfc_prefix}::${element.unite}`);

      if (q1 !== undefined && q2 !== undefined && q1 > 0 && q2 > 0) {
        const ecart = Math.abs(q1 - q2) / Math.max(q1, q2) * 100;
        const coherent = ecart < 15;
        totalChecks++;
        if (coherent) coherentChecks++;

        verifications.push({
          element: element.description,
          cfc_code: element.cfc_prefix,
          unite: element.unite,
          valeurs_par_plan: [
            { plan_id: data1.plan_id, discipline: disc1, quantite: q1 },
            { plan_id: data2.plan_id, discipline: disc2, quantite: q2 },
          ],
          ecart_max_pct: Math.round(ecart * 10) / 10,
          coherent,
          note: coherent
            ? `Cohérent (écart ${Math.round(ecart)}%)`
            : `Incohérence détectée (écart ${Math.round(ecart)}%)`,
        });

        if (!coherent) {
          alertes.push(`${element.description} : écart de ${Math.round(ecart)}% entre plan ${disc1} et ${disc2}`);
        }
      }
    }
  }

  const score = totalChecks > 0 ? Math.round((coherentChecks / totalChecks) * 100) : 100;

  // Sauvegarder le résultat
  try {
    await supabase.from('cross_plan_verifications').insert({
      org_id,
      project_id,
      plans_compares: plansCompares,
      verifications,
      score_coherence_projet: score,
      alertes,
    });
  } catch {
    // Non bloquant
  }

  return { project_id, plans_compares: plansCompares, verifications, score_coherence_projet: score, alertes };
}

// Calcul du bonus de confiance basé sur la vérification croisée
export function getCrossPlanBonus(score: number): number {
  if (score >= 90) return 0.10;
  if (score >= 70) return 0.05;
  return 0;
}

// Extrait les quantités totales par CFC::unite d'un résultat d'estimation
function extractQuantities(result: any): Map<string, number> {
  const map = new Map<string, number>();
  if (!result?.consensus_metrage?.metrage_fusionne?.metrage_par_zone) {
    // Essayer avec passe4 directement
    if (result?.passe4?.estimation_par_cfc) {
      for (const cfc of result.passe4.estimation_par_cfc) {
        for (const poste of cfc.postes || []) {
          const key = `${poste.cfc_code.split('.')[0]}::${poste.unite}`;
          map.set(key, (map.get(key) ?? 0) + (poste.quantite || 0));
        }
      }
    }
    return map;
  }

  for (const zone of result.consensus_metrage.metrage_fusionne.metrage_par_zone) {
    for (const poste of zone.postes || []) {
      const key = `${poste.cfc_code.split('.')[0]}::${poste.unite}`;
      map.set(key, (map.get(key) ?? 0) + (poste.quantite || 0));
    }
  }
  return map;
}
