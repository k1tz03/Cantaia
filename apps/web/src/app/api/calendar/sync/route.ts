import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  fetchGraphCalendarEvents,
  graphEventToCalendarEvent,
  extractAttendeesFromGraphEvent,
} from "@cantaia/core/calendar";
import { trackApiUsage } from "@cantaia/core/tracking";

export const maxDuration = 120;

/**
 * POST /api/calendar/sync
 * Trigger Microsoft Graph calendar sync for the current user.
 * Uses delta sync when available (incremental), otherwise full date range.
 */
export async function POST() {
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

    // Get Microsoft token
    const tokenResult = await getValidMicrosoftToken(user.id);
    if ("error" in tokenResult) {
      return NextResponse.json(
        {
          error: "Microsoft not connected",
          detail: tokenResult.error,
        },
        { status: 400 }
      );
    }

    // Get or create sync state
    let { data: syncState } = await (admin as any)
      .from("calendar_sync_state")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!syncState) {
      const { data: newState } = await (admin as any)
        .from("calendar_sync_state")
        .insert({
          user_id: user.id,
          delta_link: null,
          last_sync_at: null,
          sync_status: "syncing",
          error_message: null,
          events_imported: 0,
        })
        .select()
        .single();
      syncState = newState;
    } else {
      // Mark as syncing
      await (admin as any)
        .from("calendar_sync_state")
        .update({ sync_status: "syncing", error_message: null })
        .eq("id", syncState.id);
    }

    // Fetch events from Graph
    const sixMonthsAgo = new Date(
      Date.now() - 180 * 86400000
    ).toISOString();
    const oneYearAhead = new Date(
      Date.now() + 365 * 86400000
    ).toISOString();

    let graphResult;
    try {
      graphResult = await fetchGraphCalendarEvents(
        tokenResult.accessToken,
        {
          deltaLink: syncState?.delta_link || undefined,
          startDate: sixMonthsAgo,
          endDate: oneYearAhead,
        }
      );
    } catch (graphErr: any) {
      console.error("[calendar/sync] Graph fetch error:", graphErr);

      // Update sync state with error
      if (syncState?.id) {
        await (admin as any)
          .from("calendar_sync_state")
          .update({
            sync_status: "error",
            error_message: graphErr.message || "Graph API error",
          })
          .eq("id", syncState.id);
      }

      return NextResponse.json(
        { error: "Failed to fetch calendar from Microsoft" },
        { status: 502 }
      );
    }

    // Upsert events by outlook_event_id
    let imported = 0;
    let updated = 0;

    for (const graphEvent of graphResult.events) {
      try {
        const calendarData = graphEventToCalendarEvent(
          graphEvent,
          user.id,
          profile.organization_id
        );

        // Check if event already exists
        const { data: existingEvent } = await (admin as any)
          .from("calendar_events")
          .select("id, outlook_change_key")
          .eq("outlook_event_id", graphEvent.id)
          .eq("organization_id", profile.organization_id)
          .maybeSingle();

        if (existingEvent) {
          // Only update if change_key differs (event was modified)
          if (existingEvent.outlook_change_key !== graphEvent.changeKey) {
            await (admin as any)
              .from("calendar_events")
              .update({
                ...calendarData,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingEvent.id);
            updated++;
          }
        } else {
          // Insert new event
          const { data: newEvent } = await (admin as any)
            .from("calendar_events")
            .insert(calendarData)
            .select("id")
            .single();

          if (newEvent) {
            imported++;

            // Insert attendees as invitations
            const attendees = extractAttendeesFromGraphEvent(graphEvent);
            if (attendees.length > 0) {
              const invRows = attendees.map((a) => ({
                event_id: newEvent.id,
                attendee_email: a.email,
                attendee_name: a.name,
                attendee_user_id: null,
                response_status: a.response_status,
                is_organizer: a.is_organizer,
                notified_at: null,
                responded_at: null,
              }));

              await (admin as any)
                .from("calendar_invitations")
                .insert(invRows)
                .catch((err: any) => {
                  console.error(
                    "[calendar/sync] Insert invitations error:",
                    err
                  );
                });
            }
          }
        }
      } catch (eventErr) {
        console.error(
          "[calendar/sync] Error processing event:",
          graphEvent.id,
          eventErr
        );
        // Continue with next event
      }
    }

    // Update sync state
    const totalImported = (syncState?.events_imported || 0) + imported;
    await (admin as any)
      .from("calendar_sync_state")
      .update({
        delta_link: graphResult.deltaLink,
        last_sync_at: new Date().toISOString(),
        sync_status: "idle",
        error_message: null,
        events_imported: totalImported,
      })
      .eq("user_id", user.id);

    // Track API usage
    trackApiUsage({
      supabase: admin as any,
      userId: user.id,
      organizationId: profile.organization_id,
      actionType: "calendar_sync" as any,
      apiProvider: "microsoft" as any,
      model: "graph-calendar",
      metadata: {
        events_fetched: graphResult.events.length,
        imported,
        updated,
        has_delta: !!graphResult.deltaLink,
      },
    }).catch(() => {});

    console.log(
      `[calendar/sync] Completed: ${imported} imported, ${updated} updated, ${graphResult.events.length} fetched`
    );

    return NextResponse.json({
      success: true,
      imported,
      updated,
      total_fetched: graphResult.events.length,
      total_events: totalImported,
    });
  } catch (error) {
    console.error("[calendar/sync] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
