import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEstimationPipeline } from "@cantaia/core/plans/estimation/pipeline";
import { getBureauProfile, updateBureauProfile } from "@cantaia/core/plans/estimation/calibration-engine";
import { verifyCrossPlan } from "@cantaia/core/plans/estimation";
import { checkUsageLimit } from "@cantaia/config/plan-features";

// Multi-model 4-pass pipeline can take several minutes
export const maxDuration = 300;

/**
 * GET /api/plans/estimate-v2?plan_id=xxx
 * Fetch the latest saved estimation for a plan (used after agent completion).
 */
export async function GET(request: NextRequest) {
  const planId = request.nextUrl.searchParams.get("plan_id");
  if (!planId) {
    return NextResponse.json({ error: "plan_id required" }, { status: 400 });
  }

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

  // Verify plan belongs to the user's org
  const { data: plan } = await (adminClient as any)
    .from("plan_registry")
    .select("id, organization_id")
    .eq("id", planId)
    .eq("organization_id", userOrg.organization_id)
    .maybeSingle();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // Fetch the latest estimation
  const { data: estimate } = await (adminClient as any)
    .from("plan_estimates")
    .select("id, plan_id, estimate_result, grand_total, confidence_summary, created_at")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!estimate) {
    return NextResponse.json({ error: "No estimation found" }, { status: 404 });
  }

  return NextResponse.json({ estimation: estimate.estimate_result });
}

