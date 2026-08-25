"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import type {
  CalendarEvent,
  CalendarEventType,
} from "@cantaia/core/calendar";
import { toLocaleTag, toLocalDateString } from "./datetime-utils";
import { sourceMetaFor } from "./event-source";

// ── Props ─────────────────────────────────────────────────

interface TimelineViewProps {
  events: CalendarEvent[];
  selectedDate: Date;
  viewMode: "day" | "week" | "month";
  selectedEvent: CalendarEvent | null;
  onSelectEvent: (event: CalendarEvent | null) => void;
  onCreateEvent: (startTime?: Date) => void;
}

// ── Constants ─────────────────────────────────────────────

const HOUR_START = 7;
const HOUR_END = 20;
const HOUR_HEIGHT = 60; // px per hour
const TIME_COL_WIDTH = 52; // px
const EVENT_LEFT = 64; // px (time col + gap)
const EVENT_RIGHT_MARGIN = 24; // px
const GRID_HEIGHT = (HOUR_END - HOUR_START) * HOUR_HEIGHT;

const EVENT_TYPE_COLORS: Record<CalendarEventType, string> = {
  meeting: "#3B82F6",
  site_visit: "#10B981",
  call: "#F59E0B",
  deadline: "#EF4444",
  construction: "#8B5CF6",
  milestone: "#F97316",
  other: "#71717A",
};

const LEGEND_ITEMS = [
  { type: "meeting" as const, labelKey: "typeMeeting", color: "#3B82F6" },
  { type: "site_visit" as const, labelKey: "typeSiteVisitShort", color: "#10B981" },
  { type: "call" as const, labelKey: "typeCall", color: "#F59E0B" },
  { type: "deadline" as const, labelKey: "typeDeadline", color: "#EF4444" },
];

/** Localized short weekday labels, Monday first. */
function useWeekdayLabels(localeTag: string): string[] {
  return useMemo(() => {
    const base = new Date(2026, 0, 5); // a Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(localeTag, { weekday: "short" }).replace(/\.$/, "");
    });
  }, [localeTag]);
}

// ── Helpers ───────────────────────────────────────────────

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getEventColor(event: CalendarEvent): string {
  return event.color || EVENT_TYPE_COLORS[event.event_type] || "#71717A";
}

/**
 * Small "source" chip for rows derived from another module (submission
 * deadline, PV, tâche, jalon planning, réception, garantie, réserve, visite).
 * Without it the grid mixes real appointments and echoes of other modules
 * with no way to tell them apart.
 */
