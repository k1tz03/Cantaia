import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/plans/corrections
 * Sauvegarde une correction de quantité pour le système de calibration
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: userOrg } = await adminClient
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userOrg?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const body = await request.json();
    const { plan_id, estimation_id, cfc_code, description, quantite_corrigee, unite, raison, commentaire } = body;

    if (!plan_id || !estimation_id || !cfc_code || quantite_corrigee === undefined || !raison) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify that the plan belongs to the user's organization
    const { data: planCheck } = await (adminClient as any)
      .from("plan_registry")
      .select("organization_id")
      .eq("id", plan_id)
      .maybeSingle();

    if (!planCheck || planCheck.organization_id !== userOrg.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Récupérer l'estimation originale
    const { data: analysis } = await (adminClient as any)
      .from("plan_analyses")
      .select("result")
      .eq("plan_id", plan_id)
      .eq("analysis_type", "estimation_v2")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!analysis?.result) {
      return NextResponse.json({ error: "Estimation not found" }, { status: 404 });
    }

    const estimation = analysis.result;
    const passe1 = estimation.passe1;
    const consensus = estimation.consensus_metrage;

    // Trouver le poste dans le consensus
    const consensusPoste = consensus?.postes?.find((p: any) => p.cfc_code === cfc_code);
    const quantite_estimee = consensusPoste?.quantite_consensuelle ?? 0;

    // Déterminer quel modèle était le plus/moins proche
    let modele_plus_proche = null;
    let modele_plus_eloigne = null;
    const valeurs_par_modele: Record<string, number> = {};

    if (consensusPoste?.valeurs_par_modele) {
      let minEcart = Infinity;
      let maxEcart = -Infinity;

      for (const v of consensusPoste.valeurs_par_modele) {
        valeurs_par_modele[v.provider] = v.quantite;
        const ecart = Math.abs(v.quantite - quantite_corrigee);
        if (ecart < minEcart) { minEcart = ecart; modele_plus_proche = v.provider; }
        if (ecart > maxEcart) { maxEcart = ecart; modele_plus_eloigne = v.provider; }
      }
    }

    // Insérer la correction
    const { data: correction, error } = await (adminClient as any)
      .from("quantity_corrections")
      .insert({
        org_id: userOrg.organization_id,
        plan_id,
        estimation_id,
        cfc_code,
        description: description || cfc_code,
        discipline: passe1?.classification?.discipline || 'architecture',
        type_plan: passe1?.classification?.type_plan || 'plan_etage',
        bureau_auteur: passe1?.cartouche?.auteur_bureau || null,
        echelle: passe1?.cartouche?.echelle || null,
        qualite_image: passe1?.contexte_metrage?.qualite_image || 'moyenne',
        quantite_estimee,
        quantite_corrigee,
        unite,
        methode_mesure_originale: consensusPoste ? `Consensus ${consensusPoste.methode_consensus}` : null,
        modele_plus_proche,
        modele_plus_eloigne,
        valeurs_par_modele,
        raison,
        commentaire: commentaire || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[corrections] Insert error:", error);
      return NextResponse.json({ error: "Failed to save correction" }, { status: 500 });
    }

    // Mettre à jour le profil bureau si connu
    const bureauNom = passe1?.cartouche?.auteur_bureau;
    if (bureauNom) {
      await updateBureauProfile(adminClient, userOrg.organization_id, bureauNom, correction);
    }

    // Mettre à jour les profils d'erreur par modèle (C2, cross-org)
    if (body.valeurs_par_modele && body.quantite_corrigee !== undefined) {
      await updateModelErrorProfiles(adminClient, {
        valeurs_par_modele: body.valeurs_par_modele,
        valeur_corrigee: body.quantite_corrigee,
        discipline: passe1?.classification?.discipline || 'general',
        element_cfc: body.cfc_code || 'general',
      });
    }

    return NextResponse.json({ correction });
  } catch (err) {
    console.error("[corrections] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function updateModelErrorProfiles(
  admin: any,
  params: {
    valeurs_par_modele: Record<string, number>;
    valeur_corrigee: number;
    discipline: string;
    element_cfc: string;
  }
) {
  try {
    const { valeurs_par_modele, valeur_corrigee, discipline, element_cfc } = params;
    const corrected = valeur_corrigee;

    for (const [provider, value] of Object.entries(valeurs_par_modele)) {
      const errorPct = Math.abs((value as number) - corrected) / Math.max(corrected, 0.01);

      const { data: existing } = await (admin as any)
        .from("model_error_profiles")
        .select("id, ecart_moyen_pct, nombre_corrections")
        .eq("provider", provider)
        .eq("discipline", discipline)
        .eq("type_element_cfc", element_cfc)
        .maybeSingle();

      if (existing) {
        const newCount = (existing.nombre_corrections || 0) + 1;
        const newAvg = ((existing.ecart_moyen_pct || 0) * existing.nombre_corrections + errorPct) / newCount;
        await (admin as any)
          .from("model_error_profiles")
          .update({
            ecart_moyen_pct: Math.round(newAvg * 1000) / 1000,
            nombre_corrections: newCount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await (admin as any).from("model_error_profiles").insert({
          provider,
          discipline,
          type_element_cfc: element_cfc,
          ecart_moyen_pct: Math.round(errorPct * 1000) / 1000,
          nombre_corrections: 1,
        });
      }
    }
  } catch (err) {
    // Ne jamais laisser l'erreur des profils modèle bloquer la sauvegarde de la correction
    console.error("[corrections] Model error profiles update failed (non-fatal):", err);
  }
}

async function updateBureauProfile(adminClient: any, org_id: string, bureauNom: string, correction: any) {
  try {
    // Créer un hash simple du nom du bureau
    const encoder = new TextEncoder();
    const data = encoder.encode(bureauNom);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const bureauHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Upsert le profil
    const { data: existing } = await adminClient
      .from("bureau_profiles")
      .select("id, nb_plans_analyses, erreurs_frequentes")
      .eq("org_id", org_id)
      .eq("bureau_nom_hash", bureauHash)
      .maybeSingle();

    if (existing) {
      const erreurs = existing.erreurs_frequentes || [];
      const existingErr = erreurs.find((e: any) => e.type === correction.raison);
      if (existingErr) {
        existingErr.frequence_pct = Math.round(((existingErr.frequence_pct || 0) * 0.8 + 100 * 0.2));
      } else {
        erreurs.push({ type: correction.raison, description: correction.commentaire || correction.raison, frequence_pct: 10 });
      }

      await adminClient
        .from("bureau_profiles")
        .update({ erreurs_frequentes: erreurs, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await adminClient
        .from("bureau_profiles")
        .insert({
          org_id,
          bureau_nom: bureauNom,
          bureau_nom_hash: bureauHash,
          nb_plans_analyses: 1,
          erreurs_frequentes: [{ type: correction.raison, description: correction.commentaire || correction.raison, frequence_pct: 10 }],
        });
    }
  } catch (err) {
    console.error("[corrections] Bureau profile update error:", err);
  }
}
