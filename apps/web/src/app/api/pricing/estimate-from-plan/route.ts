import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackApiUsage } from "@cantaia/core/tracking";

/**
 * POST /api/pricing/estimate-from-plan
 * Run automatic cost estimation from plan analysis quantities.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
  }

  // Get user's organization
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const body = await request.json();
  const { plan_id, analysis_id, config } = body;

  if (!analysis_id || !config) {
    return NextResponse.json({ error: "analysis_id and config are required" }, { status: 400 });
  }

  // Fetch analysis — verify org ownership
  const { data: analysis } = await (adminClient as any)
    .from("plan_analyses")
    .select("id, plan_id, project_id, organization_id, analysis_result")
    .eq("id", analysis_id)
    .maybeSingle();

  if (!analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  if (analysis.organization_id !== userOrg.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const quantities = analysis.analysis_result?.quantities;
  if (!quantities || quantities.length === 0) {
    return NextResponse.json({ error: "No quantities found in analysis" }, { status: 400 });
  }

  try {
    // Dynamic import to avoid client bundling
    const { estimateFromPlanAnalysis } = await import("@cantaia/core/pricing");

    const estimateResult = await estimateFromPlanAnalysis({
      quantities,
      config,
      organizationId: userOrg.organization_id,
      anthropicApiKey,
      supabase: adminClient,
      onUsage: (usage: { input_tokens: number; output_tokens: number }) => {
        trackApiUsage({
          supabase: adminClient,
          userId: user.id,
          organizationId: userOrg.organization_id!,
          actionType: "price_estimate",
          apiProvider: "anthropic",
          model: "claude-sonnet-4-5-20250929",
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          metadata: { analysis_id, plan_id: analysis.plan_id },
        });
      },
    });

    // Save estimate to DB
    const { data: savedEstimate, error: saveError } = await (adminClient as any)
      .from("plan_estimates")
      .insert({
        plan_id: analysis.plan_id || plan_id,
        plan_analysis_id: analysis_id,
        project_id: analysis.project_id,
        organization_id: userOrg.organization_id,
        config,
        estimate_result: estimateResult,
        subtotal: estimateResult.subtotal,
        margin_total: estimateResult.margin_total,
        transport_cost: estimateResult.transport_cost,
        grand_total: estimateResult.grand_total,
        db_coverage_percent: estimateResult.db_coverage_percent,
        confidence_summary: estimateResult.confidence_summary,
        items_count: estimateResult.line_items.length,
        status: "completed",
        estimated_by: user.id,
      })
      .select()
      .single();

    if (saveError) {
      console.error("[estimate-from-plan] Save error:", saveError);
      // Still return the estimate even if save failed
    }

    return NextResponse.json({
      success: true,
      estimate: estimateResult,
      estimate_id: savedEstimate?.id || null,
    });
  } catch (err: any) {
    console.error("[estimate-from-plan] Error:", err);
    return NextResponse.json({ error: err.message || "Estimation failed" }, { status: 500 });
  }
}
