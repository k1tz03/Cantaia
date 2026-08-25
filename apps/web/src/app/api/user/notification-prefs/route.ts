import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  NOTIFICATION_EVENTS,
  defaultNotificationPrefs,
  getUserNotificationPrefs,
  sanitizeNotificationPrefs,
} from "@cantaia/core/notifications";

// ============================================================
// GET | PATCH /api/user/notification-prefs
// ============================================================
//
// Backs Settings > Notifications, which stored four toggles in localStorage and
// piloted nothing at all. Preferences now live in `users.notification_prefs`
// (JSONB, migration 092) and are read server-side by every trigger site.
//
// Storage is opt-OUT: only explicit `false` values are persisted, so a user who
// never touched the page keeps receiving everything, and new event types ship
// enabled without a backfill.

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const prefs = await getUserNotificationPrefs(admin, user.id);

  return NextResponse.json({ prefs, events: NOTIFICATION_EVENTS });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = (body as { prefs?: unknown })?.prefs ?? body;
  // Unknown keys are dropped — the column is never a free-form JSON dumpster.
  const clean = sanitizeNotificationPrefs(payload);

  if (Object.keys(clean).length === 0) {
    return NextResponse.json(
      { error: "No known notification preference in payload" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { error } = await (admin as any)
    .from("users")
    .update({ notification_prefs: clean })
    .eq("id", user.id);

  if (error) {
    console.error("[user/notification-prefs] Update error:", error.message);
    const missingColumn = error.message?.includes("does not exist");
    return NextResponse.json(
      {
        error: missingColumn
          ? "Notification preferences are not available yet (migration 092 pending)"
          : "Failed to save notification preferences",
      },
      { status: missingColumn ? 503 : 500 }
    );
  }

  return NextResponse.json({ ok: true, prefs: { ...defaultNotificationPrefs(), ...clean } });
}
