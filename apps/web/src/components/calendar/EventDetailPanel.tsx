"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { toLocalISOString, toLocalDateString, toLocaleTag } from "./datetime-utils";
import {
  X,
  Edit3,
  Trash2,
  ArrowUpRight,
  ClipboardList,
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
import { useRouter } from "next/navigation";
import { isVirtualEvent, sourceMetaFor, sourceUrlFor } from "./event-source";

// ── Props ────────────────────────────────────────────────

interface EventDetailPanelProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}

// ── Constants ────────────────────────────────────────────

const EVENT_TYPE_LABEL_KEYS: Record<string, string> = {
  meeting: "typeMeeting",
  site_visit: "typeSiteVisit",
  call: "typeCall",
  deadline: "typeDeadline",
  construction: "typeConstruction",
  milestone: "typeMilestone",
  other: "typeOther",
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
  { value: "meeting", labelKey: "typeMeeting" },
  { value: "site_visit", labelKey: "typeSiteVisit" },
  { value: "call", labelKey: "typeCall" },
  { value: "deadline", labelKey: "typeDeadline" },
  { value: "construction", labelKey: "typeConstruction" },
  { value: "other", labelKey: "typeOther" },
] as const;

const STATUS_META: Record<string, { labelKey: string; color: string }> = {
  confirmed: { labelKey: "statusConfirmed", color: "#10B981" },
  tentative: { labelKey: "statusTentative", color: "#F59E0B" },
  cancelled: { labelKey: "statusCancelled", color: "#EF4444" },
};

const RESPONSE_STATUS_META: Record<string, { labelKey: string; color: string }> = {
  accepted: { labelKey: "responseAccepted", color: "#10B981" },
  declined: { labelKey: "responseDeclined", color: "#EF4444" },
  tentative: { labelKey: "responseTentative", color: "#F59E0B" },
  pending: { labelKey: "responsePending", color: "#71717A" },
};

// ── Helpers ──────────────────────────────────────────────

