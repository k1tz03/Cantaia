import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  updateGraphCalendarEvent,
  deleteGraphCalendarEvent,
  shouldQueuePrep,
} from "@cantaia/core/calendar";

export const maxDuration = 60;

/**
 * The calendar now serves two synthetic id shapes alongside real rows:
 *   • "virt:<source>:<uuid>" — a read-only projection of another module
 *     (submission deadline, PV, task…). It has no row here.
 *   • "<uuid>@<iso>"         — an expanded occurrence of a recurring event.
 *     Reads and writes target the master row.
 */
function resolveEventId(
  raw: string
): { kind: "virtual" } | { kind: "event"; id: string; occurrence: string | null } {
  if (raw.startsWith("virt:")) return { kind: "virtual" };
  const [id, occurrence] = raw.split("@");
  return { kind: "event", id, occurrence: occurrence || null };
}

/** Built per call — a NextResponse body can only be consumed once. */
function virtualEventResponse() {
  return NextResponse.json(
    {
      error: "virtual_event",
      message:
        "Cet élément provient d'un autre module (soumission, PV, tâche…). Ouvrez-le dans son module pour le modifier.",
    },
    { status: 400 }
  );
}

/**
 * GET /api/calendar/events/[id]
 * Single event with invitations + meeting_preparations if exists.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params;
    const resolved = resolveEventId(rawId);
    if (resolved.kind === "virtual") return virtualEventResponse();
    const id = resolved.id;

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
    const { id: rawId } = await params;
    const resolved = resolveEventId(rawId);
    if (resolved.kind === "virtual") return virtualEventResponse();
    const id = resolved.id;

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
      .select("organization_id, role, is_superadmin")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Verify event belongs to org
    const { data: existing } = await (admin as any)
      .from("calendar_events")
      .select(
        "id, organization_id, outlook_event_id, user_id, project_id, event_type, start_at, ai_prep_status, recurrence_rule, recurrence_end, timezone"
      )
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // CAL.M1: only the event owner or an admin/director can modify it
    const isOwner = existing.user_id === user.id;
    const isOrgAdmin =
      profile.role === "admin" ||
      profile.role === "director" ||
      profile.is_superadmin === true;
    if (!isOwner && !isOrgAdmin) {
      return NextResponse.json(
        { error: "Only the event owner or an admin can modify this event" },
        { status: 403 }
      );
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

    // AGT — meeting-prep trigger. Linking a meeting to a project (or moving
    // it into the future) is the moment its prep becomes worth generating.
    // Only ever moves none → pending; a ready/delivered prep is left alone.
    if (
      shouldQueuePrep({
        eventType: (updates.event_type as string) ?? existing.event_type,
        projectId: (updates.project_id as string) ?? existing.project_id,
        startAt: (updates.start_at as string) ?? existing.start_at,
        currentStatus: existing.ai_prep_status,
        now: Date.now(),
      })
    ) {
      updates.ai_prep_status = "pending";
    }

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
              // CAL: the recurrence used to stay local — Outlook kept the
              // stale series (or none at all).
              ...(updates.recurrence_rule !== undefined
                ? {
                    recurrence_rule: updates.recurrence_rule as string | undefined,
                    recurrence_end: existing.recurrence_end || undefined,
                    start_at:
                      (updates.start_at as string | undefined) ?? existing.start_at,
                    timezone: existing.timezone || "Europe/Zurich",
                  }
                : {}),
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
    const { id: rawId } = await params;
    const resolved = resolveEventId(rawId);
    if (resolved.kind === "virtual") return virtualEventResponse();
    const id = resolved.id;

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
      .select("organization_id, role, is_superadmin")
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

    // CAL.M1: only the event owner or an admin/director can cancel it
    const isOwner = existing.user_id === user.id;
    const isOrgAdmin =
      profile.role === "admin" ||
      profile.role === "director" ||
      profile.is_superadmin === true;
    if (!isOwner && !isOrgAdmin) {
      return NextResponse.json(
        { error: "Only the event owner or an admin can delete this event" },
        { status: 403 }
      );
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
