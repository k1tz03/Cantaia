import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzePlan, classifyAIError, MODEL_FOR_TASK, PlanAnalysisError } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { insufficientCreditsResponse } from "@/lib/credits";
import { grantCredits } from "@/lib/credits";

interface PlanVersion {
  id: string;
  version_code: string;
  version_number: number;
  file_url: string | null;
  file_name: string;
  file_size: number;
  file_type: string;
  is_current: boolean;
}

export const maxDuration = 300;

const MAX_FILE_SIZE_MB = 20;
const PLAN_ANALYZE_ACTION = "plan_analyze";

/**
 * Télécharge le fichier d'un plan depuis Supabase Storage — anti-SSRF.
 *
 * `file_url` est une donnée persistée qui, avant ce correctif, était `fetch()`
 * telle quelle côté serveur : n'importe quelle URL (métadonnées cloud interne,
 * service local) pouvait être lue et renvoyée au modèle. On EXIGE désormais que
 * l'URL désigne un objet de notre Storage (buckets internes), on parse
 * bucket+chemin et on lit via `storage.download()` (service role, fonctionne
 * même bucket privé). Toute autre origine est REFUSÉE — pas de fetch arbitraire.
 */
async function downloadPlanFile(
  admin: any,
  fileUrl: string
): Promise<{ buffer: Buffer } | { error: string }> {
  const match = fileUrl.match(
    /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/?]+)\/(.+?)(?:\?|$)/
  );

  if (!match) {
    return { error: "invalid_file_reference" };
  }

  const ALLOWED_BUCKETS = new Set(["plans", "submissions"]);
  const bucketName = match[1];
  if (!ALLOWED_BUCKETS.has(bucketName)) {
    return { error: "file_reference_not_allowed" };
  }

  let objectPath = match[2];
  try {
    objectPath = decodeURIComponent(objectPath);
  } catch {
    /* déjà décodé */
  }

  const { data, error } = await admin.storage.from(bucketName).download(objectPath);
  if (error || !data) {
    return { error: `storage_download_failed: ${error?.message ?? "unknown"}` };
  }
  return { buffer: Buffer.from(await data.arrayBuffer()) };
}

