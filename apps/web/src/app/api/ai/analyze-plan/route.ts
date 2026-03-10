import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzePlan, classifyAIError } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";

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

const MAX_FILE_SIZE_MB = 20;

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

    // Fetch plan with versions
    const { data: plan, error: planError } = await (adminClient as any)
      .from("plan_registry")
      .select(`
        id, plan_number, plan_title, discipline, project_id,
        projects(id, name, code),
        plan_versions(id, version_code, version_number, file_url, file_name, file_size, file_type, is_current)
      `)
      .eq("id", plan_id)
      .eq("organization_id", userOrg.organization_id)
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
      // Default to current version
      targetVersion = versions.find((v: PlanVersion) => v.is_current) || versions[0];
    }

    if (!targetVersion || !targetVersion.file_url) {
      return NextResponse.json(
        { error: "No file available for analysis" },
        { status: 404 }
      );
    }

    // Check cache — if analysis already exists for this version, return it
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

    // Download file from Supabase Storage
    if (process.env.NODE_ENV === "development") console.log(`[analyze-plan] Downloading file: ${targetVersion.file_url}`);
    const fileResponse = await fetch(targetVersion.file_url);
    if (!fileResponse.ok) {
      console.error(`[analyze-plan] File download failed: ${fileResponse.status}`);
      return NextResponse.json(
        { error: "Failed to download plan file" },
        { status: 500 }
      );
    }

    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
    const fileSizeMB = fileBuffer.length / (1024 * 1024);

    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      return NextResponse.json(
        { error: `File too large for analysis (${fileSizeMB.toFixed(1)} MB, max ${MAX_FILE_SIZE_MB} MB)` },
        { status: 413 }
      );
    }

    const fileBase64 = fileBuffer.toString("base64");
    const fileMediaType = targetVersion.file_type || "application/pdf";

    if (process.env.NODE_ENV === "development") console.log(`[analyze-plan] File downloaded: ${fileSizeMB.toFixed(1)} MB, type: ${fileMediaType}`);

    // Call Claude Vision
    const startTime = Date.now();
    const project = plan.projects;

    const result = await analyzePlan(
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
          organizationId: userOrg.organization_id!,
          actionType: "plan_analyze",
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

    const durationMs = Date.now() - startTime;
    if (process.env.NODE_ENV === "development") console.log(`[analyze-plan] Analysis completed in ${durationMs}ms`);

    // Store result in plan_analyses table
    const { data: analysis, error: insertError } = await (adminClient as any)
      .from("plan_analyses")
      .insert({
        plan_id,
        plan_version_id: targetVersion.id,
        project_id: plan.project_id,
        organization_id: userOrg.organization_id,
        plan_type_detected: result.plan_type,
        discipline_detected: result.discipline,
        model_used: "claude-sonnet-4-5-20250929",
        analysis_duration_ms: durationMs,
        analysis_result: result,
        summary: result.summary,
        confidence: result.quantities.length > 0 ? 0.85 : 0.5,
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
