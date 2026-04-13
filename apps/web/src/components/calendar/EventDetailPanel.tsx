"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  X,
  Edit3,
  Trash2,
  Clock,
  MapPin,
  Calendar,
  Users,
  FileText,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Sparkles,
  FolderKanban,
  Save,
} from "lucide-react";
import type { CalendarEvent, CalendarInvitation } from "@cantaia/core/calendar";

// ── Props ────────────────────────────────────────────────

interface EventDetailPanelProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}

// ── Constants ────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  meeting: "Reunion",
  site_visit: "Visite chantier",
  call: "Appel",
  deadline: "Deadline",
  construction: "Construction",
  milestone: "Jalon",
  other: "Autre",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  meeting: "#3B82F6",
  site_visit: "#10B981",
  call: "#F59E0B",
  deadline: "#EF4444",
  construction: "#8B5CF6",
  milestone: "#F97316",
  other: "#71717A",
};

const EVENT_TYPES = [
  { value: "meeting", label: "Reunion" },
  { value: "site_visit", label: "Visite chantier" },
  { value: "call", label: "Appel" },
  { value: "deadline", label: "Deadline" },
  { value: "construction", label: "Construction" },
  { value: "other", label: "Autre" },
] as const;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  confirmed: { label: "Confirme", color: "#10B981" },
  tentative: { label: "Provisoire", color: "#F59E0B" },
  cancelled: { label: "Annule", color: "#EF4444" },
};

const RESPONSE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  accepted: { label: "Accepte", color: "#10B981" },
  declined: { label: "Refuse", color: "#EF4444" },
  tentative: { label: "Peut-etre", color: "#F59E0B" },
  pending: { label: "En attente", color: "#71717A" },
};

// ── Helpers ──────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
}

function formatDateForInput(iso: string): string {
  return iso.split("T")[0];
}

