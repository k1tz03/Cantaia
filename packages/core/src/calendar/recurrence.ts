// ============================================================
// Recurrence — RRULE ⟷ Microsoft Graph, and read-side expansion
// ============================================================
// `calendar_events.recurrence_rule` stores an RFC 5545 RRULE string.
// Two things were missing:
//   • WRITE: a recurring Cantaia event was pushed to Outlook as a single
//     occurrence (the rule was silently dropped in the Graph payload).
//   • READ: only the master row was returned, so a weekly site meeting
//     appeared once in the week/month grid instead of on every occurrence.
//
// Only the simple patterns actually produced by the product are handled
// (DAILY / WEEKLY[+BYDAY] / MONTHLY, with INTERVAL / UNTIL / COUNT).
// Anything else is left untouched and logged — better one honest master
// row than a wrong expansion.

import type { CalendarEvent } from "./types";

// ── Parsing ────────────────────────────────────────────────

export type RRuleFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface ParsedRRule {
  freq: RRuleFreq;
  interval: number;
  /** 0 = Sunday … 6 = Saturday */
  byDay: number[] | null;
  until: Date | null;
  count: number | null;
  /** Frequencies the expander/pusher do not support (e.g. YEARLY + BYSETPOS). */
  supported: boolean;
}

const DAY_TO_INDEX: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};
const INDEX_TO_GRAPH_DAY = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

export function parseRRule(rule: string | null | undefined): ParsedRRule | null {
  if (!rule || typeof rule !== "string") return null;

  const body = rule.replace(/^RRULE:/i, "").trim();
  if (!body) return null;

  const parts: Record<string, string> = {};
  for (const chunk of body.split(";")) {
    const [k, v] = chunk.split("=");
    if (k && v) parts[k.trim().toUpperCase()] = v.trim();
  }

  const freq = (parts.FREQ || "").toUpperCase() as RRuleFreq;
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;

  const interval = Math.max(1, Number(parts.INTERVAL) || 1);

  let byDay: number[] | null = null;
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(",")
      // Strip an ordinal prefix ("2MO") — unsupported, see `supported` below.
      .map((d) => DAY_TO_INDEX[d.replace(/^[+-]?\d+/, "").toUpperCase()])
      .filter((d) => d !== undefined);
    byDay = days.length ? days : null;
  }

  let until: Date | null = null;
  if (parts.UNTIL) {
    // Accept both "20260930" and "20260930T235959Z"
    const raw = parts.UNTIL;
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(raw);
    if (m) {
      until = new Date(
        Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 23), +(m[5] || 59), +(m[6] || 59))
      );
    } else {
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) until = parsed;
    }
  }

  const count = parts.COUNT ? Number(parts.COUNT) : null;

  // Ordinal BYDAY ("2MO"), BYSETPOS and YEARLY are not expanded — the master
  // row stays visible on its own date instead of being expanded wrongly.
  const hasOrdinalByDay = !!parts.BYDAY && /[+-]?\d/.test(parts.BYDAY);
  const supported =
    (freq === "DAILY" || freq === "WEEKLY" || freq === "MONTHLY") &&
    !parts.BYSETPOS &&
    !hasOrdinalByDay;

  return { freq, interval, byDay, until, count: count && count > 0 ? count : null, supported };
}

// ── Wall-clock helpers (Europe/Zurich) ─────────────────────
// Occurrences must keep their LOCAL time-of-day across DST: a weekly 08:00
// Europe/Zurich meeting stays 08:00 before and after the March/October
// switch. Advancing by fixed UTC increments (setUTCDate/setUTCMonth) drifts
// by ±1h and diverges from Outlook. We therefore iterate on local calendar
// dates and reconvert each to a UTC instant.

const RECURRENCE_ZONE = "Europe/Zurich";

interface WallParts {
  y: number;
  mo: number; // 1-based
  d: number;
  h: number;
  mi: number;
  s: number;
}

/** Wall-clock parts of a UTC instant in Europe/Zurich. */
function wallPartsInZone(utcMs: number): WallParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: RECURRENCE_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  return {
    y: Number(parts.year),
    mo: Number(parts.month),
    d: Number(parts.day),
    h: parts.hour === "24" ? 0 : Number(parts.hour),
    mi: Number(parts.minute),
    s: Number(parts.second),
  };
}

/** UTC instant (ms) for a Europe/Zurich wall-clock time. */
function zoneWallToUtc(w: WallParts): number {
  const target = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  let utc = target;
  for (let i = 0; i < 3; i++) {
    const wp = wallPartsInZone(utc);
    const produced = Date.UTC(wp.y, wp.mo - 1, wp.d, wp.h, wp.mi, wp.s);
    utc += target - produced;
  }
  return utc;
}

