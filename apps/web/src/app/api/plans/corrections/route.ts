import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateBureauProfile } from "@cantaia/core/plans/estimation/calibration-engine";
import { logLearningEvent, updateModelErrorProfilesForOrg } from "@cantaia/core/learning";

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

    // Mettre à jour les profils d'erreur par modèle.
    //
    // AUDIT 08/2026 — writer UNIQUE désormais : le recalcul complet (médiane
    // signée en %, nb_corrections réel) vit dans @cantaia/core/learning et se
    // base sur les quantity_corrections persistées de l'ORG — jamais sur les
    // valeurs envoyées par le client. L'ancien writer incrémental local (qui
    // écrivait la |erreur| absolue et entrait en conflit avec le cron) est
    // supprimé.
    await updateModelErrorProfilesForOrg(adminClient, {
      orgId: userOrg.organization_id,
      discipline: passe1?.classification?.discipline || 'general',
      cfcPrefix: String(cfc_code).split('.')[0] || 'general',
    });

    // Journal d'apprentissage : une correction humaine de quantité.
    await logLearningEvent(adminClient, {
      organizationId: userOrg.organization_id,
      module: "plans",
      eventType: "correction",
      decisionSource: "consensus_multi_ia",
      wasCorrected: true,
      payload: { cfc_code, raison, ecart_source: "quantity_correction" },
    });

    return NextResponse.json({ correction });
  } catch (err) {
    console.error("[corrections] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// L'ancien writer incrémental `updateModelErrorProfiles` (|erreur| absolue,
// moyenne mobile) vivait ici et entrait en conflit avec un second writer dans
// /api/cron/calibrate (erreur signée cross-org). Le writer UNIQUE est désormais
// `updateModelErrorProfilesForOrg` dans @cantaia/core/learning — médiane
// signée en %, org-scopé (migration 102), recalcul complet à chaque correction.
