"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Zap,
  Mail,
  FileText,
  AlertTriangle,
  Clock,
  Truck,
  ClipboardList,
  Sparkles,
  Bell,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MapPin,
  Check,
  type LucideIcon,
} from "lucide-react";
import type {
  IntelligenceFeedItem,
  CalendarWeather,
  TeamMemberAvailability,
  CalendarEvent,
  MeetingPrepData,
  MeetingPrepReserve,
} from "@cantaia/core/calendar";

// ── Swiss Cities ──────────────────────────────────────────

export interface WeatherCity {
  name: string;
  lat: number;
  lon: number;
  canton: string;
}

export const SWISS_CITIES: WeatherCity[] = [
  { name: "Genève", lat: 46.2044, lon: 6.1432, canton: "GE" },
  { name: "Lausanne", lat: 46.5197, lon: 6.6323, canton: "VD" },
  { name: "Bern", lat: 46.9480, lon: 7.4474, canton: "BE" },
  { name: "Zürich", lat: 47.3769, lon: 8.5417, canton: "ZH" },
  { name: "Basel", lat: 47.5596, lon: 7.5886, canton: "BS" },
  { name: "Luzern", lat: 47.0502, lon: 8.3093, canton: "LU" },
  { name: "St. Gallen", lat: 47.4245, lon: 9.3767, canton: "SG" },
  { name: "Biel/Bienne", lat: 47.1368, lon: 7.2467, canton: "BE" },
  { name: "Thun", lat: 46.7580, lon: 7.6280, canton: "BE" },
  { name: "Fribourg", lat: 46.8065, lon: 7.1620, canton: "FR" },
  { name: "Sion", lat: 46.2325, lon: 7.3597, canton: "VS" },
  { name: "Neuchâtel", lat: 46.9920, lon: 6.9311, canton: "NE" },
  { name: "Delémont", lat: 47.3650, lon: 7.3450, canton: "JU" },
  { name: "Lugano", lat: 46.0037, lon: 8.9511, canton: "TI" },
  { name: "Chur", lat: 46.8499, lon: 9.5329, canton: "GR" },
  { name: "Aarau", lat: 47.3925, lon: 8.0444, canton: "AG" },
  { name: "Winterthur", lat: 47.5001, lon: 8.7240, canton: "ZH" },
  { name: "Yverdon", lat: 46.7785, lon: 6.6410, canton: "VD" },
  { name: "Montreux", lat: 46.4312, lon: 6.9108, canton: "VD" },
  { name: "Bulle", lat: 46.6167, lon: 7.0558, canton: "FR" },
];

const LS_KEY = "cantaia_weather_city";

export function getStoredCity(): WeatherCity {
  if (typeof window === "undefined") return SWISS_CITIES[0];
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.name && parsed?.lat && parsed?.lon) return parsed;
    }
  } catch { /* ignore */ }
  return SWISS_CITIES[0];
}

function storeCity(city: WeatherCity) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_KEY, JSON.stringify(city));
  }
}

// ── Props ─────────────────────────────────────────────────

interface IntelligencePanelProps {
  feed: IntelligenceFeedItem[];
  weather: CalendarWeather | null;
  teamAvailability: TeamMemberAvailability[];
  selectedEvent: CalendarEvent | null;
  meetingPrep: MeetingPrepData | null;
  onCityChange?: (city: WeatherCity) => void;
}

// ── Constants ─────────────────────────────────────────────

const URGENCY_DOT: Record<string, string> = {
  critical: "bg-[#EF4444] animate-pulse",
  high: "bg-[#EF4444]",
  medium: "bg-[#F59E0B]",
  low: "bg-[#3B82F6]",
};

const FEED_ICON: Record<IntelligenceFeedItem["type"], LucideIcon> = {
  submission_deadline: FileText,
  planning_delay: AlertTriangle,
  email_urgent: Mail,
  task_overdue: Clock,
  supplier_alert: Truck,
  meeting_prep: Sparkles,
  report_pending: ClipboardList,
  offer_received: Bell,
};

const SEVERITY_STYLES: Record<MeetingPrepReserve["severity"], { text: string; bg: string }> = {
  blocking: { text: "text-[#EF4444]", bg: "bg-[#EF4444]/10" },
  major: { text: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10" },
  minor: { text: "text-[#3B82F6]", bg: "bg-[#3B82F6]/10" },
};

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-[#EF4444]",
  medium: "bg-[#F59E0B]",
  low: "bg-[#3B82F6]",
};

// ── Helpers ───────────────────────────────────────────────

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "maintenant";
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  return `il y a ${days}j`;
}