/**
 * POST /api/ai/analyze-plan
 * Analyze a construction plan using Claude Vision.
 * Request body: { plan_id: string, version_id?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { plan_id, version_id } = body;

    if (!plan_id) {
      return NextResponse.json(
        { error: "plan_id is required" },
        { status: 400 }
      );
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
    const organizationId: string = userOrg.organization_id;

    // Fetch plan with versions (org-scoped — anti-IDOR)
    const { data: plan, error: planError } = await (adminClient as any)
      .from("plan_registry")
      .select(`
        id, plan_number, plan_title, discipline, project_id,
        projects(id, name, code),
        plan_versions(id, version_code, version_number, file_url, file_name, file_size, file_type, is_current)
      `)
      .eq("id", plan_id)
      .eq("organization_id", organizationId)
      .single();

    if (planError || !plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Select the version to analyze
    const versions: PlanVersion[] = plan.plan_versions || [];
    let targetVersion: PlanVersion | undefined;

    if (version_id) {
      targetVersion = versions.find((v: PlanVersion) => v.id === version_id);
    } else {
      targetVersion = versions.find((v: PlanVersion) => v.is_current) || versions[0];
    }

    if (!targetVersion || !targetVersion.file_url) {
      return NextResponse.json(
        { error: "No file available for analysis" },
        { status: 404 }
      );
    }

    // ── Cache FIRST, debit LATER ──────────────────────────────────────────
    // checkUsageLimit() DÉBITE le solde (side-effect documenté). Le faire avant
    // le lookup cache facturait 10 crédits à CHAQUE consultation d'une analyse
    // déjà en cache. On ne débite donc qu'après avoir constaté l'absence de
    // cache. Le cache ne retient QUE les analyses `completed` (les `failed` en
    // sont exclues, si bien qu'un échec ne bloque pas les tentatives suivantes).
    const { data: existingAnalysis } = await (adminClient as any)
      .from("plan_analyses")
      .select("*")
      .eq("plan_version_id", targetVersion.id)
      .eq("status", "completed")
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingAnalysis && !body.force) {
      if (process.env.NODE_ENV === "development") console.log(`[analyze-plan] Returning cached analysis for version ${targetVersion.id}`);
      return NextResponse.json({
        success: true,
        analysis: existingAnalysis,
        cached: true,
      });
    }

    // Check AI usage limit (DEBITS credits) — only reached on a cache miss.
    const { data: orgData } = await adminClient
      .from("organizations")
      .select("subscription_plan")
      .eq("id", organizationId)
      .single();

    const usageCheck = await checkUsageLimit(adminClient, organizationId, orgData?.subscription_plan || "trial", PLAN_ANALYZE_ACTION);
    if (!usageCheck.allowed) {
      if (usageCheck.insufficient_credits) {
        return insufficientCreditsResponse(usageCheck.required_credits ?? 1, usageCheck.remaining_credits ?? 0);
      }
      return NextResponse.json(
        { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
        { status: 429 }
      );
    }
    const debited = (usageCheck.required_credits ?? 0) > 0;

    /** Rembourse le débit quand l'analyse n'a rien produit d'exploitable. */
    async function refundOnFailure() {
      if (!debited) return;
      await grantCredits(
        organizationId,
        usageCheck.required_credits ?? 0,
        "refund",
        `analyze-plan:failed:${targetVersion!.id}`,
        user!.id
      );
    }

    // Download file from Supabase Storage (SSRF-safe: internal buckets only)
    const download = await downloadPlanFile(adminClient, targetVersion.file_url);
    if ("error" in download) {
      console.error(`[analyze-plan] File download failed: ${download.error}`);
      await refundOnFailure();
      return NextResponse.json(
        { error: "Failed to download plan file" },
        { status: download.error === "file_reference_not_allowed" || download.error === "invalid_file_reference" ? 400 : 502 }
      );
    }

    const fileBuffer = download.buffer;
    const fileSizeMB = fileBuffer.length / (1024 * 1024);

    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      await refundOnFailure();
      return NextResponse.json(
        { error: `File too large for analysis (${fileSizeMB.toFixed(1)} MB, max ${MAX_FILE_SIZE_MB} MB)` },
        { status: 413 }
      );
    }

    const fileBase64 = fileBuffer.toString("base64");
    const fileMediaType = targetVersion.file_type || "application/pdf";

    // Call Claude Vision
    const startTime = Date.now();
    const project = plan.projects;
    const modelUsed = MODEL_FOR_TASK.plan_analysis;

    let result;
    try {
      result = await analyzePlan(
        anthropicApiKey,
        fileBase64,
        fileMediaType,
        {
          plan_title: plan.plan_title,
          plan_number: plan.plan_number,
          discipline_hint: plan.discipline || null,
          project_name: project?.name || "",
          project_code: project?.code || null,
          file_type: fileMediaType,
          file_name: targetVersion.file_name,
        },
        undefined,
        (usage) => {
          trackApiUsage({
            supabase: adminClient as any,
            userId: user.id,
            organizationId,
            actionType: PLAN_ANALYZE_ACTION,
            apiProvider: "anthropic",
            model: usage.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            metadata: {
              plan_id,
              version_id: targetVersion.id,
              file_name: targetVersion.file_name,
            },
          });
        }
      );
    } catch (analysisError: any) {
      // Échec de l'analyse : on persiste `failed` (JAMAIS mis en cache), on
      // rembourse le débit, et on renvoie une erreur explicite au client.
      const errMessage = analysisError?.message || "Analyse impossible";
      console.error("[analyze-plan] Analysis failed:", errMessage);

      await (adminClient as any)
        .from("plan_analyses")
        .insert({
          plan_id,
          plan_version_id: targetVersion.id,
          project_id: plan.project_id,
          organization_id: organizationId,
          model_used: modelUsed,
          analysis_duration_ms: Date.now() - startTime,
          analysis_result: null,
          summary: errMessage,
          confidence: 0,
          warnings: [errMessage],
          status: "failed",
          analyzed_by: user.id,
        });

      await refundOnFailure();

      const classified =
        analysisError instanceof PlanAnalysisError
          ? { message: errMessage, status: 422 }
          : classifyAIError(analysisError);
      return NextResponse.json({ error: classified.message }, { status: classified.status });
    }

    const durationMs = Date.now() - startTime;
    if (process.env.NODE_ENV === "development") console.log(`[analyze-plan] Analysis completed in ${durationMs}ms`);

    // Confidence dérivée de la richesse des quantités (heuristique bornée).
    const confidence = result.quantities.length > 0 ? 0.85 : 0.5;

    // Store result in plan_analyses table
    const { data: analysis, error: insertError } = await (adminClient as any)
      .from("plan_analyses")
      .insert({
        plan_id,
        plan_version_id: targetVersion.id,
        project_id: plan.project_id,
        organization_id: organizationId,
        plan_type_detected: result.plan_type,
        discipline_detected: result.discipline,
        model_used: modelUsed,
        analysis_duration_ms: durationMs,
        analysis_result: result,
        summary: result.summary,
        confidence,
        warnings: [],
        status: "completed",
        analyzed_by: user.id,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("[analyze-plan] DB insert error:", insertError);
      // Still return the result even if DB insert fails
      return NextResponse.json({
        success: true,
        analysis: {
          analysis_result: result,
          plan_type_detected: result.plan_type,
          discipline_detected: result.discipline,
          summary: result.summary,
          analysis_duration_ms: durationMs,
          analyzed_at: new Date().toISOString(),
        },
        cached: false,
      });
    }

    return NextResponse.json({
      success: true,
      analysis,
      cached: false,
    });
  } catch (error: any) {
    console.error("[analyze-plan] Error:", error?.message || error);
    const err = classifyAIError(error);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
