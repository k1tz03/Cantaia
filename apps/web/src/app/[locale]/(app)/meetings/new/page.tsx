"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ArrowLeft,
  Plus,
  X,
  Loader2,
  Mic,
  UserPlus,
  Clock,
  MapPin,
  Calendar,
} from "lucide-react";
import type { MeetingParticipant, Meeting, Project } from "@cantaia/database";

const allMeetings: Meeting[] = [];
const allProjects: Project[] = [];

function getNextMeetingNumber(projectId: string): number {
  const projectMeetings = allMeetings.filter((m) => m.project_id === projectId);
  if (projectMeetings.length === 0) return 1;
  const maxNum = Math.max(...projectMeetings.map((m) => m.meeting_number ?? 0));
  return maxNum + 1;
}

function getLastMeetingParticipants(projectId: string): MeetingParticipant[] {
  const projectMeetings = allMeetings
    .filter((m) => m.project_id === projectId)
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
  if (projectMeetings.length === 0) return [];
  return projectMeetings[0].participants.map((p) => ({ ...p, present: true }));
}

function getLastMeetingLocation(projectId: string): string {
  const projectMeetings = allMeetings
    .filter((m) => m.project_id === projectId)
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
  return projectMeetings[0]?.location ?? "";
}

function getTodayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DURATION_OPTIONS = [30, 45, 60, 90, 120, 150, 180];

