import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/user/profile
 * Returns the authenticated user's profile from the users table.
 * Uses admin client to bypass RLS.
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

  // Try full SELECT first, then fallback to basic columns if some don't exist yet (migrations not applied)
  const FULL_COLUMNS = "id, organization_id, role, first_name, last_name, phone, preferred_language, email, job_title, age_range, gender, avatar_url, outlook_sync_enabled, last_sync_at, microsoft_access_token, briefing_enabled, briefing_time, briefing_email, briefing_projects, is_superadmin";
  const BASIC_COLUMNS = "id, organization_id, role, first_name, last_name, phone, preferred_language, email, avatar_url, outlook_sync_enabled, microsoft_access_token, is_superadmin";
  const MINIMAL_COLUMNS = "id, organization_id, role, first_name, last_name, email, is_superadmin";

  let profile = null;
  for (const columns of [FULL_COLUMNS, BASIC_COLUMNS, MINIMAL_COLUMNS]) {
    const { data, error } = await admin
      .from("users")
      .select(columns)
      .eq("id", user.id)
      .maybeSingle();
    if (!error && data) {
      profile = data;
      break;
    }
    if (!error && !data) {
      // Row doesn't exist at all
      break;
    }
    // If error (column missing), try simpler query
    console.warn(`[user/profile] SELECT failed with columns [${columns.substring(0, 50)}...]:`, error?.message);
  }

  if (!profile) {
    return NextResponse.json({ profile: null, user: { id: user.id } });
  }

  return NextResponse.json({ profile, user: { id: user.id } });
}

/**
 * POST /api/user/profile
 * Updates the authenticated user's briefing preferences.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const admin = createAdminClient();

  // Only allow updating specific briefing fields
  const allowedFields: Record<string, unknown> = {};
  if (typeof body.briefing_enabled === "boolean") allowedFields.briefing_enabled = body.briefing_enabled;
  if (typeof body.briefing_time === "string") allowedFields.briefing_time = body.briefing_time;
  if (typeof body.briefing_email === "boolean") allowedFields.briefing_email = body.briefing_email;
  if (Array.isArray(body.briefing_projects)) allowedFields.briefing_projects = body.briefing_projects;

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await (admin as any)
    .from("users")
    .update(allowedFields)
    .eq("id", user.id);

  if (error) {
    console.error("[user/profile] Update error:", error);
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
