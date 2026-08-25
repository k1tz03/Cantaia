import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { insufficientCreditsResponse } from "@/lib/credits";
import { listOrgUserIds, runQuoteExtraction } from "../_shared/quote-extraction";

export const maxDuration = 120; // PDF analysis can take time

/**
 * POST /api/submissions/receive-quote
 * Called when a tracking code SUB-xxx is found in an incoming email.
 * Extracts prices from the email body AND any PDF/Excel/CSV attachments,
 * including supplier remarks, conditions, and variants.
 *
 * The whole extraction pipeline lives in `../_shared/quote-extraction`
 * (shared with the email sync auto-reception — Next.js route modules must
 * not export anything beyond HTTP verbs + route config).
 *
 * Body: {
 *   tracking_code: string;
 *   email_id?: string;
 *   email_body?: string;
 *   email_subject?: string;
 *   pdf_attachments?: Array<{ filename: string; content_base64: string; content_type: string }>;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const body = await request.json();
    const { tracking_code, email_id, email_body, email_subject, pdf_attachments } = body;

    if (!tracking_code) {
      return NextResponse.json({ error: "tracking_code required" }, { status: 400 });
    }

    // ─── H4: caller must belong to the organization that owns the tracking code ───
    const { data: callerProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!callerProfile?.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const orgId: string = callerProfile.organization_id;

    // Find the price request by tracking code (cast: migration 049 tables)
    const { data: priceRequest } = await (admin as any)
      .from("submission_price_requests")
      .select("*, suppliers(company_name)")
      .eq("tracking_code", tracking_code)
      .maybeSingle();

    if (!priceRequest) {
      return NextResponse.json({ error: "Tracking code not found" }, { status: 404 });
    }

    // Resolve the owning organization: price request → submission → project
    const { data: ownerSubmission } = await (admin as any)
      .from("submissions")
      .select("id, project_id, projects!submissions_project_id_fkey(organization_id)")
      .eq("id", priceRequest.submission_id)
      .maybeSingle();

    const ownerOrgId = (ownerSubmission as any)?.projects?.organization_id;
    if (!ownerOrgId || ownerOrgId !== orgId) {
      // Do not leak whether the tracking code exists for another organization
      return NextResponse.json({ error: "Tracking code not found" }, { status: 404 });
    }

    // Org-scoped email lookup: every email_records query below is restricted to
    // mailboxes belonging to this organization (H4 — previously unscoped, which
    // let one org read another org's supplier emails).
    const orgUserIds = await listOrgUserIds(admin, orgId, user.id);

    // Metering ("offer_parse") happens INSIDE runQuoteExtraction, AFTER the
    // source email/PDF has been located: a request whose source email cannot be
    // found returns 404 WITHOUT debiting credits (previously 5 credits were
    // consumed and then a 400 came back).
    const outcome = await runQuoteExtraction({
      admin,
      orgId,
      actorUserId: user.id,
      orgUserIds,
      priceRequest,
      trackingCode: tracking_code,
      emailBody: email_body,
      emailSubject: email_subject,
      emailId: email_id,
      pdfAttachments: pdf_attachments,
      // Manual extraction: the actor triggered it themselves — do not send
      // them an "offer received" email about their own click.
      notifyActorId: user.id,
    });

    if (!outcome.ok) {
      if (outcome.insufficientCredits) {
        return insufficientCreditsResponse(
          outcome.insufficientCredits.required,
          outcome.insufficientCredits.remaining
        );
      }
      if (outcome.usageLimit) {
        return NextResponse.json(
          {
            error: "usage_limit_reached",
            current: outcome.usageLimit.current,
            limit: outcome.usageLimit.limit,
            required_plan: outcome.usageLimit.requiredPlan,
          },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: outcome.error }, { status: outcome.status ?? 400 });
    }

    return NextResponse.json({ success: true, ...outcome.result });
  } catch (err: any) {
    console.error("[receive-quote] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
