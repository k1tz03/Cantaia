import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

    let query = (admin as any).from("support_tickets").select("id", { count: "exact", head: true });

    if (isSuperAdmin) {
      // Tickets with new user replies that admin hasn't read
      query = query
        .not("last_user_reply_at", "is", null)
        .or("last_admin_read_at.is.null,last_user_reply_at.gt.last_admin_read_at");
    } else {
      // User's tickets with new admin replies
      query = query
        .eq("user_id", user.id)
        .not("last_admin_reply_at", "is", null)
        .or("last_read_at.is.null,last_admin_reply_at.gt.last_read_at");
    }

    const { count, error } = await query;

    if (error) {
      console.error("[Support] Unread count error:", error);
      return NextResponse.json({ count: 0 });
    }

    return NextResponse.json({ count: count || 0 });
  } catch (error) {
    console.error("[Support] Unread count error:", error);
    return NextResponse.json({ count: 0 });
  }
}
