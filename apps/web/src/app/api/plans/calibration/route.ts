import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/plans/calibration
 * Enregistre un prix réel pour calibrer les estimations futures.
 *
 * Contrat :
 *   plan_id        (uuid)   plan concerné (anti-IDOR + résolution estimation)
 *   cfc_code       (string)
 *   prix_reel      (number > 0)
 *   source         (enum)   offre_fournisseur | decompte_final | correction_manuelle
 * Optionnel :
 *   estimation_id  (uuid)   ligne `plan_estimates` visée
 *   fournisseur_nom
 *
 * B9 — L'ancienne version lisait l'estimation dans `plan_analyses.result`
 * (colonne inexistante) : `prix_estime_median` retombait à 0 et `unite`/
 * `region` sur les valeurs par défaut 'm²'/'vaud'. Or `price_calibrations`
 * dérive `coefficient = prix_reel / prix_estime_median` en colonne GENERATED :
 * avec un dénominateur nul, la table se remplissait de coefficients faux (1
 * par le CASE de garde) rattachés à une région/unité inventées, qui
 * repartaient ensuite dans `mv_calibration_coefficients` et corrompaient les
 * estimations suivantes. On REFUSE désormais plutôt que d'écrire du déchet.
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
    const { plan_id, estimation_id, cfc_code, prix_reel, source, fournisseur_nom } = body;

    const missing: string[] = [];
    if (!plan_id && !estimation_id) missing.push("plan_id");
    if (!cfc_code) missing.push("cfc_code");
    if (prix_reel === undefined || prix_reel === null) missing.push("prix_reel");
    if (!source) missing.push("source");

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Champs manquants : ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const prixReel = Number(prix_reel);
    if (!Number.isFinite(prixReel) || prixReel <= 0) {
      return NextResponse.json({ error: "prix_reel doit être un nombre > 0" }, { status: 400 });
    }

    if (!["offre_fournisseur", "decompte_final", "correction_manuelle"].includes(source)) {
      return NextResponse.json({ error: "source invalide" }, { status: 400 });
    }

    // ── Résolution de l'estimation (org-scoped, donc anti-IDOR) ──────────
    let estimateRow: { id: string; plan_id: string; estimate_result: any } | null = null;

    if (estimation_id) {
      const { data } = await (adminClient as any)
        .from("plan_estimates")
        .select("id, plan_id, estimate_result")
        .eq("id", estimation_id)
        .eq("organization_id", userOrg.organization_id)
        .maybeSingle();
      estimateRow = data ?? null;
    }

    if (!estimateRow && plan_id) {
      const { data } = await (adminClient as any)
        .from("plan_estimates")
        .select("id, plan_id, estimate_result")
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
            "Aucune estimation enregistrée pour ce plan. La calibration prix a besoin du prix estimé d'origine pour calculer un coefficient — relancez l'estimation d'abord.",
        },
        { status: 400 }
      );
    }

    // Double contrôle anti-IDOR : le plan de l'estimation doit bien être
    // dans l'org (défense en profondeur, `plan_estimates` étant déjà filtrée).
    const { data: planCheck } = await (adminClient as any)
      .from("plan_registry")
      .select("organization_id")
      .eq("id", estimateRow.plan_id)
      .maybeSingle();

    if (!planCheck || planCheck.organization_id !== userOrg.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Retrouver le poste estimé (prix, unité, région) ──────────────────
    const estimationResult = estimateRow.estimate_result;
    let prixEstimeMedian = 0;
    let sourceEstimation = "";
    let unite = "";
    let description = "";

    const cfcGroups = estimationResult?.passe4?.estimation_par_cfc ?? [];
    for (const cfcGroup of cfcGroups) {
      for (const poste of cfcGroup?.postes ?? []) {
        if (poste?.cfc_code === cfc_code) {
          prixEstimeMedian = Number(poste?.prix_unitaire?.median ?? 0);
          sourceEstimation = poste?.prix_unitaire?.source ?? "";
          unite = poste?.unite ?? "";
          description = poste?.description ?? "";
          break;
        }
      }
      if (prixEstimeMedian > 0) break;
    }

    const region = estimationResult?.passe4?.parametres_estimation?.region;

    // Refus explicite : sans prix estimé / unité / région réels, le
    // coefficient calculé serait faux (ou infini) et polluerait durablement
    // `mv_calibration_coefficients`.
    if (!prixEstimeMedian || prixEstimeMedian <= 0) {
      return NextResponse.json(
        {
          error: "poste_sans_prix_estime",
          message: `Le poste ${cfc_code} n'a pas de prix estimé médian dans cette estimation — impossible de calculer un coefficient de calibration.`,
        },
        { status: 400 }
      );
    }

    if (!unite || !region) {
      return NextResponse.json(
        {
          error: "contexte_estimation_incomplet",
          message:
            "L'estimation ne contient pas l'unité ou la région du poste — calibration refusée pour ne pas enregistrer un contexte inventé.",
        },
        { status: 400 }
      );
    }

    // Hasher le nom du fournisseur
    let fournisseurHash: string | null = null;
    if (fournisseur_nom) {
      const encoder = new TextEncoder();
      const data = encoder.encode(String(fournisseur_nom).toLowerCase().trim());
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      fournisseurHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Insérer la calibration
    const { data: calibration, error } = await (adminClient as any)
      .from("price_calibrations")
      .insert({
        org_id: userOrg.organization_id,
        cfc_code,
        description_normalized: description || cfc_code,
        unite,
        region,
        estimation_id: estimateRow.id,
        prix_estime_median: prixEstimeMedian,
        source_estimation: sourceEstimation || "inconnue",
        prix_reel: prixReel,
        source_prix_reel: source,
        fournisseur_hash: fournisseurHash,
      })
      .select()
      .single();

    if (error) {
      console.error("[calibration] Insert error:", error);
      return NextResponse.json({ error: "Failed to save calibration" }, { status: 500 });
    }

    // Rafraîchir la vue matérialisée si on a assez de données
    try {
      const { count } = await (adminClient as any)
        .from("price_calibrations")
        .select("id", { count: "exact", head: true })
        .eq("org_id", userOrg.organization_id)
        .eq("cfc_code", cfc_code)
        .eq("region", region);

      if (count && count >= 2) {
        await (adminClient as any).rpc("refresh_calibration_views");
      }
    } catch {
      // Non bloquant
    }

    return NextResponse.json({ calibration });
  } catch (err) {
    console.error("[calibration] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
