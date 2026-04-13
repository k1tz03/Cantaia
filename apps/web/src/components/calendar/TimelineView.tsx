"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type {
  CalendarEvent,
  CalendarEventType,
} from "@cantaia/core/calendar";

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
  { type: "meeting" as const, label: "Reunion", color: "#3B82F6" },
  { type: "site_visit" as const, label: "Visite", color: "#10B981" },
  { type: "call" as const, label: "Appel", color: "#F59E0B" },
  { type: "deadline" as const, label: "Deadline", color: "#EF4444" },
];

const WEEK_DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const AVAILABILITY_SLOTS = [
  { label: "08-10", start: 8, end: 10 },
  { label: "10-12", start: 10, end: 12 },
  { label: "12-14", start: 12, end: 14 },
  { label: "14-16", start: 14, end: 16 },
  { label: "16-18", start: 16, end: 18 },
];

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

// ── Day View ──────────────────────────────────────────────

function DayView({
  events,
  selectedDate,
  selectedEvent,
  onSelectEvent,
  onCreateEvent,
}: Omit<TimelineViewProps, "viewMode">) {
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

  // Filter events for this day
  const dayEvents = useMemo(() => {
    return events.filter((e) => {
      const start = new Date(e.start_at);
      return isSameDay(start, selectedDate);
    });
  }, [events, selectedDate]);

  // Team availability computation
  const availability = useMemo(() => {
    return AVAILABILITY_SLOTS.map((slot) => {
      const slotStart = slot.start * 60;
      const slotEnd = slot.end * 60;
      let busyCount = 0;
      const totalSlots = 5;

      for (const event of dayEvents) {
        const { startMin, durationMin } = getEventMinutes(event);
        const eventEnd = startMin + durationMin;
        if (startMin < slotEnd && eventEnd > slotStart) {
          busyCount++;
        }
      }

      const busyRatio = busyCount / totalSlots;
      const freeCount = Math.max(0, totalSlots - busyCount);

      let statusColor = "#10B981"; // green
      if (busyRatio > 0.7) statusColor = "#EF4444"; // red
      else if (busyRatio > 0.3) statusColor = "#F59E0B"; // amber

      return {
        ...slot,
        freeCount,
        totalSlots,
        statusColor,
      };
    });
  }, [dayEvents]);

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
          Timeline du jour
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
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Team availability strip */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#27272A]">
        <span
          className="text-[11px] font-medium mr-1"
          style={{ color: "#52525B" }}
        >
          Dispo
        </span>
        {availability.map((slot) => (
          <div
            key={slot.label}
            className="flex flex-col items-center gap-0.5"
          >
            <div className="flex items-center gap-1">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: slot.statusColor }}
              />
              <span
                className="text-[10px] font-mono"
                style={{ color: "#52525B" }}
              >
                {slot.label}
              </span>
            </div>
            <span
              className="text-[9px]"
              style={{ color: "#52525B" }}
            >
              {slot.freeCount}/{slot.totalSlots} dispo
            </span>
          </div>
        ))}
      </div>

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
                    style={{ color: "#52525B" }}
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
          {dayEvents.map((event) => {
            const { startMin, durationMin } = getEventMinutes(event);
            const color = getEventColor(event);
            const top = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
            const height = Math.max(20, (durationMin / 60) * HOUR_HEIGHT);
            const startDate = new Date(event.start_at);
            const endDate = new Date(event.end_at);
            const isSelected = selectedEvent?.id === event.id;

            return (
              <div
                key={event.id}
                className="absolute cursor-pointer transition-all duration-150"
                style={{
                  top: Math.max(0, top),
                  left: EVENT_LEFT,
                  right: EVENT_RIGHT_MARGIN,
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
                <div
                  className="text-[13px] font-semibold leading-tight truncate"
                  style={{ color: "#FAFAFA" }}
                >
                  {event.title}
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

  // Group events by day of week
  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {};
    for (let i = 0; i < 7; i++) map[i] = [];

    for (const event of events) {
      const start = new Date(event.start_at);
      for (let i = 0; i < 7; i++) {
        if (isSameDay(start, weekDays[i])) {
          map[i].push(event);
          break;
        }
      }
    }
    return map;
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
                {WEEK_DAYS_FR[i]}
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
                  style={{ color: "#52525B" }}
                >
                  {formatTime(hour, 0)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, dayIdx) => {
            const dayIsToday = isToday(day);
            const dayEvents = eventsByDay[dayIdx] || [];

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
                {dayEvents.map((event) => {
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

                  return (
                    <div
                      key={event.id}
                      className="absolute cursor-pointer transition-all duration-150"
                      style={{
                        top: Math.max(0, top),
                        left: 2,
                        right: 2,
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

// ── Month Placeholder ─────────────────────────────────────

function MonthPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-2">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#52525B"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <rect x="8" y="14" width="2" height="2" />
          <rect x="14" y="14" width="2" height="2" />
          <rect x="8" y="18" width="2" height="2" />
        </svg>
        <span
          className="text-[13px] font-medium"
          style={{ color: "#52525B" }}
        >
          Vue mois — bientot disponible
        </span>
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
        <MonthPlaceholder />
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
