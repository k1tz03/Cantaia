import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sendRelanceForRequest } from "@/lib/submissions/relance";

/**
 * POST /api/submissions/[id]/relance
 * Body: { request_id: string, custom_subject?, custom_body? }
 *
 * Sends the follow-up reminder for one price request, in the supplier's own
 * language, and carrying the supplier-portal link so the reminder is actionable
 * instead of being a nudge to write an email back.
 *
 * The core path lives in `@/lib/submissions/relance` (a route.ts may only
 * export HTTP handlers) and is shared with the followups agent — the 24 h
 * anti double-relance guard therefore protects both the button and the cron.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limit = await rateLimit(`relance:user:${user.id}`, { limit: 30, windowSec: 3600 });
    if (!limit.allowed) return rateLimitResponse(limit);

    const admin = createAdminClient();
    const body = await request.json();
    const { request_id, custom_subject, custom_body } = body;

    if (!request_id) {
      return NextResponse.json({ error: "request_id required" }, { status: 400 });
    }

    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const outcome = await sendRelanceForRequest({
      admin,
      userId: user.id,
      organizationId: profile.organization_id,
      submissionId,
      requestId: request_id,
      customSubject: custom_subject,
      customBody: custom_body,
    });

    if (!outcome.ok) {
      const status =
        outcome.reason === "not_found"
          ? 404
          : outcome.reason === "forbidden"
            ? 403
            : outcome.reason === "too_soon"
              ? 429
              : 400;
      const message =
        outcome.reason === "not_found"
          ? "Price request not found"
          : outcome.reason === "already_responded"
            ? "Already responded"
            : outcome.reason === "no_email"
              ? "Supplier has no email"
              : outcome.reason === "invalid_status"
                ? "Cette demande ne peut pas être relancée (jamais envoyée ou clôturée)"
                : outcome.reason === "too_soon"
                  ? "Une relance a déjà été envoyée il y a moins de 24 h"
                  : "Forbidden";
      return NextResponse.json(
        {
          error: message,
          reason: outcome.reason,
          ...(outcome.retry_after_sec ? { retry_after_sec: outcome.retry_after_sec } : {}),
        },
        {
          status,
          ...(outcome.reason === "too_soon" && outcome.retry_after_sec
            ? { headers: { "Retry-After": String(outcome.retry_after_sec) } }
            : {}),
        }
      );
    }

    return NextResponse.json({
      success: true,
      sent: outcome.sent,
      relance_count: outcome.relance_count,
      ...(outcome.error ? { message: outcome.error } : {}),
    });
  } catch (err: any) {
    console.error("[relance] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