function formatTimeForInput(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function getInitials(email: string, name?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  const local = email.split("@")[0] || "";
  return local.slice(0, 2).toUpperCase();
}

// ── Component ────────────────────────────────────────────

export function EventDetailPanel({ event, onClose, onUpdated, onDeleted }: EventDetailPanelProps) {
  const [detailedEvent, setDetailedEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editType, setEditType] = useState("meeting");
  const [editAllDay, setEditAllDay] = useState(false);

  // ── Fetch detailed event ─────────────────────────────

  const fetchDetail = useCallback(async (eventId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar/events/${eventId}`);
      if (!res.ok) throw new Error("Failed to fetch event");
      const data = await res.json();
      if (data.event) {
        setDetailedEvent(data.event);
      }
    } catch (err) {
      console.error("[EventDetail] Fetch error:", err);
      // Use the basic event data as fallback
      setDetailedEvent(event);
    } finally {
      setLoading(false);
    }
  }, [event]);

  useEffect(() => {
    if (event?.id) {
      fetchDetail(event.id);
      setEditing(false);
      setShowDeleteConfirm(false);
    } else {
      setDetailedEvent(null);
    }
  }, [event?.id, fetchDetail]);

  // ── Enter edit mode ──────────────────────────────────

  const enterEditMode = useCallback(() => {
    if (!detailedEvent) return;
    setEditTitle(detailedEvent.title || "");
    setEditDescription(detailedEvent.description || "");
    setEditLocation(detailedEvent.location || "");
    setEditDate(formatDateForInput(detailedEvent.start_at));
    setEditStartTime(formatTimeForInput(detailedEvent.start_at));
    setEditEndTime(formatTimeForInput(detailedEvent.end_at));
    setEditType(detailedEvent.event_type || "meeting");
    setEditAllDay(detailedEvent.all_day || false);
    setEditing(true);
  }, [detailedEvent]);

  // ── Save edits ───────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!detailedEvent) return;
    setSaving(true);
    try {
      const startAt = editAllDay
        ? `${editDate}T00:00:00`
        : `${editDate}T${editStartTime}:00`;
      const endAt = editAllDay
        ? `${editDate}T23:59:59`
        : `${editDate}T${editEndTime}:00`;

      const res = await fetch(`/api/calendar/events/${detailedEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription || null,
          location: editLocation || null,
          event_type: editType,
          start_at: startAt,
          end_at: endAt,
          all_day: editAllDay,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Echec de la mise a jour");
      }

      toast.success("Evenement mis a jour");
      setEditing(false);
      await fetchDetail(detailedEvent.id);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la mise a jour");
    } finally {
      setSaving(false);
    }
  }, [detailedEvent, editTitle, editDescription, editLocation, editDate, editStartTime, editEndTime, editType, editAllDay, fetchDetail, onUpdated]);

  // ── Delete event ─────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!detailedEvent) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/calendar/events/${detailedEvent.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Echec de la suppression");
      }

      toast.success("Evenement supprime");
      onDeleted();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la suppression");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [detailedEvent, onDeleted, onClose]);

  // ── Don't render if no event ─────────────────────────

  if (!event) return null;

  const ev = detailedEvent || event;
  const typeColor = EVENT_TYPE_COLORS[ev.event_type] || "#71717A";
  const typeLabel = EVENT_TYPE_LABELS[ev.event_type] || ev.event_type;
  const statusInfo = STATUS_LABELS[ev.status] || STATUS_LABELS.confirmed;
  const invitations: CalendarInvitation[] = (ev as any).invitations || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative w-full max-w-[480px] bg-[#111113] border-l border-[#27272A] overflow-y-auto animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#111113]/95 backdrop-blur-xl border-b border-[#27272A]">
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: typeColor }}
            />
            <h2 className="text-[15px] font-semibold text-[#FAFAFA] font-display truncate max-w-[260px]">
              {editing ? "Modifier l'evenement" : ev.title}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {!editing && (
              <>
                <button
                  onClick={enterEditMode}
                  className="flex items-center justify-center w-8 h-8 rounded-md text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#27272A] transition-colors"
                  title="Modifier"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center justify-center w-8 h-8 rounded-md text-[#A1A1AA] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={() => {
                if (editing) setEditing(false);
                else onClose();
              }}
              className="flex items-center justify-center w-8 h-8 rounded-md text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#27272A] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-[#F97316] animate-spin" />
          </div>
        )}

        {/* ── VIEW MODE ─────────────────────────────── */}
        {!loading && !editing && (
          <div className="px-6 py-5 space-y-5">

            {/* Status + Type badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold"
                style={{
                  backgroundColor: `${typeColor}15`,
                  color: typeColor,
                }}
              >
                {typeLabel}
              </span>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold"
                style={{
                  backgroundColor: `${statusInfo.color}15`,
                  color: statusInfo.color,
                }}
              >
                {statusInfo.label}
              </span>
              {ev.ai_suggested && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F97316]/10 text-[#F97316] text-[11px] font-semibold">
                  <Sparkles className="w-3 h-3" />
                  Cree par IA
                </span>
              )}
              {ev.outlook_event_id && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#3B82F6]/10 text-[#3B82F6] text-[11px] font-semibold">
                  <ExternalLink className="w-3 h-3" />
                  Outlook
                </span>
              )}
            </div>

            {/* Title */}
            <h3 className="text-lg font-semibold text-[#FAFAFA] font-display leading-snug">
              {ev.title}
            </h3>

            {/* Date & Time */}
            <div className="space-y-2.5">
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-[#71717A] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] text-[#FAFAFA] capitalize">
                    {formatDateTime(ev.start_at)}
                  </p>
                  {!ev.all_day && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3.5 h-3.5 text-[#52525B]" />
                      <p className="text-[12px] text-[#A1A1AA]">
                        {formatTime(ev.start_at)} — {formatTime(ev.end_at)}
                      </p>
                    </div>
                  )}
                  {ev.all_day && (
                    <p className="text-[12px] text-[#A1A1AA] mt-0.5">Toute la journee</p>
                  )}
                </div>
              </div>

              {/* Location */}
              {ev.location && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-[#71717A] mt-0.5 flex-shrink-0" />
                  <p className="text-[13px] text-[#FAFAFA]">{ev.location}</p>
                </div>
              )}

              {/* Project */}
              {(ev as any).project && (
                <div className="flex items-start gap-3">
                  <FolderKanban className="w-4 h-4 text-[#71717A] mt-0.5 flex-shrink-0" />
                  <div className="flex items-center gap-2">
                    {(ev as any).project.color && (
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: (ev as any).project.color }}
                      />
                    )}
                    <p className="text-[13px] text-[#FAFAFA]">{(ev as any).project.name}</p>
                    {(ev as any).project.code && (
                      <span className="text-[11px] text-[#52525B] font-mono">
                        ({(ev as any).project.code})
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            {ev.description && (
              <div className="pt-2 border-t border-[#27272A]">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-[#71717A]" />
                  <span className="text-[12px] font-medium text-[#71717A] uppercase tracking-wider">
                    Description
                  </span>
                </div>
                <p className="text-[13px] text-[#A1A1AA] leading-relaxed whitespace-pre-wrap">
                  {ev.description}
                </p>
              </div>
            )}

            {/* Attendees */}
            {invitations.length > 0 && (
              <div className="pt-2 border-t border-[#27272A]">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-[#71717A]" />
                  <span className="text-[12px] font-medium text-[#71717A] uppercase tracking-wider">
                    Participants ({invitations.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {invitations.map((inv, i) => {
                    const responseInfo = RESPONSE_STATUS_LABELS[inv.response_status] || RESPONSE_STATUS_LABELS.pending;
                    return (
                      <div key={inv.id || i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A]">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#27272A] text-[11px] font-bold text-[#A1A1AA] flex-shrink-0">
                          {getInitials(inv.attendee_email, inv.attendee_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-[#FAFAFA] truncate">
                            {inv.attendee_name || inv.attendee_email.split("@")[0]}
                            {inv.is_organizer && (
                              <span className="ml-1.5 text-[10px] text-[#F97316] font-medium">(organisateur)</span>
                            )}
                          </p>
                          <p className="text-[11px] text-[#52525B] truncate">{inv.attendee_email}</p>
                        </div>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                          style={{
                            backgroundColor: `${responseInfo.color}15`,
                            color: responseInfo.color,
                          }}
                        >
                          {responseInfo.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Meeting Prep (AI) */}
            {ev.ai_prep_data && (
              <div className="pt-2 border-t border-[#27272A]">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-[#F97316]" />
                  <span className="text-[12px] font-medium text-[#F97316] uppercase tracking-wider">
                    Preparation IA
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[#F97316]/5 border border-[#F97316]/10">
                  <p className="text-[12px] text-[#A1A1AA] leading-relaxed whitespace-pre-wrap">
                    {typeof ev.ai_prep_data === "string"
                      ? ev.ai_prep_data
                      : JSON.stringify(ev.ai_prep_data, null, 2)}
                  </p>
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="pt-2 border-t border-[#27272A]">
              <div className="flex items-center justify-between text-[11px] text-[#52525B]">
                <span>Cree le {new Date(ev.created_at).toLocaleDateString("fr-CH")}</span>
                {ev.last_synced_at && (
                  <span>Sync: {new Date(ev.last_synced_at).toLocaleString("fr-CH", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── EDIT MODE ──────────────────────────────── */}
        {!loading && editing && (
          <div className="px-6 py-5 space-y-4">
            {/* Title */}
            <div>
              <label className="block text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-1.5">
                Titre
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A] text-[13px] text-[#FAFAFA] placeholder-[#52525B] focus:outline-none focus:border-[#F97316]/50 focus:ring-1 focus:ring-[#F97316]/20 transition-colors"
                placeholder="Titre de l'evenement"
              />
            </div>

            {/* Event type */}
            <div>
              <label className="block text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-1.5">
                Type
              </label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A] text-[13px] text-[#FAFAFA] focus:outline-none focus:border-[#F97316]/50 focus:ring-1 focus:ring-[#F97316]/20 transition-colors"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* All day toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEditAllDay(!editAllDay)}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  editAllDay ? "bg-[#F97316]" : "bg-[#27272A]"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    editAllDay ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="text-[13px] text-[#A1A1AA]">Toute la journee</span>
            </div>

            {/* Date */}
            <div>
              <label className="block text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-1.5">
                Date
              </label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A] text-[13px] text-[#FAFAFA] focus:outline-none focus:border-[#F97316]/50 focus:ring-1 focus:ring-[#F97316]/20 transition-colors [color-scheme:dark]"
              />
            </div>

            {/* Time (if not all day) */}
            {!editAllDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-1.5">
                    Debut
                  </label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A] text-[13px] text-[#FAFAFA] focus:outline-none focus:border-[#F97316]/50 focus:ring-1 focus:ring-[#F97316]/20 transition-colors [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-1.5">
                    Fin
                  </label>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A] text-[13px] text-[#FAFAFA] focus:outline-none focus:border-[#F97316]/50 focus:ring-1 focus:ring-[#F97316]/20 transition-colors [color-scheme:dark]"
                  />
                </div>
              </div>
            )}

            {/* Location */}
            <div>
              <label className="block text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-1.5">
                Lieu
              </label>
              <input
                type="text"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A] text-[13px] text-[#FAFAFA] placeholder-[#52525B] focus:outline-none focus:border-[#F97316]/50 focus:ring-1 focus:ring-[#F97316]/20 transition-colors"
                placeholder="Lieu (optionnel)"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-1.5">
                Description
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A] text-[13px] text-[#FAFAFA] placeholder-[#52525B] focus:outline-none focus:border-[#F97316]/50 focus:ring-1 focus:ring-[#F97316]/20 transition-colors resize-none"
                placeholder="Description (optionnel)"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !editTitle.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#F97316] text-white text-[13px] font-semibold hover:bg-[#EA580C] transition-colors disabled:opacity-50 shadow-sm shadow-[#F97316]/20"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Enregistrer
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="px-4 py-2.5 rounded-lg border border-[#27272A] bg-[#18181B] text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3F3F46] transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* ── DELETE CONFIRMATION ─────────────────────── */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowDeleteConfirm(false)} />
            <div className="relative w-full max-w-sm mx-4 p-6 rounded-xl bg-[#18181B] border border-[#27272A] shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#EF4444]/10">
                  <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-[#FAFAFA]">Supprimer l&apos;evenement ?</h3>
                  <p className="text-[12px] text-[#71717A]">Cette action est irreversible</p>
                </div>
              </div>
              <p className="text-[13px] text-[#A1A1AA] mb-5">
                L&apos;evenement &laquo;{ev.title}&raquo; sera supprime{ev.outlook_event_id ? " de Cantaia et d'Outlook" : ""}.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#EF4444] text-white text-[13px] font-semibold hover:bg-[#DC2626] transition-colors disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Supprimer
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="px-4 py-2.5 rounded-lg border border-[#27272A] bg-[#1C1C1F] text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3F3F46] transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
