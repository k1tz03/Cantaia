import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * GET /api/organization/branding
 * Returns current branding settings for the user's organization.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 404 });
  }

  const { data: org, error } = await admin
    .from("organizations")
    .select(
      "id, name, logo_url, logo_dark_url, primary_color, secondary_color, sidebar_color, accent_color, custom_name, favicon_url, branding_enabled, subscription_plan"
    )
    .eq("id", userRow.organization_id)
    .maybeSingle();

  if (error || !org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  return NextResponse.json({ branding: org });
}

/**
 * POST /api/organization/branding
 * Updates branding settings (colors, custom_name, branding_enabled).
 */
export async function POST(request: NextRequest) {
  console.log("[branding] Updating branding settings...");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 404 });
  }

  const orgId = userRow.organization_id;

  // Check plan
  const { data: org } = await admin
    .from("organizations")
    .select("subscription_plan")
    .eq("id", orgId)
    .maybeSingle();

  if (
    org &&
    org.subscription_plan !== "pro" &&
    org.subscription_plan !== "enterprise"
  ) {
    return NextResponse.json(
      { error: "Branding requires Pro or Enterprise plan" },
      { status: 403 }
    );
  }

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const {
    primary_color,
    secondary_color,
    sidebar_color,
    accent_color,
    custom_name,
    branding_enabled,
  } = body;

  // Validate colors
  const colors = { primary_color, secondary_color, sidebar_color, accent_color };
  for (const [key, val] of Object.entries(colors)) {
    if (val !== undefined && !HEX_REGEX.test(val as string)) {
      return NextResponse.json(
        { error: `Invalid color format for ${key}: must be #RRGGBB` },
        { status: 400 }
      );
    }
  }

  // Build update object (only include provided fields)
  const update: Record<string, unknown> = {};
  if (primary_color !== undefined) update.primary_color = primary_color;
  if (secondary_color !== undefined) update.secondary_color = secondary_color;
  if (sidebar_color !== undefined) update.sidebar_color = sidebar_color;
  if (accent_color !== undefined) update.accent_color = accent_color;
  if (custom_name !== undefined) update.custom_name = custom_name;
  if (branding_enabled !== undefined) update.branding_enabled = branding_enabled;

  const { error: updateErr } = await admin
    .from("organizations")
    .update(update)
    .eq("id", orgId);

  if (updateErr) {
    console.error("[branding] Update error:", updateErr.message);
    return NextResponse.json(
      { error: "Failed to update branding" },
      { status: 500 }
    );
  }

  console.log("[branding] Updated for org:", orgId, update);

  return NextResponse.json({ success: true });
}
