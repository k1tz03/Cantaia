import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/plans/:id/scene
 *
 * Returns the latest BuildingScene IR (v1.0.0) for a plan (ADR-001 W1-W3).
 *
 * Reads from the `plan_scenes_latest` VIEW (migration 076) which already
 * prefers `extraction_status = 'completed'` and falls back to the most
 * recent of any status when none have completed yet. This makes the
 * endpoint a safe polling target for the POST /api/scenes/extract
 * 202-Accepted flow: clients can long-poll and observe
 * `processing` → `completed | failed` without racing.
 *
 * Security model:
 *   - `createAdminClient()` bypasses RLS, so org scope is ENFORCED
 *     explicitly via `.eq("organization_id", userOrg.organization_id)`.
 *     Dropping that filter = IDOR. Keep it.
 *   - We do NOT pre-verify the plan exists in the user's org before
 *     hitting the VIEW — the org filter on the VIEW query is sufficient
 *     and cheaper (one round-trip). A non-existent plan or a plan in a
 *     different org both resolve to "no row" → 404.
 *
 * Response shape matches the Phase 1 contract in ADR-001 §API:
 *   200 → { scene: { id, scene_data, extraction_status, confidence_score,
 *                    model_divergence, error_message, parent_scene_id,
 *                    schema_version, extracted_at, created_at, updated_at } }
 *   404 → { error: "No scene found" }  (never extracted, or cross-tenant)
 *   401/403/500 as usual.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  // Query the latest-scene VIEW (defined in migration 076).
  //
  // The VIEW's ORDER BY already prefers `extraction_status = 'completed'`
  // and falls back to most-recent-regardless-of-status. That means a
  // client polling after POST /api/scenes/extract will:
  //   - see `processing` while Passe 5 runs (from `after()` background job)
  //   - see `completed` once scene_data is populated
  //   - see `failed` if Passe 5 errored (with error_message populated)
  // …without needing client-side "which row is canonical" logic.
  const { data: scene, error } = await (adminClient as any)
    .from("plan_scenes_latest")
    .select(
      `id, plan_id, organization_id, parent_scene_id, schema_version,
       scene_data, extraction_status, error_message, confidence_score,
       model_divergence, extracted_by, extracted_at, tokens_used,
       cost_chf, created_at, updated_at`
    )
    .eq("plan_id", planId)
    .eq("organization_id", userOrg.organization_id)
    .maybeSingle();

  if (error) {
    console.error("[plans/:id/scene] VIEW query error:", error);
    return NextResponse.json({ error: "Failed to fetch scene" }, { status: 500 });
  }

  if (!scene) {
    // Either the plan has never been extracted, OR the plan exists in a
    // different org. Both cases intentionally return 404 — we do NOT
    // leak existence to cross-tenant callers.
    return NextResponse.json({ error: "No scene found" }, { status: 404 });
  }

  return NextResponse.json({
    scene: {
      id: scene.id,
      plan_id: scene.plan_id,
      parent_scene_id: scene.parent_scene_id,
      schema_version: scene.schema_version,
      scene_data: scene.scene_data,
      extraction_status: scene.extraction_status,
      error_message: scene.error_message,
      confidence_score: scene.confidence_score,
      model_divergence: scene.model_divergence,
      extracted_by: scene.extracted_by,
      extracted_at: scene.extracted_at,
      tokens_used: scene.tokens_used,
      cost_chf: scene.cost_chf,
      created_at: scene.created_at,
      updated_at: scene.updated_at,
    },
  });
}
