import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("is_superadmin")
      .eq("id", user.id)
      .single();

    const isSuperAdmin = profile?.is_superadmin === true;

    // PostgREST cannot compare two columns, so fetch and count in JS
    let query = (admin as any)
      .from("support_tickets")
      .select("id, last_read_at, last_admin_reply_at, last_user_reply_at, last_admin_read_at");

    if (!isSuperAdmin) {
      query = query.eq("user_id", user.id);
    }

    // Only fetch non-closed tickets for performance
    query = query.neq("status", "closed");

    const { data: tickets, error } = await query;

    if (error) {
      console.error("[Support] Unread count error:", error);
      return NextResponse.json({ count: 0 });
    }

    let count = 0;
    for (const t of tickets || []) {
      if (isSuperAdmin) {
        // Ticket has new user reply that admin hasn't read
        if (t.last_user_reply_at && (!t.last_admin_read_at || new Date(t.last_user_reply_at) > new Date(t.last_admin_read_at))) {
          count++;
        }
      } else {
        // User's ticket has new admin reply they haven't read
        if (t.last_admin_reply_at && (!t.last_read_at || new Date(t.last_admin_reply_at) > new Date(t.last_read_at))) {
          count++;
        }
      }
    }

    return NextResponse.json({ count });
  } catch (error) {
    console.error("[Support] Unread count error:", error);
    return NextResponse.json({ count: 0 });
  }
}
