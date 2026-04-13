import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/agents/notifications
 * Lists notifications for the current user.
 * Query params:
 *   - unread_only: 'true' to filter unread only (default: false)
 *   - agent_type: filter by agent (optional)
 *   - limit: number (default: 30, max: 100)
 *
 * PATCH /api/agents/notifications
 * Mark notification(s) as read.
 * Body: { notification_ids: string[] } or { mark_all_read: true }
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const url = request.nextUrl;
  const unreadOnly = url.searchParams.get("unread_only") === "true";
  const agentType = url.searchParams.get("agent_type");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "30"), 100);

  let query = (admin as any)
    .from("agent_notifications")
    .select(`
      id,
      agent_type,
      title,
      description,
      metadata,
      read_at,
      created_at
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }
  if (agentType) {
    query = query.eq("agent_type", agentType);
  }

  const { data: notifications, error } = await query;

  if (error) {
    console.error("[api/agents/notifications] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also get unread count for badge
  const { count: unreadCount } = await (admin as any)
    .from("agent_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return NextResponse.json({
    notifications: notifications || [],
    count: notifications?.length || 0,
    unread_count: unreadCount || 0,
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { notification_ids, mark_all_read } = body;

  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (mark_all_read) {
    const { error } = await (admin as any)
      .from("agent_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, marked_all: true });
  }

  if (!notification_ids || !Array.isArray(notification_ids) || notification_ids.length === 0) {
    return NextResponse.json({ error: "notification_ids array required" }, { status: 400 });
  }

  // Verify ownership — only mark user's own notifications
  const { error } = await (admin as any)
    .from("agent_notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .in("id", notification_ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, marked: notification_ids.length });
}
