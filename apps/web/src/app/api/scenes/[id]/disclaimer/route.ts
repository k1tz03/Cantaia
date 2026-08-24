import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/scenes/:id/disclaimer
 *
 * Consigne l'acceptation du disclaimer « visualisation indicative — non
 * contractuelle » (bouclier de responsabilité SIA, migration 076).
 *
 * Jusqu'ici la table `ai_disclaimer_acceptance` n'était JAMAIS écrite :
 * l'acceptation vivait dans un `useState` du SceneViewer, perdu au moindre
 * rafraîchissement. Le registre légal était donc vide — exactement ce qu'il
 * ne fallait pas pour un argument de responsabilité.
 *
 * Colonnes (076) : user_id, organization_id, feature, scene_id,
 * disclaimer_version, accepted_at (default now), ip_address, user_agent.
 *
 * Sécurité :
 *   - Auth Supabase SSR.
 *   - Anti-IDOR : la scène doit appartenir à l'organisation de l'appelant.
 *   - `user_id` vient TOUJOURS de la session, jamais du body.
 */

/**
 * Version du texte du disclaimer accepté. À incrémenter à chaque révision
 * juridique du contenu de `LowConfidenceGate` (messages `scene3d.gate.*`) —
 * c'est ce qui permet de détecter les acceptations périmées et de forcer une
 * ré-acceptation.
 */
const DISCLAIMER_VERSION = "1.0.0";
const DISCLAIMER_FEATURE = "visualization3d";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sceneId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: userOrg } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Anti-IDOR : la scène doit être dans l'org de l'appelant.
  const { data: scene, error: sceneErr } = await (admin as any)
    .from("plan_scenes")
    .select("id, organization_id")
    .eq("id", sceneId)
    .maybeSingle();

  if (sceneErr) {
    console.error("[scenes/:id/disclaimer] scene lookup error:", sceneErr);
    return NextResponse.json({ error: "Failed to fetch scene" }, { status: 500 });
  }

  if (!scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  if (scene.organization_id !== userOrg.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Body optionnel : permet de figer la version acceptée côté client si le
  // texte est versionné ailleurs. Toute autre clé est ignorée.
  let disclaimerVersion = DISCLAIMER_VERSION;
  try {
    const body = await request.json();
    if (typeof body?.disclaimer_version === "string" && body.disclaimer_version.length <= 32) {
      disclaimerVersion = body.disclaimer_version;
    }
  } catch {
    /* body vide — on garde la version par défaut */
  }

  // `x-forwarded-for` peut contenir une chaîne de proxies : on ne garde que
  // l'IP client d'origine, tronquée pour rester raisonnable en base.
  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress = (forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null)
    ?.slice(0, 64) ?? null;
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;

  const { data: inserted, error: insertErr } = await (admin as any)
    .from("ai_disclaimer_acceptance")
    .insert({
      user_id: user.id,
      organization_id: userOrg.organization_id,
      feature: DISCLAIMER_FEATURE,
      scene_id: sceneId,
      disclaimer_version: disclaimerVersion,
      ip_address: ipAddress,
      user_agent: userAgent,
    })
    .select("id, accepted_at")
    .single();

  if (insertErr || !inserted) {
    console.error(
      "[scenes/:id/disclaimer] insert error:",
      insertErr?.message ?? "unknown"
    );
    return NextResponse.json(
      { error: "Failed to record disclaimer acceptance" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      acceptance_id: inserted.id,
      scene_id: sceneId,
      feature: DISCLAIMER_FEATURE,
      disclaimer_version: disclaimerVersion,
      accepted_at: inserted.accepted_at,
    },
    { status: 201 }
  );
}