export default function NewMeetingPage() {
  const t = useTranslations("meetings");
  const tc = useTranslations("common");
  const router = useRouter();

  const [projectId, setProjectId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [meetingNumber, setMeetingNumber] = useState<number | null>(null);
  const [date, setDate] = useState(getTodayDateStr());
  const [time, setTime] = useState("14:00");
  const [location, setLocation] = useState("");
  const [duration, setDuration] = useState(90);
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [agenda, setAgenda] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New participant form
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [newParticipant, setNewParticipant] = useState({
    name: "",
    company: "",
    role: "",
    email: "",
  });

  const projectsList = allProjects;

  const handleProjectChange = useCallback((newProjectId: string) => {
    setProjectId(newProjectId);
    if (!newProjectId) {
      setTitle("");
      setMeetingNumber(null);
      setParticipants([]);
      setLocation("");
      return;
    }
    const num = getNextMeetingNumber(newProjectId);
    setMeetingNumber(num);
    setTitle(`Séance de chantier #${num}`);
    setParticipants(getLastMeetingParticipants(newProjectId));
    setLocation(getLastMeetingLocation(newProjectId));
  }, []);

  const toggleParticipantPresent = useCallback((index: number) => {
    setParticipants((prev) =>
      prev.map((p, i) => (i === index ? { ...p, present: !p.present } : p))
    );
  }, []);

  const removeParticipant = useCallback((index: number) => {
    setParticipants((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addParticipant = useCallback(() => {
    if (!newParticipant.name.trim() || !newParticipant.company.trim()) return;
    setParticipants((prev) => [
      ...prev,
      {
        name: newParticipant.name.trim(),
        company: newParticipant.company.trim(),
        role: newParticipant.role.trim(),
        email: newParticipant.email.trim() || null,
        present: true,
      },
    ]);
    setNewParticipant({ name: "", company: "", role: "", email: "" });
    setShowAddParticipant(false);
  }, [newParticipant]);

  const updateAgendaPoint = useCallback((index: number, value: string) => {
    setAgenda((prev) => prev.map((item, i) => (i === index ? value : item)));
  }, []);

  const addAgendaPoint = useCallback(() => {
    setAgenda((prev) => [...prev, ""]);
  }, []);

  const removeAgendaPoint = useCallback((index: number) => {
    setAgenda((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const isValid = useMemo(() => {
    return projectId && title.trim() && date && time;
  }, [projectId, title, date, time]);

  async function handleSubmit(startRecording: boolean) {
    if (!isValid) return;
    setSaving(true);
    setErrorMsg(null);

    const meetingDate = `${date}T${time}:00Z`;
    const filteredAgenda = agenda.filter((a) => a.trim());

    const payload = {
      project_id: projectId,
      title: title.trim(),
      meeting_number: meetingNumber,
      meeting_date: meetingDate,
      location: location.trim() || undefined,
      planned_duration_minutes: duration,
      agenda: filteredAgenda,
      participants,
    };

    try {
      // For now, mock save — later will be POST /api/meetings/create
      console.log("[NewMeeting] Payload:", payload);

      // Simulate save delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (startRecording) {
        // Will navigate to /meetings/[id]/record in future
        router.push("/meetings");
      } else {
        router.push("/meetings");
      }
    } catch (err) {
      console.error("[NewMeeting] Error:", err);
      setErrorMsg("Erreur lors de la création de la séance");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/meetings"
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t("newMeeting")}</h1>
        </div>
      </div>

      <div className="mt-8 max-w-3xl">
        {/* Section: Informations générales */}
        <fieldset className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <legend className="px-2 text-sm font-semibold text-gray-900">
            {t("projectLabel")}
          </legend>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* Project */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t("projectLabel")} *
              </label>
              <select
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                className={inputClass}
              >
                <option value="">— {t("allProjects")} —</option>
                {projectsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {t("titleLabel")} *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Séance de chantier #1"
                className={inputClass}
              />
            </div>

            {/* Date + Time */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <Calendar className="h-3.5 w-3.5" />
                {t("dateLabel")} *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <Clock className="h-3.5 w-3.5" />
                {t("timeLabel")} *
              </label>
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Location */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <MapPin className="h-3.5 w-3.5" />
                {t("locationLabel")}
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Baraque de chantier, Rte de Chavannes"
                className={inputClass}
              />
            </div>

            {/* Duration */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <Clock className="h-3.5 w-3.5" />
                {t("durationLabel")}
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className={inputClass}
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d >= 60
                      ? `${Math.floor(d / 60)}${t("hours")}${d % 60 > 0 ? ` ${d % 60}${t("minutes")}` : ""}`
                      : `${d} ${t("minutes")}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        {/* Section: Participants */}
        <fieldset className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <legend className="px-2 text-sm font-semibold text-gray-900">
            {t("participantsLabel")}
          </legend>

          {participants.length === 0 && !projectId && (
            <p className="text-sm text-gray-400 italic">
              Sélectionnez un projet pour pré-remplir les participants.
            </p>
          )}

          {participants.length > 0 && (
            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1fr_1fr_80px_32px] gap-2 text-xs font-medium uppercase text-gray-500">
                <span>{t("participantName")}</span>
                <span>{t("participantCompany")}</span>
                <span>{t("participantRole")}</span>
                <span className="text-center">{t("present")}</span>
                <span />
              </div>

              {participants.map((p, idx) => (
                <div
                  key={`${p.name}-${idx}`}
                  className="grid grid-cols-[1fr_1fr_1fr_80px_32px] items-center gap-2 rounded-md border border-gray-100 bg-gray-50/50 px-3 py-2"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-800">{p.name}</span>
                    {p.email && (
                      <span className="ml-2 text-xs text-gray-400">{p.email}</span>
                    )}
                  </div>
                  <span className="text-sm text-gray-600">{p.company}</span>
                  <span className="text-sm text-gray-500">{p.role}</span>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => toggleParticipantPresent(idx)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        p.present
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {p.present ? t("present") : t("absent")}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeParticipant(idx)}
                    className="flex items-center justify-center rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add participant form */}
          {showAddParticipant ? (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/30 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={newParticipant.name}
                  onChange={(e) =>
                    setNewParticipant((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder={`${t("participantName")} *`}
                  className={inputClass}
                  autoFocus
                />
                <input
                  type="text"
                  value={newParticipant.company}
                  onChange={(e) =>
                    setNewParticipant((prev) => ({ ...prev, company: e.target.value }))
                  }
                  placeholder={`${t("participantCompany")} *`}
                  className={inputClass}
                />
                <input
                  type="text"
                  value={newParticipant.role}
                  onChange={(e) =>
                    setNewParticipant((prev) => ({ ...prev, role: e.target.value }))
                  }
                  placeholder={t("participantRole")}
                  className={inputClass}
                />
                <input
                  type="email"
                  value={newParticipant.email}
                  onChange={(e) =>
                    setNewParticipant((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder={t("participantEmail")}
                  className={inputClass}
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={addParticipant}
                  disabled={!newParticipant.name.trim() || !newParticipant.company.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {tc("create")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddParticipant(false);
                    setNewParticipant({ name: "", company: "", role: "", email: "" });
                  }}
                  className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                >
                  {tc("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddParticipant(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-brand hover:text-brand"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {t("addParticipant")}
            </button>
          )}
        </fieldset>

        {/* Section: Agenda */}
        <fieldset className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <legend className="px-2 text-sm font-semibold text-gray-900">
            {t("agendaLabel")}
          </legend>

          <div className="space-y-2">
            {agenda.map((point, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
                  {idx + 1}
                </span>
                <input
                  type="text"
                  value={point}
                  onChange={(e) => updateAgendaPoint(idx, e.target.value)}
                  placeholder={idx === 0 ? "Tour de table / remarques générales" : `Point ${idx + 1}`}
                  className={`flex-1 ${inputClass}`}
                />
                {agenda.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAgendaPoint(idx)}
                    className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addAgendaPoint}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-brand hover:text-brand"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addAgendaPoint")}
          </button>
        </fieldset>

        {/* Error message */}
        {errorMsg && (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Actions */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={!isValid || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-500 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("createMeeting")}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={!isValid || saving}
            className="inline-flex items-center gap-2 rounded-lg border border-brand bg-brand/5 px-6 py-2.5 text-sm font-semibold text-brand shadow-sm transition-colors hover:bg-brand/10 disabled:opacity-50"
          >
            <Mic className="h-4 w-4" />
            {t("createAndRecord")}
          </button>
          <Link
            href="/meetings"
            className="rounded-lg px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            {tc("cancel")}
          </Link>
        </div>
      </div>
    </div>
  );
}
