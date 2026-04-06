import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSupplierSearchPrompt, MODEL_FOR_TASK, classifyAIError } from "@cantaia/core/ai";

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
    });

    const response = await anthropic.messages.create({
      model: MODEL_FOR_TASK.supplier_search,
      max_tokens: 4096,
      messages: [
        { role: "user", content: [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }] },
        { role: "assistant", content: '{"suggestions": [' },
      ],
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Prepend the assistant prefill to reconstruct full JSON
    const fullJson = '{"suggestions": [' + rawText;

    // Robust JSON parsing with multiple strategies
    let result: any;
    const cleaned = fullJson.replace(/,\s*([\]}])/g, "$1").trim();
    try {
      result = JSON.parse(cleaned);
    } catch {
      // If truncated, try closing the JSON
      let fixed = cleaned;
      if (!fixed.endsWith("}")) fixed += "}";
      if (!fixed.includes("]}")) fixed = fixed.replace(/\]?\s*\}?\s*$/, "]}");
      try {
        result = JSON.parse(fixed);
      } catch {
        // Last resort: extract individual suggestion objects
        const objects: any[] = [];
        const regex = /\{[^{}]*"company_name"[^{}]*\}/g;
        let match;
        while ((match = regex.exec(fullJson)) !== null) {
          try { objects.push(JSON.parse(match[0])); } catch { /* skip malformed */ }
        }
        if (objects.length > 0) {
          result = { suggestions: objects };
        } else {
          throw new SyntaxError("No valid supplier objects found in AI response");
        }
      }
    }

    return NextResponse.json({
      suggestions: result.suggestions || [],
    });
  } catch (err: any) {
    console.error("[suppliers/search] AI search error:", err?.message || err);

    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Failed to parse AI response", suggestions: [] },
        { status: 500 }
      );
    }

    const aiErr = classifyAIError(err);
    return NextResponse.json(
      { error: aiErr.message, suggestions: [] },
      { status: aiErr.status }
    );
  }
}