function daysUntil(deadline: string): number {
  return Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / 86400000
  );
}

function deadlineBarColor(daysLeft: number): string {
  if (daysLeft <= 1) return "bg-[#EF4444]";
  if (daysLeft <= 3) return "bg-[#F59E0B]";
  return "bg-[#10B981]";
}

function deadlineBarWidth(daysLeft: number, maxDays: number): string {
  const pct = Math.max(0, Math.min(100, ((maxDays - daysLeft) / maxDays) * 100));
  return `${pct}%`;
}

// ── Sub-components ────────────────────────────────────────

function WeatherWidget({
  weather,
  onCityChange,
}: {
  weather: CalendarWeather;
  onCityChange?: (city: WeatherCity) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentCity = getStoredCity();

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPicker]);

  // Focus input when opening
  useEffect(() => {
    if (showPicker && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showPicker]);

  const filteredCities = useMemo(() => {
    if (!search.trim()) return SWISS_CITIES;
    const q = search.toLowerCase();
    return SWISS_CITIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.canton.toLowerCase().includes(q)
    );
  }, [search]);

  function selectCity(city: WeatherCity) {
    storeCity(city);
    setShowPicker(false);
    setSearch("");
    onCityChange?.(city);
  }

  return (
    <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{weather.icon}</span>
          <div>
            <p className="text-lg font-semibold text-[#FAFAFA] font-mono">
              {weather.temperature}°C
            </p>
            <p className="text-xs text-[#A1A1AA]">{weather.description}</p>
          </div>
        </div>

        {/* City selector button */}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-1 text-xs text-[#A1A1AA] hover:text-[#F97316] transition-colors rounded-md px-2 py-1 hover:bg-[#27272A]/50"
          >
            <MapPin className="w-3 h-3" />
            <span>{weather.location || currentCity.name}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showPicker ? "rotate-180" : ""}`} />
          </button>

          {/* Dropdown picker */}
          {showPicker && (
            <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-[#27272A] bg-[#18181B] shadow-xl shadow-black/40 overflow-hidden">
              {/* Search input */}
              <div className="p-2 border-b border-[#27272A]">
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher une ville..."
                  className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-2.5 py-1.5 text-xs text-[#FAFAFA] placeholder-[#52525B] outline-none focus:border-[#F97316]/50"
                />
              </div>

              {/* City list */}
              <div className="max-h-60 overflow-y-auto py-1">
                {filteredCities.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-[#52525B]">Aucun resultat</p>
                ) : (
                  filteredCities.map((city) => {
                    const isActive = city.name === currentCity.name;
                    return (
                      <button
                        key={city.name}
                        type="button"
                        onClick={() => selectCity(city)}
                        className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors ${
                          isActive
                            ? "bg-[#F97316]/10 text-[#F97316]"
                            : "text-[#A1A1AA] hover:bg-[#27272A]/50 hover:text-[#FAFAFA]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span>{city.name}</span>
                          <span className="text-[10px] text-[#52525B]">{city.canton}</span>
                        </div>
                        {isActive && <Check className="w-3 h-3 text-[#F97316]" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {weather.alert && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#F59E0B]/10 px-3 py-1.5 text-xs text-[#F59E0B]">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{weather.alert}</span>
        </div>
      )}
    </div>
  );
}

// ── Accordion Section ─────────────────────────────────────

function PrepSection({
  title,
  count,
  countColor,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  countColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <div className="border-t border-[#27272A] first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-2.5 px-1 text-left hover:bg-[#27272A]/30 rounded transition-colors"
      >
        <span className="text-xs font-medium text-[#A1A1AA]">{title}</span>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                countColor || "bg-[#3B82F6]/15 text-[#3B82F6]"
              }`}
            >
              {count}
            </span>
          )}
          <Icon className="w-3.5 h-3.5 text-[#52525B]" />
        </div>
      </button>
      {open && <div className="pb-3 space-y-2">{children}</div>}
    </div>
  );
}

// ── Meeting Prep Panel ────────────────────────────────────

