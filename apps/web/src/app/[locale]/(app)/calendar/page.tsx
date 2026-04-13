"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Sparkles,
  Loader2,
  Zap,
} from "lucide-react";
import { AgendaStream } from "@/components/calendar/AgendaStream";
import { TimelineView } from "@/components/calendar/TimelineView";
import { IntelligencePanel, getStoredCity } from "@/components/calendar/IntelligencePanel";
import { CreateEventModal } from "@/components/calendar/CreateEventModal";
import type { WeatherCity } from "@/components/calendar/IntelligencePanel";
import type {
  CalendarEvent,
  IntelligenceFeedItem,
  CalendarWeather,
  TeamMemberAvailability,
  AICommandResult,
} from "@cantaia/core/calendar";

type ViewMode = "day" | "week" | "month";

interface IntelligenceState {
  feed: IntelligenceFeedItem[];
  weather: CalendarWeather | null;
  teamAvailability: TeamMemberAvailability[];
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

/** Format a Date for display in the toolbar subtitle */
function formatFullDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale === "de" ? "de-CH" : locale === "en" ? "en-GB" : "fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Get ISO date string YYYY-MM-DD */
function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/** Get the start of the week (Monday) */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Get end of week (Sunday) */
function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Get start of month */
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Get end of month */
function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Navigate date by view mode */
function navigateDate(date: Date, direction: -1 | 1, mode: ViewMode): Date {
  const d = new Date(date);
  switch (mode) {
    case "day":
      d.setDate(d.getDate() + direction);
      break;
    case "week":
      d.setDate(d.getDate() + direction * 7);
      break;
    case "month":
      d.setMonth(d.getMonth() + direction);
      break;
  }
  return d;
}

/** Compute the date range for API fetches based on view mode */
function getDateRange(date: Date, mode: ViewMode): { start: string; end: string } {
  switch (mode) {
    case "day": {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      return { start: dayStart.toISOString(), end: dayEnd.toISOString() };
    }
    case "week":
      return { start: startOfWeek(date).toISOString(), end: endOfWeek(date).toISOString() };
    case "month": {
      // Include padding days from prev/next month for the grid
      const mStart = startOfMonth(date);
      const mEnd = endOfMonth(date);
      const paddedStart = startOfWeek(mStart);
      const paddedEnd = endOfWeek(mEnd);
      return { start: paddedStart.toISOString(), end: paddedEnd.toISOString() };
    }
  }
}

/** Check if two dates are the same calendar day */
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* ═══════════════════════════════════════════════════════════
   AI COMMAND CHIPS
   ═══════════════════════════════════════════════════════════ */

const AI_CHIPS = [
  { label: "Reunion", icon: "calendar", command: "Planifie une reunion " },
  { label: "Visite chantier", icon: "hardhat", command: "Planifie une visite chantier " },
  { label: "Creneau libre", icon: "clock", command: "Trouve un creneau libre " },
  { label: "Resume semaine", icon: "zap", command: "Fais un resume de ma semaine" },
] as const;

/* ═══════════════════════════════════════════════════════════
   VIEW MODE TABS
   ═══════════════════════════════════════════════════════════ */

const VIEW_MODES: Array<{ key: ViewMode; label: string }> = [
  { key: "day", label: "Jour" },
  { key: "week", label: "Semaine" },
  { key: "month", label: "Mois" },
];

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════════ */

export default function CalendarPage() {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const aiInputRef = useRef<HTMLInputElement>(null);

  /* ---- State ---- */
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("cantaia_calendar_view") as ViewMode) || "day";
    }
    return "day";
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [intelligence, setIntelligence] = useState<IntelligenceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [aiCommand, setAiCommand] = useState("");
  const [aiProcessing, setAiProcessing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  /* ---- Persist view mode ---- */
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("cantaia_calendar_view", viewMode);
    }
  }, [viewMode]);

  /* ---- Data Fetching ---- */

  const fetchEvents = useCallback(async () => {
    try {
      const { start, end } = getDateRange(selectedDate, viewMode);
      const res = await fetch(`/api/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      if (res.status === 401) return;
      if (!res.ok) throw new Error("Failed to fetch events");
      const data = await res.json();
      if (data.events) setEvents(data.events);
    } catch (err) {
      console.error("Calendar: failed to fetch events", err);
    }
  }, [selectedDate, viewMode]);

  const [weatherCity, setWeatherCity] = useState<WeatherCity>(() => getStoredCity());

  const fetchIntelligence = useCallback(async () => {
    try {
      const city = getStoredCity();
      const res = await fetch(
        `/api/calendar/intelligence?date=${toISODate(selectedDate)}&lat=${city.lat}&lon=${city.lon}&city=${encodeURIComponent(city.name)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setIntelligence(data);
    } catch (err) {
      console.error("Calendar: failed to fetch intelligence", err);
    }
  }, [selectedDate, weatherCity]);

  const handleCityChange = useCallback((city: WeatherCity) => {
    setWeatherCity(city);
    // fetchIntelligence will re-run via the weatherCity dependency
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([fetchEvents(), fetchIntelligence()]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [fetchEvents, fetchIntelligence]);

  /* ---- Sync ---- */

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      const data = await res.json();
      toast.success(data.message || "Calendrier synchronise");
      await fetchEvents();
    } catch {
      toast.error("Erreur de synchronisation");
    } finally {
      setSyncing(false);
    }
  }, [fetchEvents]);

  /* ---- AI Command ---- */

  const handleAICommand = useCallback(async (command?: string) => {
    const cmd = command || aiCommand;
    if (!cmd.trim()) return;

    setAiProcessing(true);
    try {
      const res = await fetch("/api/calendar/ai-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: cmd.trim(),
          context: {
            date: toISODate(selectedDate),
            viewMode,
            existingEvents: events.slice(0, 20).map((e) => ({
              title: e.title,
              start: e.start_at,
              end: e.end_at,
              type: e.event_type,
            })),
          },
        }),
      });

      if (!res.ok) throw new Error("AI command failed");
      const data = await res.json();
      const result: AICommandResult = data.result;

      if (data.success) {
        toast.success(result.message);
        if (result.action === "create_event") {
          await fetchEvents();
        }
      } else {
        toast.error(result?.message || "L'IA n'a pas pu traiter la commande");
      }
    } catch {
      toast.error("Erreur lors du traitement de la commande IA");
    } finally {
      setAiProcessing(false);
      setAiCommand("");
    }
  }, [aiCommand, selectedDate, viewMode, events, fetchEvents]);

  /* ---- Navigation ---- */

  const goToToday = useCallback(() => setSelectedDate(new Date()), []);
  const goPrev = useCallback(() => setSelectedDate((d) => navigateDate(d, -1, viewMode)), [viewMode]);
  const goNext = useCallback(() => setSelectedDate((d) => navigateDate(d, 1, viewMode)), [viewMode]);

  /* ---- Keyboard Shortcuts ---- */

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          goPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goNext();
          break;
        case "t":
        case "T":
          e.preventDefault();
          goToToday();
          break;
        case "n":
        case "N":
          e.preventDefault();
          setShowCreateModal(true);
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goPrev, goNext, goToToday]);

  /* ---- Derived state ---- */

  const isToday = isSameDay(selectedDate, new Date());
  const formattedDate = formatFullDate(selectedDate, locale);
  // Capitalize first letter
  const displayDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */

  return (
    <div className="flex flex-col h-full bg-[#0F0F11] overflow-hidden">

      {/* ──────────────────────── TOOLBAR ──────────────────────── */}
      <div className="flex-shrink-0 border-b border-[#27272A] bg-[#0F0F11]">
        <div className="flex items-center justify-between px-6 py-3">

          {/* Left: title + date + nav */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#F97316]/10">
                <Calendar className="w-4 h-4 text-[#F97316]" />
              </div>
              <div>
                <h1 className="text-[15px] font-semibold text-[#FAFAFA] font-display leading-tight">
                  {t("title")}
                </h1>
                <p className="text-[12px] text-[#71717A] leading-tight mt-0.5">
                  {displayDate}
                </p>
              </div>
            </div>

            {/* Prev / Next arrows */}
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={goPrev}
                className="flex items-center justify-center w-7 h-7 rounded-md border border-[#27272A] bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3F3F46] transition-colors"
                title="Precedent"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={goNext}
                className="flex items-center justify-center w-7 h-7 rounded-md border border-[#27272A] bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3F3F46] transition-colors"
                title="Suivant"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Center: Today button + View switcher */}
          <div className="flex items-center gap-3">
            <button
              onClick={goToToday}
              className={`px-3 py-1.5 text-[13px] font-medium rounded-md border transition-colors ${
                isToday
                  ? "border-[#F97316]/30 bg-[#F97316]/10 text-[#F97316]"
                  : "border-[#27272A] bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3F3F46]"
              }`}
            >
              Aujourd&apos;hui
            </button>

            {/* View mode switcher */}
            <div className="flex items-center bg-[#18181B] border border-[#27272A] rounded-lg p-0.5">
              {VIEW_MODES.map((vm) => (
                <button
                  key={vm.key}
                  onClick={() => setViewMode(vm.key)}
                  className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${
                    viewMode === vm.key
                      ? "bg-[#F97316] text-white shadow-sm"
                      : "text-[#71717A] hover:text-[#A1A1AA]"
                  }`}
                >
                  {vm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Sync + New event */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-md border border-[#27272A] bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3F3F46] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-semibold rounded-md bg-[#F97316] text-white hover:bg-[#EA580C] transition-colors shadow-sm shadow-[#F97316]/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nouvel evenement</span>
            </button>
          </div>
        </div>
      </div>

      {/* ──────────────────── AI COMMAND BAR ──────────────────── */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-[#27272A] bg-[#0F0F11]">
        <div
          className="relative rounded-xl border border-[#27272A] bg-[#18181B] overflow-hidden"
          style={{
            boxShadow: "0 0 0 1px rgba(249, 115, 22, 0.08), 0 1px 12px rgba(249, 115, 22, 0.04)",
          }}
        >
          {/* Subtle orange gradient top border */}
          <div
            className="absolute top-0 left-0 right-0 h-[1px]"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(249, 115, 22, 0.4), rgba(234, 88, 12, 0.3), transparent)",
            }}
          />

          <div className="flex items-center gap-3 px-4 py-2.5">
            {/* Sparkles icon */}
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#F97316]/10 flex-shrink-0">
              {aiProcessing ? (
                <Loader2 className="w-4 h-4 text-[#F97316] animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-[#F97316]" />
              )}
            </div>

            {/* Input */}
            <input
              ref={aiInputRef}
              type="text"
              value={aiCommand}
              onChange={(e) => setAiCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAICommand();
                }
              }}
              placeholder="Planifie une reunion CVC mardi a 14h avec Sophie..."
              className="flex-1 bg-transparent text-[13px] text-[#FAFAFA] placeholder-[#52525B] outline-none font-sans"
              disabled={aiProcessing}
            />

            {/* Quick chips */}
            <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
              {AI_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => {
                    setAiCommand(chip.command);
                    aiInputRef.current?.focus();
                    if (chip.command.endsWith("semaine")) {
                      // Auto-submit for "Resume semaine"
                      handleAICommand(chip.command);
                    }
                  }}
                  disabled={aiProcessing}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-[#27272A] bg-[#1C1C1F] text-[#71717A] hover:text-[#A1A1AA] hover:border-[#3F3F46] transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Submit button */}
            {aiCommand.trim() && (
              <button
                onClick={() => handleAICommand()}
                disabled={aiProcessing}
                className="flex items-center justify-center w-7 h-7 rounded-md bg-[#F97316] text-white hover:bg-[#EA580C] transition-colors flex-shrink-0 disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ──────────────────── 3-COLUMN BODY ──────────────────── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 text-[#F97316] animate-spin" />
            <span className="text-[13px] text-[#52525B]">Chargement du calendrier...</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-[300px_1fr_320px] overflow-hidden">

          {/* ──── Left: Agenda Stream ──── */}
          <div className="border-r border-[#27272A] overflow-y-auto">
            <AgendaStream
              events={events}
              selectedDate={selectedDate}
              selectedEvent={selectedEvent}
              onSelectEvent={setSelectedEvent}
              onCreateEvent={() => setShowCreateModal(true)}
            />
          </div>

          {/* ──── Center: Timeline ──── */}
          <div className="overflow-y-auto overflow-x-hidden">
            <TimelineView
              events={events}
              selectedDate={selectedDate}
              selectedEvent={selectedEvent}
              viewMode={viewMode}
              onSelectEvent={setSelectedEvent}
              onCreateEvent={() => setShowCreateModal(true)}
            />
          </div>

          {/* ──── Right: Intelligence Panel ──── */}
          <div className="border-l border-[#27272A] overflow-y-auto">
            <IntelligencePanel
              feed={intelligence?.feed ?? []}
              weather={intelligence?.weather ?? null}
              teamAvailability={intelligence?.teamAvailability ?? []}
              selectedEvent={selectedEvent}
              meetingPrep={selectedEvent?.ai_prep_data ?? null}
              onCityChange={handleCityChange}
            />
          </div>
        </div>
      )}

      {/* ──────────────────── CREATE EVENT MODAL ──────────────────── */}
      <CreateEventModal
        open={showCreateModal}
        defaultDate={selectedDate}
        onClose={() => setShowCreateModal(false)}
        onCreated={async () => {
          setShowCreateModal(false);
          await fetchEvents();
          toast.success("Evenement cree");
        }}
      />
    </div>
  );
}