/** Day of week (0=Sun…6=Sat) of a local calendar date. */
function localDow(y: number, mo: number, d: number): number {
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

/** Add days to a local calendar date. */
function addLocalDays(
  y: number,
  mo: number,
  d: number,
  days: number
): { y: number; mo: number; d: number } {
  const base = new Date(Date.UTC(y, mo - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return {
    y: base.getUTCFullYear(),
    mo: base.getUTCMonth() + 1,
    d: base.getUTCDate(),
  };
}

/** Add months to a local calendar date, clamping the day to the month length. */
function addLocalMonths(
  y: number,
  mo: number,
  d: number,
  months: number
): { y: number; mo: number; d: number } {
  const total = mo - 1 + months;
  const ny = y + Math.floor(total / 12);
  const nmo0 = ((total % 12) + 12) % 12;
  const daysInMonth = new Date(Date.UTC(ny, nmo0 + 1, 0)).getUTCDate();
  return { y: ny, mo: nmo0 + 1, d: Math.min(d, daysInMonth) };
}

// ── Read-side expansion ────────────────────────────────────

/** Hard cap so a malformed rule cannot generate an unbounded list. */
const MAX_OCCURRENCES = 400;

/**
 * Expand a recurring event into the occurrences overlapping [rangeStart, rangeEnd).
 *
 * The master row is returned as-is (same id); every generated occurrence gets
 * a derived id "<masterId>@<startIso>" and `parent_event_id` set to the master
 * so the UI can tell them apart and route edits to the master.
 */
export function expandRecurringEvent(
  event: CalendarEvent,
  rangeStart: Date,
  rangeEnd: Date
): CalendarEvent[] {
  const parsed = parseRRule(event.recurrence_rule);
  if (!parsed || !parsed.supported) {
    if (event.recurrence_rule && (!parsed || !parsed.supported)) {
      console.warn(
        `[calendar/recurrence] Unsupported RRULE, showing master only: ${event.recurrence_rule}`
      );
    }
    return [event];
  }

  const masterStart = new Date(event.start_at);
  const masterEnd = new Date(event.end_at);
  if (isNaN(masterStart.getTime()) || isNaN(masterEnd.getTime())) return [event];

  const durationMs = Math.max(0, masterEnd.getTime() - masterStart.getTime());

  // Hard stop: whichever of UNTIL / recurrence_end / range end comes first.
  const recurrenceEnd = event.recurrence_end ? new Date(event.recurrence_end) : null;
  const limits = [rangeEnd.getTime()];
  if (parsed.until) limits.push(parsed.until.getTime() + durationMs);
  if (recurrenceEnd && !isNaN(recurrenceEnd.getTime())) {
    limits.push(recurrenceEnd.getTime() + durationMs);
  }
  const stopAt = Math.min(...limits);

  const out: CalendarEvent[] = [];
  let emitted = 0;

  // Master's local wall-clock parts — the time-of-day is preserved for every
  // occurrence (DST-safe), and the calendar date drives the iteration.
  const masterWall = wallPartsInZone(masterStart.getTime());
  const tod = { h: masterWall.h, mi: masterWall.mi, s: masterWall.s };

  const pushOccurrence = (start: Date) => {
    const end = new Date(start.getTime() + durationMs);
    if (end.getTime() < rangeStart.getTime()) return;
    if (start.getTime() >= rangeEnd.getTime()) return;

    // The wall-clock reconstruction is second-precision; the master's stored
    // start may carry sub-second ms. Occurrences are ≥1 day apart, so a match
    // within a minute unambiguously identifies the master — emit it verbatim
    // (exact id + stored instant) instead of a near-duplicate occurrence.
    if (Math.abs(start.getTime() - masterStart.getTime()) < 60_000) {
      out.push(event);
      return;
    }
    out.push({
      ...event,
      id: `${event.id}@${start.toISOString()}`,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      parent_event_id: event.id,
    });
  };

  const occUtcFor = (date: { y: number; mo: number; d: number }): number =>
    zoneWallToUtc({ ...date, ...tod });

  if (parsed.freq === "WEEKLY" && parsed.byDay?.length) {
    // Walk week by week (in local dates), emitting each selected weekday.
    const dow0 = localDow(masterWall.y, masterWall.mo, masterWall.d);
    const weekStart = addLocalDays(masterWall.y, masterWall.mo, masterWall.d, -dow0);
    let weekIndex = 0;

    while (emitted < MAX_OCCURRENCES) {
      const base = addLocalDays(
        weekStart.y,
        weekStart.mo,
        weekStart.d,
        weekIndex * 7 * parsed.interval
      );
      const baseUtc = occUtcFor(base);
      if (baseUtc > stopAt) break;

      for (const dow of parsed.byDay) {
        const dayDate = addLocalDays(base.y, base.mo, base.d, dow);
        const occUtc = occUtcFor(dayDate);
        // −60s tolerance so the master's own reconstructed instant is not
        // skipped by sub-second rounding (see pushOccurrence).
        if (occUtc < masterStart.getTime() - 60_000) continue;
        if (occUtc > stopAt) continue;
        if (parsed.count !== null && emitted >= parsed.count) break;
        pushOccurrence(new Date(occUtc));
        emitted++;
      }
      weekIndex++;
      if (parsed.count !== null && emitted >= parsed.count) break;
      // Safety valve: 400 weeks ≈ 7.5 years.
      if (weekIndex > MAX_OCCURRENCES) break;
    }
  } else {
    let cursor = { y: masterWall.y, mo: masterWall.mo, d: masterWall.d };
    while (emitted < MAX_OCCURRENCES) {
      const occUtc = occUtcFor(cursor);
      if (occUtc > stopAt) break;
      if (parsed.count !== null && emitted >= parsed.count) break;
      pushOccurrence(new Date(occUtc));
      emitted++;

      if (parsed.freq === "DAILY") {
        cursor = addLocalDays(cursor.y, cursor.mo, cursor.d, parsed.interval);
      } else if (parsed.freq === "WEEKLY") {
        cursor = addLocalDays(cursor.y, cursor.mo, cursor.d, 7 * parsed.interval);
      } else {
        cursor = addLocalMonths(cursor.y, cursor.mo, cursor.d, parsed.interval);
      }
    }
  }

  return out.length > 0 ? out : [event];
}

/**
 * Expand a list of events; non-recurring rows pass straight through.
 */
export function expandRecurringEvents(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const ev of events) {
    if (!ev.recurrence_rule) {
      out.push(ev);
      continue;
    }
    out.push(...expandRecurringEvent(ev, rangeStart, rangeEnd));
  }
  return out.sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
}

// ── Write-side: RRULE → Microsoft Graph `recurrence` ───────

export interface GraphRecurrence {
  pattern: {
    type: "daily" | "weekly" | "absoluteMonthly";
    interval: number;
    daysOfWeek?: string[];
    dayOfMonth?: number;
    firstDayOfWeek?: string;
  };
  range: {
    type: "noEnd" | "endDate" | "numbered";
    startDate: string;
    endDate?: string;
    numberOfOccurrences?: number;
    recurrenceTimeZone?: string;
  };
}

/**
 * Build the Graph `recurrence` object from an RRULE.
 * Returns null (and logs) for patterns Graph cannot express from our subset,
 * in which case the event is pushed as a single occurrence — the previous
 * behaviour, but now visible in the logs instead of silent.
 */
export function rruleToGraphRecurrence(
  rrule: string | null | undefined,
  startAtIso: string,
  timeZone = "Europe/Zurich",
  recurrenceEndIso?: string | null
): GraphRecurrence | null {
  const parsed = parseRRule(rrule);
  if (!parsed) return null;

  if (!parsed.supported) {
    console.warn(
      `[calendar/recurrence] RRULE not pushed to Graph (unsupported pattern): ${rrule}`
    );
    return null;
  }

  const start = new Date(startAtIso);
  if (isNaN(start.getTime())) return null;

  // Graph wants calendar dates in the event's own timezone.
  const dateInZone = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  const startDate = dateInZone(start);

  let pattern: GraphRecurrence["pattern"];
  if (parsed.freq === "DAILY") {
    pattern = { type: "daily", interval: parsed.interval };
  } else if (parsed.freq === "WEEKLY") {
    const days = parsed.byDay?.length
      ? parsed.byDay.map((d) => INDEX_TO_GRAPH_DAY[d])
      : [INDEX_TO_GRAPH_DAY[start.getUTCDay()]];
    pattern = {
      type: "weekly",
      interval: parsed.interval,
      daysOfWeek: days,
      firstDayOfWeek: "monday",
    };
  } else {
    pattern = {
      type: "absoluteMonthly",
      interval: parsed.interval,
      dayOfMonth: Number(startDate.slice(8, 10)),
    };
  }

  let range: GraphRecurrence["range"];
  const endSource = parsed.until ?? (recurrenceEndIso ? new Date(recurrenceEndIso) : null);
  if (parsed.count) {
    range = {
      type: "numbered",
      startDate,
      numberOfOccurrences: parsed.count,
      recurrenceTimeZone: timeZone,
    };
  } else if (endSource && !isNaN(endSource.getTime())) {
    range = {
      type: "endDate",
      startDate,
      endDate: dateInZone(endSource),
      recurrenceTimeZone: timeZone,
    };
  } else {
    range = { type: "noEnd", startDate, recurrenceTimeZone: timeZone };
  }

  return { pattern, range };
}