function SourceChip({ event }: { event: CalendarEvent }) {
  const meta = sourceMetaFor(event);
  if (!meta) return null;
  return (
    <span
      className="inline-flex flex-shrink-0 items-center rounded px-1 py-[1px] text-[9px] font-semibold leading-none"
      style={{ backgroundColor: `${meta.color}26`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

function getEventMinutes(event: CalendarEvent): {
  startMin: number;
  durationMin: number;
} {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const durationMin = Math.max(
    20,
    (end.getTime() - start.getTime()) / (1000 * 60)
  );
  return { startMin, durationMin };
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Split a day's events into all-day (rendered in a dedicated header row) and
 * timed (positioned in the grid). Without this, an all-day event started at
 * 00:00 → top clamped to 0 and a ~24h height, painting a block over the whole
 * grid and hiding every real appointment.
 */
function splitAllDay(events: CalendarEvent[]): {
  allDay: CalendarEvent[];
  timed: CalendarEvent[];
} {
  const allDay: CalendarEvent[] = [];
  const timed: CalendarEvent[] = [];
  for (const e of events) (e.all_day ? allDay : timed).push(e);
  return { allDay, timed };
}

interface LaidOutEvent {
  event: CalendarEvent;
  col: number;
  cols: number;
}

/**
 * Column layout for overlapping timed events: events that overlap in time are
 * placed side by side instead of stacked on top of each other. Returns each
 * event with its column index and the column count of its overlap cluster.
 */
function layoutTimedEvents(events: CalendarEvent[]): LaidOutEvent[] {
  const sorted = [...events].sort((a, b) => {
    const d = new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
    return d !== 0
      ? d
      : new Date(b.end_at).getTime() - new Date(a.end_at).getTime();
  });

  const result: LaidOutEvent[] = [];
  let cluster: CalendarEvent[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const columnEnds: number[] = [];
    const assigned: Array<{ event: CalendarEvent; col: number }> = [];
    for (const ev of cluster) {
      const s = new Date(ev.start_at).getTime();
      const e = new Date(ev.end_at).getTime();
      let placed = false;
      for (let c = 0; c < columnEnds.length; c++) {
        if (s >= columnEnds[c]) {
          columnEnds[c] = e;
          assigned.push({ event: ev, col: c });
          placed = true;
          break;
        }
      }
      if (!placed) {
        columnEnds.push(e);
        assigned.push({ event: ev, col: columnEnds.length - 1 });
      }
    }
    const cols = Math.max(1, columnEnds.length);
    for (const a of assigned) result.push({ event: a.event, col: a.col, cols });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const ev of sorted) {
    const s = new Date(ev.start_at).getTime();
    const e = new Date(ev.end_at).getTime();
    if (cluster.length && s >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return result;
}

/** Horizontal placement (CSS left/width) for a column within the grid body. */
function columnStyle(
  col: number,
  cols: number,
  leftPx: number,
  rightPx: number
): { left: string; width: string } {
  if (cols <= 1) {
    return { left: `${leftPx}px`, width: `calc(100% - ${leftPx + rightPx}px)` };
  }
  const gap = 3;
  return {
    left: `calc(${leftPx}px + (100% - ${leftPx + rightPx}px) * ${col} / ${cols})`,
    width: `calc((100% - ${leftPx + rightPx}px) / ${cols} - ${gap}px)`,
  };
}

/** Compact chip row for all-day / derived events above the timed grid. */
function AllDayRow({
  events,
  selectedEvent,
  onSelectEvent,
  label,
}: {
  events: CalendarEvent[];
  selectedEvent: CalendarEvent | null;
  onSelectEvent: (event: CalendarEvent | null) => void;
  label: string;
}) {
  if (events.length === 0) return null;
  return (
    <div className="flex items-start gap-2 px-4 py-2 border-b border-[#27272A]">
      <span
        className="text-[11px] font-medium mt-0.5 flex-shrink-0"
        style={{ color: "#A1A1AA" }}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {events.map((event) => {
          const color = getEventColor(event);
          const isSelected = selectedEvent?.id === event.id;
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelectEvent(event)}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium truncate max-w-[220px] transition-colors"
              style={{
                backgroundColor: isSelected ? `${color}30` : `${color}1F`,
                borderLeft: `2px solid ${color}`,
                color: "#FAFAFA",
              }}
            >
              <SourceChip event={event} />
              <span className="truncate">{event.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Day View ──────────────────────────────────────────────

function DayView({
  events,
  selectedDate,
  selectedEvent,
  onSelectEvent,
  onCreateEvent,
}: Omit<TimelineViewProps, "viewMode">) {
  const t = useTranslations("calendar");
  const gridRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLDivElement>(null);
  const [nowMinutes, setNowMinutes] = useState<number>(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  const showNow = isToday(selectedDate);

  // Update now indicator every minute
  useEffect(() => {
    if (!showNow) return;
    const interval = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60_000);
    return () => clearInterval(interval);
  }, [showNow]);

  // Auto-scroll to current time or 8am
  useEffect(() => {
    if (showNow && nowRef.current) {
      nowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (gridRef.current) {
      // Scroll to 8am
      const offset = (8 - HOUR_START) * HOUR_HEIGHT;
      gridRef.current.scrollTop = offset;
    }
  }, [showNow, selectedDate]);

  // Filter events for this day, split all-day out of the timed grid, and lay
  // out overlapping timed events into side-by-side columns.
  const { allDayEvents, laidOutTimed } = useMemo(() => {
    const dayEvents = events.filter((e) =>
      isSameDay(new Date(e.start_at), selectedDate)
    );
    const { allDay, timed } = splitAllDay(dayEvents);
    return { allDayEvents: allDay, laidOutTimed: layoutTimedEvents(timed) };
  }, [events, selectedDate]);

  const handleSlotClick = useCallback(
    (hour: number) => {
      const d = new Date(selectedDate);
      d.setHours(hour, 0, 0, 0);
      onCreateEvent(d);
    },
    [selectedDate, onCreateEvent]
  );

  // Build hour rows
  const hours = useMemo(() => {
    const result: number[] = [];
    for (let h = HOUR_START; h < HOUR_END; h++) {
      result.push(h);
    }
    return result;
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272A]">
        <span
          className="text-[13px] font-medium"
          style={{ color: "#71717A" }}
        >
          {t("dayTimeline")}
        </span>
        <div className="flex items-center gap-3">
          {LEGEND_ITEMS.map((item) => (
            <div key={item.type} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span
                className="text-[11px]"
                style={{ color: "#A1A1AA" }}
              >
                {t(item.labelKey)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* All-day / derived events row (kept out of the timed grid) */}
      <AllDayRow
        events={allDayEvents}
        selectedEvent={selectedEvent}
        onSelectEvent={onSelectEvent}
        label={t("allDayShort")}
      />

      {/* Time grid */}
      <div
        ref={gridRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#27272A #0F0F11" }}
      >
        <div
          className="relative"
          style={{ height: GRID_HEIGHT, minHeight: GRID_HEIGHT }}
        >
          {/* Hour rows */}
          {hours.map((hour) => {
            const top = (hour - HOUR_START) * HOUR_HEIGHT;
            return (
              <div
                key={hour}
                className="absolute left-0 right-0 flex"
                style={{ top, height: HOUR_HEIGHT }}
              >
                {/* Time label */}
                <div
                  className="flex-shrink-0 flex items-start justify-end pr-3 pt-0.5"
                  style={{ width: TIME_COL_WIDTH }}
                >
                  <span
                    className="text-[11px] font-mono"
                    style={{ color: "#71717A" }}
                  >
                    {formatTime(hour, 0)}
                  </span>
                </div>
                {/* Time slot */}
                <div
                  className="flex-1 cursor-pointer transition-colors duration-100"
                  style={{
                    borderLeft: "1px solid #1C1C1F",
                    borderBottom: "1px solid #1C1C1F",
                  }}
                  onClick={() => handleSlotClick(hour)}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "rgba(249, 115, 22, 0.04)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor =
                      "transparent";
                  }}
                />
              </div>
            );
          })}

          {/* Event blocks */}
          {laidOutTimed.map(({ event, col, cols }) => {
            const { startMin, durationMin } = getEventMinutes(event);
            const color = getEventColor(event);
            const top = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
            const height = Math.max(20, (durationMin / 60) * HOUR_HEIGHT);
            const startDate = new Date(event.start_at);
            const endDate = new Date(event.end_at);
            const isSelected = selectedEvent?.id === event.id;
            const pos = columnStyle(col, cols, EVENT_LEFT, EVENT_RIGHT_MARGIN);

            return (
              <div
                key={event.id}
                className="absolute cursor-pointer transition-all duration-150"
                style={{
                  top: Math.max(0, top),
                  left: pos.left,
                  width: pos.width,
                  height: Math.max(24, height),
                  backgroundColor: isSelected
                    ? `${color}20`
                    : `${color}1F`,
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  zIndex: isSelected ? 20 : 10,
                  boxShadow: isSelected
                    ? `0 0 0 1px ${color}40`
                    : "none",
                }}
                onClick={() => onSelectEvent(event)}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = `${color}28`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = `${color}1F`;
                  }
                }}
              >
                {/* Title */}
                <div className="flex items-center gap-1.5">
                  <SourceChip event={event} />
                  <div
                    className="text-[13px] font-semibold leading-tight truncate"
                    style={{ color: "#FAFAFA" }}
                  >
                    {event.title}
                  </div>
                </div>
                {/* Meta: time range + location */}
                {height >= 36 && (
                  <div
                    className="text-[11px] leading-tight mt-0.5 truncate"
                    style={{ color }}
                  >
                    {formatTime(startDate.getHours(), startDate.getMinutes())}
                    {" - "}
                    {formatTime(endDate.getHours(), endDate.getMinutes())}
                    {event.location ? ` \u00B7 ${event.location}` : ""}
                  </div>
                )}
                {/* Attendee avatars */}
                {height >= 52 &&
                  event.invitations &&
                  event.invitations.length > 0 && (
                    <div className="flex items-center gap-0.5 mt-1.5">
                      {event.invitations.slice(0, 4).map((inv, i) => (
                        <div
                          key={inv.id || i}
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold"
                          style={{
                            backgroundColor: `${color}30`,
                            color,
                            border: `1px solid ${color}50`,
                          }}
                          title={
                            inv.attendee_name || inv.attendee_email
                          }
                        >
                          {getInitials(
                            inv.attendee_name || inv.attendee_email
                          )}
                        </div>
                      ))}
                      {event.invitations.length > 4 && (
                        <span
                          className="text-[9px] ml-0.5"
                          style={{ color: "#71717A" }}
                        >
                          +{event.invitations.length - 4}
                        </span>
                      )}
                    </div>
                  )}
              </div>
            );
          })}

          {/* Now indicator */}
          {showNow &&
            nowMinutes >= HOUR_START * 60 &&
            nowMinutes <= HOUR_END * 60 && (
              <div
                ref={nowRef}
                className="absolute left-0 right-0 pointer-events-none"
                style={{
                  top:
                    ((nowMinutes - HOUR_START * 60) / 60) * HOUR_HEIGHT,
                  zIndex: 30,
                }}
              >
                {/* Red dot with glow */}
                <div
                  className="absolute rounded-full"
                  style={{
                    width: 10,
                    height: 10,
                    left: TIME_COL_WIDTH - 5,
                    top: -5,
                    backgroundColor: "#EF4444",
                    boxShadow: "0 0 8px rgba(239, 68, 68, 0.6)",
                  }}
                />
                {/* Red line */}
                <div
                  className="absolute"
                  style={{
                    left: TIME_COL_WIDTH,
                    right: 0,
                    height: 2,
                    backgroundColor: "#EF4444",
                    opacity: 0.7,
                  }}
                />
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

// ── Week View ─────────────────────────────────────────────

function WeekView({
  events,
  selectedDate,
  selectedEvent,
  onSelectEvent,
  onCreateEvent,
}: Omit<TimelineViewProps, "viewMode">) {
  const locale = useLocale();
  const weekdayLabels = useWeekdayLabels(toLocaleTag(locale));
  const monday = useMemo(() => getMonday(selectedDate), [selectedDate]);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  }, [monday]);

  // Group events by day of week, splitting all-day (shown in the header) from
  // timed events (laid out into overlap columns inside the day column).
  const eventsByDay = useMemo(() => {
    const buckets: CalendarEvent[][] = Array.from({ length: 7 }, () => []);
    for (const event of events) {
      const start = new Date(event.start_at);
      for (let i = 0; i < 7; i++) {
        if (isSameDay(start, weekDays[i])) {
          buckets[i].push(event);
          break;
        }
      }
    }
    return buckets.map((dayEvents) => {
      const { allDay, timed } = splitAllDay(dayEvents);
      return { allDay, timed: layoutTimedEvents(timed) };
    });
  }, [events, weekDays]);

  const hours = useMemo(() => {
    const result: number[] = [];
    for (let h = HOUR_START; h < HOUR_END; h++) result.push(h);
    return result;
  }, []);

  const gridRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to 8am
  useEffect(() => {
    if (gridRef.current) {
      const offset = (8 - HOUR_START) * HOUR_HEIGHT;
      gridRef.current.scrollTop = offset;
    }
  }, [selectedDate]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with day columns */}
      <div
        className="flex border-b"
        style={{ borderColor: "#27272A" }}
      >
        {/* Time column spacer */}
        <div
          className="flex-shrink-0"
          style={{ width: TIME_COL_WIDTH }}
        />
        {/* Day headers */}
        {weekDays.map((day, i) => {
          const dayIsToday = isToday(day);
          const dayIsSelected = isSameDay(day, selectedDate);
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center py-2"
              style={{
                borderLeft: "1px solid #1C1C1F",
                backgroundColor: dayIsToday
                  ? "rgba(249, 115, 22, 0.05)"
                  : "transparent",
              }}
            >
              <span
                className="text-[10px] font-medium uppercase"
                style={{
                  color: dayIsToday ? "#F97316" : "#52525B",
                }}
              >
                {weekdayLabels[i]}
              </span>
              <span
                className="text-[14px] font-semibold mt-0.5 w-7 h-7 flex items-center justify-center rounded-full"
                style={{
                  color: dayIsToday ? "#FAFAFA" : dayIsSelected ? "#FAFAFA" : "#A1A1AA",
                  backgroundColor: dayIsToday
                    ? "#F97316"
                    : "transparent",
                }}
              >
                {day.getDate()}
              </span>
              {/* All-day / derived events — kept out of the timed grid */}
              {(eventsByDay[i]?.allDay?.length ?? 0) > 0 && (
                <div className="mt-1 flex w-full flex-col gap-0.5 px-1">
                  {eventsByDay[i].allDay.slice(0, 2).map((event) => {
                    const color = getEventColor(event);
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onSelectEvent(event)}
                        className="truncate rounded px-1 py-[1px] text-left text-[9px] font-medium"
                        style={{
                          backgroundColor: `${color}1F`,
                          borderLeft: `2px solid ${color}`,
                          color: "#FAFAFA",
                        }}
                        title={event.title}
                      >
                        {event.title}
                      </button>
                    );
                  })}
                  {eventsByDay[i].allDay.length > 2 && (
                    <span className="px-1 text-[9px]" style={{ color: "#A1A1AA" }}>
                      +{eventsByDay[i].allDay.length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#27272A #0F0F11" }}
      >
        <div
          className="relative flex"
          style={{ height: GRID_HEIGHT, minHeight: GRID_HEIGHT }}
        >
          {/* Time labels column */}
          <div className="flex-shrink-0 relative" style={{ width: TIME_COL_WIDTH }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute flex items-start justify-end pr-3 pt-0.5"
                style={{
                  top: (hour - HOUR_START) * HOUR_HEIGHT,
                  height: HOUR_HEIGHT,
                  width: TIME_COL_WIDTH,
                }}
              >
                <span
                  className="text-[11px] font-mono"
                  style={{ color: "#71717A" }}
                >
                  {formatTime(hour, 0)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, dayIdx) => {
            const dayIsToday = isToday(day);
            const timedEvents = eventsByDay[dayIdx]?.timed ?? [];

            return (
              <div
                key={dayIdx}
                className="flex-1 relative"
                style={{
                  borderLeft: "1px solid #1C1C1F",
                  backgroundColor: dayIsToday
                    ? "rgba(249, 115, 22, 0.02)"
                    : "transparent",
                }}
              >
                {/* Hour grid lines */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 cursor-pointer transition-colors duration-100"
                    style={{
                      top: (hour - HOUR_START) * HOUR_HEIGHT,
                      height: HOUR_HEIGHT,
                      borderBottom: "1px solid #1C1C1F",
                    }}
                    onClick={() => {
                      const d = new Date(day);
                      d.setHours(hour, 0, 0, 0);
                      onCreateEvent(d);
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "rgba(249, 115, 22, 0.04)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "transparent";
                    }}
                  />
                ))}

                {/* Events */}
                {timedEvents.map(({ event, col, cols }) => {
                  const { startMin, durationMin } = getEventMinutes(event);
                  const color = getEventColor(event);
                  const top =
                    ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
                  const height = Math.max(
                    18,
                    (durationMin / 60) * HOUR_HEIGHT
                  );
                  const startDate = new Date(event.start_at);
                  const isSelected = selectedEvent?.id === event.id;
                  const pos = columnStyle(col, cols, 2, 2);

                  return (
                    <div
                      key={event.id}
                      className="absolute cursor-pointer transition-all duration-150"
                      style={{
                        top: Math.max(0, top),
                        left: pos.left,
                        width: pos.width,
                        height: Math.max(18, height),
                        backgroundColor: isSelected
                          ? `${color}20`
                          : `${color}1F`,
                        borderLeft: `2px solid ${color}`,
                        borderRadius: 6,
                        padding: "3px 6px",
                        zIndex: isSelected ? 20 : 10,
                        overflow: "hidden",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(event);
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = `${color}28`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = `${color}1F`;
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <SourceChip event={event} />
                      </div>
                      <div
                        className="text-[10px] font-semibold leading-tight truncate"
                        style={{ color: "#FAFAFA" }}
                      >
                        {event.title}
                      </div>
                      {height >= 30 && (
                        <div
                          className="text-[9px] leading-tight truncate"
                          style={{ color }}
                        >
                          {formatTime(
                            startDate.getHours(),
                            startDate.getMinutes()
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Month View ───────────────────────────────────────────

/** Max event chips visible per cell before showing "+N" */
const MAX_EVENTS_PER_CELL = 3;

interface MonthCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
}

function MonthView({
  events,
  selectedDate,
  selectedEvent,
  onSelectEvent,
  onCreateEvent,
}: Omit<TimelineViewProps, "viewMode">) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const localeTag = toLocaleTag(locale);
  const weekdayLabels = useWeekdayLabels(localeTag);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // Build the 6-row × 7-col grid
  const grid = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    // First day of month
    const firstDay = new Date(year, month, 1);
    // Day of week for the 1st (Monday=0...Sunday=6)
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6; // Sunday → 6

    // Start from the Monday before the 1st (or the 1st itself if it's Monday)
    const gridStart = new Date(firstDay);
    gridStart.setDate(gridStart.getDate() - startDow);

    const cells: MonthCell[] = [];
    const today = new Date();

    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);

      const dayEvents = events.filter((e) => {
        const start = new Date(e.start_at);
        return isSameDay(start, d);
      });

      cells.push({
        date: d,
        isCurrentMonth: d.getMonth() === month,
        isToday: isSameDay(d, today),
        isSelected: isSameDay(d, selectedDate),
        events: dayEvents,
      });
    }

    // Group into rows of 7
    const rows: MonthCell[][] = [];
    for (let r = 0; r < 6; r++) {
      rows.push(cells.slice(r * 7, r * 7 + 7));
    }

    return rows;
  }, [events, selectedDate]);

  // Count total events this month
  const monthEventCount = useMemo(() => {
    const month = selectedDate.getMonth();
    const year = selectedDate.getFullYear();
    return events.filter((e) => {
      const d = new Date(e.start_at);
      return d.getMonth() === month && d.getFullYear() === year;
    }).length;
  }, [events, selectedDate]);

  const handleCellClick = useCallback(
    (date: Date) => {
      const d = new Date(date);
      d.setHours(9, 0, 0, 0);
      onCreateEvent(d);
    },
    [onCreateEvent]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272A]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium capitalize" style={{ color: "#71717A" }}>
            {selectedDate.toLocaleDateString(localeTag, { month: "long", year: "numeric" })}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{
              backgroundColor: "rgba(249, 115, 22, 0.1)",
              color: "#F97316",
            }}
          >
            {t("eventCount", { count: monthEventCount })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {LEGEND_ITEMS.map((item) => (
            <div key={item.type} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[11px]" style={{ color: "#A1A1AA" }}>
                {t(item.labelKey)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Day-of-week headers */}
      <div
        className="grid grid-cols-7 border-b"
        style={{ borderColor: "#27272A" }}
      >
        {weekdayLabels.map((day, i) => (
          <div
            key={i}
            className="py-2 text-center text-[11px] font-semibold uppercase"
            style={{
              color: i >= 5 ? "#52525B" : "#71717A",
              borderLeft: i > 0 ? "1px solid #1C1C1F" : undefined,
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-rows-6 overflow-hidden">
        {grid.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className="grid grid-cols-7"
            style={{
              borderBottom: rowIdx < 5 ? "1px solid #1C1C1F" : undefined,
            }}
          >
            {row.map((cell, colIdx) => {
              const cellKey = toLocalDateString(cell.date);
              const isHovered = hoveredDate === cellKey;
              const hasEvents = cell.events.length > 0;
              const visibleEvents = cell.events.slice(0, MAX_EVENTS_PER_CELL);
              const overflowCount = cell.events.length - MAX_EVENTS_PER_CELL;

              return (
                <div
                  key={colIdx}
                  className="relative flex flex-col cursor-pointer transition-colors duration-100 overflow-hidden"
                  style={{
                    borderLeft: colIdx > 0 ? "1px solid #1C1C1F" : undefined,
                    backgroundColor: cell.isToday
                      ? "rgba(249, 115, 22, 0.04)"
                      : isHovered
                        ? "rgba(249, 115, 22, 0.03)"
                        : cell.isSelected
                          ? "rgba(250, 250, 250, 0.02)"
                          : "transparent",
                    padding: "4px 6px",
                    minHeight: 0,
                  }}
                  onClick={() => handleCellClick(cell.date)}
                  onMouseEnter={() => setHoveredDate(cellKey)}
                  onMouseLeave={() => setHoveredDate(null)}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className="text-[12px] font-semibold leading-none flex items-center justify-center rounded-full"
                      style={{
                        width: cell.isToday ? 24 : undefined,
                        height: cell.isToday ? 24 : undefined,
                        color: cell.isToday
                          ? "#FAFAFA"
                          : cell.isCurrentMonth
                            ? "#A1A1AA"
                            : "#3F3F46",
                        backgroundColor: cell.isToday ? "#F97316" : "transparent",
                      }}
                    >
                      {cell.date.getDate()}
                    </span>
                    {/* Event count dot for small screens / overflow */}
                    {hasEvents && !cell.isToday && (
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: "#F97316" }}
                      />
                    )}
                  </div>

                  {/* Event chips */}
                  <div className="flex-1 flex flex-col gap-[2px] overflow-hidden min-h-0">
                    {visibleEvents.map((event) => {
                      const color = getEventColor(event);
                      const isEvtSelected = selectedEvent?.id === event.id;
                      const startDate = new Date(event.start_at);

                      return (
                        <div
                          key={event.id}
                          className="flex items-center gap-1 rounded px-1.5 py-[2px] truncate cursor-pointer transition-all duration-100"
                          style={{
                            backgroundColor: isEvtSelected
                              ? `${color}30`
                              : `${color}15`,
                            borderLeft: `2px solid ${color}`,
                            outline: isEvtSelected
                              ? `1px solid ${color}60`
                              : "none",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEvent(event);
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = `${color}25`;
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = isEvtSelected
                              ? `${color}30`
                              : `${color}15`;
                          }}
                          title={`${formatTime(startDate.getHours(), startDate.getMinutes())} ${event.title}`}
                        >
                          {sourceMetaFor(event) ? (
                            <SourceChip event={event} />
                          ) : (
                            <span
                              className="text-[9px] font-mono flex-shrink-0"
                              style={{ color }}
                            >
                              {formatTime(startDate.getHours(), startDate.getMinutes())}
                            </span>
                          )}
                          <span
                            className="text-[10px] font-medium truncate"
                            style={{ color: "#FAFAFA" }}
                          >
                            {event.title}
                          </span>
                        </div>
                      );
                    })}

                    {/* Overflow indicator */}
                    {overflowCount > 0 && (
                      <div
                        className="text-[9px] font-medium px-1.5 py-[1px] rounded"
                        style={{
                          color: "#F97316",
                          backgroundColor: "rgba(249, 115, 22, 0.08)",
                        }}
                      >
                        {t("moreEvents", { count: overflowCount })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Export ────────────────────────────────────────────

export function TimelineView(props: TimelineViewProps) {
  const { viewMode } = props;

  if (viewMode === "month") {
    return (
      <div
        className="flex flex-col h-full"
        style={{ backgroundColor: "#0F0F11" }}
      >
        <MonthView {...props} />
      </div>
    );
  }

  if (viewMode === "week") {
    return (
      <div
        className="flex flex-col h-full"
        style={{ backgroundColor: "#0F0F11" }}
      >
        <WeekView {...props} />
      </div>
    );
  }

  // Default: day view
  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: "#0F0F11" }}
    >
      <DayView {...props} />
    </div>
  );
}
