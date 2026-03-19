import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEstimationPipeline } from "@cantaia/core/plans/estimation/pipeline";
import { checkUsageLimit } from "@cantaia/config/plan-features";

// Multi-model 4-pass pipeline can take several minutes
export const maxDuration = 300;

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
    });

    return NextResponse.json({ estimation: result });
  } catch (err) {
    console.error("[estimate-v2] Pipeline error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
