// Auto-calibration depuis le module Soumissions
// Quand une offre fournisseur est adjugée, compare automatiquement
// avec l'estimation pour créer des entrées de calibration prix

export interface AutoCalibrateResult {
  calibrations_creees: number;
  postes_matche: number;
  postes_non_matche: number;
  details: Array<{
    cfc_code: string;
    description: string;
    prix_estime: number;
    prix_reel: number;
    ecart_pct: number;
  }>;
}

export async function autoCalibrate(params: {
  org_id: string;
  project_id?: string;
  submission_id: string;
  offer_id: string;
  supabase: any;
}): Promise<AutoCalibrateResult> {
  const { org_id, offer_id, supabase } = params;

  // Resolve project_id from submission if not provided
  let project_id = params.project_id;
  if (!project_id && params.submission_id) {
    const { data: sub } = await (supabase as any)
      .from('submissions')
      .select('project_id')
      .eq('id', params.submission_id)
      .maybeSingle();
    project_id = sub?.project_id;
  }
  if (!project_id) {
    return { calibrations_creees: 0, postes_matche: 0, postes_non_matche: 0, details: [] };
  }

  const result: AutoCalibrateResult = {
    calibrations_creees: 0,
    postes_matche: 0,
    postes_non_matche: 0,
    details: [],
  };

  // 1. Récupérer les lignes de l'offre adjugée
  const { data: offerLines } = await (supabase as any)
    .from('offer_line_items')
    .select('id, cfc_subcode, normalized_description, unit_price, unite, quantity')
    .eq('offer_id', offer_id);

  if (!offerLines || offerLines.length === 0) {
    return result;
  }

  // 2. Récupérer la dernière estimation v2 du projet
  // Note: plan_analyses has no analysis_type column — filter by completed status and most recent
  const { data: analyses } = await (supabase as any)
    .from('plan_analyses')
    .select('id, result, plan_registry!inner(project_id, organization_id)')
    .eq('plan_registry.project_id', project_id)
    .eq('plan_registry.organization_id', org_id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!analyses || analyses.length === 0) {
    result.postes_non_matche = offerLines.length;
    return result;
  }

  const estimation = analyses[0].result;
  const estimationId = analyses[0].id;

  if (!estimation?.passe4?.estimation_par_cfc) {
    result.postes_non_matche = offerLines.length;
    return result;
  }

  // 3. Construire un index des postes estimés par CFC
  const estimatedByCode = new Map<string, { median: number; source: string; unite: string; description: string }>();
  for (const cfcGroup of estimation.passe4.estimation_par_cfc) {
    for (const poste of cfcGroup.postes) {
      if (poste.prix_unitaire.median) {
        estimatedByCode.set(poste.cfc_code, {
          median: poste.prix_unitaire.median,
          source: poste.prix_unitaire.source,
          unite: poste.unite,
          description: poste.description,
        });
      }
    }
  }

  // 4. Pour chaque ligne de l'offre, tenter le matching
  const region = estimation.passe4?.parametres_estimation?.region || 'vaud';

  for (const line of offerLines) {
    const cfcCode = line.cfc_subcode;
    const unitPrice = Number(line.unit_price);

    if (!cfcCode || !unitPrice || unitPrice <= 0) {
      result.postes_non_matche++;
      continue;
    }

    // Match priorité 1 : code CFC exact + même unité
    const match = estimatedByCode.get(cfcCode);

    if (match && match.unite === line.unite) {
      const ecart = match.median > 0
        ? Math.round(((unitPrice - match.median) / match.median) * 100 * 10) / 10
        : 0;

      // Hasher un identifiant pour le fournisseur (basé sur l'offer_id)
      const encoder = new TextEncoder();
      const data = encoder.encode(offer_id);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const offerHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Créer la calibration
      try {
        await (supabase as any)
          .from('price_calibrations')
          .insert({
            org_id,
            cfc_code: cfcCode,
            description_normalized: line.normalized_description || cfcCode,
            unite: line.unite,
            region,
            estimation_id: estimationId,
            prix_estime_median: match.median,
            source_estimation: match.source,
            prix_reel: unitPrice,
            source_prix_reel: 'offre_fournisseur',
            fournisseur_hash: offerHash,
          });

        result.calibrations_creees++;
        result.postes_matche++;
        result.details.push({
          cfc_code: cfcCode,
          description: match.description || line.normalized_description || cfcCode,
          prix_estime: match.median,
          prix_reel: unitPrice,
          ecart_pct: ecart,
        });
      } catch {
        result.postes_non_matche++;
      }
    } else {
      result.postes_non_matche++;
    }
  }

  // 5. Rafraîchir les vues si des calibrations ont été créées
  if (result.calibrations_creees > 0) {
    try {
      await supabase.rpc('refresh_calibration_views');
    } catch {
      // Non bloquant
    }
  }

  console.log(`[auto-calibration] ${result.calibrations_creees} calibrations créées, ${result.postes_matche} matchés, ${result.postes_non_matche} non matchés`);
  return result;
}