/**
 * POST /api/plans/estimate-v2
 * Lance le pipeline d'estimation multi-modèle 4 passes
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Récupérer l'org de l'utilisateur
    const { data: userOrg } = await adminClient
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userOrg?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Check AI usage limit
    const { data: orgData } = await adminClient
      .from("organizations")
      .select("subscription_plan")
      .eq("id", userOrg.organization_id)
      .single();

    const usageCheck = await checkUsageLimit(adminClient, userOrg.organization_id, orgData?.subscription_plan || "trial");
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { plan_id, project_id, region, type_batiment, acces_chantier, periode_travaux } = body;

    if (!plan_id || !project_id) {
      return NextResponse.json({ error: "plan_id and project_id are required" }, { status: 400 });
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

    // Récupérer la dernière version du plan
    const { data: version } = await (adminClient as any)
      .from("plan_versions")
      .select("id, file_url, file_name, file_type")
      .eq("plan_id", plan_id)
      .eq("is_current", true)
      .maybeSingle();

    if (!version?.file_url) {
      return NextResponse.json({ error: "No file found for this plan" }, { status: 404 });
    }

    // Télécharger le fichier depuis Supabase Storage
    const filePath = version.file_url.replace(/^.*\/storage\/v1\/object\/public\//, '');
    const bucketName = filePath.split('/')[0];
    const objectPath = filePath.split('/').slice(1).join('/');

    const { data: fileData, error: dlError } = await adminClient.storage
      .from(bucketName || 'plans')
      .download(objectPath || filePath);

    if (dlError || !fileData) {
      return NextResponse.json({ error: "Failed to download plan file" }, { status: 500 });
    }

    // Convertir en base64
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const imageBase64 = buffer.toString('base64');

    // Déterminer le media type
    const ext = (version.file_name || '').toLowerCase();
    let mediaType = 'image/png';
    if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) mediaType = 'image/jpeg';
    else if (ext.endsWith('.png')) mediaType = 'image/png';
    else if (ext.endsWith('.gif')) mediaType = 'image/gif';
    else if (ext.endsWith('.webp')) mediaType = 'image/webp';
    else if (ext.endsWith('.pdf')) mediaType = 'application/pdf';

    // Calculer les poids des modèles depuis les profils d'erreur C2 (cross-org)
    const modelWeights: Record<string, number> = {};
    try {
      const { data: profiles } = await (adminClient as any)
        .from("model_error_profiles")
        .select("provider, discipline, ecart_moyen_pct, nombre_corrections");

      if (profiles?.length) {
        const byProvider: Record<string, number[]> = {};
        for (const p of profiles) {
          if (!byProvider[p.provider]) byProvider[p.provider] = [];
          byProvider[p.provider].push(p.ecart_moyen_pct ?? 0.15);
        }
        for (const [provider, errors] of Object.entries(byProvider)) {
          const avgError = errors.reduce((a: number, b: number) => a + b, 0) / errors.length;
          modelWeights[provider] = 1 / (1 + avgError / 10);
        }
        // Normaliser so que la somme des poids ≈ 3.0 (un poids neutre de 1 par modèle)
        const sum = Object.values(modelWeights).reduce((a, b) => a + b, 0);
        if (sum > 0) {
          const factor = 3.0 / sum;
          for (const k of Object.keys(modelWeights)) modelWeights[k] *= factor;
        }
        if (Object.keys(modelWeights).length > 0) {
          console.log("[estimate-v2] Model weights from error profiles:", JSON.stringify(modelWeights));
        }
      }
    } catch (weightErr) {
      // Non-fatal — on continue sans poids adaptatifs
      console.warn("[estimate-v2] Could not load model error profiles, using equal weights:", weightErr);
    }

    // Récupérer le profil de bureau depuis la dernière analyse connue du plan
    // (le nom du bureau n'est connu qu'après Passe 1, donc on utilise la valeur du dernier run)
    let bureauEnrichment: string | undefined;
    try {
      const { data: lastAnalysis } = await (adminClient as any)
        .from("plan_analyses")
        .select("result")
        .eq("plan_id", plan_id)
        .eq("analysis_type", "estimation_v2")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastBureauName = lastAnalysis?.result?.passe1?.cartouche?.auteur_bureau;
      if (lastBureauName) {
        const bureauData = await getBureauProfile({
          org_id: userOrg.organization_id,
          bureau_nom: lastBureauName,
          supabase: adminClient,
        });
        if (bureauData.prompt_enrichment) {
          bureauEnrichment = bureauData.prompt_enrichment;
          console.log(`[estimate-v2] Bureau enrichment loaded for "${lastBureauName}" (bonus: ${bureauData.confidence_bonus})`);
        }
      }
    } catch (bureauErr) {
      // Non-fatal
      console.warn("[estimate-v2] Could not load bureau profile for enrichment:", bureauErr);
    }

    // Lancer le pipeline
    const result = await runEstimationPipeline({
      plan_id,
      project_id,
      org_id: userOrg.organization_id,
      image_base64: imageBase64,
      media_type: mediaType,
      region: region || 'vaud',
      type_batiment: type_batiment || 'logement_collectif_standard',
      acces_chantier: acces_chantier || 'normal',
      periode_travaux: periode_travaux || `${new Date().getFullYear()}-Q${Math.ceil((new Date().getMonth() + 1) / 3)}`,
      supabase: adminClient,
      modelWeights: Object.keys(modelWeights).length > 0 ? (modelWeights as any) : undefined,
      bureauEnrichment,
    });

    // Mettre à jour le profil du bureau avec le résultat de cette analyse (Passe 1)
    const detectedBureauName = result.passe1?.cartouche?.auteur_bureau;
    if (detectedBureauName) {
      const qualityScore = result.passe3?.score_fiabilite_metrage?.score ?? 50;
      await updateBureauProfile(
        adminClient,
        userOrg.organization_id,
        detectedBureauName,
        qualityScore
      );
      console.log(`[estimate-v2] Bureau profile updated for "${detectedBureauName}" (quality: ${qualityScore})`);
    }

    // Lancer la vérification croisée inter-plans si le projet a au moins 2 plans analysés
    let crossPlanResult = null;
    if (project_id) {
      try {
        const { data: projectPlans } = await (adminClient as any)
          .from("plan_registry")
          .select("id")
          .eq("project_id", project_id)
          .eq("organization_id", userOrg.organization_id);

        if (projectPlans && projectPlans.length >= 2) {
          crossPlanResult = await verifyCrossPlan({
            project_id,
            org_id: userOrg.organization_id,
            supabase: adminClient,
          });
          console.log(`[estimate-v2] Cross-plan verification: score=${crossPlanResult.score_coherence_projet}, alerts=${crossPlanResult.alertes.length}`);
        }
      } catch (crossErr) {
        console.warn("[estimate-v2] Cross-plan verification failed (non-fatal):", crossErr);
      }
    }

    return NextResponse.json({ estimation: result, cross_plan: crossPlanResult });
  } catch (err) {
    console.error("[estimate-v2] Pipeline error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