function MeetingPrepSection({ prep }: { prep: MeetingPrepData }) {
  return (
    <div className="space-y-1">
      {/* Project Summary */}
      <div className="rounded-lg border border-[#27272A] bg-[#1C1C1F] p-3">
        <p className="text-xs text-[#A1A1AA] leading-relaxed">
          {prep.project_summary}
        </p>
      </div>

      {/* Unread Emails */}
      <PrepSection
        title="Emails non traites"
        count={prep.unread_emails.length}
        countColor="bg-[#3B82F6]/15 text-[#3B82F6]"
        defaultOpen={prep.unread_emails.length > 0}
      >
        {prep.unread_emails.map((email, i) => (
          <div key={i} className="flex items-start gap-2 px-1">
            <Mail className="w-3 h-3 mt-0.5 text-[#3B82F6] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-[#FAFAFA] truncate">{email.subject}</p>
              <p className="text-[10px] text-[#71717A]">{email.sender}</p>
            </div>
          </div>
        ))}
        {prep.unread_emails.length === 0 && (
          <p className="text-[10px] text-[#52525B] px-1">Aucun email en attente</p>
        )}
      </PrepSection>

      {/* Overdue Tasks */}
      <PrepSection
        title="Taches en retard"
        count={prep.overdue_tasks.length}
        countColor="bg-[#EF4444]/15 text-[#EF4444]"
        defaultOpen={prep.overdue_tasks.length > 0}
      >
        {prep.overdue_tasks.map((task, i) => (
          <div key={i} className="flex items-start gap-2 px-1">
            <Clock className="w-3 h-3 mt-0.5 text-[#EF4444] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-[#FAFAFA] truncate">{task.title}</p>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-[#EF4444] font-medium">
                  {task.days_overdue}j de retard
                </span>
                {task.assignee && (
                  <span className="text-[#71717A]">{task.assignee}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </PrepSection>

      {/* Open Reserves */}
      <PrepSection
        title="Reserves ouvertes"
        count={prep.open_reserves.length}
        countColor="bg-[#F59E0B]/15 text-[#F59E0B]"
      >
        {prep.open_reserves.map((reserve, i) => {
          const style = SEVERITY_STYLES[reserve.severity];
          return (
            <div key={i} className="flex items-start gap-2 px-1">
              <span
                className={`mt-1 inline-block rounded px-1 py-0.5 text-[9px] font-bold uppercase ${style.bg} ${style.text}`}
              >
                {reserve.severity}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-[#FAFAFA] truncate">
                  {reserve.description}
                </p>
                {reserve.location && (
                  <p className="text-[10px] text-[#71717A]">{reserve.location}</p>
                )}
              </div>
            </div>
          );
        })}
      </PrepSection>

      {/* Key Points */}
      <PrepSection
        title="Points cles"
        count={prep.key_points.length}
        defaultOpen={prep.key_points.length > 0}
      >
        <ol className="space-y-1.5 px-1">
          {prep.key_points.map((point, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                className={`mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                  PRIORITY_DOT[point.priority] || "bg-[#3B82F6]"
                }`}
              />
              <div className="min-w-0">
                <p className="text-xs text-[#FAFAFA]">{point.point}</p>
                <p className="text-[10px] text-[#52525B]">{point.source}</p>
              </div>
            </li>
          ))}
        </ol>
      </PrepSection>

      {/* Suggested Agenda */}
      <PrepSection
        title="Agenda suggere"
        count={prep.suggested_agenda.length}
        defaultOpen={prep.suggested_agenda.length > 0}
      >
        <ol className="space-y-1.5 px-1">
          {prep.suggested_agenda.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="flex-shrink-0 mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#F97316]/15 text-[10px] font-bold text-[#F97316]">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-[#FAFAFA]">{item.topic}</p>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-[#71717A]">{item.duration_min} min</span>
                  {item.context && (
                    <span className="text-[#52525B] truncate">{item.context}</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </PrepSection>
    </div>
  );
}

// ── Feed Card ─────────────────────────────────────────────

function FeedCard({ item }: { item: IntelligenceFeedItem }) {
  const Icon = FEED_ICON[item.type] || Bell;
  const dotClass = URGENCY_DOT[item.urgency] || URGENCY_DOT.low;

  const inner = (
    <div
      className={`group flex items-start gap-2.5 rounded-lg border border-[#27272A] bg-[#18181B] p-3 transition-colors ${
        item.link
          ? "hover:border-[#3F3F46] hover:bg-[#1C1C1F] cursor-pointer"
          : ""
      }`}
    >
      {/* Urgency dot */}
      <span
        className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${dotClass}`}
      />

      {/* Icon */}
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#71717A]" />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#FAFAFA] leading-tight truncate">
          {item.title}
        </p>
        <p className="mt-0.5 text-[12px] text-[#A1A1AA] leading-snug line-clamp-2">
          {item.description}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          {item.project_name && (
            <span className="inline-flex items-center rounded bg-[#27272A] px-1.5 py-0.5 text-[10px] text-[#A1A1AA] font-medium truncate max-w-[140px]">
              {item.project_name}
            </span>
          )}
          <span className="text-[10px] text-[#52525B]">
            {formatRelativeTime(item.timestamp)}
          </span>
        </div>
      </div>

      {/* Link arrow */}
      {item.link && (
        <ExternalLink className="mt-0.5 h-3 w-3 flex-shrink-0 text-[#52525B] opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  );

  if (item.link) {
    return (
      <a href={item.link} className="block">
        {inner}
      </a>
    );
  }
  return inner;
}

// ── Deadline Card ─────────────────────────────────────────

function DeadlineCard({ item }: { item: IntelligenceFeedItem }) {
  const days = daysUntil(item.timestamp);
  const maxDays = 14;
  const barColor = deadlineBarColor(days);
  const barWidth = deadlineBarWidth(days, maxDays);

  return (
    <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[#FAFAFA] font-medium truncate flex-1 mr-3">
          {item.description || item.title}
        </p>
        <span
          className={`font-mono text-lg font-bold ${
            days <= 1
              ? "text-[#EF4444]"
              : days <= 3
              ? "text-[#F59E0B]"
              : "text-[#10B981]"
          }`}
        >
          J-{Math.max(0, days)}
        </span>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-[#27272A] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: barWidth }}
        />
      </div>
      {item.project_name && (
        <p className="mt-1.5 text-[10px] text-[#52525B]">{item.project_name}</p>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────

export function IntelligencePanel({
  feed,
  weather,
  selectedEvent,
  meetingPrep,
  onCityChange,
}: IntelligencePanelProps) {
  // Split deadlines from the rest of the feed
  const { deadlines, alerts } = useMemo(() => {
    const deadlines: IntelligenceFeedItem[] = [];
    const alerts: IntelligenceFeedItem[] = [];
    for (const item of feed) {
      if (item.type === "submission_deadline") {
        deadlines.push(item);
      } else {
        alerts.push(item);
      }
    }
    return { deadlines, alerts };
  }, [feed]);

  return (
    <aside className="w-[320px] flex-shrink-0 border-l border-[#27272A] bg-[#0F0F11] overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* ── Weather Widget ────────────────────────────── */}
        {weather && <WeatherWidget weather={weather} onCityChange={onCityChange} />}

        {/* ── Meeting Prep ──────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-[#F97316]" />
            <h3 className="text-sm font-semibold text-[#FAFAFA]">
              Preparation IA
            </h3>
          </div>

          {selectedEvent && meetingPrep && (
            <p className="text-[11px] text-[#71717A] mb-2 truncate">
              {selectedEvent.title}
            </p>
          )}

          {meetingPrep ? (
            <MeetingPrepSection prep={meetingPrep} />
          ) : (
            <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4 text-center">
              <Sparkles className="mx-auto h-5 w-5 text-[#52525B] mb-2" />
              <p className="text-xs text-[#52525B]">
                Selectionnez un evenement pour voir la preparation IA
              </p>
            </div>
          )}
        </section>

        {/* ── Deadlines ─────────────────────────────────── */}
        {deadlines.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-[#F59E0B]" />
              <h3 className="text-sm font-semibold text-[#FAFAFA]">
                Deadlines
              </h3>
              <span className="ml-auto rounded-full bg-[#F59E0B]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#F59E0B]">
                {deadlines.length}
              </span>
            </div>
            <div className="space-y-2">
              {deadlines.map((item) => (
                <DeadlineCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* ── Intelligence Feed ─────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-[#F97316]" />
            <h3 className="text-sm font-semibold text-[#FAFAFA]">
              Intelligence
            </h3>
            {alerts.length > 0 && (
              <span className="ml-auto rounded-full bg-[#F97316]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#F97316]">
                {alerts.length}
              </span>
            )}
          </div>

          {alerts.length > 0 ? (
            <div className="space-y-2">
              {alerts.map((item) => (
                <FeedCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4 text-center">
              <p className="text-xs text-[#52525B]">
                Aucune alerte — tout roule
              </p>
              <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-[#10B981]" />
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
