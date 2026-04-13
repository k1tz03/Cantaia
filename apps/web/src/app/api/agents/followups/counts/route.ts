import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/agents/followups/counts
 * Returns counts of pending followup items by urgency.
 * Used by Briefing page and Dashboard cards.
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
    return NextResponse.json({ total: 0, by_urgency: {}, by_type: {} });
  }

  const { data: items, error } = await (admin as any)
    .from("followup_items")
    .select("urgency, followup_type")
    .eq("organization_id", profile.organization_id)
    .eq("status", "pending");

  if (error) {
    console.error("[api/agents/followups/counts] Error:", error.message);
    return NextResponse.json({ total: 0, by_urgency: {}, by_type: {} });
  }

  const byUrgency: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const item of items || []) {
    byUrgency[item.urgency] = (byUrgency[item.urgency] || 0) + 1;
    byType[item.followup_type] = (byType[item.followup_type] || 0) + 1;
  }

  return NextResponse.json({
    total: items?.length || 0,
    by_urgency: byUrgency,
    by_type: byType,
  });
}
