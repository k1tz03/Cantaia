import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  collectIntelligenceFeed,
  fetchConstructionWeather,
  buildTeamAvailability,
  computeFreeSlots,
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
    const cityName = searchParams.get("city") || "Genève";

    // CAL — the client has always sent ?date= (it follows the selected day),
    // but the route ignored it and always answered for "now". Navigating to
    // another day showed today's availability and today's free slots.
    const requestedDate = searchParams.get("date");
    const isValidDay = !!requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate);
    const today = isValidDay
      ? requestedDate!
      : // Default to the Europe/Zurich day, not the server's UTC day.
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Zurich",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

    // Run all three data sources in parallel for speed
    const [feedItems, weather, teamAvailability, freeSlots] = await Promise.all([
      collectIntelligenceFeed({
        userId: user.id,
        orgId: profile.organization_id,
        admin: admin as any,
        today,
      }).catch((err) => {
        console.error("[calendar/intelligence] Feed collection error:", err);
        return [];
      }),

      fetchConstructionWeather(lat, lon, cityName).catch((err) => {
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

      // Free slots for the SELECTED day, computed in Europe/Zurich.
      computeFreeSlots(
        admin as any,
        profile.organization_id,
        user.id,
        today
      ).catch((err) => {
        console.error("[calendar/intelligence] Free slots error:", err);
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
      date: today,
      feed: filteredFeed,
      weather,
      teamAvailability,
      freeSlots,
    });
  } catch (error) {
    console.error("[calendar/intelligence] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
