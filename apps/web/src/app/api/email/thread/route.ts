import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/email/thread?thread_id=xxx
 * Fetch all emails in a thread (by provider_thread_id).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threadId = request.nextUrl.searchParams.get("thread_id");
  if (!threadId) {
    return NextResponse.json({ error: "thread_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: emails, error } = await (admin as any)
    .from("emails")
    .select("id, subject, from_email, sender_email, from_name, sender_name, body_preview, received_at, has_attachments, project_id, triage_status, classification, ai_summary, provider_thread_id")
    .eq("user_id", user.id)
    .eq("provider_thread_id", threadId)
    .order("received_at", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    emails: emails || [],
    count: emails?.length || 0,
    thread_id: threadId,
  });
}
