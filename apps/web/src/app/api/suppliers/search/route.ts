import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSupplierSearchPrompt, MODEL_FOR_TASK } from "@cantaia/core/ai";

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

  // Validate required fields
  if (!body.cfc_codes || !Array.isArray(body.cfc_codes) || body.cfc_codes.length === 0) {
    return NextResponse.json(
      { error: "cfc_codes is required and must be a non-empty array" },
      { status: 400 }
    );
  }
  if (!body.specialty || typeof body.specialty !== "string") {
    return NextResponse.json(
      { error: "specialty is required" },
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
    cfc_codes: body.cfc_codes,
    specialty: body.specialty,
    geo_zone: body.geo_zone,
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
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse the JSON response from Claude
    // Handle potential markdown code block wrapping
    const jsonText = text
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    const result = JSON.parse(jsonText);

    return NextResponse.json({
      suggestions: result.suggestions || [],
    });
  } catch (err: unknown) {
    console.error("[suppliers/search] AI search error:", err);

    // Distinguish between JSON parse errors and API errors
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Failed to parse AI response", suggestions: [] },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "AI supplier search failed", suggestions: [] },
      { status: 500 }
    );
  }
}
