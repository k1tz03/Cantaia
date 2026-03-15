import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/emails/preferences
 * Returns the current user's email preferences (or defaults if none exist).
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

  const DEFAULTS = {
    auto_move_outlook: false,
    auto_dismiss_spam: true,
    auto_dismiss_newsletters: false,
    show_dismissed: false,
    outlook_root_folder_name: "Cantaia",
    outlook_root_folder_id: null,
    default_snooze_hours: 4,
    archive_enabled: false,
    archive_path: null,
  };

  const { data: prefs, error } = await (admin as any)
    .from("email_preferences")
    .select("auto_move_outlook, auto_dismiss_spam, auto_dismiss_newsletters, show_dismissed, outlook_root_folder_name, outlook_root_folder_id, default_snooze_hours, archive_enabled, archive_path")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    // Table may not exist yet (migration 019b not applied) — return defaults gracefully
    console.warn("[emails/preferences] GET error (returning defaults):", error.message);
    return NextResponse.json({ preferences: DEFAULTS, exists: false });
  }

  // Return existing prefs or defaults
  return NextResponse.json({
    preferences: prefs || DEFAULTS,
    exists: !!prefs,
  });
}

/**
 * POST /api/emails/preferences
 * Creates or updates the current user's email preferences.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get user's organization
  const { data: userRow } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Allowed fields
  const allowedFields = [
    "auto_move_outlook",
    "auto_dismiss_spam",
    "auto_dismiss_newsletters",
    "show_dismissed",
    "outlook_root_folder_name",
    "outlook_root_folder_id",
    "default_snooze_hours",
    "archive_enabled",
    "archive_path",
  ];

  const updateData: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updateData[field] = body[field];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  // Upsert preferences
  const { data: prefs, error } = await (admin as any)
    .from("email_preferences")
    .upsert(
      {
        user_id: user.id,
        organization_id: userRow?.organization_id || null,
        ...updateData,
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) {
    // Table may not exist yet (migration 019b not applied)
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json({ error: "La table email_preferences n'existe pas encore. Appliquez la migration 019b." }, { status: 501 });
    }
    console.error("[emails/preferences] POST error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ preferences: prefs });
}
