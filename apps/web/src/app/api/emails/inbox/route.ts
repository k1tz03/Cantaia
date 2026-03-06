import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/emails/inbox
 * Returns all emails for the authenticated user, bypassing RLS via admin client.
 * Supports pagination via ?page=1&limit=50
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Pagination
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const offset = (page - 1) * limit;

  const { data: emails, error, count } = await admin
    .from("email_records")
    .select("id, subject, sender_email, sender_name, received_at, body_preview, project_id, classification, ai_classification_confidence, ai_summary, classification_status, email_category, is_processed, is_read, has_attachments, outlook_message_id, recipients, linked_price_request_id, created_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("received_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[emails/inbox] Error:", error.message);
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
  }

  const response = NextResponse.json({ emails: emails || [] });
  if (count !== null) response.headers.set("X-Total-Count", String(count));
  return response;
}
