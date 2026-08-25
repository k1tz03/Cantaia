// ============================================================
// Calendar Sync Runner — one user's Outlook ⇄ Cantaia reconciliation
// ============================================================
// Shared by POST /api/calendar/sync (manual) and /api/cron/calendar-sync
// (nightly), so both paths handle deletions, private events, delta-token
// expiry and prep flagging identically.
//
// Dependency-injected: the Supabase admin client and a valid Graph access
// token are passed in, keeping this file free of app imports.

import {
  fetchGraphCalendarEvents,
  graphEventToCalendarEvent,
  extractAttendeesFromGraphEvent,
  isPrivateGraphCalendarEvent,
  GraphCalendarResyncRequiredError,
} from "./calendar-sync";

export interface SyncUserCalendarInput {
  /** Supabase admin client (bypasses RLS). */
  admin: any;
  accessToken: string;
  userId: string;
  orgId: string;
  /** Window for the FIRST (non-delta) sync. Defaults to −180d / +365d. */
  windowStart?: string;
  windowEnd?: string;
  /** Ignore any stored delta link and replay the whole window. */
  forceFull?: boolean;
}

export interface SyncUserCalendarResult {
  imported: number;
  updated: number;
  removed: number;
  skippedPrivate: number;
  totalFetched: number;
  deltaLink: string | null;
  usedDelta: boolean;
  /** Events flagged for the meeting-prep agent during this run. */
  prepQueued: number;
  /** Writes (upserts) that failed and were skipped. */
  failed: number;
}

/**
 * Columns that belong to Cantaia and must survive an Outlook update.
 * Spreading the whole converted payload used to reset `project_id` to null
 * on every remote edit, silently unlinking the event from its project (and
 * with it, the meeting-prep trigger).
 */
const LOCALLY_OWNED_FIELDS = [
  "project_id",
  "ai_suggested",
  "ai_prep_status",
  "ai_prep_data",
  "color",
  "source_type",
  "source_id",
  // sync_source designates who OWNS the row. A Cantaia-created event
  // (sync_source='cantaia') merely pushed a copy to Outlook; letting the
  // converted Graph payload overwrite it with 'outlook' on the first remote
  // retouch would flip ownership and turn the next Outlook deletion into a
  // hard DELETE instead of a soft-cancel. Never let the remote payload win.
  "sync_source",
  // recurrence_end may be set locally (Cantaia UI); the Graph converter
  // always emits null for it, which would wipe a locally-set series end.
  "recurrence_end",
] as const;

