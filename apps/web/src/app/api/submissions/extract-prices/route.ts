import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPricesFromEmail } from "@cantaia/core/submissions";
import { classifyAIError } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";

/**
 * POST /api/submissions/extract-prices
 * Extract prices from a supplier response email using Claude AI.
 *
 * Body: { email_id: string, submission_id: string }
 */
export async function POST(request: Request) {
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

    const adminClient = createAdminClient();

    // Get user's organization
    const { data: userOrg } = await adminClient
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userOrg?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const body = await request.json();
    const { email_id, submission_id } = body;

    if (!email_id || !submission_id) {
      return NextResponse.json(
        { error: "email_id and submission_id are required" },
        { status: 400 }
      );
    }

    // Fetch the email record to get body
    const { data: emailRecord, error: emailError } = await (adminClient as any)
      .from("email_records")
      .select("id, body_preview, subject, sender_email")
      .eq("id", email_id)
      .eq("user_id", user.id)
      .single();

    if (emailError || !emailRecord) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    // Fetch submission line items
    const { data: lineItems, error: lineItemsError } = await (adminClient as any)
      .from("submission_line_items")
      .select("item_description, quantity, unit")
      .eq("submission_id", submission_id);

    if (lineItemsError) {
      return NextResponse.json(
        { error: "Failed to fetch submission items" },
        { status: 500 }
      );
    }

    const submissionItems = (lineItems || []).map((li: any) => ({
      item: li.item_description || "",
      quantity: li.quantity ?? null,
      unit: li.unit || "",
    }));

    // Call the price extractor
    const result = await extractPricesFromEmail(
      anthropicApiKey,
      emailRecord.body_preview || "",
      submissionItems,
      (usage) => {
        trackApiUsage({
          supabase: adminClient as any,
          userId: user.id,
          organizationId: userOrg.organization_id!,
          actionType: "price_extract",
          apiProvider: "anthropic",
          model: "claude-sonnet-4-5-20250929",
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          metadata: {
            email_id,
            submission_id,
          },
        });
      }
    );

    return NextResponse.json({
      success: true,
      extraction: result,
    });
  } catch (error: any) {
    console.error("[extract-prices] Error:", error?.message || error);
    const aiErr = classifyAIError(error);
    return NextResponse.json({ error: aiErr.message }, { status: aiErr.status });
  }
}
