import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/plans/calibration
 * Enregistre un prix réel pour calibrer les estimations futures
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
    const { estimation_id, cfc_code, prix_reel, source, fournisseur_nom } = body;

    if (!estimation_id || !cfc_code || prix_reel === undefined || !source) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify ownership: resolve estimation_id to a plan_id, then check plan's org
    const { data: analysisForAuth } = await (adminClient as any)
      .from("plan_analyses")
      .select("plan_id")
      .eq("id", estimation_id)
      .maybeSingle();

    const resolvedPlanId = analysisForAuth?.plan_id ?? estimation_id;

    const { data: planCheck } = await (adminClient as any)
      .from("plan_registry")
      .select("organization_id")
      .eq("id", resolvedPlanId)
      .maybeSingle();

    if (!planCheck || planCheck.organization_id !== userOrg.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Récupérer le prix estimé original
    const { data: analysis } = await (adminClient as any)
      .from("plan_analyses")
      .select("result")
      .eq("id", estimation_id)
      .maybeSingle();

    // Aussi essayer par plan_id si l'estimation_id est un plan_id
    let estimationResult = analysis?.result;
    if (!estimationResult) {
      const { data: byPlan } = await (adminClient as any)
        .from("plan_analyses")
        .select("result")
        .eq("plan_id", estimation_id)
        .eq("analysis_type", "estimation_v2")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      estimationResult = byPlan?.result;
    }

    // Chercher le poste estimé
    let prixEstimeMedian = 0;
    let sourceEstimation = 'referentiel_crb';
    let unite = '';
    let region = '';

    if (estimationResult?.passe4) {
      for (const cfcGroup of estimationResult.passe4.estimation_par_cfc) {
        for (const poste of cfcGroup.postes) {
          if (poste.cfc_code === cfc_code) {
            prixEstimeMedian = poste.prix_unitaire.median ?? 0;
            sourceEstimation = poste.prix_unitaire.source;
            unite = poste.unite;
            break;
          }
        }
      }
      region = estimationResult.passe4.parametres_estimation?.region || 'vaud';
    }

    // Hasher le nom du fournisseur
    let fournisseurHash = null;
    if (fournisseur_nom) {
      const encoder = new TextEncoder();
      const data = encoder.encode(fournisseur_nom.toLowerCase().trim());
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
        description_normalized: cfc_code,
        unite: unite || 'm²',
        region: region || 'vaud',
        estimation_id,
        prix_estime_median: prixEstimeMedian,
        source_estimation: sourceEstimation,
        prix_reel,
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
