import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackApiUsage } from "@cantaia/core/tracking";

/**
 * POST /api/suppliers/[id]/enrich
 * AI enrichment of an existing supplier (contacts, certifications, website, etc.)
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
  }

  const adminClient = createAdminClient();

  // Verify user org
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  // Fetch supplier
  const { data: supplier, error: fetchErr } = await (adminClient as any)
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .eq("organization_id", userOrg.organization_id)
    .maybeSingle();

  if (fetchErr || !supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  try {
    const { enrichSupplier } = await import("@cantaia/core/suppliers");

    const result = await enrichSupplier(
      anthropicApiKey,
      {
        company_name: supplier.company_name,
        city: supplier.city || undefined,
        specialties: supplier.specialties || [],
      },
      (usage) => {
        trackApiUsage({
          supabase: adminClient,
          userId: user.id,
          organizationId: userOrg.organization_id!,
          actionType: "supplier_enrichment",
          apiProvider: "anthropic",
          model: "claude-sonnet-4-5-20250929",
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          metadata: { supplier_id: id },
        });
      }
    );

    // Apply enrichment to supplier record
    const updates: Record<string, any> = {};
    if (result.website_url && !supplier.website) {
      updates.website = result.website_url;
    }
    if (result.company_description && !supplier.notes) {
      updates.notes = result.company_description;
    }
    if (result.certifications_found?.length > 0) {
      const existing = new Set(supplier.certifications || []);
      result.certifications_found.forEach((c: string) => existing.add(c));
      updates.certifications = Array.from(existing);
    }
    if (result.specialties_suggested?.length > 0) {
      const existing = new Set(supplier.specialties || []);
      result.specialties_suggested.forEach((s: string) => existing.add(s));
      updates.specialties = Array.from(existing);
    }

    if (Object.keys(updates).length > 0) {
      await (adminClient as any)
        .from("suppliers")
        .update(updates)
        .eq("id", id);
    }

    return NextResponse.json({
      success: true,
      enrichment: result,
      updates_applied: Object.keys(updates),
    });
  } catch (err: any) {
    console.error("[suppliers/enrich] Error:", err);
    return NextResponse.json({ error: err.message || "Enrichment failed" }, { status: 500 });
  }
}
