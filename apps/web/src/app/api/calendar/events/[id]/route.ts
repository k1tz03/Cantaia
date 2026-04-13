import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  updateGraphCalendarEvent,
  deleteGraphCalendarEvent,
} from "@cantaia/core/calendar";

export const maxDuration = 60;

/**
 * GET /api/calendar/events/[id]
 * Single event with invitations + meeting_preparations if exists.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Fetch event with IDOR protection
    const { data: event, error } = await (admin as any)
      .from("calendar_events")
      .select("*")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .single();

    if (error || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Fetch invitations
    const { data: invitations } = await (admin as any)
      .from("calendar_invitations")
      .select("*")
      .eq("event_id", id)
      .order("is_organizer", { ascending: false });

    // Fetch meeting preparation if exists
    const { data: meetingPrep } = await (admin as any)
      .from("meeting_preparations")
      .select("*")
      .eq("event_id", id)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();

    // Fetch project info if linked
    let project = null;
    if (event.project_id) {
      const { data: p } = await admin
        .from("projects")
        .select("id, name, code, color")
        .eq("id", event.project_id)
        .single();
      project = p;
    }

    return NextResponse.json({
      success: true,
      event: {
        ...event,
        invitations: invitations || [],
        meeting_prep: meetingPrep || null,
        project,
      },
    });
  } catch (error) {
    console.error("[calendar/events/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/calendar/events/[id]
 * Update event fields. Also update on Graph if outlook_event_id exists.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Verify event belongs to org
    const { data: existing } = await (admin as any)
      .from("calendar_events")
      .select("id, organization_id, outlook_event_id, user_id")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const body = await request.json();

    // Build update object from allowed fields
    const allowedFields = [
      "title",
      "description",
      "location",
      "event_type",
      "start_at",
      "end_at",
      "all_day",
      "project_id",
      "color",
      "status",
      "recurrence_rule",
    ];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Verify project belongs to org if changing project_id
    if (updates.project_id) {
      const { data: project } = await admin
        .from("projects")
        .select("id, organization_id")
        .eq("id", updates.project_id as string)
        .single();

      if (!project || project.organization_id !== profile.organization_id) {
        return NextResponse.json(
          { error: "Project not found or not in your organization" },
          { status: 403 }
        );
      }
    }

    updates.updated_at = new Date().toISOString();

    // Push changes to Microsoft Graph if connected
    if (existing.outlook_event_id && body.sync_to_outlook !== false) {
      try {
        const tokenResult = await getValidMicrosoftToken(existing.user_id);
        if (!("error" in tokenResult)) {
          const graphResult = await updateGraphCalendarEvent(
            tokenResult.accessToken,
            existing.outlook_event_id,
            {
              title: updates.title as string | undefined,
              description: updates.description as string | undefined,
              location: updates.location as string | undefined,
              start_at: updates.start_at as string | undefined,
              end_at: updates.end_at as string | undefined,
              all_day: updates.all_day as boolean | undefined,
            }
          );
          updates.outlook_change_key = graphResult.changeKey;
          updates.last_synced_at = new Date().toISOString();
        }
      } catch (graphErr) {
        console.error(
          "[calendar/events/[id]] Graph update failed (non-fatal):",
          graphErr
        );
      }
    }

    const { data: event, error } = await (admin as any)
      .from("calendar_events")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .select()
      .single();

    if (error) {
      console.error("[calendar/events/[id]] Update error:", error);
      return NextResponse.json(
        { error: "Failed to update event" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, event });
  } catch (error) {
    console.error("[calendar/events/[id]] PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/calendar/events/[id]
 * Soft-delete event by setting status='cancelled'.
 * Also delete on Graph if outlook_event_id exists.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Verify event belongs to org
    const { data: existing } = await (admin as any)
      .from("calendar_events")
      .select("id, organization_id, outlook_event_id, user_id")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Delete from Microsoft Graph if connected
    if (existing.outlook_event_id) {
      try {
        const tokenResult = await getValidMicrosoftToken(existing.user_id);
        if (!("error" in tokenResult)) {
          await deleteGraphCalendarEvent(
            tokenResult.accessToken,
            existing.outlook_event_id
          );
        }
      } catch (graphErr) {
        console.error(
          "[calendar/events/[id]] Graph delete failed (non-fatal):",
          graphErr
        );
      }
    }

    // Soft-delete: set status to cancelled
    const { error } = await (admin as any)
      .from("calendar_events")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("organization_id", profile.organization_id);

    if (error) {
      console.error("[calendar/events/[id]] Delete error:", error);
      return NextResponse.json(
        { error: "Failed to delete event" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[calendar/events/[id]] DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
