import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// GET /api/badges
// ============================================================
//
// One authenticated round-trip for every sidebar badge.
//
// The Sidebar used to run FOUR independent 60-second polls
// (/api/mail/decisions?counts_only=true, /api/support/tickets/unread-count,
// /api/agents/drafts/counts, /api/agents/supplier-alerts/counts) — four auth
// round-trips and four `users` lookups per minute per open tab, for four
// numbers that are always rendered together.
//
// Response shape (contract, consumed by the Sidebar):
//   { mail_unread, support_unread, drafts_pending, supplier_alerts }
//
// Every counter degrades to 0 on error: a badge must never break the shell.
// The original endpoints stay in place — other surfaces still call them.

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: profile } = await (admin as any)
    .from("users")
    .select("organization_id, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  const organizationId: string | null = profile?.organization_id ?? null;
  const isSuperAdmin = profile?.is_superadmin === true;

  const [mailUnread, supportUnread, draftsPending, supplierAlerts] = await Promise.all([
    countMailUnread(admin, user.id),
    countSupportUnread(admin, user.id, isSuperAdmin),
    countDraftsPending(admin, user.id, organizationId),
    countSupplierAlerts(admin, organizationId),
  ]);

  return NextResponse.json({
    // Contract keys.
    mail_unread: mailUnread,
    support_unread: supportUnread,
    drafts_pending: draftsPending,
    supplier_alerts: supplierAlerts,
    // camelCase aliases: the Sidebar hook (lib/hooks/use-badges.ts) reads
    // `mail` / `drafts` / `support` / `supplierAlerts`. Serving both shapes
    // costs nothing and avoids a silently-zero badge if the two sides drift.
    mail: mailUnread,
    support: supportUnread,
    drafts: draftsPending,
    supplierAlerts,
  });
}

/** Same metric as /api/mail/decisions?counts_only=true (user-scoped). */
async function countMailUnread(admin: any, userId: string): Promise<number> {
  try {
    const { count, error } = await admin
      .from("email_records")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_processed", false);
    if (error) throw new Error(error.message);
    return count || 0;
  } catch (err) {
    console.error("[api/badges] mail_unread:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/**
 * Same rule as /api/support/tickets/unread-count: PostgREST cannot compare two
 * columns, so the "reply newer than my last read" test happens in JS.
 */
async function countSupportUnread(
  admin: any,
  userId: string,
  isSuperAdmin: boolean
): Promise<number> {
  try {
    let query = admin
      .from("support_tickets")
      .select("id, last_read_at, last_admin_reply_at, last_user_reply_at, last_admin_read_at")
      .neq("status", "closed");

    if (!isSuperAdmin) query = query.eq("user_id", userId);

    const { data: tickets, error } = await query;
    if (error) throw new Error(error.message);

    let count = 0;
    for (const t of tickets || []) {
      if (isSuperAdmin) {
        if (
          t.last_user_reply_at &&
          (!t.last_admin_read_at || new Date(t.last_user_reply_at) > new Date(t.last_admin_read_at))
        ) {
          count++;
        }
      } else if (
        t.last_admin_reply_at &&
        (!t.last_read_at || new Date(t.last_admin_reply_at) > new Date(t.last_read_at))
      ) {
        count++;
      }
    }
    return count;
  } catch (err) {
    console.error("[api/badges] support_unread:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** User-scoped, like GET /api/agents/drafts — an org-wide badge would point at drafts the user cannot open. */
async function countDraftsPending(
  admin: any,
  userId: string,
  organizationId: string | null
): Promise<number> {
  if (!organizationId) return 0;
  try {
    const { count, error } = await admin
      .from("email_drafts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return count || 0;
  } catch (err) {
    console.error("[api/badges] drafts_pending:", err instanceof Error ? err.message : err);
    return 0;
  }
}

async function countSupplierAlerts(admin: any, organizationId: string | null): Promise<number> {
  if (!organizationId) return 0;
  try {
    const { count, error } = await admin
      .from("supplier_alerts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return count || 0;
  } catch (err) {
    console.error("[api/badges] supplier_alerts:", err instanceof Error ? err.message : err);
    return 0;
  }
}
