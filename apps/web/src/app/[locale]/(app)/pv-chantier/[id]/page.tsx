"use client";

import { useState, useEffect, use } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Save,
  CheckCircle,
  FileDown,
  RotateCcw,
  Plus,
  X,
  Loader2,
  ArrowLeft,
  FileText,
  ListChecks,
  Headphones,
  Trash2,
  AlertTriangle,
} from "lucide-react";
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

export default function PVDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("pv");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [meeting, setMeeting] = useState<any>(null);
  const [pvContent, setPvContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "transcription" | "actions" | "audio"
  >("transcription");
  const [selectedActions, setSelectedActions] = useState<Set<number>>(
    new Set()
  );
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Load meeting data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/pv/${id}`);
        const data = await res.json();
        if (data.success && data.meeting) {
          setMeeting(data.meeting);
          if (data.meeting.pv_content) {
            setPvContent(data.meeting.pv_content);
            // Select all actions by default
            const allActions: number[] = [];
            let idx = 0;
            for (const section of data.meeting.pv_content.sections || []) {
              for (const _action of section.actions || []) {
                allActions.push(idx++);
              }
            }
            setSelectedActions(new Set(allActions));
          }
        }
      } catch (err) {
        console.error("Failed to load meeting:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Save handler
  const handleSave = async () => {
    if (!pvContent) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pv/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pv_content: pvContent }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMessage(t("saved"));
        setTimeout(() => setSaveMessage(null), 2000);
      }
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  // Finalize handler
  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      const res = await fetch(`/api/pv/${id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selected_action_indices: Array.from(selectedActions),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMessage(
          `${t("finalized")}. ${data.tasks_created} ${t("tasks_created_label")}`
        );
        setMeeting({ ...meeting, status: "finalized" });
        setShowFinalizeDialog(false);
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch (err) {
      console.error("Finalize failed:", err);
    } finally {
      setFinalizing(false);
    }
  };

  // Regenerate handler
  const handleRegenerate = async () => {
    setRegenerating(true);
    setShowRegenerateDialog(false);
    try {
      const res = await fetch("/api/ai/generate-pv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_id: id }),
      });
      const data = await res.json();
      if (data.success && data.pv_content) {
        setPvContent(data.pv_content);
      }
    } catch (err) {
      console.error("Regenerate failed:", err);
    } finally {
      setRegenerating(false);
    }
  };

  // Export PDF
  const handleExportPDF = async () => {
    // Save current content first
    await handleSave();
    window.open(`/api/pv/${id}/export-pdf`, "_blank");
  };

  // PV content helpers
  const updateSection = (index: number, field: string, value: any) => {
    const sections = [...(pvContent.sections || [])];
    sections[index] = { ...sections[index], [field]: value };
    setPvContent({ ...pvContent, sections });
  };

  const addSection = () => {
    const sections = [...(pvContent.sections || [])];
    sections.push({
      number: String(sections.length + 1),
      title: "",
      content: "",
      decisions: [],
      actions: [],
    });
    setPvContent({ ...pvContent, sections });
  };

  const removeSection = (index: number) => {
    const sections = (pvContent.sections || []).filter(
      (_: any, i: number) => i !== index
    );
    // Renumber
    sections.forEach((s: any, i: number) => (s.number = String(i + 1)));
    setPvContent({ ...pvContent, sections });
  };

  const addDecision = (sectionIndex: number) => {
    const sections = [...(pvContent.sections || [])];
    sections[sectionIndex] = {
      ...sections[sectionIndex],
      decisions: [...(sections[sectionIndex].decisions || []), ""],
    };
    setPvContent({ ...pvContent, sections });
  };

  const updateDecision = (
    sectionIndex: number,
    decisionIndex: number,
    value: string
  ) => {
    const sections = [...(pvContent.sections || [])];
    const decisions = [...(sections[sectionIndex].decisions || [])];
    decisions[decisionIndex] = value;
    sections[sectionIndex] = { ...sections[sectionIndex], decisions };
    setPvContent({ ...pvContent, sections });
  };

  const removeDecision = (
    sectionIndex: number,
    decisionIndex: number
  ) => {
    const sections = [...(pvContent.sections || [])];
    const decisions = (sections[sectionIndex].decisions || []).filter(
      (_: any, i: number) => i !== decisionIndex
    );
    sections[sectionIndex] = { ...sections[sectionIndex], decisions };
    setPvContent({ ...pvContent, sections });
  };

  const addAction = (sectionIndex: number) => {
    const sections = [...(pvContent.sections || [])];
    sections[sectionIndex] = {
      ...sections[sectionIndex],
      actions: [
        ...(sections[sectionIndex].actions || []),
        {
          description: "",
          responsible_name: "",
          responsible_company: "",
          deadline: null,
          priority: "normal" as const,
        },
      ],
    };
    setPvContent({ ...pvContent, sections });
  };

  const updateAction = (
    sectionIndex: number,
    actionIndex: number,
    field: string,
    value: any
  ) => {
    const sections = [...(pvContent.sections || [])];
    const actions = [...(sections[sectionIndex].actions || [])];
    actions[actionIndex] = { ...actions[actionIndex], [field]: value };
    sections[sectionIndex] = { ...sections[sectionIndex], actions };
    setPvContent({ ...pvContent, sections });
  };

  const removeAction = (sectionIndex: number, actionIndex: number) => {
    const sections = [...(pvContent.sections || [])];
    const actions = (sections[sectionIndex].actions || []).filter(
      (_: any, i: number) => i !== actionIndex
    );
    sections[sectionIndex] = { ...sections[sectionIndex], actions };
    setPvContent({ ...pvContent, sections });
  };

  // Collect all actions for the actions tab
  const allActions: Array<PVAction & { sectionTitle: string; globalIndex: number }> = [];
  let globalIdx = 0;
  if (pvContent?.sections) {
    for (const section of pvContent.sections) {
      for (const action of section.actions || []) {
        allActions.push({
          ...action,
          sectionTitle: section.title,
          globalIndex: globalIdx++,
        });
      }
    }
  }

  const toggleAction = (index: number) => {
    const next = new Set(selectedActions);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedActions(next);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!meeting || !pvContent) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <FileText className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">{t("no_pv_found")}</p>
        <button
          onClick={() => router.push("/pv-chantier")}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {tCommon("back")}
        </button>
      </div>
    );
  }

  const isFinalized = meeting.status === "finalized" || meeting.status === "sent";

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/pv-chantier")}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              {meeting.title}
            </h1>
            {meeting.projects && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: meeting.projects.color,
                  }}
                />
                {meeting.projects.name}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveMessage && (
            <span className="text-sm text-green-600">{saveMessage}</span>
          )}

          {!isFinalized && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {t("save_draft")}
            </button>
          )}

          {!isFinalized && (
            <button
              onClick={() => setShowFinalizeDialog(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              {t("finalize")}
            </button>
          )}

          <button
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <FileDown className="h-3.5 w-3.5" />
            {t("export_pdf")}
          </button>

          {meeting.status === "review" && (
            <button
              onClick={() => setShowRegenerateDialog(true)}
              disabled={regenerating}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              {t("regenerate")}
            </button>
          )}
        </div>
      </div>

      {/* Main content: 2 columns on desktop */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column: PV Editor */}
        <div className="flex-1 overflow-y-auto p-6 lg:w-[65%]">
          {/* Header */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  {t("col_title")}
                </label>
                <input
                  type="text"
                  value={pvContent.header?.date || ""}
                  onChange={(e) =>
                    setPvContent({
                      ...pvContent,
                      header: { ...pvContent.header, date: e.target.value },
                    })
                  }
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm disabled:bg-gray-50"
                  disabled={isFinalized}
                  placeholder={t("date")}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  {t("location")}
                </label>
                <input
                  type="text"
                  value={pvContent.header?.location || ""}
                  onChange={(e) =>
                    setPvContent({
                      ...pvContent,
                      header: {
                        ...pvContent.header,
                        location: e.target.value,
                      },
                    })
                  }
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm disabled:bg-gray-50"
                  disabled={isFinalized}
                />
              </div>
            </div>
          </div>

          {/* Sections */}
          {(pvContent.sections || []).map(
            (section: PVSection, sectionIdx: number) => (
              <div
                key={sectionIdx}
                className="mb-4 rounded-lg border border-gray-200 bg-white p-4"
              >
                {/* Section header */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-brand/10 text-xs font-semibold text-brand">
                      {section.number}
                    </span>
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) =>
                        updateSection(sectionIdx, "title", e.target.value)
                      }
                      className="border-0 bg-transparent text-sm font-semibold text-gray-900 focus:outline-none disabled:text-gray-500"
                      placeholder={t("section_title")}
                      disabled={isFinalized}
                    />
                  </div>
                  {!isFinalized && (
                    <button
                      onClick={() => removeSection(sectionIdx)}
                      className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                      title={t("delete_section")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Content */}
                <div className="mb-3">
                  <label className="mb-1 block text-xs text-gray-500">
                    {t("discussion")}
                  </label>
                  <textarea
                    value={section.content}
                    onChange={(e) =>
                      updateSection(sectionIdx, "content", e.target.value)
                    }
                    rows={3}
                    className="w-full resize-none rounded border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none disabled:bg-gray-50"
                    disabled={isFinalized}
                  />
                </div>

                {/* Decisions */}
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    {t("decisions")}
                  </label>
                  {(section.decisions || []).map(
                    (decision: string, decIdx: number) => (
                      <div
                        key={decIdx}
                        className="mb-1 flex items-center gap-1"
                      >
                        <span className="text-xs text-gray-400">•</span>
                        <input
                          type="text"
                          value={decision}
                          onChange={(e) =>
                            updateDecision(
                              sectionIdx,
                              decIdx,
                              e.target.value
                            )
                          }
                          className="flex-1 rounded border border-gray-100 px-2 py-1 text-sm focus:border-brand focus:outline-none disabled:bg-gray-50"
                          disabled={isFinalized}
                        />
                        {!isFinalized && (
                          <button
                            onClick={() =>
                              removeDecision(sectionIdx, decIdx)
                            }
                            className="rounded p-0.5 text-gray-300 hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )
                  )}
                  {!isFinalized && (
                    <button
                      onClick={() => addDecision(sectionIdx)}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                    >
                      <Plus className="h-3 w-3" />
                      {t("add_decision")}
                    </button>
                  )}
                </div>

                {/* Actions */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    {t("actions")}
                  </label>
                  {(section.actions || []).map(
                    (action: PVAction, actIdx: number) => (
                      <div
                        key={actIdx}
                        className="mb-2 rounded border border-gray-100 bg-gray-50 p-2"
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="text"
                            value={action.description}
                            onChange={(e) =>
                              updateAction(
                                sectionIdx,
                                actIdx,
                                "description",
                                e.target.value
                              )
                            }
                            placeholder={t("action_description")}
                            className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-sm focus:border-brand focus:outline-none disabled:bg-gray-50"
                            disabled={isFinalized}
                          />
                          {!isFinalized && (
                            <button
                              onClick={() =>
                                removeAction(sectionIdx, actIdx)
                              }
                              className="rounded p-0.5 text-gray-300 hover:text-red-500"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                          <input
                            type="text"
                            value={action.responsible_name}
                            onChange={(e) =>
                              updateAction(
                                sectionIdx,
                                actIdx,
                                "responsible_name",
                                e.target.value
                              )
                            }
                            placeholder={t("responsible")}
                            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-brand focus:outline-none disabled:bg-gray-50"
                            disabled={isFinalized}
                          />
                          <input
                            type="text"
                            value={action.responsible_company}
                            onChange={(e) =>
                              updateAction(
                                sectionIdx,
                                actIdx,
                                "responsible_company",
                                e.target.value
                              )
                            }
                            placeholder={t("company")}
                            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-brand focus:outline-none disabled:bg-gray-50"
                            disabled={isFinalized}
                          />
                          <input
                            type="text"
                            value={action.deadline || ""}
                            onChange={(e) =>
                              updateAction(
                                sectionIdx,
                                actIdx,
                                "deadline",
                                e.target.value || null
                              )
                            }
                            placeholder={t("deadline")}
                            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-brand focus:outline-none disabled:bg-gray-50"
                            disabled={isFinalized}
                          />
                          <select
                            value={action.priority}
                            onChange={(e) =>
                              updateAction(
                                sectionIdx,
                                actIdx,
                                "priority",
                                e.target.value
                              )
                            }
                            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-brand focus:outline-none disabled:bg-gray-50"
                            disabled={isFinalized}
                          >
                            <option value="normal">
                              {t("priority_normal")}
                            </option>
                            <option value="urgent">
                              {t("priority_urgent")}
                            </option>
                          </select>
                        </div>
                      </div>
                    )
                  )}
                  {!isFinalized && (
                    <button
                      onClick={() => addAction(sectionIdx)}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                    >
                      <Plus className="h-3 w-3" />
                      {t("add_action")}
                    </button>
                  )}
                </div>
              </div>
            )
          )}

          {/* Add section */}
          {!isFinalized && (
            <button
              onClick={addSection}
              className="mb-6 inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 py-3 text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700"
            >
              <Plus className="h-4 w-4" />
              {t("add_section")}
            </button>
          )}

          {/* Summary & Next Steps */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                {t("summary")}
              </label>
              <textarea
                value={pvContent.summary_fr || pvContent.summary || ""}
                onChange={(e) =>
                  setPvContent({
                    ...pvContent,
                    summary_fr: e.target.value,
                  })
                }
                rows={3}
                className="w-full resize-none rounded border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none disabled:bg-gray-50"
                disabled={isFinalized}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                {t("next_steps")}
              </label>
              {(pvContent.next_steps || []).map(
                (step: string, i: number) => (
                  <div key={i} className="mb-1 flex items-center gap-1">
                    <span className="text-xs text-gray-400">
                      {i + 1}.
                    </span>
                    <input
                      type="text"
                      value={step}
                      onChange={(e) => {
                        const steps = [...(pvContent.next_steps || [])];
                        steps[i] = e.target.value;
                        setPvContent({ ...pvContent, next_steps: steps });
                      }}
                      className="flex-1 rounded border border-gray-100 px-2 py-1 text-sm focus:border-brand focus:outline-none disabled:bg-gray-50"
                      disabled={isFinalized}
                    />
                    {!isFinalized && (
                      <button
                        onClick={() => {
                          const steps = (
                            pvContent.next_steps || []
                          ).filter((_: any, idx: number) => idx !== i);
                          setPvContent({ ...pvContent, next_steps: steps });
                        }}
                        className="rounded p-0.5 text-gray-300 hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )
              )}
              {!isFinalized && (
                <button
                  onClick={() =>
                    setPvContent({
                      ...pvContent,
                      next_steps: [
                        ...(pvContent.next_steps || []),
                        "",
                      ],
                    })
                  }
                  className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  <Plus className="h-3 w-3" />
                  {t("add_next_step")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Side panel */}
        <div className="hidden w-[35%] border-l border-gray-200 bg-gray-50 lg:flex lg:flex-col">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab("transcription")}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                activeTab === "transcription"
                  ? "border-b-2 border-brand text-brand"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <FileText className="mr-1 inline h-3.5 w-3.5" />
              {t("transcription")}
            </button>
            <button
              onClick={() => setActiveTab("actions")}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                activeTab === "actions"
                  ? "border-b-2 border-brand text-brand"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <ListChecks className="mr-1 inline h-3.5 w-3.5" />
              {t("actions")} ({allActions.length})
            </button>
            <button
              onClick={() => setActiveTab("audio")}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                activeTab === "audio"
                  ? "border-b-2 border-brand text-brand"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Headphones className="mr-1 inline h-3.5 w-3.5" />
              {t("audio")}
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === "transcription" && (
              <div>
                {meeting.transcription_raw ? (
                  <div className="rounded-md bg-white p-4 text-sm leading-relaxed text-gray-700 shadow-sm">
                    {meeting.transcription_raw}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    {t("no_transcription")}
                  </p>
                )}
              </div>
            )}

            {activeTab === "actions" && (
              <div>
                <p className="mb-3 text-xs text-gray-500">
                  {t("actions_detected", {
                    count: allActions.length,
                  })}
                </p>
                {allActions.map((action) => (
                  <div
                    key={action.globalIndex}
                    className="mb-2 rounded-md border border-gray-200 bg-white p-3"
                  >
                    <div className="flex items-start gap-2">
                      {!isFinalized && (
                        <input
                          type="checkbox"
                          checked={selectedActions.has(
                            action.globalIndex
                          )}
                          onChange={() =>
                            toggleAction(action.globalIndex)
                          }
                          className="mt-0.5"
                        />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {action.description}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {action.responsible_name}
                          {action.responsible_company
                            ? ` (${action.responsible_company})`
                            : ""}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {action.sectionTitle}
                          </span>
                          {action.priority === "urgent" && (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                              {t("priority_urgent")}
                            </span>
                          )}
                          {action.deadline && (
                            <span className="text-xs text-gray-400">
                              {action.deadline}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {allActions.length === 0 && (
                  <p className="text-sm text-gray-400">
                    {t("no_actions")}
                  </p>
                )}
              </div>
            )}

            {activeTab === "audio" && (
              <div>
                {meeting.audio_url ? (
                  <div>
                    <p className="mb-2 text-sm text-gray-600">
                      {meeting.audio_duration_seconds
                        ? `${Math.floor(meeting.audio_duration_seconds / 60)} min ${meeting.audio_duration_seconds % 60} sec`
                        : ""}
                    </p>
                    <p className="text-xs text-gray-400">
                      {t("audio_stored")}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    {t("no_audio")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Finalize dialog */}
      {showFinalizeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <h3 className="text-base font-semibold text-gray-900">
                {t("finalize")}
              </h3>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              {t("finalize_confirm")}
            </p>
            <p className="mb-4 text-sm text-gray-500">
              {selectedActions.size} {t("actions_selected")}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowFinalizeDialog(false)}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {finalizing && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                {t("finalize")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regenerate dialog */}
      {showRegenerateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <h3 className="text-base font-semibold text-gray-900">
                {t("regenerate")}
              </h3>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              {t("regenerate_confirm")}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRegenerateDialog(false)}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={handleRegenerate}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("regenerate")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
