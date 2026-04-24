import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPasse5Topology } from "@cantaia/core/plans/scene/passe5-topology";
import {
  canAccess,
  check3dExtractionLimit,
  PLAN_3D_EXTRACT_ACTION,
} from "@cantaia/config/plan-features";
import { trackApiUsage } from "@cantaia/core/tracking";

// Passe 5 is a single Claude Vision call (~15-30s). We use `after()` to run it
// in the background and return 202 immediately, so the handler itself closes
// fast. maxDuration still needs headroom for cold starts + image download +
// Claude latency in the worst case. Mirror the rest of the plans pipeline.
export const maxDuration = 300;

/**
 * POST /api/scenes/extract
 *
 * Kick off a Passe 5 (BuildingScene IR) extraction for a plan.
 *
 * Body:
 *   - plan_id: string (required)
 *   - project_id: string (required; kept for parity with estimate-v2)
 *   - parent_scene_id?: string (optional — chain lineage for re-extractions)
 *
 * Behaviour:
 *   1. Auth (Supabase SSR session).
 *   2. Anti-IDOR: plan_registry.organization_id must match the caller.
 *   3. Feature gate: `canAccess(plan, "visualization3d")` AND
 *      `check3dExtractionLimit` (separate axis from generic aiCalls — see
 *      plan-features.ts for the reasoning).
 *   4. Requires a prior `plan_analyses` row with analysis_type='estimation_v2'
 *      (Passe 1-3 cached). 409 if none — client must run estimation first.
 *   5. Insert a `plan_scenes` row with extraction_status='processing' and
 *      return 202 with `{ scene_id }`.
 *   6. Schedule background work via `after()`:
 *        - Download current plan_version file from Storage, base64-encode.
 *        - Invoke `runPasse5Topology` with the cached Passe 1/2/3.
 *        - On success → UPDATE row to 'completed' + call trackApiUsage.
 *        - On failure → UPDATE row to 'failed' + error_message.
 *
 * The client is expected to poll `GET /api/plans/[id]/scene` for the final
 * scene_data and extraction_status.
 */
