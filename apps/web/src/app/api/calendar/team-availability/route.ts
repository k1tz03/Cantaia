import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  getTeamSchedules,
  buildTeamAvailability,
} from "@cantaia/core/calendar";

export const maxDuration = 60;

/**
 * GET /api/calendar/team-availability
 * Get team availability for a given date.
 * Query params:
 *   - date (ISO date string, required)
 *   - members (comma-separated user IDs, optional — defaults to org members)
 */
export async function GET(request: NextRequest) {
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
    const date = searchParams.get("date");
    const membersParam = searchParams.get("members");

    if (!date) {
      return NextResponse.json(
        { error: "date query param is required (ISO date)" },
        { status: 400 }
      );
    }

    // If specific members requested, filter
    let memberIds: string[] | null = null;
    if (membersParam) {
      memberIds = membersParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    }

    // Try to get availability via Microsoft Graph schedules API (richer data)
    let graphSchedules: Array<{
      email: string;
      busy_slots: Array<{ start: string; end: string; status: string }>;
    }> | null = null;

    try {
      const tokenResult = await getValidMicrosoftToken(user.id);
      if (!("error" in tokenResult)) {
        // Get org members emails
        let memberQuery = admin
          .from("users")
          .select("id, email, first_name, last_name")
          .eq("organization_id", profile.organization_id);

        if (memberIds?.length) {
          memberQuery = memberQuery.in("id", memberIds);
        }

        const { data: orgMembers } = await memberQuery.limit(15);

        if (orgMembers?.length) {
          const emails = orgMembers
            .map((m: any) => m.email)
            .filter(Boolean);

          const dayStart = `${date}T00:00:00`;
          const dayEnd = `${date}T23:59:59`;

          graphSchedules = await getTeamSchedules(
            tokenResult.accessToken,
            emails,
            dayStart,
            dayEnd
          );
        }
      }
    } catch (graphErr) {
      console.error(
        "[calendar/team-availability] Graph schedules failed, falling back to DB:",
        graphErr
      );
      // Fall through to DB-based availability
    }

    // Build availability from calendar_events DB (always as baseline or fallback)
    const dbAvailability = await buildTeamAvailability(
      admin as any,
      profile.organization_id,
      date
    );

    // If we got Graph schedules, enrich the DB availability with them
    if (graphSchedules?.length) {
      const graphByEmail = new Map(
        graphSchedules.map((s) => [s.email.toLowerCase(), s])
      );

      for (const member of dbAvailability) {
        const graphData = graphByEmail.get(member.email.toLowerCase());
        if (graphData) {
          // Attach graph busy_slots as extra data
          (member as any).graph_busy_slots = graphData.busy_slots;
        }
      }
    }

    return NextResponse.json({
      success: true,
      date,
      availability: dbAvailability,
      source: graphSchedules ? "graph+db" : "db",
    });
  } catch (error) {
    console.error("[calendar/team-availability] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