function formatDateTime(iso: string, localeTag: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(localeTag, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso: string, localeTag: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" });
}

// CAL.C1: use the LOCAL calendar date (iso.split("T")[0] would return the
// UTC date, off by one around midnight for UTC-stored timestamps)
function formatDateForInput(iso: string): string {
  return toLocalDateString(new Date(iso));
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
  const t = useTranslations("calendar");
  const locale = useLocale();
  const localeTag = toLocaleTag(locale);
  const router = useRouter();
  const [detailedEvent, setDetailedEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [creatingPv, setCreatingPv] = useState(false);
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
    // Derived rows ("virt:…") have no calendar_events row — fetching would
    // 400. The projection already carries everything the panel shows.
    if (eventId.startsWith("virt:")) {
      setDetailedEvent(event);
      setLoading(false);
      return;
    }
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
      // CAL.C1: build ISO datetimes WITH the browser's local UTC offset so
      // Postgres stores the correct instant (naive strings were read as UTC)
      const startAt = editAllDay
        ? toLocalISOString(editDate, "00:00")
        : toLocalISOString(editDate, editStartTime);
      const endAt = editAllDay
        ? toLocalISOString(editDate, "23:59")
        : toLocalISOString(editDate, editEndTime);

      // Reject an inverted range before hitting the server (the Graph push
      // fails non-fatally, so a bad range would otherwise be stored silently).
      if (!editAllDay && new Date(endAt).getTime() <= new Date(startAt).getTime()) {
        toast.error(t("endBeforeStart"));
        setSaving(false);
        return;
      }

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
        throw new Error(err.error || t("updateFailed"));
      }

      toast.success(t("eventUpdated"));
      setEditing(false);
      await fetchDetail(detailedEvent.id);
      onUpdated();
    } catch (err: any) {
      toast.error(err.message || t("updateError"));
    } finally {
      setSaving(false);
    }
  }, [detailedEvent, editTitle, editDescription, editLocation, editDate, editStartTime, editEndTime, editType, editAllDay, fetchDetail, onUpdated, t]);

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
        throw new Error(err.error || t("deleteFailed"));
      }

      toast.success(t("eventCancelled"));
      onDeleted();
      onClose();
    } catch (err: any) {
      toast.error(err.message || t("deleteError"));
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [detailedEvent, onDeleted, onClose, t]);

  // ── Don't render if no event ─────────────────────────

  if (!event) return null;

  const ev = detailedEvent || event;
  // Rows projected from another module: read-only, linked, never editable.
  const derived = isVirtualEvent(ev);
  // An expanded recurrence occurrence carries a derived id ("<master>@<iso>")
  // and/or a parent_event_id. Editing it would route the write to the master
  // (resolveEventId) and move/cancel the WHOLE series. The current model has
  // no per-occurrence exception, so occurrences are read-only here; the series
  // is edited from its master row.
  const isOccurrence =
    !derived &&
    ((typeof ev.id === "string" && ev.id.includes("@")) || !!ev.parent_event_id);
  const editable = !derived && !isOccurrence;
  const sourceMeta = sourceMetaFor(ev);
  const sourceUrl = sourceUrlFor(ev);
  // "Créer le PV de cette séance" — only for a real meeting event tied to a
  // project (a virtual PV row already IS a meeting).
  const canCreatePv =
    !derived && ev.event_type === "meeting" && !!ev.project_id;
  const typeColor = EVENT_TYPE_COLORS[ev.event_type] || "#71717A";
  const typeLabel = EVENT_TYPE_LABEL_KEYS[ev.event_type]
    ? t(EVENT_TYPE_LABEL_KEYS[ev.event_type])
    : ev.event_type;
  const statusMeta = STATUS_META[ev.status] || STATUS_META.confirmed;
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
              {editing ? t("editEvent") : ev.title}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {/* Derived rows and recurrence occurrences are read-only here. */}
            {!editing && editable && (
              <>
                <button aria-label={t("edit")}
                  onClick={enterEditMode}
                  className="flex items-center justify-center w-8 h-8 rounded-md text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#27272A] transition-colors"
                  title={t("edit")}
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center justify-center w-8 h-8 rounded-md text-[#A1A1AA] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
                  title={t("delete")}
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

            {/* ── Origin banner (derived rows) ──────────── */}
            {derived && sourceMeta && (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                style={{
                  borderColor: `${sourceMeta.color}33`,
                  backgroundColor: `${sourceMeta.color}0D`,
                }}
              >
                <div className="min-w-0">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: sourceMeta.color }}
                  >
                    {sourceMeta.label}
                  </p>
                  {/* i18n-pending: calendar.derivedEventHint */}
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[#A1A1AA]">
                    Échéance issue d&apos;un autre module. Elle se modifie depuis son module d&apos;origine.
                  </p>
                </div>
                {sourceUrl && (
                  <button
                    type="button"
                    onClick={() => router.push(sourceUrl)}
                    className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-[#27272A] bg-[#18181B] px-3 py-1.5 text-[12px] font-medium text-[#FAFAFA] transition-colors hover:border-[#3F3F46]"
                  >
                    {/* i18n-pending: calendar.openInModule */}
                    Ouvrir
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* ── Recurrence occurrence: read-only, edit the series ─────── */}
            {isOccurrence && (
              <div className="flex items-start gap-2.5 rounded-lg border border-[#3B82F6]/20 bg-[#3B82F6]/[0.06] px-3 py-2.5">
                <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#3B82F6]" />
                <p className="text-[12px] leading-relaxed text-[#A1A1AA]">
                  {t("recurringOccurrenceHint")}
                </p>
              </div>
            )}

            {/* ── Créer le PV de cette séance ───────────── */}
            {canCreatePv && (
              <button
                type="button"
                disabled={creatingPv}
                onClick={async () => {
                  setCreatingPv(true);
                  try {
                    const res = await fetch(
                      `/api/calendar/events/${encodeURIComponent(ev.id)}/create-pv`,
                      { method: "POST" }
                    );
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      throw new Error(data.error || "Création du PV impossible");
                    }
                    // i18n-pending: calendar.pvCreated / calendar.pvAlreadyExists
                    toast.success(
                      data.already_existed
                        ? "PV déjà créé pour cette séance — ouverture."
                        : "PV de séance créé."
                    );
                    router.push(`/pv-chantier/${data.meeting_id}`);
                  } catch (err: any) {
                    toast.error(err.message || "Création du PV impossible");
                  } finally {
                    setCreatingPv(false);
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-4 py-2.5 text-[13px] font-semibold text-[#3B82F6] transition-colors hover:bg-[#3B82F6]/15 disabled:opacity-50"
              >
                {creatingPv ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardList className="h-4 w-4" />
                )}
                {/* i18n-pending: calendar.createPvForMeeting */}
                Créer le PV de cette séance
              </button>
            )}

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
                  backgroundColor: `${statusMeta.color}15`,
                  color: statusMeta.color,
                }}
              >
                {t(statusMeta.labelKey)}
              </span>
              {ev.ai_suggested && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F97316]/10 text-[#F97316] text-[11px] font-semibold">
                  <Sparkles className="w-3 h-3" />
                  {t("createdByAI")}
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
                <Calendar className="w-4 h-4 text-[#A1A1AA] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] text-[#FAFAFA] capitalize">
                    {formatDateTime(ev.start_at, localeTag)}
                  </p>
                  {!ev.all_day && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3.5 h-3.5 text-[#A1A1AA]" />
                      <p className="text-[12px] text-[#A1A1AA]">
                        {formatTime(ev.start_at, localeTag)} — {formatTime(ev.end_at, localeTag)}
                      </p>
                    </div>
                  )}
                  {ev.all_day && (
                    <p className="text-[12px] text-[#A1A1AA] mt-0.5">{t("allDayFull")}</p>
                  )}
                </div>
              </div>

              {/* Location */}
              {ev.location && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-[#A1A1AA] mt-0.5 flex-shrink-0" />
                  <p className="text-[13px] text-[#FAFAFA]">{ev.location}</p>
                </div>
              )}

              {/* Project */}
              {(ev as any).project && (
                <div className="flex items-start gap-3">
                  <FolderKanban className="w-4 h-4 text-[#A1A1AA] mt-0.5 flex-shrink-0" />
                  <div className="flex items-center gap-2">
                    {(ev as any).project.color && (
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: (ev as any).project.color }}
                      />
                    )}
                    <p className="text-[13px] text-[#FAFAFA]">{(ev as any).project.name}</p>
                    {(ev as any).project.code && (
                      <span className="text-[11px] text-[#A1A1AA] font-mono">
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
                  <FileText className="w-4 h-4 text-[#A1A1AA]" />
                  <span className="text-[12px] font-medium text-[#A1A1AA] uppercase tracking-wider">
                    {t("descriptionLabel")}
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
                  <Users className="w-4 h-4 text-[#A1A1AA]" />
                  <span className="text-[12px] font-medium text-[#A1A1AA] uppercase tracking-wider">
                    {t("attendeesCount", { count: invitations.length })}
                  </span>
                </div>
                <div className="space-y-2">
                  {invitations.map((inv, i) => {
                    const responseInfo = RESPONSE_STATUS_META[inv.response_status] || RESPONSE_STATUS_META.pending;
                    return (
                      <div key={inv.id || i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A]">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#27272A] text-[11px] font-bold text-[#A1A1AA] flex-shrink-0">
                          {getInitials(inv.attendee_email, inv.attendee_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-[#FAFAFA] truncate">
                            {inv.attendee_name || inv.attendee_email.split("@")[0]}
                            {inv.is_organizer && (
                              <span className="ml-1.5 text-[10px] text-[#F97316] font-medium">{t("organizer")}</span>
                            )}
                          </p>
                          <p className="text-[11px] text-[#A1A1AA] truncate">{inv.attendee_email}</p>
                        </div>
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                          style={{
                            backgroundColor: `${responseInfo.color}15`,
                            color: responseInfo.color,
                          }}
                        >
                          {t(responseInfo.labelKey)}
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
                    {t("meetingPrep")}
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
              <div className="flex items-center justify-between text-[11px] text-[#A1A1AA]">
                <span>{t("createdOn", { date: new Date(ev.created_at).toLocaleDateString(localeTag) })}</span>
                {ev.last_synced_at && (
                  <span>{t("syncedAt", { date: new Date(ev.last_synced_at).toLocaleString(localeTag, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) })}</span>
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
              <label className="block text-[11px] font-medium text-[#A1A1AA] uppercase tracking-wider mb-1.5">
                {t("titleLabel")}
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A] text-[13px] text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#F97316]/50 focus:ring-1 focus:ring-[#F97316]/20 transition-colors"
                placeholder={t("editTitlePlaceholder")}
              />
            </div>

            {/* Event type */}
            <div>
              <label className="block text-[11px] font-medium text-[#A1A1AA] uppercase tracking-wider mb-1.5">
                {t("typeLabel")}
              </label>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A] text-[13px] text-[#FAFAFA] focus:outline-none focus:border-[#F97316]/50 focus:ring-1 focus:ring-[#F97316]/20 transition-colors"
              >
                {EVENT_TYPES.map((et) => (
                  <option key={et.value} value={et.value}>
                    {t(et.labelKey)}
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
              <span className="text-[13px] text-[#A1A1AA]">{t("allDayFull")}</span>
            </div>

            {/* Date */}
            <div>
              <label className="block text-[11px] font-medium text-[#A1A1AA] uppercase tracking-wider mb-1.5">
                {t("dateLabel")}
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
                  <label className="block text-[11px] font-medium text-[#A1A1AA] uppercase tracking-wider mb-1.5">
                    {t("startLabel")}
                  </label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A] text-[13px] text-[#FAFAFA] focus:outline-none focus:border-[#F97316]/50 focus:ring-1 focus:ring-[#F97316]/20 transition-colors [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#A1A1AA] uppercase tracking-wider mb-1.5">
                    {t("endLabel")}
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
              <label className="block text-[11px] font-medium text-[#A1A1AA] uppercase tracking-wider mb-1.5">
                {t("locationLabel")}
              </label>
              <input
                type="text"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A] text-[13px] text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#F97316]/50 focus:ring-1 focus:ring-[#F97316]/20 transition-colors"
                placeholder={t("locationOptional")}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-[11px] font-medium text-[#A1A1AA] uppercase tracking-wider mb-1.5">
                {t("descriptionLabel")}
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-[#27272A] text-[13px] text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:border-[#F97316]/50 focus:ring-1 focus:ring-[#F97316]/20 transition-colors resize-none"
                placeholder={t("descriptionOptional")}
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !editTitle.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#F97316] text-[#0F0F11] text-[13px] font-semibold hover:bg-[#EA580C] transition-colors disabled:opacity-50 shadow-sm shadow-[#F97316]/20"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {t("save")}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="px-4 py-2.5 rounded-lg border border-[#27272A] bg-[#18181B] text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3F3F46] transition-colors"
              >
                {t("cancel")}
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
                  <h3 className="text-[15px] font-semibold text-[#FAFAFA]">{t("deleteConfirmTitle")}</h3>
                  {/* CAL.B2: DELETE is a soft delete (status=cancelled), not irreversible destruction */}
                  <p className="text-[12px] text-[#A1A1AA]">{t("deleteConfirmSubtitle")}</p>
                </div>
              </div>
              <p className="text-[13px] text-[#A1A1AA] mb-5">
                {ev.outlook_event_id
                  ? t("deleteConfirmBodyOutlook", { title: ev.title })
                  : t("deleteConfirmBody", { title: ev.title })}
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
                  {t("delete")}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="px-4 py-2.5 rounded-lg border border-[#27272A] bg-[#1C1C1F] text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3F3F46] transition-colors"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