export async function syncUserCalendar(
  input: SyncUserCalendarInput
): Promise<SyncUserCalendarResult> {
  const { admin, accessToken, userId, orgId } = input;

  const windowStart =
    input.windowStart || new Date(Date.now() - 180 * 86400000).toISOString();
  const windowEnd =
    input.windowEnd || new Date(Date.now() + 365 * 86400000).toISOString();

  // ── Sync state ────────────────────────────────────────────
  let { data: syncState } = await admin
    .from("calendar_sync_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!syncState) {
    const { data: created, error: createStateError } = await admin
      .from("calendar_sync_state")
      .insert({
        user_id: userId,
        delta_link: null,
        last_sync_at: null,
        sync_status: "syncing",
        error_message: null,
        events_imported: 0,
      })
      .select()
      .single();
    if (createStateError) {
      console.error(
        "[calendar/sync-runner] Create sync state failed:",
        createStateError.message
      );
    }
    syncState = created;
  } else {
    const { error: markSyncingError } = await admin
      .from("calendar_sync_state")
      .update({ sync_status: "syncing", error_message: null })
      .eq("id", syncState.id);
    if (markSyncingError) {
      console.error(
        "[calendar/sync-runner] Mark syncing failed:",
        markSyncingError.message
      );
    }
  }

  const storedDelta: string | null = input.forceFull
    ? null
    : syncState?.delta_link || null;

  // ── Fetch changes ─────────────────────────────────────────
  let graphResult;
  let usedDelta = !!storedDelta;
  try {
    graphResult = await fetchGraphCalendarEvents(accessToken, {
      deltaLink: storedDelta || undefined,
      startDate: windowStart,
      endDate: windowEnd,
    });
  } catch (err) {
    if (err instanceof GraphCalendarResyncRequiredError) {
      // Token invalidated by Graph → replay the full window once.
      console.warn(
        `[calendar/sync-runner] Delta token rejected for ${userId} — full resync.`
      );
      usedDelta = false;
      graphResult = await fetchGraphCalendarEvents(accessToken, {
        startDate: windowStart,
        endDate: windowEnd,
      });
    } else {
      await admin
        .from("calendar_sync_state")
        .update({
          sync_status: "error",
          error_message: err instanceof Error ? err.message : "Graph API error",
        })
        .eq("user_id", userId);
      throw err;
    }
  }

  // ── Apply removals (deleted in Outlook) ──────────────────
  // Before this, a meeting cancelled in Outlook stayed on the Cantaia
  // calendar forever: the sync only ever upserted.
  //
  // Two different treatments, on purpose:
  //   • sync_source = 'outlook'  → the row only exists because Outlook had
  //     it; delete it.
  //   • sync_source = 'cantaia'  → Cantaia owns the event and merely pushed
  //     a copy; soft-cancel instead of destroying local data (project link,
  //     invitations, meeting prep).
  let removed = 0;
  if (graphResult.removedIds.length > 0) {
    // Chunked so a long list cannot blow the URL length of the .in() filter.
    for (let i = 0; i < graphResult.removedIds.length; i += 100) {
      const chunk = graphResult.removedIds.slice(i, i + 100);

      const { error, count } = await admin
        .from("calendar_events")
        .delete({ count: "exact" })
        .eq("organization_id", orgId)
        .eq("user_id", userId)
        .eq("sync_source", "outlook")
        .in("outlook_event_id", chunk);
      if (error) {
        console.warn("[calendar/sync-runner] Removal batch failed:", error.message);
      } else {
        removed += count || 0;
      }

      const { error: cancelError, count: cancelled } = await admin
        .from("calendar_events")
        .update(
          { status: "cancelled", updated_at: new Date().toISOString() },
          { count: "exact" }
        )
        .eq("organization_id", orgId)
        .eq("user_id", userId)
        .neq("sync_source", "outlook")
        .neq("status", "cancelled")
        .in("outlook_event_id", chunk);
      if (cancelError) {
        console.warn(
          "[calendar/sync-runner] Cancel batch failed:",
          cancelError.message
        );
      } else {
        removed += cancelled || 0;
      }
    }
  }

  // ── Upsert changed events ────────────────────────────────
  let imported = 0;
  let updated = 0;
  let skippedPrivate = 0;
  let prepQueued = 0;
  let failed = 0;
  const now = Date.now();

  for (const graphEvent of graphResult.events) {
    try {
      // CAL.H1 — private/personal/confidential events never reach the
      // org-visible table; a previously imported copy is removed.
      if (isPrivateGraphCalendarEvent(graphEvent)) {
        skippedPrivate++;
        await admin
          .from("calendar_events")
          .delete()
          .eq("outlook_event_id", graphEvent.id)
          .eq("organization_id", orgId)
          .eq("sync_source", "outlook");
        continue;
      }

      const calendarData = graphEventToCalendarEvent(graphEvent, userId, orgId);

      const { data: existingEvent } = await admin
        .from("calendar_events")
        .select("id, outlook_change_key, project_id, event_type, ai_prep_status, start_at")
        .eq("outlook_event_id", graphEvent.id)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (existingEvent) {
        if (existingEvent.outlook_change_key === graphEvent.changeKey) continue;

        // Keep the Cantaia-owned fields (project link, AI prep, colour).
        const patch: Record<string, unknown> = {
          ...calendarData,
          updated_at: new Date().toISOString(),
        };
        for (const field of LOCALLY_OWNED_FIELDS) delete patch[field];

        // Prep trigger: a project-linked meeting starting in the future gets
        // queued for the meeting-prep agent (it only ever moves none→pending).
        const nextPrep = shouldQueuePrep({
          eventType: (calendarData.event_type as string) || existingEvent.event_type,
          projectId: existingEvent.project_id,
          startAt: calendarData.start_at,
          currentStatus: existingEvent.ai_prep_status,
          now,
        });
        if (nextPrep) {
          patch.ai_prep_status = "pending";
          prepQueued++;
        }

        const { error: updateError } = await admin
          .from("calendar_events")
          .update(patch)
          .eq("id", existingEvent.id);
        if (updateError) {
          console.error(
            "[calendar/sync-runner] Update failed:",
            graphEvent.id,
            updateError.message
          );
          failed++;
          continue;
        }
        updated++;
        continue;
      }

      const { data: newEvent, error: insertError } = await admin
        .from("calendar_events")
        .insert(calendarData)
        .select("id")
        .single();

      if (insertError || !newEvent) {
        if (insertError) {
          console.error(
            "[calendar/sync-runner] Insert failed:",
            graphEvent.id,
            insertError.message
          );
          failed++;
        }
        continue;
      }
      imported++;

      const attendees = extractAttendeesFromGraphEvent(graphEvent);
      if (attendees.length > 0) {
        const { error: invError } = await admin.from("calendar_invitations").insert(
          attendees.map((a) => ({
            event_id: newEvent.id,
            attendee_email: a.email,
            attendee_name: a.name,
            attendee_user_id: null,
            response_status: a.response_status,
            is_organizer: a.is_organizer,
            notified_at: null,
            responded_at: null,
          }))
        );
        if (invError) {
          console.warn(
            "[calendar/sync-runner] Insert invitations failed:",
            invError.message
          );
        }
      }
    } catch (eventErr) {
      console.error(
        "[calendar/sync-runner] Event failed:",
        graphEvent.id,
        eventErr instanceof Error ? eventErr.message : eventErr
      );
    }
  }

  // ── Persist sync state ───────────────────────────────────
  const totalImported = (syncState?.events_imported || 0) + imported;
  const { error: stateError } = await admin
    .from("calendar_sync_state")
    .update({
      // A null deltaLink means "paging cap reached" — keep the previous token
      // so the next run resumes where this one stopped.
      ...(graphResult.deltaLink ? { delta_link: graphResult.deltaLink } : {}),
      last_sync_at: new Date().toISOString(),
      sync_status: "idle",
      error_message: null,
      events_imported: totalImported,
    })
    .eq("user_id", userId);
  if (stateError) {
    console.error(
      "[calendar/sync-runner] Persist sync state failed:",
      stateError.message
    );
  }

  return {
    imported,
    updated,
    removed,
    skippedPrivate,
    totalFetched: graphResult.events.length,
    deltaLink: graphResult.deltaLink,
    usedDelta,
    prepQueued,
    failed,
  };
}

/**
 * The meeting-prep agent only ever ran against `ai_prep_status IN
 * ('pending','failed')` — a value nothing set, so it never had work.
 * This is the setter: a project-linked meeting in the future moves
 * none → pending exactly once.
 */
export function shouldQueuePrep(params: {
  eventType: string | null | undefined;
  projectId: string | null | undefined;
  startAt: string | null | undefined;
  currentStatus: string | null | undefined;
  now: number;
}): boolean {
  if (params.eventType !== "meeting") return false;
  if (!params.projectId) return false;
  if (params.currentStatus && params.currentStatus !== "none") return false;
  if (!params.startAt) return false;
  const start = new Date(params.startAt).getTime();
  return !isNaN(start) && start > params.now;
}
