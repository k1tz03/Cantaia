import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  collectIntelligenceFeed,
  fetchConstructionWeather,
  buildTeamAvailability,
} from "@cantaia/core/calendar";

export const maxDuration = 60;

/**
 * GET /api/calendar/intelligence
 * Get intelligence feed + weather + team availability for the Calendar Hub IA panel.
 * Query params:
 *   - project_id (optional filter)
 *   - lat / lon (optional, default Geneva 46.2044/6.1432)
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
    const projectId = searchParams.get("project_id");
    const lat = parseFloat(searchParams.get("lat") || "46.2044");
    const lon = parseFloat(searchParams.get("lon") || "6.1432");

    const today = new Date().toISOString().split("T")[0];

    // Run all three data sources in parallel for speed
    const [feedItems, weather, teamAvailability] = await Promise.all([
      collectIntelligenceFeed({
        userId: user.id,
        orgId: profile.organization_id,
        admin: admin as any,
        today,
      }).catch((err) => {
        console.error("[calendar/intelligence] Feed collection error:", err);
        return [];
      }),

      fetchConstructionWeather(lat, lon).catch((err) => {
        console.error("[calendar/intelligence] Weather fetch error:", err);
        return null;
      }),

      buildTeamAvailability(
        admin as any,
        profile.organization_id,
        today
      ).catch((err) => {
        console.error(
          "[calendar/intelligence] Team availability error:",
          err
        );
        return [];
      }),
    ]);

    // Filter feed by project_id if requested
    const filteredFeed = projectId
      ? feedItems.filter(
          (item) => !item.project_id || item.project_id === projectId
        )
      : feedItems;

    return NextResponse.json({
      success: true,
      feed: filteredFeed,
      weather,
      teamAvailability,
    });
  } catch (error) {
    console.error("[calendar/intelligence] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
