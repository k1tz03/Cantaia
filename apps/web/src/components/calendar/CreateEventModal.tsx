"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Loader2, AlertCircle, Sparkles, Plus, MapPin, Calendar, Clock, Users } from "lucide-react";
import { toast } from "sonner";

interface CreateEventModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultDate?: Date;
  defaultStartTime?: Date;
}

interface ProjectOption {
  id: string;
  name: string;
  code?: string;
}

interface AgendaSuggestion {
  id: string;
  topic: string;
  checked: boolean;
}

const EVENT_TYPES = [
  { value: "meeting", label: "Reunion" },
  { value: "site_visit", label: "Visite chantier" },
  { value: "call", label: "Appel" },
  { value: "deadline", label: "Deadline" },
  { value: "construction", label: "Construction" },
  { value: "other", label: "Autre" },
] as const;

function formatDateForInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeForInput(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function getInitials(email: string): string {
  const local = email.split("@")[0] || "";
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

export function CreateEventModal({
  open,
  onClose,
  onCreated,
  defaultDate,
  defaultStartTime,
}: CreateEventModalProps) {
  // Form state
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<string>("meeting");
  const [date, setDate] = useState(formatDateForInput(defaultDate || new Date()));
  const [startTime, setStartTime] = useState(
    defaultStartTime ? formatTimeForInput(defaultStartTime) : "09:00"
  );
  const [endTime, setEndTime] = useState(
    defaultStartTime
      ? formatTimeForInput(new Date(defaultStartTime.getTime() + 60 * 60 * 1000))
      : "10:00"
  );
  const [allDay, setAllDay] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  // Attendees
  const [attendeeInput, setAttendeeInput] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);

  // AI suggestions
  const [suggestions, setSuggestions] = useState<AgendaSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Projects
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Submit state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setTitle("");
      setEventType("meeting");
      setDate(formatDateForInput(defaultDate || new Date()));
      setStartTime(
        defaultStartTime ? formatTimeForInput(defaultStartTime) : "09:00"
      );
      setEndTime(
        defaultStartTime
          ? formatTimeForInput(new Date(defaultStartTime.getTime() + 60 * 60 * 1000))
          : "10:00"
      );
      setAllDay(false);
      setProjectId("");
      setLocation("");
      setDescription("");
      setAttendeeInput("");
      setAttendees([]);
      setSuggestions([]);
      setError("");
      setSubmitted(false);
    }
  }, [open, defaultDate, defaultStartTime]);

  // Fetch projects on mount
  useEffect(() => {
    if (!open) return;
    setLoadingProjects(true);
    fetch("/api/projects/list")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        const items = Array.isArray(data) ? data : data.projects || [];
        setProjects(
          items.map((p: { id: string; name: string; code?: string }) => ({
            id: p.id,
            name: p.name,
            code: p.code,
          }))
        );
      })
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [open]);

  // Fetch AI suggestions when project changes
  const fetchSuggestions = useCallback(async (pid: string) => {
    if (!pid) {
      setSuggestions([]);
      return;
    }
    setLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/projects/${pid}`);
      if (!res.ok) throw new Error();
      const project = await res.json();

      // Generate simple agenda suggestions based on project context
      const baseSuggestions: string[] = [];
      if (project.budget_total) baseSuggestions.push("Revue du budget et suivi financier");
      if (project.status === "active") baseSuggestions.push("Avancement des travaux et planning");
      baseSuggestions.push("Points ouverts et decisions a prendre");
      baseSuggestions.push("Coordination entre corps de metiers");
      baseSuggestions.push("Prochaines etapes et responsabilites");

      setSuggestions(
        baseSuggestions.map((topic, i) => ({
          id: `suggestion-${i}`,
          topic,
          checked: false,
        }))
      );
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    if (projectId) {
      fetchSuggestions(projectId);
    } else {
      setSuggestions([]);
    }
  }, [projectId, fetchSuggestions]);

  // Attendees management
  function handleAddAttendee(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const email = attendeeInput.trim().toLowerCase();
    if (!email) return;
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (attendees.includes(email)) {
      setAttendeeInput("");
      return;
    }
    setAttendees((prev) => [...prev, email]);
    setAttendeeInput("");
  }

  function handleRemoveAttendee(email: string) {
    setAttendees((prev) => prev.filter((a) => a !== email));
  }

  // Toggle suggestion
  function toggleSuggestion(id: string) {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s))
    );
  }

  // Validation
  const missingTitle = !title.trim();

  // Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError("");
    if (missingTitle) return;

    setSaving(true);
    try {
      const selectedSuggestions = suggestions
        .filter((s) => s.checked)
        .map((s) => s.topic);

      // Build ISO datetime strings from date + time fields
      // The API expects start_at and end_at as ISO strings
      let startAt: string;
      let endAt: string;

      if (allDay) {
        // All-day: start at 00:00, end at 23:59 of the same day
        startAt = `${date}T00:00:00`;
        endAt = `${date}T23:59:59`;
      } else {
        startAt = `${date}T${startTime}:00`;
        endAt = `${date}T${endTime}:00`;
      }

      const payload = {
        title: title.trim(),
        event_type: eventType,
        start_at: startAt,
        end_at: endAt,
        is_all_day: allDay,
        project_id: projectId || null,
        location: location.trim() || null,
        description: description.trim() || null,
        attendees: attendees.length > 0
          ? attendees.map((email) => ({ email, name: email.split("@")[0] }))
          : undefined,
        agenda_items: selectedSuggestions.length > 0 ? selectedSuggestions : null,
        sync_to_outlook: true,
      };

      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur serveur");
        setSaving(false);
        return;
      }

      toast.success("Evenement cree avec succes");
      onCreated();
      onClose();
    } catch {
      setError("Erreur reseau");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const fieldErrorClass = "border-[#EF4444] ring-1 ring-[#EF4444]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-[#18181B] border border-[#27272A] shadow-2xl max-h-[90vh] flex flex-col transition-all duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#27272A] px-6 py-4">
          <h2 className="text-base font-semibold text-[#FAFAFA]">Nouvel evenement</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#27272A] hover:text-[#A1A1AA] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Error banner */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-[#EF4444]/10 px-3 py-2.5 text-sm text-[#EF4444] ring-1 ring-inset ring-[#EF4444]/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
                Titre *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                className={`w-full rounded-lg border bg-[#0F0F11] px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#52525B] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316] transition-colors ${
                  submitted && missingTitle ? fieldErrorClass : "border-[#27272A]"
                }`}
                placeholder="Coordination CVC — Residence du Lac"
              />
              {submitted && missingTitle && (
                <p className="mt-1 text-xs text-[#EF4444]">Le titre est requis</p>
              )}
            </div>

            {/* Event type pills */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
                Type
              </label>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map((et) => (
                  <button
                    key={et.value}
                    type="button"
                    onClick={() => setEventType(et.value)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                      eventType === et.value
                        ? "bg-[#F97316] text-white shadow-sm shadow-[#F97316]/25"
                        : "bg-[#1C1C1F] text-[#A1A1AA] border border-[#27272A] hover:border-[#3F3F46] hover:text-[#FAFAFA]"
                    }`}
                  >
                    {et.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#A1A1AA]">
                <Calendar className="h-3.5 w-3.5" />
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2.5 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316] transition-colors [color-scheme:dark]"
              />
            </div>

            {/* Time range + All day */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[#A1A1AA]">
                  <Clock className="h-3.5 w-3.5" />
                  Horaire
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-[#71717A]">Journee entiere</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={allDay}
                    onClick={() => setAllDay(!allDay)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      allDay ? "bg-[#F97316]" : "bg-[#27272A]"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        allDay ? "translate-x-[18px]" : "translate-x-[3px]"
                      }`}
                    />
                  </button>
                </label>
              </div>
              {!allDay && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2.5 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316] transition-colors [color-scheme:dark]"
                  />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2.5 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316] transition-colors [color-scheme:dark]"
                  />
                </div>
              )}
            </div>

            {/* Project selector */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
                Projet
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={loadingProjects}
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2.5 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316] transition-colors disabled:opacity-50"
              >
                <option value="">Aucun projet</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} — ${p.name}` : p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Location */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#A1A1AA]">
                <MapPin className="h-3.5 w-3.5" />
                Lieu
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={300}
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#52525B] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316] transition-colors"
                placeholder="Bureau / Chantier Av. de la Gare 12"
              />
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2.5 text-sm text-[#FAFAFA] placeholder-[#52525B] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316] transition-colors resize-none"
                placeholder="Notes ou details supplementaires..."
              />
            </div>

            {/* Attendees */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#A1A1AA]">
                <Users className="h-3.5 w-3.5" />
                Participants
              </label>
              {/* Chips */}
              {attendees.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {attendees.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#1C1C1F] border border-[#27272A] pl-1 pr-2 py-0.5"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F97316]/20 text-[10px] font-semibold text-[#F97316]">
                        {getInitials(email)}
                      </span>
                      <span className="text-xs text-[#A1A1AA] max-w-[160px] truncate">
                        {email}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttendee(email)}
                        className="ml-0.5 rounded-full p-0.5 text-[#52525B] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <input
                  type="email"
                  value={attendeeInput}
                  onChange={(e) => setAttendeeInput(e.target.value)}
                  onKeyDown={handleAddAttendee}
                  className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] pl-3 pr-9 py-2.5 text-sm text-[#FAFAFA] placeholder-[#52525B] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316] transition-colors"
                  placeholder="email@exemple.ch — Entree pour ajouter"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Plus className="h-4 w-4 text-[#52525B]" />
                </div>
              </div>
            </div>

            {/* AI Agenda Suggestions */}
            {projectId && (
              <div className="rounded-xl border border-[#27272A] bg-[#1C1C1F] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#F97316]/10">
                    <Sparkles className="h-3.5 w-3.5 text-[#F97316]" />
                  </div>
                  <span className="text-xs font-medium text-[#FAFAFA]">
                    Suggestions IA pour l&apos;ordre du jour
                  </span>
                </div>

                {loadingSuggestions ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#71717A]" />
                    <span className="text-xs text-[#71717A]">Chargement...</span>
                  </div>
                ) : suggestions.length > 0 ? (
                  <div className="space-y-2">
                    {suggestions.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-start gap-2.5 cursor-pointer group"
                      >
                        <input
                          type="checkbox"
                          checked={s.checked}
                          onChange={() => toggleSuggestion(s.id)}
                          className="mt-0.5 h-4 w-4 rounded border-[#3F3F46] bg-[#0F0F11] text-[#F97316] focus:ring-[#F97316] focus:ring-offset-0"
                        />
                        <span
                          className={`text-sm transition-colors ${
                            s.checked ? "text-[#FAFAFA]" : "text-[#71717A] group-hover:text-[#A1A1AA]"
                          }`}
                        >
                          {s.topic}
                        </span>
                      </label>
                    ))}

                    {/* Show selected items summary */}
                    {suggestions.some((s) => s.checked) && (
                      <div className="mt-3 rounded-lg bg-[#0F0F11] border border-[#27272A] px-3 py-2.5">
                        <p className="text-xs text-[#71717A] mb-1.5">
                          Ordre du jour selectionne :
                        </p>
                        <ol className="list-decimal list-inside space-y-0.5">
                          {suggestions
                            .filter((s) => s.checked)
                            .map((s) => (
                              <li key={s.id} className="text-xs text-[#A1A1AA]">
                                {s.topic}
                              </li>
                            ))}
                        </ol>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#52525B]">
                    Aucune suggestion disponible pour ce projet.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[#27272A] px-6 py-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-[#71717A] hover:bg-[#27272A] hover:text-[#A1A1AA] transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#EA580C] disabled:opacity-50 transition-colors shadow-sm shadow-[#F97316]/20"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Creer l&apos;evenement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
