"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  X,
  Save,
  CheckCircle,
  FileText,
  ChevronRight,
  ChevronLeft,
  Trash2,
} from "lucide-react";
import type { Meeting, Project } from "@cantaia/database";

const allMeetings: Meeting[] = [];
const allProjects: Project[] = [];

interface PVAction {
  description: string;
  responsible_name: string;
  responsible_company: string;
  deadline: string | null;
  priority: "normal" | "urgent";
}

interface PVSection {
  number: string;
  title: string;
  content: string;
  decisions: string[];
  actions: PVAction[];
}

export default function EditPVPage() {
  const t = useTranslations("meetings");
  const params = useParams();
  const meetingId = params.id as string;

  const meeting = allMeetings.find((m) => m.id === meetingId);
  const project = meeting ? allProjects.find((p) => p.id === meeting.project_id) : null;

  const [sections, setSections] = useState<PVSection[]>([]);
  const [nextMeetingDate, setNextMeetingDate] = useState("");
  const [summaryFr, setSummaryFr] = useState("");
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize from meeting data
  useEffect(() => {
    if (!meeting?.pv_content) return;
    const pv = meeting.pv_content;
    setSections(
      pv.sections.map((s) => ({
        number: s.number,
        title: s.title,
        content: s.content,
        decisions: [...s.decisions],
        actions: s.actions.map((a) => ({ ...a })),
      }))
    );
    setNextMeetingDate(pv.header.next_meeting_date || "");
    setSummaryFr(pv.summary_fr || "");
    setNextSteps([...pv.next_steps]);
  }, [meeting]);

  // Auto-save every 30 seconds
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      if (sections.length > 0) {
        handleSave(true);
      }
    }, 30000);
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, summaryFr, nextSteps, nextMeetingDate]);

  function handleSave(_auto = false) {
    setSaving(true);
    // Mock save
    console.log("[PV Editor] Saving PV:", { sections, nextMeetingDate, summaryFr, nextSteps });
    setTimeout(() => {
      setSaving(false);
      setLastSaved(new Date());
    }, 300);
  }

  function updateSection(idx: number, field: keyof PVSection, value: string) {
    setSections((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );
  }

  function addSection() {
    const num = String(sections.length + 1);
    setSections((prev) => [
      ...prev,
      { number: num, title: "", content: "", decisions: [], actions: [] },
    ]);
  }

  function removeSection(idx: number) {
    setSections((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      return updated.map((s, i) => ({ ...s, number: String(i + 1) }));
    });
  }

  function addDecision(sectionIdx: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIdx ? { ...s, decisions: [...s.decisions, ""] } : s
      )
    );
  }

  function updateDecision(sectionIdx: number, decIdx: number, value: string) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIdx
          ? { ...s, decisions: s.decisions.map((d, di) => (di === decIdx ? value : d)) }
          : s
      )
    );
  }

  function removeDecision(sectionIdx: number, decIdx: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIdx
          ? { ...s, decisions: s.decisions.filter((_, di) => di !== decIdx) }
          : s
      )
    );
  }

  function addAction(sectionIdx: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIdx
          ? {
              ...s,
              actions: [
                ...s.actions,
                { description: "", responsible_name: "", responsible_company: "", deadline: null, priority: "normal" as const },
              ],
            }
          : s
      )
    );
  }

  function updateAction(sectionIdx: number, actIdx: number, field: keyof PVAction, value: string) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIdx
          ? {
              ...s,
              actions: s.actions.map((a, ai) =>
                ai === actIdx ? { ...a, [field]: value } : a
              ),
            }
          : s
      )
    );
  }

  function removeAction(sectionIdx: number, actIdx: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIdx
          ? { ...s, actions: s.actions.filter((_, ai) => ai !== actIdx) }
          : s
      )
    );
  }

  function addNextStep() {
    setNextSteps((prev) => [...prev, ""]);
  }

  function updateNextStep(idx: number, value: string) {
    setNextSteps((prev) => prev.map((s, i) => (i === idx ? value : s)));
  }

  function removeNextStep(idx: number) {
    setNextSteps((prev) => prev.filter((_, i) => i !== idx));
  }

  if (!meeting) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">Séance introuvable</p>
      </div>
    );
  }

  if (!meeting.pv_content) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <FileText className="h-12 w-12 text-gray-300" />
        <p className="text-gray-500">Aucun PV généré pour cette séance.</p>
        <Link
          href="/meetings"
          className="text-sm text-brand hover:underline"
        >
          Retour aux séances
        </Link>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20";

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Main editor */}
      <div className="flex-1 overflow-y-auto p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/meetings"
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {t("pvEditor")} — {meeting.title}
              </h1>
              {project && (
                <p className="mt-0.5 text-sm text-gray-500">
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  {project.name}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-save indicator */}
            {lastSaved && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="h-3 w-3" />
                {t("autoSaved")}
              </span>
            )}
            {/* Toggle transcript */}
            <button
              type="button"
              onClick={() => setShowTranscript(!showTranscript)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              {showTranscript ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
              {t("transcriptionPanel")}
            </button>
            {/* Save button */}
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {t("saveDraft")}
            </button>
            {/* Finalize button */}
            <Link
              href="/meetings"
              className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-4 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              {t("finalize")}
            </Link>
          </div>
        </div>

        {/* PV Header info */}
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <span className="text-gray-500">{t("pvHeader")}</span>
              <p className="font-medium text-gray-900">
                {meeting.pv_content.header.project_name} ({meeting.pv_content.header.project_code})
              </p>
            </div>
            <div>
              <span className="text-gray-500">Séance n°{meeting.pv_content.header.meeting_number}</span>
              <p className="font-medium text-gray-900">{meeting.pv_content.header.date}</p>
            </div>
            <div>
              <label className="text-gray-500">{t("pvNextMeeting")}</label>
              <input
                type="text"
                value={nextMeetingDate}
                onChange={(e) => setNextMeetingDate(e.target.value)}
                placeholder="22.02.2026"
                className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="mt-6 space-y-6">
          {sections.map((section, sIdx) => (
            <div
              key={sIdx}
              className="rounded-lg border border-gray-200 bg-white shadow-sm"
            >
              {/* Section header */}
              <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                  {section.number}
                </span>
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => updateSection(sIdx, "title", e.target.value)}
                  placeholder="Titre du point"
                  className="flex-1 border-0 bg-transparent text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => removeSection(sIdx)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  title={t("deletePoint")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Discussion content */}
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-gray-500">
                    {t("discussion")}
                  </label>
                  <textarea
                    value={section.content}
                    onChange={(e) => updateSection(sIdx, "content", e.target.value)}
                    rows={3}
                    className={inputClass}
                  />
                </div>

                {/* Decisions */}
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-gray-500">
                    {t("decisions")}
                  </label>
                  {section.decisions.map((dec, dIdx) => (
                    <div key={dIdx} className="mb-1.5 flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      <input
                        type="text"
                        value={dec}
                        onChange={(e) => updateDecision(sIdx, dIdx, e.target.value)}
                        className={`flex-1 ${inputClass}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeDecision(sIdx, dIdx)}
                        className="rounded p-1 text-gray-400 hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addDecision(sIdx)}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand"
                  >
                    <Plus className="h-3 w-3" />
                    {t("addDecision")}
                  </button>
                </div>

                {/* Actions */}
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-gray-500">
                    {t("actions")}
                  </label>
                  {section.actions.map((act, aIdx) => (
                    <div
                      key={aIdx}
                      className="mb-2 rounded-md border border-gray-100 bg-gray-50/50 p-3"
                    >
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          type="text"
                          value={act.description}
                          onChange={(e) => updateAction(sIdx, aIdx, "description", e.target.value)}
                          placeholder="Description de l'action"
                          className={`sm:col-span-2 ${inputClass}`}
                        />
                        <input
                          type="text"
                          value={act.responsible_name}
                          onChange={(e) => updateAction(sIdx, aIdx, "responsible_name", e.target.value)}
                          placeholder={t("responsible")}
                          className={inputClass}
                        />
                        <input
                          type="text"
                          value={act.responsible_company}
                          onChange={(e) => updateAction(sIdx, aIdx, "responsible_company", e.target.value)}
                          placeholder={t("company")}
                          className={inputClass}
                        />
                        <input
                          type="text"
                          value={act.deadline || ""}
                          onChange={(e) => updateAction(sIdx, aIdx, "deadline", e.target.value)}
                          placeholder={t("deadline")}
                          className={inputClass}
                        />
                        <div className="flex items-center justify-between">
                          <select
                            value={act.priority}
                            onChange={(e) => updateAction(sIdx, aIdx, "priority", e.target.value)}
                            className={inputClass}
                          >
                            <option value="normal">Normal</option>
                            <option value="urgent">Urgent</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => removeAction(sIdx, aIdx)}
                            className="ml-2 rounded p-1 text-gray-400 hover:text-red-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addAction(sIdx)}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand"
                  >
                    <Plus className="h-3 w-3" />
                    {t("addAction")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add section button */}
        <button
          type="button"
          onClick={addSection}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-4 py-2.5 text-sm text-gray-500 hover:border-brand hover:text-brand"
        >
          <Plus className="h-4 w-4" />
          {t("addPoint")}
        </button>

        {/* Next steps */}
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-semibold text-gray-900">
            {t("pvNextMeeting")} / {t("pvPostponed")}
          </label>
          {nextSteps.map((step, idx) => (
            <div key={idx} className="mb-1.5 flex items-center gap-2">
              <span className="text-xs text-gray-400">→</span>
              <input
                type="text"
                value={step}
                onChange={(e) => updateNextStep(idx, e.target.value)}
                className={`flex-1 ${inputClass}`}
              />
              <button
                type="button"
                onClick={() => removeNextStep(idx)}
                className="rounded p-1 text-gray-400 hover:text-red-500"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addNextStep}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand"
          >
            <Plus className="h-3 w-3" />
            Ajouter
          </button>
        </div>

        {/* Summary */}
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-semibold text-gray-900">
            Résumé
          </label>
          <textarea
            value={summaryFr}
            onChange={(e) => setSummaryFr(e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="Résumé global de la séance..."
          />
        </div>

        <div className="h-8" />
      </div>

      {/* Transcription side panel */}
      {showTranscript && (
        <div className="w-96 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              {t("transcriptionPanel")}
            </h3>
            <button
              type="button"
              onClick={() => setShowTranscript(false)}
              className="rounded p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
            {meeting.transcript_text || "Aucune transcription disponible."}
          </div>
        </div>
      )}
    </div>
  );
}
