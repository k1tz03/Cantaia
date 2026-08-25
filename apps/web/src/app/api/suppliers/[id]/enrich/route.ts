import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackApiUsage } from "@cantaia/core/tracking";
import { MODEL_FOR_TASK, classifyAIError } from "@cantaia/core/ai";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { insufficientCreditsResponse } from "@/lib/credits";

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
    // Anti-IDOR contract: unresolvable org attachment → 403 (like the rest of the module).
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Fetch supplier
  const { data: supplier, error: fetchErr } = await (adminClient as any)
    .from("suppliers")
    .select("id, company_name, city, specialties, website, notes, certifications")
    .eq("id", id)
    .eq("organization_id", userOrg.organization_id)
    .maybeSingle();

  if (fetchErr || !supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  // ── Metering ────────────────────────────────────────────
  // The route already TRACKED its cost but never DEBITED it: enrichment ran
  // free of charge for the org. Gate it like every other AI action.
  const { data: enrichOrg } = await (adminClient as any)
    .from("organizations")
    .select("subscription_plan")
    .eq("id", userOrg.organization_id)
    .maybeSingle();

  const usageCheck = await checkUsageLimit(
    adminClient,
    userOrg.organization_id,
    enrichOrg?.subscription_plan || "trial",
    "supplier_enrichment"
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
      },
      { status: 429 }
    );
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
          model: MODEL_FOR_TASK.supplier_enrichment,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          metadata: { supplier_id: id },
        }).catch(() => {});
      }
    );

    // Apply enrichment to supplier record
    const updates: Record<string, any> = {};
    const fieldsEnriched: string[] = [];

    if (result.website_url && !supplier.website) {
      updates.website = result.website_url;
      fieldsEnriched.push("website");
    }
    if (result.company_description && !supplier.notes) {
      updates.notes = result.company_description;
      fieldsEnriched.push("notes");
    }
    if (result.certifications_found?.length > 0) {
      const existing = new Set(supplier.certifications || []);
      result.certifications_found.forEach((c: string) => existing.add(c));
      updates.certifications = Array.from(existing);
      fieldsEnriched.push("certifications");
    }
    if (result.specialties_suggested?.length > 0) {
      const existing = new Set(supplier.specialties || []);
      result.specialties_suggested.forEach((s: string) => existing.add(s));
      updates.specialties = Array.from(existing);
      fieldsEnriched.push("specialties");
    }

    // ── Store enrichment metadata (confidence, model, fields enriched) ──
    // Compute enrichment confidence: based on how many fields were found
    const maxPossibleFields = 5; // website, notes, certifications, specialties, contacts
    const foundCount = fieldsEnriched.length + (result.additional_contacts?.length > 0 ? 1 : 0);
    const enrichmentConfidence = Math.min(1.0, foundCount / maxPossibleFields);

    // Fetch existing metadata to merge (column added in migration 110)
    let existingMetadata: Record<string, any> = {};
    {
      const { data: currentSupplier, error: metaErr } = await (adminClient as any)
        .from("suppliers")
        .select("metadata")
        .eq("id", id)
        .eq("organization_id", userOrg.organization_id)
        .maybeSingle();
      if (metaErr) {
        console.warn("[suppliers/enrich] metadata read failed:", metaErr.message);
      } else {
        existingMetadata = currentSupplier?.metadata || {};
      }
    }

    updates.metadata = {
      ...existingMetadata,
      last_enrichment: {
        date: new Date().toISOString(),
        model: MODEL_FOR_TASK.supplier_enrichment,
        confidence: enrichmentConfidence,
        fields_enriched: fieldsEnriched,
        contacts_found: result.additional_contacts?.length || 0,
        website_found: result.website_found,
        certifications_count: result.certifications_found?.length || 0,
        specialties_suggested_count: result.specialties_suggested?.length || 0,
      },
    };

    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await (adminClient as any)
        .from("suppliers")
        .update(updates)
        .eq("id", id)
        .eq("organization_id", userOrg.organization_id);
      if (updateErr) {
        console.error("[suppliers/enrich] Update failed:", updateErr.message);
        return NextResponse.json(
          { error: "Enrichissement calculé mais non enregistré" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      enrichment: result,
      updates_applied: fieldsEnriched,
      enrichment_confidence: enrichmentConfidence,
    });
  } catch (err: any) {
    console.error("[suppliers/enrich] Error:", err?.message || err);
    const aiErr = classifyAIError(err);
    return NextResponse.json({ error: aiErr.message }, { status: aiErr.status });
  }
}
