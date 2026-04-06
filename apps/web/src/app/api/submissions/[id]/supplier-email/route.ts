import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/submissions/[id]/supplier-email?request_id=xxx
 * Fetches the supplier response email linked to a price request.
 * Looks up via submission_quotes.raw_email_id or by tracking_code in email_records.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;
    const requestId = request.nextUrl.searchParams.get("request_id");
    if (!requestId) {
      return NextResponse.json({ error: "request_id required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Verify user's org owns this submission
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    const { data: submission } = await (admin as any)
      .from("submissions")
      .select("id, project_id, projects!submissions_project_id_fkey(organization_id)")
      .eq("id", submissionId)
      .maybeSingle();

    if (!submission || (submission as any).projects?.organization_id !== userProfile?.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get the price request with tracking code
    const { data: priceRequest } = await (admin as any)
      .from("submission_price_requests")
      .select("id, tracking_code, supplier_id, supplier_name_manual, supplier_email_manual, sent_at")
      .eq("id", requestId)
      .eq("submission_id", submissionId)
      .maybeSingle();

    if (!priceRequest) {
      return NextResponse.json({ error: "Price request not found" }, { status: 404 });
    }

    // Strategy 1: Find email via raw_email_id in submission_quotes
    const { data: quotesWithEmail } = await (admin as any)
      .from("submission_quotes")
      .select("raw_email_id")
      .eq("request_id", requestId)
      .not("raw_email_id", "is", null)
      .limit(1);

    let emailRecord = null;

    if (quotesWithEmail?.[0]?.raw_email_id) {
      const { data: email } = await (admin as any)
        .from("email_records")
        .select("id, subject, sender_email, sender_name, received_at, body_text, body_html, body_preview")
        .eq("id", quotesWithEmail[0].raw_email_id)
        .maybeSingle();
      emailRecord = email;
    }

    // Strategy 2: Search by tracking code in email body/subject
    if (!emailRecord && priceRequest.tracking_code) {
      const safeCode = priceRequest.tracking_code.replace(/[%_,().]/g, "");
      const { data: emails } = await (admin as any)
        .from("email_records")
        .select("id, subject, sender_email, sender_name, received_at, body_text, body_html, body_preview")
        .or(`body_preview.ilike.%${safeCode}%,subject.ilike.%${safeCode}%,body_text.ilike.%${safeCode}%`)
        .order("received_at", { ascending: false })
        .limit(1);

      emailRecord = emails?.[0] || null;
    }

    // Strategy 3: Search by supplier email in recent emails
    if (!emailRecord && priceRequest.supplier_email_manual) {
      const { data: emails } = await (admin as any)
        .from("email_records")
        .select("id, subject, sender_email, sender_name, received_at, body_text, body_html, body_preview")
        .eq("sender_email", priceRequest.supplier_email_manual)
        .order("received_at", { ascending: false })
        .limit(1);

      emailRecord = emails?.[0] || null;
    }

    return NextResponse.json({
      success: true,
      email: emailRecord
        ? {
            id: emailRecord.id,
            subject: emailRecord.subject,
            sender_email: emailRecord.sender_email,
            sender_name: emailRecord.sender_name,
            received_at: emailRecord.received_at,
            body_html: emailRecord.body_html || null,
            body_text: emailRecord.body_text || emailRecord.body_preview || null,
          }
        : null,
      tracking_code: priceRequest.tracking_code,
    });
  } catch (err: any) {
    console.error("[supplier-email] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