export async function POST(request: NextRequest) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 2. Org resolution
  const { data: userOrg } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Hoist the narrowed organization_id into a `string` local. TypeScript
  // does NOT propagate the `userOrg.organization_id` narrowing into the
  // async `after()` closure below (closures can be invoked after further
  // mutations, from TS's POV), so referencing `userOrg.organization_id`
  // inside `after()` re-widens to `string | null`. Capture once here.
  const organizationId: string = userOrg.organization_id;

  // 3. Parse body
  let body: {
    plan_id?: string;
    project_id?: string;
    parent_scene_id?: string | null;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { plan_id, project_id, parent_scene_id } = body;

  if (!plan_id || !project_id) {
    return NextResponse.json(
      { error: "plan_id and project_id are required" },
      { status: 400 }
    );
  }

  // 4. Anti-IDOR: the plan must belong to the caller's org
  const { data: planRow } = await (admin as any)
    .from("plan_registry")
    .select("id, organization_id, project_id")
    .eq("id", plan_id)
    .maybeSingle();

  if (!planRow || planRow.organization_id !== organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 5. Feature gate — two checks in one helper
  const { data: orgData } = await admin
    .from("organizations")
    .select("subscription_plan")
    .eq("id", organizationId)
    .single();

  const plan = orgData?.subscription_plan || "trial";

  if (!canAccess(plan, "visualization3d")) {
    // Redundant with check3dExtractionLimit's feature check, but keeps the
    // 403 shape crisp when the plan is flatly ineligible.
    return NextResponse.json(
      {
        error: "feature_not_in_plan",
        feature: "visualization3d",
        required_plan: "pro",
      },
      { status: 403 }
    );
  }

  const quotaCheck = await check3dExtractionLimit(
    admin,
    organizationId,
    plan
  );
  if (!quotaCheck.allowed) {
    return NextResponse.json(
      {
        error: quotaCheck.reason,
        current: quotaCheck.current,
        limit: quotaCheck.limit,
        required_plan: quotaCheck.requiredPlan,
      },
      { status: quotaCheck.reason === "quota_exceeded" ? 429 : 403 }
    );
  }

  // 6. Optional: validate parent_scene_id is in the same org (lineage must not
  // cross tenants). Null parent_scene_id is fine — that's a fresh extraction.
  if (parent_scene_id) {
    const { data: parentRow } = await (admin as any)
      .from("plan_scenes")
      .select("id, organization_id")
      .eq("id", parent_scene_id)
      .maybeSingle();

    if (!parentRow || parentRow.organization_id !== organizationId) {
      return NextResponse.json(
        { error: "parent_scene_id not found or not in your organization" },
        { status: 403 }
      );
    }
  }

  // 7. Cached passes — we require a prior estimation_v2 run to avoid burning
  // multi-model tokens inside Passe 5. If missing, tell the client to run
  // estimation first.
  const { data: lastAnalysis } = await (admin as any)
    .from("plan_analyses")
    .select("id, result")
    .eq("plan_id", plan_id)
    .eq("analysis_type", "estimation_v2")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pipelineResult = lastAnalysis?.result;
  const passe1 = pipelineResult?.passe1;
  const passe2Consensus = pipelineResult?.consensus_metrage?.metrage_fusionne;
  const passe3 = pipelineResult?.passe3;

  if (!lastAnalysis?.id || !passe1 || !passe2Consensus || !passe3) {
    return NextResponse.json(
      {
        error: "estimation_required",
        message:
          "No estimation_v2 result found for this plan. Run the 4-pass pipeline first.",
      },
      { status: 409 }
    );
  }

  // 8. Current plan_version file (Storage download is deferred to after())
  const { data: version } = await (admin as any)
    .from("plan_versions")
    .select("id, file_url, file_name")
    .eq("plan_id", plan_id)
    .eq("is_current", true)
    .maybeSingle();

  if (!version?.file_url) {
    return NextResponse.json(
      { error: "No current file found for this plan" },
      { status: 404 }
    );
  }

  // 9. Insert the pending scene row — this gives us the scene_id to return
  // immediately and also pins the lineage before we spend any AI tokens.
  const { data: sceneInsert, error: insertErr } = await (admin as any)
    .from("plan_scenes")
    .insert({
      plan_id,
      organization_id: organizationId,
      parent_scene_id: parent_scene_id ?? null,
      schema_version: "1.0.0",
      scene_data: {},
      extraction_status: "processing",
      extracted_by: user.id,
    })
    .select("id")
    .single();

  if (insertErr || !sceneInsert?.id) {
    console.error("[scenes/extract] Failed to insert scene row:", insertErr);
    return NextResponse.json(
      { error: "Failed to create scene row" },
      { status: 500 }
    );
  }

  const sceneId: string = sceneInsert.id;

  // 10. Background processing. `after()` executes after the response is sent
  // but before the serverless function is torn down. maxDuration applies to
  // this whole lifecycle, so we keep headroom at 300s.
  after(async () => {
    const started = Date.now();
    try {
      // 10a. Download plan image from Storage
      const filePath = version.file_url.replace(
        /^.*\/storage\/v1\/object\/public\//,
        ""
      );
      const bucketName = filePath.split("/")[0];
      const objectPath = filePath.split("/").slice(1).join("/");

      const { data: fileData, error: dlError } = await admin.storage
        .from(bucketName || "plans")
        .download(objectPath || filePath);

      if (dlError || !fileData) {
        throw new Error(
          `Failed to download plan file: ${dlError?.message || "no data"}`
        );
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const imageBase64 = buffer.toString("base64");

      // Media-type sniff by extension (mirrors estimate-v2)
      const ext = (version.file_name || "").toLowerCase();
      let mediaType = "image/png";
      if (ext.endsWith(".jpg") || ext.endsWith(".jpeg"))
        mediaType = "image/jpeg";
      else if (ext.endsWith(".png")) mediaType = "image/png";
      else if (ext.endsWith(".gif")) mediaType = "image/gif";
      else if (ext.endsWith(".webp")) mediaType = "image/webp";
      else if (ext.endsWith(".pdf")) mediaType = "application/pdf";

      // 10b. Run Passe 5. This is contractually non-throwing — it returns
      // { scene: null, error } on failure rather than throwing. We still wrap
      // in try/catch to catch anything truly unexpected (dynamic import
      // failures, OOM, etc.).
      const result = await runPasse5Topology({
        passe1,
        passe2: passe2Consensus,
        passe3,
        image_base64: imageBase64,
        media_type: mediaType,
        plan_id,
        // Spike convention: we don't persist passes as separate rows yet, so
        // the upstream ids degenerate to plan_id (same default the pipeline
        // uses internally when the caller omits them). When we persist passes
        // individually in Phase 2, swap these for the real row ids.
        passe1_id: lastAnalysis.id,
        passe2_id: lastAnalysis.id,
        passe3_id: lastAnalysis.id,
      });

      if (!result.scene) {
        // Failure path — `runPasse5Topology` already logs diagnostics.
        await (admin as any)
          .from("plan_scenes")
          .update({
            extraction_status: "failed",
            error_message: result.error || "Passe 5 returned no scene",
          })
          .eq("id", sceneId);
        console.warn(
          `[scenes/extract] scene ${sceneId} failed:`,
          result.error
        );
        return;
      }

      // 10c. Success path — persist scene, confidence, and cost metrics.
      // We compute a simple confidence heuristic from the scene itself (mean
      // of element-level confidences when present); the richer scoring lives
      // in dynamic-confidence.ts and will be folded in during Phase 2.
      const elements =
        (result.scene as any).elements as Array<{ confidence?: number }>;
      const elementConfidences = Array.isArray(elements)
        ? elements
            .map((e) => (typeof e.confidence === "number" ? e.confidence : null))
            .filter((v): v is number => v !== null)
        : [];
      const confidenceScore =
        elementConfidences.length > 0
          ? elementConfidences.reduce((a, b) => a + b, 0) /
            elementConfidences.length
          : null;

      await (admin as any)
        .from("plan_scenes")
        .update({
          scene_data: result.scene,
          extraction_status: "completed",
          confidence_score: confidenceScore,
          model_divergence: result.model_divergence,
          extracted_at: new Date().toISOString(),
          tokens_used: result.tokens_used,
        })
        .eq("id", sceneId);

      // 10d. Cost tracking (fire-and-forget; `trackApiUsage` never throws).
      // We attribute the whole token usage to Claude since Passe 5 is a
      // single-provider call in the spike.
      await trackApiUsage({
        supabase: admin,
        userId: user.id,
        organizationId,
        actionType: PLAN_3D_EXTRACT_ACTION,
        apiProvider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        // The topology pass returns a single aggregate — we don't get an
        // input/output split from the SDK wrapper. Accept a rough 80/20 split
        // which matches Claude Vision's typical ratio for image → structured
        // JSON. If we later surface separate counts from the wrapper, replace
        // this with the exact values.
        inputTokens: Math.round(result.tokens_used * 0.8),
        outputTokens: Math.round(result.tokens_used * 0.2),
        metadata: {
          scene_id: sceneId,
          plan_id,
          project_id,
          duration_ms: Date.now() - started,
          model_divergence: result.model_divergence,
        },
      });

      console.log(
        `[scenes/extract] scene ${sceneId} completed in ${
          Date.now() - started
        }ms, tokens=${result.tokens_used}`
      );
    } catch (err) {
      const errMessage =
        err instanceof Error ? err.message : "Unknown error in Passe 5";
      console.error(`[scenes/extract] scene ${sceneId} crashed:`, err);
      await (admin as any)
        .from("plan_scenes")
        .update({
          extraction_status: "failed",
          error_message: errMessage,
        })
        .eq("id", sceneId);
    }
  });

  // 11. 202 Accepted — client polls GET /api/plans/[id]/scene for completion.
  return NextResponse.json(
    {
      scene_id: sceneId,
      plan_id,
      extraction_status: "processing",
      parent_scene_id: parent_scene_id ?? null,
    },
    { status: 202 }
  );
}
