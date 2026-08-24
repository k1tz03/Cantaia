import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateBureauProfile } from "@cantaia/core/plans/estimation/calibration-engine";

/**
 * POST /api/plans/corrections
 * Sauvegarde une correction de quantité pour le système de calibration.
 *
 * Contrat (B3) — le client DOIT envoyer :
 *   plan_id            (uuid)   plan concerné — sert au contrôle anti-IDOR
 *   cfc_code           (string)
 *   unite              (string) NOT NULL en base (migration 043)
 *   quantite_corrigee  (number)
 *   raison             (enum)   cf. CHECK de quantity_corrections
 * Optionnel :
 *   estimation_id      (uuid)   ligne `plan_estimates` visée ; à défaut on
 *                               prend la dernière estimation du plan
 *   description, commentaire, valeurs_par_modele
 *
 * L'ancien contrat était incohérent : le client envoyait `estimation_id` (en
 * réalité un plan_id) sans `plan_id` ni `unite`, la route exigeait `plan_id`
 * → 400 systématique, avalé par un `fetch` sans vérification côté client, et
 * la modale se fermait en faux succès. `quantity_corrections` est donc restée
 * vide, ce qui coupait toute la boucle d'apprentissage quantité.
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
    const {
      plan_id,
      estimation_id,
      cfc_code,
      description,
      quantite_corrigee,
      unite,
      raison,
      commentaire,
    } = body;

    const missing: string[] = [];
    if (!plan_id) missing.push("plan_id");
    if (!cfc_code) missing.push("cfc_code");
    if (!unite) missing.push("unite");
    if (quantite_corrigee === undefined || quantite_corrigee === null) missing.push("quantite_corrigee");
    if (!raison) missing.push("raison");

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Champs manquants : ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const quantiteCorrigee = Number(quantite_corrigee);
    if (!Number.isFinite(quantiteCorrigee)) {
      return NextResponse.json({ error: "quantite_corrigee doit être un nombre" }, { status: 400 });
    }

    // Anti-IDOR : le plan doit appartenir à l'organisation de l'appelant
    const { data: planCheck } = await (adminClient as any)
      .from("plan_registry")
      .select("organization_id")
      .eq("id", plan_id)
      .maybeSingle();

    if (!planCheck || planCheck.organization_id !== userOrg.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Récupérer l'estimation d'origine depuis `plan_estimates`
    // (migrations 022 + 084 — cf. B1 : plus jamais depuis plan_analyses).
    let estimateRow: { id: string; estimate_result: any } | null = null;

    if (estimation_id) {
      const { data } = await (adminClient as any)
        .from("plan_estimates")
        .select("id, estimate_result")
        .eq("id", estimation_id)
        .eq("organization_id", userOrg.organization_id)
        .maybeSingle();
      estimateRow = data ?? null;
    }

    if (!estimateRow) {
      const { data } = await (adminClient as any)
        .from("plan_estimates")
        .select("id, estimate_result")
        .eq("plan_id", plan_id)
        .eq("organization_id", userOrg.organization_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      estimateRow = data ?? null;
    }

    if (!estimateRow?.estimate_result) {
      return NextResponse.json(
        {
          error: "estimation_introuvable",
          message:
            "Aucune estimation enregistrée pour ce plan — impossible de rattacher la correction.",
        },
        { status: 404 }
      );
    }

    const estimation = estimateRow.estimate_result;
    const passe1 = estimation.passe1;
    const consensus = estimation.consensus_metrage;

    // Trouver le poste dans le consensus
    const consensusPoste = consensus?.postes?.find((p: any) => p.cfc_code === cfc_code);
    const quantite_estimee = Number(consensusPoste?.quantite_consensuelle ?? body.quantite_estimee ?? 0);

    // Déterminer quel modèle était le plus/moins proche
    let modele_plus_proche: string | null = null;
    let modele_plus_eloigne: string | null = null;
    const valeurs_par_modele: Record<string, number> = {};

    if (consensusPoste?.valeurs_par_modele) {
      let minEcart = Infinity;
      let maxEcart = -Infinity;

      for (const v of consensusPoste.valeurs_par_modele) {
        valeurs_par_modele[v.provider] = v.quantite;
        const ecart = Math.abs(v.quantite - quantiteCorrigee);
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
        estimation_id: estimateRow.id,
        cfc_code,
        description: description || consensusPoste?.description || cfc_code,
        discipline: passe1?.classification?.discipline || 'architecture',
        type_plan: passe1?.classification?.type_plan || 'plan_etage',
        bureau_auteur: passe1?.cartouche?.auteur_bureau || null,
        echelle: passe1?.cartouche?.echelle || null,
        qualite_image: passe1?.contexte_metrage?.qualite_image || 'moyenne',
        quantite_estimee,
        quantite_corrigee: quantiteCorrigee,
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

    // Mettre à jour le profil bureau si connu.
    // B13 — un seul écrivain : `updateBureauProfile()` du calibration-engine
    // (clé = SHA-256 du nom normalisé). La logique dupliquée qui vivait ici
    // écrivait une clé incompatible et fragmentait les profils.
    const bureauNom = passe1?.cartouche?.auteur_bureau;
    if (bureauNom) {
      await updateBureauProfile(adminClient, userOrg.organization_id, bureauNom, null, {
        correction: { raison, commentaire: commentaire || null },
      });
    }

    // Mettre à jour les profils d'erreur par modèle (C2, cross-org).
    // On préfère les valeurs issues du consensus persisté à celles envoyées
    // par le client (non fiables / falsifiables).
    const modelValues = Object.keys(valeurs_par_modele).length > 0
      ? valeurs_par_modele
      : (body.valeurs_par_modele as Record<string, number> | undefined);

    if (modelValues && Object.keys(modelValues).length > 0) {
      await updateModelErrorProfiles(adminClient, {
        valeurs_par_modele: modelValues,
        valeur_corrigee: quantiteCorrigee,
        discipline: passe1?.classification?.discipline || 'general',
        element_cfc: String(cfc_code).split('.')[0] || 'general',
      });
    }

    return NextResponse.json({ correction });
  } catch (err) {
    console.error("[corrections] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Met à jour l'agrégat C2 `model_error_profiles`.
 *
 * B7 — la colonne s'appelle `nb_corrections` (migration 043), pas
 * `nombre_corrections` : le SELECT 400ait, l'UPDATE aussi, et l'INSERT
 * violait quatre NOT NULL (`contributor_count`, `ecart_median_pct`,
 * `ecart_stddev_pct`, `nb_corrections`). Aucun profil n'a jamais été écrit,
 * donc les poids adaptatifs du consensus multi-modèle étaient morts.
 */
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

    for (const [provider, rawValue] of Object.entries(valeurs_par_modele)) {
      // La contrainte CHECK n'accepte que ces trois providers.
      if (!["claude", "gpt4o", "gemini"].includes(provider)) continue;

      const value = Number(rawValue);
      if (!Number.isFinite(value)) continue;

      // Écart signé en % : le signe porte la tendance (sur/sous-estimation).
      const signedErrorPct = ((value - corrected) / Math.max(Math.abs(corrected), 0.01)) * 100;
      const absErrorPct = Math.abs(signedErrorPct);

      const { data: existing, error: readError } = await (admin as any)
        .from("model_error_profiles")
        .select("id, ecart_moyen_pct, ecart_median_pct, ecart_stddev_pct, nb_corrections, contributor_count")
        .eq("provider", provider)
        .eq("discipline", discipline)
        .eq("type_element_cfc", element_cfc)
        .maybeSingle();

      if (readError) {
        console.error("[corrections] model_error_profiles SELECT error:", readError.message);
        continue;
      }

      if (existing) {
        const prevCount = Number(existing.nb_corrections) || 0;
        const newCount = prevCount + 1;
        const prevAvg = Number(existing.ecart_moyen_pct) || 0;
        const newAvg = (prevAvg * prevCount + absErrorPct) / newCount;
        // Écart-type incrémental approché (Welford simplifié sur la moyenne).
        const prevStd = Number(existing.ecart_stddev_pct) || 0;
        const newStd = Math.sqrt(
          (prevStd ** 2 * prevCount + (absErrorPct - newAvg) ** 2) / newCount
        );

        const { error: updateError } = await (admin as any)
          .from("model_error_profiles")
          .update({
            ecart_moyen_pct: Math.round(newAvg * 1000) / 1000,
            // Approximation : la médiane exacte demanderait de conserver
            // l'échantillon. La moyenne mobile est suffisante pour pondérer.
            ecart_median_pct: Math.round(newAvg * 1000) / 1000,
            ecart_stddev_pct: Math.round(newStd * 1000) / 1000,
            nb_corrections: newCount,
            tendance: signedErrorPct > 5 ? "surestime" : signedErrorPct < -5 ? "sous_estime" : "neutre",
            coefficient_correction: Math.round((corrected / Math.max(value, 0.01)) * 1000) / 1000,
            fiabilite: Math.min(0.95, 0.5 + newCount * 0.02),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (updateError) {
          console.error("[corrections] model_error_profiles UPDATE error:", updateError.message);
        }
      } else {
        const { error: insertError } = await (admin as any).from("model_error_profiles").insert({
          provider,
          discipline,
          type_element_cfc: element_cfc,
          // Colonnes NOT NULL sans DEFAULT dans la migration 043 :
          nb_corrections: 1,
          contributor_count: 1,
          ecart_moyen_pct: Math.round(absErrorPct * 1000) / 1000,
          ecart_median_pct: Math.round(absErrorPct * 1000) / 1000,
          ecart_stddev_pct: 0,
          tendance: signedErrorPct > 5 ? "surestime" : signedErrorPct < -5 ? "sous_estime" : "neutre",
          coefficient_correction: Math.round((corrected / Math.max(value, 0.01)) * 1000) / 1000,
          fiabilite: 0.5,
        });

        if (insertError) {
          console.error("[corrections] model_error_profiles INSERT error:", insertError.message);
        }
      }
    }
  } catch (err) {
    // Ne jamais laisser l'erreur des profils modèle bloquer la sauvegarde de la correction
    console.error("[corrections] Model error profiles update failed (non-fatal):", err);
  }
}
