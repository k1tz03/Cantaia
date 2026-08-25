import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSupplierSearchPrompt, MODEL_FOR_TASK, classifyAIError, callAnthropicWithRetry, parseAIJson } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { insufficientCreditsResponse } from "@/lib/credits";

export const maxDuration = 60;

/**
 * POST /api/suppliers/search
 * AI-powered supplier search using Claude.
 * Body: { cfc_codes: string[], specialty: string, geo_zone: string, project_description?: string }
 * Returns: { suggestions: AISupplierSuggestion[] }
 */
export async function POST(request: NextRequest) {
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

  // ── Metering ────────────────────────────────────────────
  // This route runs a 4096-token Sonnet call. It was billing Anthropic without
  // ever debiting the org or writing an api_usage_logs row.
  const { data: searchOrg } = await (adminClient as any)
    .from("organizations")
    .select("subscription_plan")
    .eq("id", userOrg.organization_id)
    .maybeSingle();

  const usageCheck = await checkUsageLimit(
    adminClient,
    userOrg.organization_id,
    searchOrg?.subscription_plan || "trial",
    "supplier_search"
  );
  if (!usageCheck.allowed) {
    if (usageCheck.insufficient_credits) {
      return insufficientCreditsResponse(
        usageCheck.required_credits ?? 1,
        usageCheck.remaining_credits ?? 0
      );
    }
    return NextResponse.json(
      {
        error: "usage_limit_reached",
        current: usageCheck.current,
        limit: usageCheck.limit,
        required_plan: usageCheck.requiredPlan,
        suggestions: [],
      },
      { status: 429 }
    );
  }

  const body = await request.json();

  // Validate required fields — either cfc_codes or keywords must be provided
  const hasCfcCodes = body.cfc_codes && Array.isArray(body.cfc_codes) && body.cfc_codes.length > 0;
  const hasKeywords = body.keywords && typeof body.keywords === "string" && body.keywords.trim().length > 0;

  if (!hasCfcCodes && !hasKeywords) {
    return NextResponse.json(
      { error: "cfc_codes ou keywords est requis" },
      { status: 400 }
    );
  }
  if (!body.geo_zone || typeof body.geo_zone !== "string") {
    return NextResponse.json(
      { error: "geo_zone is required" },
      { status: 400 }
    );
  }

  // Fetch existing supplier names for this org (to exclude from AI suggestions)
  const { data: existingSuppliers } = await (adminClient as any)
    .from("suppliers")
    .select("company_name")
    .eq("organization_id", userOrg.organization_id)
    .neq("status", "inactive");

  const existingNames = (existingSuppliers || []).map(
    (s: any) => s.company_name as string
  );

  // Build the prompt
  const prompt = buildSupplierSearchPrompt({
    cfc_codes: body.cfc_codes || [],
    specialty: body.specialty || "",
    geo_zone: body.geo_zone,
    keywords: body.keywords || undefined,
    project_description: body.project_description || undefined,
    existing_suppliers: existingNames,
    language: "fr",
  });

  try {
    // Dynamic import to avoid client-side bundling
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 60_000,
      maxRetries: 0, // retries handled by callAnthropicWithRetry
    });

    // No assistant prefill (breaks Sonnet 4.6+/5) and no cache_control on a prompt
    // that is unique to every search (it would add the +25% write surcharge for
    // nothing). The prompt already instructs "Réponds UNIQUEMENT en JSON".
    const response = await callAnthropicWithRetry(() =>
      anthropic.messages.create({
        model: MODEL_FOR_TASK.supplier_search,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      })
    );

    trackApiUsage({
      supabase: adminClient,
      userId: user.id,
      organizationId: userOrg.organization_id,
      actionType: "supplier_search",
      apiProvider: "anthropic",
      model: MODEL_FOR_TASK.supplier_search,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      metadata: {
        geo_zone: body.geo_zone,
        cfc_codes: body.cfc_codes || [],
      },
    }).catch(() => {});

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    const result = parseAIJson<{ suggestions?: any[] }>(rawText);
    if (!result) {
      return NextResponse.json(
        { error: "Failed to parse AI response", suggestions: [] },
        { status: 500 }
      );
    }

    // The model is asked for confidence-scored guesses; only keep the ones it is
    // reasonably sure about (the old core filter lived in dead code).
    const suggestions = (result.suggestions || []).filter(
      (s: any) => (typeof s?.confidence === "number" ? s.confidence : 1) >= 0.5
    );

    return NextResponse.json({ suggestions });
  } catch (err: any) {
    console.error("[suppliers/search] AI search error:", err?.message || err);
    const aiErr = classifyAIError(err);
    return NextResponse.json(
      { error: aiErr.message, suggestions: [] },
      { status: aiErr.status }
    );
  }
}
