// Moteur de calibration — 4 fonctions principales
// Récupère les coefficients de correction basés sur l'historique

import type { ModelProvider, BureauProfile } from './types';

// ─── 1. Calibration quantités ───

export async function getQuantityCalibration(params: {
  org_id: string;
  cfc_code: string;
  discipline: string;
  bureau_auteur: string | null;
  supabase: any;
}): Promise<{
  coefficient: number;
  nb_corrections: number;
  specificity: 'cfc_discipline_bureau' | 'cfc_discipline' | 'cfc_only' | 'none';
  confidence_bonus: number;
}> {
  const { org_id, cfc_code, discipline, bureau_auteur, supabase } = params;

  // Niveau 1 : CFC + discipline + bureau (le plus spécifique)
  if (bureau_auteur) {
    try {
      const { data } = await supabase
        .from('mv_qty_calibration')
        .select('*')
        .eq('org_id', org_id)
        .eq('cfc_code', cfc_code)
        .eq('discipline', discipline)
        .eq('bureau_auteur', bureau_auteur)
        .maybeSingle();

      if (data) {
        return {
          coefficient: Number(data.coefficient_correction),
          nb_corrections: Number(data.nb_corrections),
          specificity: 'cfc_discipline_bureau',
          confidence_bonus: calcQtyBonus(Number(data.nb_corrections), Number(data.ecart_stddev_pct)),
        };
      }
    } catch { /* vue peut ne pas exister */ }
  }

  // Niveau 2 : CFC + discipline
  try {
    const { data } = await supabase
      .from('mv_qty_calibration')
      .select('*')
      .eq('org_id', org_id)
      .eq('cfc_code', cfc_code)
      .eq('discipline', discipline)
      .is('bureau_auteur', null)
      .maybeSingle();

    if (data) {
      return {
        coefficient: Number(data.coefficient_correction),
        nb_corrections: Number(data.nb_corrections),
        specificity: 'cfc_discipline',
        confidence_bonus: calcQtyBonus(Number(data.nb_corrections), Number(data.ecart_stddev_pct)),
      };
    }
  } catch { /* vue peut ne pas exister */ }

  // Niveau 3 : CFC seul
  try {
    const { data } = await supabase
      .from('mv_qty_calibration')
      .select('*')
      .eq('org_id', org_id)
      .eq('cfc_code', cfc_code)
      .limit(1)
      .maybeSingle();

    if (data) {
      return {
        coefficient: Number(data.coefficient_correction),
        nb_corrections: Number(data.nb_corrections),
        specificity: 'cfc_only',
        confidence_bonus: calcQtyBonus(Number(data.nb_corrections), Number(data.ecart_stddev_pct)) * 0.7,
      };
    }
  } catch { /* vue peut ne pas exister */ }

  return { coefficient: 1.0, nb_corrections: 0, specificity: 'none', confidence_bonus: 0 };
}

function calcQtyBonus(nb: number, stddev: number): number {
  if (nb >= 50 && stddev < 10) return 0.25;
  if (nb >= 21) return 0.20;
  if (nb >= 11) return 0.15;
  if (nb >= 6) return 0.10;
  if (nb >= 3) return 0.05;
  return 0;
}

// ─── 2. Calibration prix ───

export async function getPriceCalibration(params: {
  org_id: string;
  cfc_code: string;
  region: string;
  supabase: any;
}): Promise<{
  coefficient: number;
  nb_calibrations: number;
  confidence_bonus: number;
}> {
  const { org_id, cfc_code, region, supabase } = params;

  try {
    const { data } = await supabase
      .from('mv_calibration_coefficients')
      .select('*')
      .eq('org_id', org_id)
      .eq('cfc_code', cfc_code)
      .eq('region', region)
      .maybeSingle();

    if (data) {
      const nb = Number(data.nb_calibrations);
      const stddev = Number(data.coefficient_stddev || 0);
      return {
        coefficient: Number(data.coefficient_median),
        nb_calibrations: nb,
        confidence_bonus: calcPriceBonus(nb, stddev),
      };
    }
  } catch { /* vue peut ne pas exister */ }

  return { coefficient: 1.0, nb_calibrations: 0, confidence_bonus: 0 };
}

function calcPriceBonus(nb: number, stddev: number): number {
  if (nb >= 15 && stddev < 0.15) return 0.30;
  if (nb >= 8) return 0.20;
  if (nb >= 4) return 0.10;
  if (nb >= 2) return 0.05;
  return 0;
}

// ─── 3. Profil d'erreur modèle ───

