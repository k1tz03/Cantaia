import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/agents/supplier-alerts/counts
 * Returns count of active supplier alerts by type.
 * Used by Sidebar badge on Fournisseurs and Dashboard cards.
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
    return NextResponse.json({ total: 0, by_type: {} });
  }

  const { data: alerts, error } = await (admin as any)
    .from("supplier_alerts")
    .select("alert_type")
    .eq("organization_id", profile.organization_id)
    .eq("status", "active");

  if (error) {
    console.error("[api/agents/supplier-alerts/counts] Error:", error.message);
    return NextResponse.json({ total: 0, by_type: {} });
  }

  const byType: Record<string, number> = {};
  for (const alert of alerts || []) {
    byType[alert.alert_type] = (byType[alert.alert_type] || 0) + 1;
  }

  return NextResponse.json({
    total: alerts?.length || 0,
    by_type: byType,
  });
}
