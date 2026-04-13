import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * GET /api/calendar/external
 * List external calendars for the org.
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: calendars, error } = await (admin as any)
      .from("external_calendars")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[calendar/external] List error:", error);
      return NextResponse.json(
        { error: "Failed to fetch external calendars" },
        { status: 500 }
      );
    }

    // Enrich with who added them
    const addedByIds: string[] = Array.from(
      new Set((calendars || []).map((c: any) => c.added_by).filter(Boolean))
    );
    let usersMap: Record<string, any> = {};

    if (addedByIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, first_name, last_name, email")
        .in("id", addedByIds);

      if (users) {
        for (const u of users) {
          usersMap[u.id] = u;
        }
      }
    }

    const enriched = (calendars || []).map((c: any) => {
      const addedByUser = usersMap[c.added_by];
      return {
        ...c,
        added_by_name: addedByUser
          ? `${addedByUser.first_name || ""} ${addedByUser.last_name || ""}`.trim()
          : "",
        added_by_email: addedByUser?.email || "",
      };
    });

    return NextResponse.json({ success: true, calendars: enriched });
  } catch (error) {
    console.error("[calendar/external] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/calendar/external
 * Add an external calendar source.
 * Body: { email: string, display_name: string, source_type: "microsoft_graph" | "ics_url", ics_url?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const body = await request.json();
    const { email, display_name, source_type, ics_url } = body;

    // Validation
    if (!email?.trim()) {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      );
    }
    if (!display_name?.trim()) {
      return NextResponse.json(
        { error: "display_name is required" },
        { status: 400 }
      );
    }
    if (!["microsoft_graph", "ics_url"].includes(source_type)) {
      return NextResponse.json(
        { error: 'source_type must be "microsoft_graph" or "ics_url"' },
        { status: 400 }
      );
    }
    if (source_type === "ics_url" && !ics_url?.trim()) {
      return NextResponse.json(
        { error: "ics_url is required for ics_url source type" },
        { status: 400 }
      );
    }

    // Check for duplicate
    const { data: existing } = await (admin as any)
      .from("external_calendars")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("member_email", email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Calendar for this email already exists" },
        { status: 409 }
      );
    }

    // Assign a color from rotation
    const colors = [
      "#3B82F6",
      "#10B981",
      "#A855F7",
      "#F59E0B",
      "#EF4444",
      "#F97316",
      "#06B6D4",
      "#EC4899",
    ];
    const { count } = await (admin as any)
      .from("external_calendars")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id);
    const colorIndex = (count || 0) % colors.length;

    const { data: calendar, error } = await (admin as any)
      .from("external_calendars")
      .insert({
        organization_id: profile.organization_id,
        added_by: user.id,
        member_email: email.toLowerCase().trim(),
        member_name: display_name.trim(),
        source: source_type === "microsoft_graph" ? "microsoft" : "ics",
        graph_user_id: null,
        ics_url: source_type === "ics_url" ? ics_url.trim() : null,
        color: colors[colorIndex],
        is_active: true,
        last_synced_at: null,
        sync_error: null,
      })
      .select()
      .single();

    if (error) {
      console.error("[calendar/external] Insert error:", error);
      return NextResponse.json(
        { error: "Failed to add external calendar" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, calendar },
      { status: 201 }
    );
  } catch (error) {
    console.error("[calendar/external] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/calendar/external
 * Remove an external calendar. Query param: id
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const calendarId = searchParams.get("id");

    if (!calendarId) {
      return NextResponse.json(
        { error: "id query param is required" },
        { status: 400 }
      );
    }

    // Verify calendar belongs to org (IDOR protection)
    const { data: existing } = await (admin as any)
      .from("external_calendars")
      .select("id, organization_id")
      .eq("id", calendarId)
      .eq("organization_id", profile.organization_id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "External calendar not found" },
        { status: 404 }
      );
    }

    const { error } = await (admin as any)
      .from("external_calendars")
      .delete()
      .eq("id", calendarId)
      .eq("organization_id", profile.organization_id);

    if (error) {
      console.error("[calendar/external] Delete error:", error);
      return NextResponse.json(
        { error: "Failed to delete external calendar" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[calendar/external] DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
