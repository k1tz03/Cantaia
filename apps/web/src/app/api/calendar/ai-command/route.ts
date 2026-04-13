import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  parseCalendarCommand,
  createGraphCalendarEvent,
} from "@cantaia/core/calendar";
import { trackApiUsage } from "@cantaia/core/tracking";
import { checkUsageLimit } from "@cantaia/config/plan-features";

export const maxDuration = 60;

/**
 * POST /api/calendar/ai-command
 * Parse natural language calendar command via Claude Haiku.
 * If action is "create_event", also creates the event in DB (+ Graph push).
 * Body: { command: string }
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
      .select("organization_id, preferred_language")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Check AI usage limit (non-fatal — allow command even if check fails)
    try {
      const { data: orgData } = await admin
        .from("organizations")
        .select("subscription_plan")
        .eq("id", profile.organization_id)
        .single();

      const usageCheck = await checkUsageLimit(
        admin,
        profile.organization_id,
        orgData?.subscription_plan || "trial"
      );
      if (!usageCheck.allowed) {
        return NextResponse.json(
          {
            error: "usage_limit_reached",
            current: usageCheck.current,
            limit: usageCheck.limit,
            required_plan: usageCheck.requiredPlan,
          },
          { status: 429 }
        );
      }
    } catch (limitErr) {
      console.warn("[calendar/ai-command] Usage limit check failed (non-fatal):", limitErr);
    }

    const body = await request.json();
    const { command } = body;

    if (!command?.trim() || command.trim().length < 3) {
      return NextResponse.json(
        { error: "command is required (min 3 chars)" },
        { status: 400 }
      );
    }

    // Gather context for the AI: active projects and team members
    const today = new Date().toISOString().split("T")[0];

    const [projectsResult, membersResult] = await Promise.all([
      admin
        .from("projects")
        .select("id, name")
        .eq("organization_id", profile.organization_id)
        .in("status", ["planning", "active"])
        .limit(20),
      admin
        .from("users")
        .select("id, first_name, last_name, email")
        .eq("organization_id", profile.organization_id)
        .limit(20),
    ]);

    const projectNames = (projectsResult.data || []).map(
      (p: any) => p.name
    );
    const teamMembers = (membersResult.data || []).map((m: any) => ({
      name: `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email,
      email: m.email,
    }));

    const locale = (profile.preferred_language || "fr") as "fr" | "en" | "de";

    // Parse the command via Claude Haiku
    const result = await parseCalendarCommand(command.trim(), {
      userId: user.id,
      orgId: profile.organization_id,
      today,
      projectNames,
      teamMembers,
      locale,
    });

    // Track API usage (fire-and-forget)
    trackApiUsage({
      supabase: admin as any,
      userId: user.id,
      organizationId: profile.organization_id,
      actionType: "calendar_ai_command" as any,
      apiProvider: "anthropic" as any,
      model: "claude-haiku-4-5-20251001",
      metadata: {
        command: command.trim().slice(0, 100),
        action: result.action,
      },
    }).catch(() => {});

    // If the AI returned a create_event action, create the event in DB
    if (result.action === "create_event" && result.event) {
      const eventDTO = result.event;

      // Try to resolve project_id from project name hint
      let resolvedProjectId: string | null = null;
      if ((eventDTO as any).project_id_hint) {
        const hint = (eventDTO as any).project_id_hint.toLowerCase();
        const matchedProject = (projectsResult.data || []).find(
          (p: any) =>
            p.name.toLowerCase().includes(hint) ||
            hint.includes(p.name.toLowerCase())
        );
        if (matchedProject) {
          resolvedProjectId = matchedProject.id;
        }
      }

      // Push to Microsoft Graph if connected
      let outlookEventId: string | null = null;
      let outlookChangeKey: string | null = null;

      try {
        const tokenResult = await getValidMicrosoftToken(user.id);
        if (!("error" in tokenResult)) {
          const graphResult = await createGraphCalendarEvent(
            tokenResult.accessToken,
            eventDTO
          );
          outlookEventId = graphResult.outlookEventId;
          outlookChangeKey = graphResult.changeKey;
        }
      } catch (graphErr) {
        console.error(
          "[calendar/ai-command] Graph push failed (non-fatal):",
          graphErr
        );
      }

      // Insert into DB
      const { data: createdEvent, error: insertError } = await (admin as any)
        .from("calendar_events")
        .insert({
          organization_id: profile.organization_id,
          user_id: user.id,
          project_id: resolvedProjectId,
          title: eventDTO.title,
          description: eventDTO.description || null,
          location: eventDTO.location || null,
          event_type: eventDTO.event_type || "meeting",
          start_at: eventDTO.start_at,
          end_at: eventDTO.end_at,
          all_day: eventDTO.all_day || false,
          timezone: "Europe/Zurich",
          recurrence_rule: null,
          recurrence_end: null,
          parent_event_id: null,
          outlook_event_id: outlookEventId,
          outlook_change_key: outlookChangeKey,
          sync_source: "cantaia",
          last_synced_at: outlookEventId
            ? new Date().toISOString()
            : null,
          color: null,
          ai_suggested: true,
          ai_prep_status: "none",
          ai_prep_data: null,
          status: "confirmed",
        })
        .select()
        .single();

      if (insertError) {
        console.error("[calendar/ai-command] Insert event error:", insertError);
        // Return the AI result anyway, just note that DB insert failed
        return NextResponse.json({
          success: true,
          result,
          event_created: false,
          error_detail: "Failed to save event to database",
        });
      }

      // Insert invitations if attendees were specified
      if (eventDTO.attendees?.length && createdEvent) {
        const invRows: Array<{
          event_id: string;
          attendee_email: string;
          attendee_name: string | null;
          attendee_user_id: string | null;
          response_status: string;
          is_organizer: boolean;
          notified_at: null;
          responded_at: null;
        }> = eventDTO.attendees.map(
          (a: { email: string; name?: string }) => ({
            event_id: createdEvent.id,
            attendee_email: a.email.toLowerCase(),
            attendee_name: a.name || null,
            attendee_user_id: null as string | null,
            response_status: "pending",
            is_organizer: false,
            notified_at: null,
            responded_at: null,
          })
        );

        // Add organizer
        invRows.unshift({
          event_id: createdEvent.id,
          attendee_email: user.email!.toLowerCase(),
          attendee_name: null,
          attendee_user_id: user.id ?? null,
          response_status: "accepted",
          is_organizer: true,
          notified_at: null,
          responded_at: null,
        });

        await (admin as any)
          .from("calendar_invitations")
          .insert(invRows)
          .catch((err: any) => {
            console.error(
              "[calendar/ai-command] Insert invitations error:",
              err
            );
          });
      }

      return NextResponse.json({
        success: true,
        result,
        event_created: true,
        event: createdEvent,
      });
    }

    // For non-create actions, just return the AI result
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("[calendar/ai-command] Error:", error?.message || error);
    console.error("[calendar/ai-command] Stack:", error?.stack?.slice(0, 500));
    return NextResponse.json(
      { error: "Internal server error", detail: error?.message || "Unknown" },
      { status: 500 }
    );
  }
}
