import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/agents/followups
 * Lists followup items for the current user's organization.
 * Query params:
 *   - status: 'pending' | 'approved' | 'sent' | 'dismissed' | 'snoozed' (default: 'pending')
 *   - urgency: 'low' | 'medium' | 'high' | 'critical' (optional filter)
 *   - type: followup_type filter (optional)
 *   - project_id: UUID (optional filter)
 *   - limit: number (default: 50, max: 100)
 *
 * PATCH /api/agents/followups
 * Update a followup item status.
 * Body: { followup_id, status, snoozed_until? }
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
  const urgency = url.searchParams.get("urgency");
  const type = url.searchParams.get("type");
  const projectId = url.searchParams.get("project_id");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  let query = (admin as any)
    .from("followup_items")
    .select(`
      id,
      followup_type,
      source_type,
      source_id,
      project_id,
      supplier_id,
      title,
      description,
      urgency,
      suggested_action,
      draft_email_subject,
      draft_email_body,
      recipient_email,
      recipient_name,
      days_overdue,
      status,
      snoozed_until,
      agent_session_id,
      created_at,
      updated_at
    `)
    .eq("organization_id", profile.organization_id)
    .eq("status", status)
    .order("urgency", { ascending: true }) // critical first
    .order("created_at", { ascending: false })
    .limit(limit);

  if (urgency) query = query.eq("urgency", urgency);
  if (type) query = query.eq("followup_type", type);
  if (projectId) query = query.eq("project_id", projectId);

  const { data: followups, error } = await query;

  if (error) {
    console.error("[api/agents/followups] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ followups: followups || [], count: followups?.length || 0 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { followup_id, status, snoozed_until } = body;

  if (!followup_id || !status) {
    return NextResponse.json({ error: "followup_id and status required" }, { status: 400 });
  }

  const validStatuses = ["pending", "approved", "sent", "dismissed", "snoozed"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: `Invalid status` }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify org ownership
  const { data: item } = await (admin as any)
    .from("followup_items")
    .select("id, organization_id")
    .eq("id", followup_id)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "Followup not found" }, { status: 404 });
  }

  const { data: profile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (item.organization_id !== profile?.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updateData: Record<string, unknown> = { status };
  if (status === "snoozed" && snoozed_until) {
    updateData.snoozed_until = snoozed_until;
  }

  const { error } = await (admin as any)
    .from("followup_items")
    .update(updateData)
    .eq("id", followup_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, followup_id, status });
}