export async function getModelErrorProfile(params: {
  provider: ModelProvider;
  discipline: string;
  cfc_prefix: string;
  org_id: string;
  supabase: any;
}): Promise<{
  coefficient_correction: number;
  fiabilite: number;
  source: 'org_specific' | 'platform_aggregate' | 'none';
  nb_datapoints: number;
}> {
  const { provider, discipline, cfc_prefix, org_id, supabase } = params;

  // D'abord, chercher les corrections spécifiques à l'org (C1)
  try {
    const { data: orgCorrections } = await supabase
      .from('quantity_corrections')
      .select('ecart_pct')
      .eq('org_id', org_id)
      .eq('discipline', discipline)
      .like('cfc_code', `${cfc_prefix}%`)
      .eq('modele_plus_eloigne', provider)
      .limit(50);

    if (orgCorrections && orgCorrections.length >= 3) {
      const ecarts = orgCorrections.map((c: any) => Number(c.ecart_pct));
      const avg = ecarts.reduce((a: number, b: number) => a + b, 0) / ecarts.length;
      const stddev = Math.sqrt(ecarts.reduce((s: number, v: number) => s + (v - avg) ** 2, 0) / ecarts.length);

      return {
        coefficient_correction: 1 + (avg / 100),
        fiabilite: Math.max(0, 1 - stddev / 50),
        source: 'org_specific',
        nb_datapoints: ecarts.length,
      };
    }
  } catch { /* table peut ne pas exister */ }

  // Ensuite, chercher le profil agrégé (C2)
  try {
    const { data: profile } = await supabase
      .from('model_error_profiles')
      .select('*')
      .eq('provider', provider)
      .eq('discipline', discipline)
      .eq('type_element_cfc', cfc_prefix)
      .maybeSingle();

    if (profile) {
      return {
        coefficient_correction: Number(profile.coefficient_correction),
        fiabilite: Number(profile.fiabilite),
        source: 'platform_aggregate',
        nb_datapoints: Number(profile.nb_corrections),
      };
    }
  } catch { /* table peut ne pas exister */ }

  return { coefficient_correction: 1.0, fiabilite: 0.5, source: 'none', nb_datapoints: 0 };
}

// ─── 4. Profil bureau d'études ───
//
// B13 — Il y avait DEUX écrivains incompatibles sur `bureau_profiles` :
//   * ce module         → bureau_nom = nom minusculé, hash = nom minusculé
//   * /api/plans/corrections → bureau_nom = nom brut,  hash = SHA-256
// La contrainte UNIQUE porte sur (org_id, bureau_nom_hash) : deux clés
// différentes = deux lignes pour le même bureau, et `getBureauProfile()`
// (qui cherchait par `bureau_nom` brut) ne retrouvait jamais la ligne écrite
// par le pipeline. Les profils étaient donc fragmentés ET illisibles.
//
// Clé unique et unique écrivain désormais : `bureauNomHash()` ci-dessous.
// Le nom lisible est conservé tel quel (trim) dans `bureau_nom`.

/**
 * Clé de déduplication d'un bureau : SHA-256 du nom normalisé
 * (trim + lowercase + espaces compactés). Doit être la SEULE façon de
 * calculer `bureau_profiles.bureau_nom_hash`, côté core comme côté routes.
 */
