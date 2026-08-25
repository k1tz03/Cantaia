"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Calendar, Clock, MapPin, Plus, Sparkles } from "lucide-react";
import { isSameDay, isToday, differenceInMinutes } from "date-fns";
import type { CalendarEvent, CalendarEventType } from "@cantaia/core/calendar";
import { toLocaleTag } from "./datetime-utils";
import { isVirtualEvent, sourceMetaFor } from "./event-source";

// ── Constants ──────────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<CalendarEventType, string> = {
  meeting: "#3B82F6",
  site_visit: "#10B981",
  call: "#F59E0B",
  deadline: "#EF4444",
  construction: "#8B5CF6",
  milestone: "#F97316",
  other: "#6B7280",
};

// ── Helpers ────────────────────────────────────────────────

function formatTime(dateStr: string, localeTag: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(localeTag, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDuration(startStr: string, endStr: string): string {
  const mins = differenceInMinutes(new Date(endStr), new Date(startStr));
  if (mins < 0) return "";
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function getHour(dateStr: string): number {
  return new Date(dateStr).getHours();
}

type TimeSection = "morning" | "afternoon" | "evening";

function getSection(event: CalendarEvent): TimeSection {
  const h = getHour(event.start_at);
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function getAttendeeInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
];

function getAvatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function getNowMinutesSinceMidnight(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getEventMinutesSinceMidnight(event: CalendarEvent): number {
  const d = new Date(event.start_at);
  return d.getHours() * 60 + d.getMinutes();
}

// ── Props ──────────────────────────────────────────────────

interface AgendaStreamProps {
  events: CalendarEvent[];
  selectedDate: Date;
  selectedEvent: CalendarEvent | null;
  onSelectEvent: (event: CalendarEvent | null) => void;
  onCreateEvent: () => void;
}

// ── Sub-components ─────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-4 pt-5 pb-2">
      <span
        className="text-[#A1A1AA] text-[10px] font-semibold tracking-[0.12em] uppercase"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {label}
      </span>
    </div>
  );
}

function NowIndicator() {
  const localeTag = toLocaleTag(useLocale());
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const formatted = time.toLocaleTimeString(localeTag, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <div className="relative flex items-center gap-2 px-4 py-1">
      {/* Red dot with glow */}
      <div className="relative flex-shrink-0">
        <div
          className="w-2 h-2 rounded-full bg-[#EF4444]"
          style={{
            boxShadow: "0 0 6px 2px rgba(239, 68, 68, 0.4)",
          }}
        />
      </div>
      {/* Red line */}
      <div className="flex-1 h-px bg-[#EF4444]/60" />
      {/* Time label */}
      <span
        className="text-[#EF4444] text-[11px] flex-shrink-0"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {formatted}
      </span>
    </div>
  );
}

function EventBadge({
  label,
  color,
  withSparkles,
}: {
  label: string;
  color: string;
  withSparkles?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide"
      style={{
        backgroundColor: `${color}15`,
        color,
      }}
    >
      {withSparkles && <Sparkles className="w-2.5 h-2.5" />}
      {label}
    </span>
  );
}

function EventItem({
  event,
  isSelected,
  onSelect,
}: {
  event: CalendarEvent;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("calendar");
  const localeTag = toLocaleTag(useLocale());
  const color = event.color || EVENT_TYPE_COLORS[event.event_type] || EVENT_TYPE_COLORS.other;
  const duration = formatDuration(event.start_at, event.end_at);
  const attendees = event.invitations?.filter((inv) => !inv.is_organizer) ?? [];

  const hasAIPrep =
    event.ai_prep_status === "ready" || event.ai_prep_status === "delivered";
  const isDeadline = event.event_type === "deadline";
  const isSynced = event.sync_source === "outlook";
  // Rows derived from another module (submission deadline, PV, tâche…) —
  // badged with their origin so the user knows why they cannot be edited here.
  const sourceMeta = sourceMetaFor(event);
  const isDerived = isVirtualEvent(event);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        w-full text-left px-4 py-2.5 flex gap-3 transition-colors
        ${
          isSelected
            ? "bg-[#18181B] border-l-2 border-l-transparent border border-[#3F3F46]"
            : "hover:bg-[#18181B] border border-transparent"
        }
      `}
    >
      {/* Time column */}
      <div className="flex-shrink-0 w-[42px] pt-0.5 text-right">
        <div
          className="text-[#A1A1AA] text-[12px] leading-tight"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {event.all_day ? t("allDayShort") : formatTime(event.start_at, localeTag)}
        </div>
        {!event.all_day && duration && (
          <div
            className="text-[#A1A1AA] text-[10px] mt-0.5"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {duration}
          </div>
        )}
      </div>

      {/* Color bar — derived rows get a faded bar: they are informative,
          not something the user scheduled. */}
      <div
        className="w-[3px] flex-shrink-0 rounded-full self-stretch"
        style={{ backgroundColor: color, opacity: isDerived ? 0.5 : 1 }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        <div className="text-[#FAFAFA] text-[13px] font-semibold truncate leading-tight">
          {event.title}
        </div>

        {/* Meta line: project + location */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {event.project?.name && (
            <span className="text-[#A1A1AA] text-[11px] truncate max-w-[120px]">
              {event.project.name}
            </span>
          )}
          {event.project?.name && event.location && (
            <span className="text-[#A1A1AA] text-[11px]">&middot;</span>
          )}
          {event.location && (
            <span className="text-[#A1A1AA] text-[11px] truncate max-w-[100px] inline-flex items-center gap-0.5">
              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
              {event.location}
            </span>
          )}
        </div>

        {/* Badges + avatars row */}
        <div className="flex items-center gap-2 mt-1.5">
          {/* Badges */}
          <div className="flex items-center gap-1">
            {sourceMeta && (
              <EventBadge label={sourceMeta.label} color={sourceMeta.color} />
            )}
            {hasAIPrep && <EventBadge label={t("badgeAIPrep")} color="#F97316" withSparkles />}
            {isDeadline && !sourceMeta && <EventBadge label={t("badgeDeadline")} color="#EF4444" />}
            {isSynced && <EventBadge label={t("badgeSynced")} color="#10B981" />}
          </div>

          {/* Avatar stack */}
          {attendees.length > 0 && (
            <div className="flex items-center ml-auto">
              {attendees.slice(0, 4).map((inv, i) => (
                <div
                  key={inv.id}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold text-white border border-[#0F0F11]"
                  style={{
                    backgroundColor: getAvatarColor(i),
                    marginLeft: i > 0 ? "-4px" : "0",
                    zIndex: 10 - i,
                    position: "relative",
                  }}
                  title={inv.attendee_name || inv.attendee_email}
                >
                  {getAttendeeInitials(inv.attendee_name)}
                </div>
              ))}
              {attendees.length > 4 && (
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-medium text-[#A1A1AA] bg-[#27272A] border border-[#0F0F11]"
                  style={{
                    marginLeft: "-4px",
                    zIndex: 5,
                    position: "relative",
                  }}
                >
                  +{attendees.length - 4}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function EmptyState() {
  const t = useTranslations("calendar");
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-xl bg-[#18181B] flex items-center justify-center mb-4">
        <Calendar className="w-6 h-6 text-[#A1A1AA]" />
      </div>
      <p className="text-[#A1A1AA] text-sm font-medium">{t("noEvents")}</p>
      <p className="text-[#A1A1AA] text-xs mt-1">
        {t("noEventsHint")}
      </p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────

export function AgendaStream({
  events,
  selectedDate,
  selectedEvent,
  onSelectEvent,
  onCreateEvent,
}: AgendaStreamProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const localeTag = toLocaleTag(locale);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLDivElement>(null);
  const dateIsToday = isToday(selectedDate);

  // Sort events by start_at
  const sortedEvents = [...events]
    .filter((e) => {
      const evDate = new Date(e.start_at);
      return isSameDay(evDate, selectedDate);
    })
    .sort(
      (a, b) =>
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );

  // Group by section
  const morning = sortedEvents.filter((e) => getSection(e) === "morning");
  const afternoon = sortedEvents.filter(
    (e) => getSection(e) === "afternoon"
  );
  const evening = sortedEvents.filter((e) => getSection(e) === "evening");

  // Scroll to now indicator on mount (if today)
  useEffect(() => {
    if (dateIsToday && nowRef.current) {
      nowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [dateIsToday, selectedDate]);

  // Determine where the now indicator should appear
  const nowMinutes = getNowMinutesSinceMidnight();

  function shouldShowNowBefore(event: CalendarEvent): boolean {
    return getEventMinutesSinceMidnight(event) > nowMinutes;
  }

  function renderEventsWithNow(
    sectionEvents: CalendarEvent[],
    sectionStart: number,
    sectionEnd: number
  ) {
    if (!dateIsToday || nowMinutes < sectionStart || nowMinutes >= sectionEnd) {
      return sectionEvents.map((event) => (
        <EventItem
          key={event.id}
          event={event}
          isSelected={selectedEvent?.id === event.id}
          onSelect={() =>
            onSelectEvent(
              selectedEvent?.id === event.id ? null : event
            )
          }
        />
      ));
    }

    const elements: React.ReactNode[] = [];
    let nowInserted = false;

    for (const event of sectionEvents) {
      if (!nowInserted && shouldShowNowBefore(event)) {
        elements.push(
          <div key="now-indicator" ref={nowRef}>
            <NowIndicator />
          </div>
        );
        nowInserted = true;
      }
      elements.push(
        <EventItem
          key={event.id}
          event={event}
          isSelected={selectedEvent?.id === event.id}
          onSelect={() =>
            onSelectEvent(
              selectedEvent?.id === event.id ? null : event
            )
          }
        />
      );
    }

    // If now is after all events in this section
    if (!nowInserted) {
      elements.push(
        <div key="now-indicator" ref={nowRef}>
          <NowIndicator />
        </div>
      );
    }

    return elements;
  }

  const hasEvents = sortedEvents.length > 0;

  // Date formatting (locale-aware)
  const dayName = selectedDate
    .toLocaleDateString(localeTag, { weekday: "long" })
    .toUpperCase();
  const dayNumber = selectedDate.getDate();
  const fullDate = selectedDate.toLocaleDateString(localeTag, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col h-full bg-[#0F0F11]">
      {/* Sticky date header */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3 bg-[#0F0F11]/95 backdrop-blur-sm border-b border-[#27272A]">
        <div
          className="text-[#F97316] text-[11px] font-semibold tracking-[0.15em] uppercase"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {dayName}
        </div>
        <div
          className="text-[#FAFAFA] text-[28px] font-extrabold leading-tight mt-0.5"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {dayNumber}
        </div>
        <div className="text-[#A1A1AA] text-[12px] mt-0.5">{fullDate}</div>

        {/* Event count */}
        {hasEvents && (
          <div className="flex items-center gap-1.5 mt-2">
            <Clock className="w-3 h-3 text-[#A1A1AA]" />
            <span className="text-[#A1A1AA] text-[11px]">
              {t("eventCount", { count: sortedEvents.length })}
            </span>
          </div>
        )}
      </div>

      {/* Scrollable event stream */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#27272A] scrollbar-track-transparent"
      >
        {!hasEvents ? (
          <EmptyState />
        ) : (
          <div className="pb-4">
            {/* Morning section */}
            {(morning.length > 0 ||
              (dateIsToday && nowMinutes < 720)) && (
              <>
                <SectionHeader label={t("morning")} />
                {morning.length > 0
                  ? renderEventsWithNow(morning, 0, 720)
                  : dateIsToday &&
                    nowMinutes < 720 && (
                      <div ref={nowRef}>
                        <NowIndicator />
                      </div>
                    )}
              </>
            )}

            {/* Afternoon section */}
            {(afternoon.length > 0 ||
              (dateIsToday &&
                nowMinutes >= 720 &&
                nowMinutes < 1080)) && (
              <>
                <SectionHeader label={t("afternoon")} />
                {afternoon.length > 0
                  ? renderEventsWithNow(afternoon, 720, 1080)
                  : dateIsToday &&
                    nowMinutes >= 720 &&
                    nowMinutes < 1080 && (
                      <div ref={nowRef}>
                        <NowIndicator />
                      </div>
                    )}
              </>
            )}

            {/* Evening section */}
            {(evening.length > 0 ||
              (dateIsToday && nowMinutes >= 1080)) && (
              <>
                <SectionHeader label={t("evening")} />
                {evening.length > 0
                  ? renderEventsWithNow(evening, 1080, 1440)
                  : dateIsToday &&
                    nowMinutes >= 1080 && (
                      <div ref={nowRef}>
                        <NowIndicator />
                      </div>
                    )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom: add event button */}
      <div className="px-4 py-3 border-t border-[#27272A]">
        <button
          type="button"
          onClick={onCreateEvent}
          className="w-full py-2 flex items-center justify-center gap-2 rounded-lg border border-dashed border-[#3F3F46] text-[#A1A1AA] text-[13px] font-medium transition-colors hover:border-[#F97316] hover:text-[#F97316] hover:bg-[#F97316]/5"
        >
          <Plus className="w-4 h-4" />
          {t("addEvent")}
        </button>
      </div>
    </div>
  );
}
