import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// POST /api/tracking/events
// ============================================================
// Receives batched activity events from the client-side tracker.
// Validates auth, enriches with org_id, inserts via admin client.

interface IncomingEvent {
  event_type: string;
  page?: string;
  feature?: string;
  action?: string;
  metadata?: Record<string, unknown>;
  session_id?: string;
  duration_ms?: number;
  referrer_page?: string;
}

const MAX_EVENTS = 50;

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse body
    let body: { events?: IncomingEvent[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const events = body.events;
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: "No events" }, { status: 400 });
    }

    if (events.length > MAX_EVENTS) {
      return NextResponse.json(
        { error: `Max ${MAX_EVENTS} events per request` },
        { status: 400 }
      );
    }

    // Get user's organization_id
    const admin = createAdminClient();
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    const orgId = userProfile?.organization_id || null;

    // Prepare rows for insert
    const rows = events.map((evt) => ({
      user_id: user.id,
      organization_id: orgId,
      event_type: evt.event_type || "unknown",
      page: evt.page || null,
      feature: evt.feature || null,
      action: evt.action || null,
      metadata: evt.metadata || null,
      session_id: evt.session_id || null,
      duration_ms: typeof evt.duration_ms === "number" ? evt.duration_ms : null,
      referrer_page: evt.referrer_page || null,
      client_type: "web",
    }));

    // Batch insert via admin client (bypass RLS)
    const { error } = await (admin as any).from("usage_events").insert(rows);

    if (error) {
      console.error("[tracking] Insert error:", error.message);
      // Still return 202 — fire-and-forget from client perspective
    }

    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (err) {
    console.error("[tracking] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
