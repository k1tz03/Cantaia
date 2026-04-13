import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/agents/drafts
 * Lists email drafts for the current user's organization.
 * Query params:
 *   - status: 'pending' | 'accepted' | 'edited' | 'sent' | 'dismissed' (default: 'pending')
 *   - limit: number (default: 50, max: 100)
 *   - offset: number (default: 0)
 *
 * PATCH /api/agents/drafts
 * Update a draft status (accept, dismiss, edit).
 * Body: { draft_id, status, edited_body? }
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: profile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const url = request.nextUrl;
  const status = url.searchParams.get("status") || "pending";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const { data: drafts, error } = await (admin as any)
    .from("email_drafts")
    .select(`
      id,
      email_record_id,
      project_id,
      subject,
      draft_body,
      draft_tone,
      confidence,
      context_used,
      status,
      reviewed_at,
      sent_at,
      agent_session_id,
      created_at,
      updated_at
    `)
    .eq("organization_id", profile.organization_id)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[api/agents/drafts] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with email info (sender, subject from email_records)
  if (drafts && drafts.length > 0) {
    const emailIds = Array.from(new Set<string>(drafts.map((d: any) => d.email_record_id)));

    const { data: emails } = await (admin as any)
      .from("email_records")
      .select("id, sender_name, sender_email, subject, received_at, project_id")
      .in("id", emailIds);

    const emailMap = new Map((emails || []).map((e: any) => [e.id, e]));

    for (const draft of drafts) {
      const email = emailMap.get(draft.email_record_id);
      (draft as any).email = email || null;
    }
  }

  return NextResponse.json({ drafts: drafts || [], count: drafts?.length || 0 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { draft_id, status, edited_body } = body;

  if (!draft_id || !status) {
    return NextResponse.json({ error: "draft_id and status required" }, { status: 400 });
  }

  const validStatuses = ["pending", "accepted", "edited", "sent", "dismissed"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify ownership
  const { data: draft } = await (admin as any)
    .from("email_drafts")
    .select("id, user_id, organization_id")
    .eq("id", draft_id)
    .maybeSingle();

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  // Verify org membership
  const { data: profile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (draft.organization_id !== profile?.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
  };

  if (edited_body && status === "edited") {
    updateData.draft_body = edited_body;
  }

  const { error } = await (admin as any)
    .from("email_drafts")
    .update(updateData)
    .eq("id", draft_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, draft_id, status });
}
