import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_CONFIG = {
  hourly_rate: 95,
  site_location: "",
  departure_location: "",
  margin_level: "standard",
  default_exclusions: [],
  default_scope: "line_by_line",
};

/**
 * GET /api/pricing/config — Get organization's pricing configuration
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const { data: org } = await (adminClient as any)
    .from("organizations")
    .select("pricing_config")
    .eq("id", userOrg.organization_id)
    .maybeSingle();

  return NextResponse.json({
    config: org?.pricing_config || DEFAULT_CONFIG,
  });
}

/**
 * PUT /api/pricing/config — Save organization's pricing configuration
 */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const body = await request.json();
  const { config } = body;

  if (!config) {
    return NextResponse.json({ error: "config required" }, { status: 400 });
  }

  // Validate config shape
  const validated = {
    hourly_rate: Number(config.hourly_rate) || 95,
    site_location: String(config.site_location || ""),
    departure_location: String(config.departure_location || ""),
    margin_level: ["tight", "standard", "comfortable"].includes(config.margin_level) ? config.margin_level : "standard",
    default_exclusions: Array.isArray(config.default_exclusions) ? config.default_exclusions : [],
    default_scope: ["general", "line_by_line"].includes(config.default_scope) ? config.default_scope : "line_by_line",
  };

  const { error } = await (adminClient as any)
    .from("organizations")
    .update({ pricing_config: validated })
    .eq("id", userOrg.organization_id);

  if (error) {
    console.error("[pricing/config] Update error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ success: true, config: validated });
}
