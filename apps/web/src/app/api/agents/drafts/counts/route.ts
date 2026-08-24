import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/agents/drafts/counts
 * Returns the count of pending email drafts belonging to the CURRENT USER.
 * Kept in sync with GET /api/agents/drafts, which is user-scoped (CAL.H1) —
 * an org-wide count here would show a badge for drafts the user cannot open.
 * Used by Sidebar badge and Mail page filter.
 */
export async function GET() {
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
    return NextResponse.json({ count: 0 });
  }

  const { count, error } = await (admin as any)
    .from("email_drafts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", profile.organization_id)
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (error) {
    console.error("[api/agents/drafts/counts] Error:", error.message);
    return NextResponse.json({ count: 0 });
  }

  return NextResponse.json({ count: count || 0 });
}
