import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/plans/upload
 * Create plan_registry + plan_versions records from metadata.
 * The file must already be uploaded to Supabase Storage by the client.
 * Body JSON: { project_id, plan_number, plan_title, file_url, file_name, file_size, file_type, ...optional }
 */

/**
 * Ajoute une version à un plan déjà enregistré, en garantissant l'invariant
 * « une seule version courante par plan ».
 *
 * Ordre volontaire : on DÉMOTE d'abord, on insère ensuite. L'inverse laisse
 * une fenêtre où deux versions sont courantes — courte, mais suffisante pour
 * faire échouer un `maybeSingle()` concurrent.
 */
async function addVersionToExistingPlan(args: {
  adminClient: any;
  planId: string;
  orgId: string;
  project_id: string;
  version_code: string;
  file_url: string;
  file_name: string;
  file_size?: number;
  file_type?: string;
}) {
  const { adminClient, planId, orgId, project_id, version_code, file_url, file_name } = args;

  // Numéro de version suivant : on lit le max existant plutôt que de compter
  // les lignes (une suppression laisserait des trous et créerait un doublon).
  const { data: lastVersion, error: lastErr } = await adminClient
    .from("plan_versions")
    .select("version_number")
    .eq("plan_id", planId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastErr) {
    console.error("[plans/upload] plan_versions max lookup error:", lastErr);
    return NextResponse.json(
      { error: "Failed to read the plan version history" },
      { status: 500 }
    );
  }

  const nextVersionNumber = Number(lastVersion?.version_number ?? 0) + 1;

  const { error: demoteErr } = await adminClient
    .from("plan_versions")
    .update({ is_current: false })
    .eq("plan_id", planId)
    .eq("is_current", true);

  if (demoteErr) {
    console.error("[plans/upload] demote current version error:", demoteErr);
    return NextResponse.json(
      { error: "Failed to supersede the previous plan version" },
      { status: 500 }
    );
  }

  const { error: versionError } = await adminClient.from("plan_versions").insert({
    plan_id: planId,
    organization_id: orgId,
    project_id,
    version_code,
    version_number: nextVersionNumber,
    version_date: new Date().toISOString(),
    file_url,
    file_name,
    file_size: args.file_size || 0,
    file_type: args.file_type || "application/pdf",
    source: "manual_upload",
    is_current: true,
    validation_status: "pending",
  });

  if (versionError) {
    console.error("[plans/upload] plan_versions insert error:", versionError);
    // On a démoté l'ancienne version et la nouvelle n'existe pas : le plan
    // n'aurait plus AUCUNE version courante. On restaure.
    await adminClient
      .from("plan_versions")
      .update({ is_current: true })
      .eq("plan_id", planId)
      .eq("version_number", nextVersionNumber - 1);

    return NextResponse.json(
      { error: "Failed to create the new plan version" },
      { status: 500 }
    );
  }

  const { error: registryErr } = await adminClient
    .from("plan_registry")
    .update({ is_current_version: true, status: "active" })
    .eq("id", planId);

  if (registryErr) {
    // Non fatal : la version courante est correcte, seul le drapeau de
    // synthèse du registre n'a pas suivi.
    console.error("[plans/upload] plan_registry flag update error:", registryErr);
  }

  return NextResponse.json({
    success: true,
    plan_id: planId,
    version_number: nextVersionNumber,
    superseded_previous_version: true,
  });
}
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Get user's org
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
      project_id,
      plan_number,
      plan_title,
      file_url,
      file_name,
      file_size,
      file_type,
      plan_type = "execution",
      discipline = null,
      version_code = "A",
      lot_name = null,
      zone = null,
      scale = null,
      format = null,
      author_company = null,
      author_name = null,
      notes = null,
    } = body;

    if (!project_id || !plan_number || !plan_title || !file_url || !file_name) {
      return NextResponse.json(
        { error: "project_id, plan_number, plan_title, file_url, and file_name are required" },
        { status: 400 }
      );
    }

    // Re-validation serveur (le filtre client peut être contourné) :
    //  - extension dans l'allow-list (pas de SVG/exécutable),
    //  - type MIME jamais image/svg+xml,
    //  - file_url pointant bien sur NOTRE Storage bucket `plans` (anti-SSRF :
    //    la valeur est ensuite fetchée/téléchargée côté serveur par analyze-plan
    //    et scenes/extract).
    const ALLOWED_EXTENSIONS = [".pdf", ".dwg", ".dxf", ".png", ".jpg", ".jpeg"];
    const ext = (() => {
      const dot = String(file_name).lastIndexOf(".");
      return dot >= 0 ? String(file_name).slice(dot).toLowerCase() : "";
    })();
    if (!ALLOWED_EXTENSIONS.includes(ext) || file_type === "image/svg+xml") {
      return NextResponse.json(
        { error: "unsupported_file_type" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const isOurPlansObject =
      typeof file_url === "string" &&
      /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?plans\//.test(file_url) &&
      (!supabaseUrl || file_url.startsWith(supabaseUrl));
    if (!isOurPlansObject) {
      return NextResponse.json(
        { error: "invalid_file_reference" },
        { status: 400 }
      );
    }

    // Verify that the project belongs to the user's organization
    const { data: projCheck } = await adminClient
      .from("projects")
      .select("organization_id")
      .eq("id", project_id)
      .maybeSingle();

    if (!projCheck || projCheck.organization_id !== userOrg.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const orgId = userOrg.organization_id;

    // Un plan déjà enregistré sous ce numéro dans ce projet ?
    //
    // Bug `is_current` — la route créait systématiquement un NOUVEAU
    // plan_registry, puis insérait une version `is_current: true`. Ré-uploader
    // l'indice B d'un plan existant produisait donc deux plans homonymes,
    // chacun avec sa version « courante ». Toutes les lectures en aval font
    // `.eq("is_current", true).maybeSingle()` (scenes/extract, estimate-v2) :
    // avec deux lignes courantes pour un même plan, PostgREST renvoie une
    // erreur et la fonctionnalité tombe — sans message compréhensible.
    //
    // On rattache donc la nouvelle version au plan existant, et on démote
    // explicitement l'ancienne version courante.
    const { data: existingPlan, error: existingErr } = await (adminClient as any)
      .from("plan_registry")
      .select("id")
      .eq("organization_id", orgId)
      .eq("project_id", project_id)
      .eq("plan_number", plan_number)
      .maybeSingle();

    if (existingErr) {
      console.error("[plans/upload] plan_registry lookup error:", existingErr);
      return NextResponse.json(
        { error: "Failed to look up the existing plan" },
        { status: 500 }
      );
    }

    if (existingPlan?.id) {
      return await addVersionToExistingPlan({
        adminClient,
        planId: existingPlan.id,
        orgId,
        project_id,
        version_code,
        file_url,
        file_name,
        file_size,
        file_type,
      });
    }

    // Create plan_registry record
    const { data: plan, error: planError } = await (adminClient as any)
      .from("plan_registry")
      .insert({
        project_id,
        organization_id: orgId,
        plan_number: plan_number,
        plan_title: plan_title,
        plan_type: plan_type,
        discipline: discipline || null,
        lot_name,
        zone,
        scale,
        format,
        author_company: author_company,
        author_name: author_name,
        notes,
        status: "active",
      })
      .select("id")
      .single();

    if (planError) {
      console.error("[plans/upload] plan_registry insert error:", planError);
      return NextResponse.json(
        { error: "Failed to create plan record" },
        { status: 500 }
      );
    }

    // Create plan_versions record
    const { error: versionError } = await (adminClient as any)
      .from("plan_versions")
      .insert({
        plan_id: plan.id,
        organization_id: orgId,
        project_id,
        version_code: version_code,
        version_number: 1,
        version_date: new Date().toISOString(),
        file_url,
        file_name,
        file_size: file_size || 0,
        file_type: file_type || "application/pdf",
        source: "manual_upload",
        is_current: true,
        validation_status: "pending",
      });

    if (versionError) {
      console.error("[plans/upload] plan_versions insert error:", versionError);
      return NextResponse.json({
        success: true,
        plan_id: plan.id,
        warning: "Plan created but version record failed",
      });
    }

    return NextResponse.json({
      success: true,
      plan_id: plan.id,
    });
  } catch (error: unknown) {
    console.error("[plans/upload] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