export async function bureauNomHash(bureauName: string): Promise<string> {
  const normalized = bureauName.trim().toLowerCase().replace(/\s+/g, ' ');
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface BureauCorrectionSignal {
  /** `quantity_corrections.raison` */
  raison: string;
  commentaire?: string | null;
}

/**
 * Unique point d'écriture de `bureau_profiles`.
 *
 * @param qualityScore  score métré 0-100 du run (null si l'appel vient d'une
 *                      correction utilisateur : pas de score à moyenner, on
 *                      n'incrémente alors PAS `nb_plans_analyses`).
 * @param options.correction  correction utilisateur à consigner dans
 *                      `erreurs_frequentes`.
 */
export async function updateBureauProfile(
  supabase: any,
  orgId: string,
  bureauName: string,
  qualityScore: number | null,
  options?: { correction?: BureauCorrectionSignal }
): Promise<void> {
  if (!bureauName || !bureauName.trim()) return;

  const display = bureauName.trim();
  const correction = options?.correction;

  try {
    const hash = await bureauNomHash(display);

    const { data: existing, error: readError } = await supabase
      .from('bureau_profiles')
      .select('id, nb_plans_analyses, avg_quality_score, erreurs_frequentes')
      .eq('org_id', orgId)
      .eq('bureau_nom_hash', hash)
      .maybeSingle();

    if (readError) {
      console.warn('[bureau_profiles] lecture échouée (non-fatal):', readError.message);
      return;
    }

    // Journal des erreurs fréquentes : moyenne mobile sur la fréquence.
    const mergeErrors = (current: any[]): any[] => {
      if (!correction) return current;
      const list = Array.isArray(current) ? [...current] : [];
      const hit = list.find((e: any) => e?.type === correction.raison);
      if (hit) {
        hit.frequence_pct = Math.round((hit.frequence_pct || 0) * 0.8 + 100 * 0.2);
        if (correction.commentaire) hit.description = correction.commentaire;
      } else {
        list.push({
          type: correction.raison,
          description: correction.commentaire || correction.raison,
          frequence_pct: 10,
        });
      }
      return list.slice(0, 20);
    };

    if (existing) {
      const prevCount = existing.nb_plans_analyses || 0;
      const update: Record<string, any> = {
        erreurs_frequentes: mergeErrors(existing.erreurs_frequentes),
        updated_at: new Date().toISOString(),
      };

      if (qualityScore !== null && qualityScore !== undefined) {
        const newCount = prevCount + 1;
        const newAvg =
          ((existing.avg_quality_score || 0) * prevCount + qualityScore) / newCount;
        update.nb_plans_analyses = newCount;
        update.avg_quality_score = Math.round(newAvg * 100) / 100;
      }

      const { error: updateError } = await supabase
        .from('bureau_profiles')
        .update(update)
        .eq('id', existing.id);

      if (updateError) {
        console.warn('[bureau_profiles] update échoué (non-fatal):', updateError.message);
      }
    } else {
      const { error: insertError } = await supabase.from('bureau_profiles').insert({
        org_id: orgId,
        bureau_nom: display,
        bureau_nom_hash: hash,
        nb_plans_analyses: qualityScore !== null && qualityScore !== undefined ? 1 : 0,
        avg_quality_score: qualityScore ?? null,
        erreurs_frequentes: mergeErrors([]),
      });

      if (insertError) {
        console.warn('[bureau_profiles] insert échoué (non-fatal):', insertError.message);
      }
    }
  } catch (err) {
    // Non-fatal — ne pas bloquer le pipeline si la mise à jour échoue
    console.warn('[bureau_profiles] updateBureauProfile failed (non-fatal):', err);
  }
}

export async function getBureauProfile(params: {
  org_id: string;
  bureau_nom: string;
  supabase: any;
}): Promise<{
  profile: BureauProfile | null;
  prompt_enrichment: string;
  confidence_bonus: number;
}> {
  const { org_id, bureau_nom, supabase } = params;

  if (!bureau_nom || !bureau_nom.trim()) {
    return { profile: null, prompt_enrichment: '', confidence_bonus: 0 };
  }

  try {
    // Lookup par la clé canonique (cf. updateBureauProfile). Chercher par
    // `bureau_nom` brut ne matchait jamais les lignes écrites par le pipeline.
    const hash = await bureauNomHash(bureau_nom);

    const { data } = await supabase
      .from('bureau_profiles')
      .select('*')
      .eq('org_id', org_id)
      .eq('bureau_nom_hash', hash)
      .maybeSingle();

    if (!data || (data.nb_plans_analyses ?? 0) < 2) {
      return { profile: null, prompt_enrichment: '', confidence_bonus: 0 };
    }

    const profile: BureauProfile = {
      bureau_nom_hash: data.bureau_nom_hash,
      bureau_nom_display: data.bureau_nom,
      org_id: data.org_id,
      nb_plans_analyses: data.nb_plans_analyses,
      conventions: data.conventions || {},
      erreurs_frequentes: data.erreurs_frequentes || [],
      performance_par_discipline: data.performance_par_discipline || {},
      derniere_maj: data.updated_at,
    };

    // Construire le prompt enrichi
    let enrichment = `CONTEXTE BUREAU D'ÉTUDES : Ce plan provient du bureau ${bureau_nom}.\n`;
    enrichment += `Sur les ${profile.nb_plans_analyses} plans précédents de ce bureau, les observations suivantes ont été faites :\n`;

    if (profile.conventions.echelle_favorite) {
      enrichment += `- Conventions : échelle habituelle ${profile.conventions.echelle_favorite}`;
      if (profile.conventions.style_cotation) enrichment += `, cotations ${profile.conventions.style_cotation}`;
      enrichment += '\n';
    }

    if (profile.erreurs_frequentes.length > 0) {
      enrichment += '- Erreurs fréquentes de l\'IA sur ces plans :\n';
      for (const err of profile.erreurs_frequentes.slice(0, 5)) {
        enrichment += `  * ${err.description} (${err.frequence_pct}% des cas)\n`;
      }
    }

    enrichment += 'Adapte ton analyse en conséquence.\n';

    // Bonus basé sur le nombre de plans analysés
    let bonus = 0;
    if (profile.nb_plans_analyses >= 10) bonus = 0.10;
    else if (profile.nb_plans_analyses >= 5) bonus = 0.07;
    else if (profile.nb_plans_analyses >= 2) bonus = 0.03;

    return { profile, prompt_enrichment: enrichment, confidence_bonus: bonus };
  } catch {
    return { profile: null, prompt_enrichment: '', confidence_bonus: 0 };
  }
}
