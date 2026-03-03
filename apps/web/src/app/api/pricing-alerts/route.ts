import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/pricing-alerts
 * List pricing alerts for the authenticated user's organization.
 * Optional query param: ?submission_id=... to filter by submission.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // Get user's organization
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const submissionId = searchParams.get("submission_id");

  let query = (adminClient as any)
    .from("pricing_alerts")
    .select("*")
    .eq("organization_id", userOrg.organization_id)
    .order("created_at", { ascending: false });

  if (submissionId) {
    query = query.eq("submission_id", submissionId);
  }

  const { data: alerts, error } = await query;

  if (error) {
    console.error("[pricing-alerts] Query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }

  return NextResponse.json({ alerts: alerts || [] });
}

/**
 * PATCH /api/pricing-alerts
 * Update alert status: resolve or dismiss.
 * Body: { alert_id: string, action: "resolve" | "dismiss" }
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // Get user's organization
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const body = await request.json();
  const { alert_id, action } = body;

  if (!alert_id || !action) {
    return NextResponse.json(
      { error: "alert_id and action are required" },
      { status: 400 }
    );
  }

  if (action !== "resolve" && action !== "dismiss") {
    return NextResponse.json(
      { error: 'action must be "resolve" or "dismiss"' },
      { status: 400 }
    );
  }

  const { error } = await (adminClient as any)
    .from("pricing_alerts")
    .update({
      status: action,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", alert_id)
    .eq("organization_id", userOrg.organization_id);

  if (error) {
    console.error("[pricing-alerts] Update error:", error);
    return NextResponse.json(
      { error: "Failed to update alert" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
