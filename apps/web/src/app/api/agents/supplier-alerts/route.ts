import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/agents/supplier-alerts
 * Lists supplier alerts for the current user's organization.
 * Query params:
 *   - status: 'active' | 'acknowledged' | 'resolved' | 'dismissed' (default: 'active')
 *   - alert_type: 'critical' | 'warning' | 'info' | 'opportunity' (optional)
 *   - supplier_id: UUID (optional)
 *   - limit: number (default: 50, max: 100)
 *
 * PATCH /api/agents/supplier-alerts
 * Update alert status (acknowledge, resolve, dismiss).
 * Body: { alert_id, status }
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
  const status = url.searchParams.get("status") || "active";
  const alertType = url.searchParams.get("alert_type");
  const supplierId = url.searchParams.get("supplier_id");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  let query = (admin as any)
    .from("supplier_alerts")
    .select(`
      id,
      supplier_id,
      alert_type,
      category,
      title,
      description,
      data,
      recommended_action,
      status,
      acknowledged_at,
      acknowledged_by,
      agent_session_id,
      created_at,
      updated_at
    `)
    .eq("organization_id", profile.organization_id)
    .eq("status", status)
    .order("alert_type", { ascending: true }) // critical first
    .order("created_at", { ascending: false })
    .limit(limit);

  if (alertType) query = query.eq("alert_type", alertType);
  if (supplierId) query = query.eq("supplier_id", supplierId);

  const { data: alerts, error } = await query;

  if (error) {
    console.error("[api/agents/supplier-alerts] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with supplier info
  if (alerts && alerts.length > 0) {
    const supplierIds = Array.from(new Set<string>(alerts.map((a: any) => a.supplier_id)));

    const { data: suppliers } = await (admin as any)
      .from("suppliers")
      .select("id, company_name, overall_score, response_rate")
      .in("id", supplierIds);

    const supplierMap = new Map((suppliers || []).map((s: any) => [s.id, s]));

    for (const alert of alerts) {
      (alert as any).supplier = supplierMap.get(alert.supplier_id) || null;
    }
  }

  return NextResponse.json({ alerts: alerts || [], count: alerts?.length || 0 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { alert_id, status } = body;

  if (!alert_id || !status) {
    return NextResponse.json({ error: "alert_id and status required" }, { status: 400 });
  }

  const validStatuses = ["active", "acknowledged", "resolved", "dismissed"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: alert } = await (admin as any)
    .from("supplier_alerts")
    .select("id, organization_id")
    .eq("id", alert_id)
    .maybeSingle();

  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  const { data: profile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (alert.organization_id !== profile?.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updateData: Record<string, unknown> = { status };
  if (status === "acknowledged") {
    updateData.acknowledged_at = new Date().toISOString();
    updateData.acknowledged_by = user.id;
  }

  const { error } = await (admin as any)
    .from("supplier_alerts")
    .update(updateData)
    .eq("id", alert_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, alert_id, status });
}
