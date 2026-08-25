"use client";

import { useState, useEffect } from "react";
import { handleInsufficientCredits } from "@/components/credits/PaywallDialog";
import { notifyCreditsChanged } from "@/lib/hooks/use-credits";
import { toLocalDateString } from "@/components/calendar/datetime-utils";
import { PV_FALLBACKS } from "@/components/pv-chantier/pv-i18n";

/** Optional next-intl translator; falls back to the French `pv-i18n` copy. */
type PVTranslator = (key: string, values?: Record<string, unknown>) => string;
function makeMsg(tf?: PVTranslator) {
  return (key: string): string => (tf ? tf(key) : PV_FALLBACKS[key] ?? key);
}

/**
 * Next free `{meeting_number}.{index}`.
 * Mirrors `nextSectionNumber()` in app/api/pv/_shared/pv-circulation.ts — point
 * numbers are stored, never derived from position, so adding a section after a
 * deletion must not reuse a number that was already read out in a séance.
 */
function nextSectionNumber(sections: any[], meetingNumber: number | string | null): string {
  const prefix = Number(meetingNumber) > 0 ? Number(meetingNumber) : 1;
  let highest = 0;
  for (const section of sections || []) {
    const raw = String(section?.number ?? "").trim();
    const dotted = raw.match(/^(\d+)\.(\d+)$/);
    const idx = dotted
      ? Number(dotted[1]) === prefix
        ? Number(dotted[2])
        : null
      : /^\d+$/.test(raw)
        ? Number(raw)
        : null;
    if (idx !== null && idx > highest) highest = idx;
  }
  return `${prefix}.${highest + 1}`;
}

export function usePVContent(id: string, tf?: PVTranslator) {
  const msg = makeMsg(tf);
  const [meeting, setMeeting] = useState<any>(null);
  const [pvContent, setPvContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [selectedActions, setSelectedActions] = useState<Set<number>>(
    new Set()
  );
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [deletingPv, setDeletingPv] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/pv/${id}`);
        const data = await res.json();
        if (data.success && data.meeting) {
          setMeeting(data.meeting);
          // Use existing pv_content or initialize an empty structure for drafts.
          // The shape mirrors what the generator and the PDF expect (`header.*`);
          // the previous flat shape was invisible to PVHeaderEditor.
          const content = data.meeting.pv_content || {
            header: {
              project_name: data.meeting.projects?.name || "",
              project_code: data.meeting.projects?.code || "",
              meeting_number: data.meeting.meeting_number || 1,
              // Local (Europe/Zurich) calendar date, never the UTC date —
              // toISOString() would print the previous day between midnight and
              // ~02h, dating an opposable document wrong.
              date: data.meeting.meeting_date || toLocalDateString(new Date()),
              location: data.meeting.location || "",
              next_meeting_date: null,
              participants: data.meeting.participants || [],
            },
            sections: [],
            summary_fr: "",
          };

          // Participants may have been edited on the meeting after the PV was
          // generated (adding e-mails, marking someone excused) — the header is
          // the source the PDF and the send modal read, so keep it in sync.
          if (
            content.header &&
            Array.isArray(data.meeting.participants) &&
            data.meeting.participants.length > 0 &&
            (content.header.participants?.length ?? 0) === 0
          ) {
            content.header.participants = data.meeting.participants;
          }

          setPvContent(content);

          // Points carried over from the previous séance already have a task
          // from that meeting: pre-selecting them would create a duplicate on
          // finalisation. They stay listed, just unchecked.
          const preselected: number[] = [];
          let idx = 0;
          for (const section of content.sections || []) {
            for (const _ of section.actions || []) { // eslint-disable-line @typescript-eslint/no-unused-vars
              if (section.carried_over !== true) preselected.push(idx);
              idx++;
            }
          }
          setSelectedActions(new Set(preselected));
        }
      } catch (err) {
        console.error("Failed to load meeting:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  /**
   * Persists the PV. Returns whether the save actually landed so callers
   * (notably handleSend, which circulates an opposable PDF) can refuse to
   * proceed on a stale version instead of silently sending the old one.
   */
  const handleSave = async (savedLabel: string): Promise<boolean> => {
    if (!pvContent) return false;
    setSaving(true);
    try {
      const res = await fetch(`/api/pv/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pv_content: pvContent }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (savedLabel) {
          setSaveMessage(savedLabel);
          setTimeout(() => setSaveMessage(null), 2000);
        }
        return true;
      }
      setSaveMessage(`${msg("save_error")}: ${data.error || res.status}`);
      setTimeout(() => setSaveMessage(null), 5000);
      return false;
    } catch (err) {
      console.error("Save failed:", err);
      setSaveMessage(msg("save_error_network"));
      setTimeout(() => setSaveMessage(null), 5000);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async (
    finalizedLabel: string,
    tasksCreatedLabel: string
  ) => {
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
        let msg = `${finalizedLabel}. ${data.tasks_created} ${tasksCreatedLabel}`;
        if (data.insert_errors?.length > 0) {
          msg += ` (${data.insert_errors.length} erreur(s): ${data.insert_errors[0].error})`;
          console.error("[Finalize] Insert errors:", data.insert_errors);
        }
        setSaveMessage(msg);
        setMeeting({ ...meeting, status: "finalized" });
        setShowFinalizeDialog(false);
        setTimeout(() => setSaveMessage(null), 5000);
      } else {
        setSaveMessage(`${msg("save_error")}: ${data.error || msg("finalize_error")}`);
        console.error("[Finalize] Failed:", data);
        setTimeout(() => setSaveMessage(null), 5000);
      }
    } catch (err) {
      console.error("Finalize failed:", err);
      setSaveMessage(msg("finalize_error_network"));
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setFinalizing(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setShowRegenerateDialog(false);
    try {
      const res = await fetch("/api/ai/generate-pv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_id: id }),
      });
      // Out of credits: the paywall dialog replaces the error banner and the
      // existing PV is left untouched, so the user can retry after topping up.
      if (await handleInsufficientCredits(res)) return;

      const data = await res.json();
      if (data.success && data.pv_content) {
        setPvContent(data.pv_content);
        notifyCreditsChanged();
      } else {
        setSaveMessage(`${msg("save_error")}: ${data.error || msg("regenerate_error")}`);
        setTimeout(() => setSaveMessage(null), 5000);
      }
    } catch (err) {
      console.error("Regenerate failed:", err);
      setSaveMessage(msg("regenerate_error_network"));
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setRegenerating(false);
    }
  };

  /**
   * Circulates the finalized PV. Saves first so the PDF that goes out matches
   * what is on screen — sending a stale version is the one failure mode a
   * signed, opposable document cannot have.
   */
  const handleSend = async (payload: {
    recipients: string[];
    message?: string;
    subject?: string;
  }): Promise<{ ok: boolean; error?: string; warnings?: string[] }> => {
    setSending(true);
    try {
      // Abort the send if the save did not land: circulating a PDF built from a
      // stale pv_content — with an opposition deadline — is the one failure an
      // opposable document cannot have.
      const saved = await handleSave("");
      if (!saved) {
        return { ok: false, error: msg("send_abort_save_failed") };
      }

      const res = await fetch(`/api/pv/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        return { ok: false, error: data.error || `${msg("send_error")} (${res.status})` };
      }

      setMeeting((prev: any) =>
        prev
          ? { ...prev, status: "sent", sent_at: data.sent_at, sent_to: data.sent_to }
          : prev
      );
      return { ok: true, warnings: data.warnings };
    } catch (err) {
      console.error("Send failed:", err);
      return { ok: false, error: msg("send_error_network") };
    } finally {
      setSending(false);
    }
  };

  const handleExportPDF = async (savedLabel: string) => {
    await handleSave(savedLabel);
    try {
      const { exportFile } = await import("@/lib/tauri");
      // The number lives in header.meeting_number — exposed here as
      // `meetingNumber`; `pvContent.meeting_number` was undefined → "PV_Seance_.pdf".
      await exportFile(`/api/pv/${id}/export-pdf`, {
        fallbackFilename: `PV_Seance_${meetingNumber || ""}.pdf`,
      });
    } catch (err) {
      console.error("PDF export failed:", err);
      setSaveMessage(msg("export_error"));
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };

  const handleDeletePv = async (onDeleted: () => void) => {
    setDeletingPv(true);
    try {
      const res = await fetch(`/api/pv/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        onDeleted();
      } else {
        // Surface the server reason — DELETE is restricted to the creator, so a
        // non-creator gets a 403 whose message must not vanish silently.
        setSaveMessage(`${msg("save_error")}: ${data.error || res.status}`);
        setTimeout(() => setSaveMessage(null), 5000);
      }
    } catch (err) {
      console.error("Delete failed:", err);
      setSaveMessage(msg("delete_error_network"));
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setDeletingPv(false);
      setShowDeleteDialog(false);
    }
  };

  const updateSection = (index: number, field: string, value: any) => {
    const sections = [...(pvContent.sections || [])];
    sections[index] = { ...sections[index], [field]: value };
    setPvContent({ ...pvContent, sections });
  };

  const meetingNumber =
    pvContent?.header?.meeting_number ?? pvContent?.meeting_number ?? meeting?.meeting_number ?? 1;

  const addSection = () => {
    const sections = [...(pvContent.sections || [])];
    sections.push({
      // Continues after the highest index in use rather than after the array
      // length: a deleted section must not have its number handed out again.
      number: nextSectionNumber(sections, meetingNumber),
      title: "",
      content: "",
      decisions: [],
      actions: [],
    });
    setPvContent({ ...pvContent, sections });
  };

  const removeSection = (index: number) => {
    // Deliberately NOT renumbering the survivors: point numbers are persistent
    // references quoted in the séance, in e-mails and in the next PV.
    const sections = (pvContent.sections || []).filter(
      (_: any, i: number) => i !== index
    );
    setPvContent({ ...pvContent, sections });
  };

  /** Updates the resolution status of a point carried from the previous séance. */
  const updateCarriedStatus = (
    sectionIndex: number,
    actionIndex: number,
    status: "open" | "in_progress" | "done"
  ) => {
    updateAction(sectionIndex, actionIndex, "carried_status", status);
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

  const toggleAction = (index: number) => {
    const next = new Set(selectedActions);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedActions(next);
  };

  const allActions: Array<
    { description: string; responsible_name: string; responsible_company: string; deadline: string | null; priority: "normal" | "urgent" } & {
      sectionTitle: string;
      globalIndex: number;
      sectionIndex: number;
      actionIndex: number;
      /** True for a point inherited from the previous séance. */
      isCarried: boolean;
      carriedFrom?: string | null;
      carriedStatus?: "open" | "in_progress" | "done";
    }
  > = [];
  let globalIdx = 0;
  if (pvContent?.sections) {
    pvContent.sections.forEach((section: any, sectionIndex: number) => {
      (section.actions || []).forEach((action: any, actionIndex: number) => {
        allActions.push({
          ...action,
          sectionTitle: section.title,
          globalIndex: globalIdx++,
          sectionIndex,
          actionIndex,
          isCarried: section.carried_over === true,
          carriedFrom: action.carried_from ?? null,
          carriedStatus: action.carried_status ?? "open",
        });
      });
    });
  }

  const isFinalized = meeting?.status === "finalized" || meeting?.status === "sent";
  /** A PV can only be circulated once it is frozen. */
  const canSend = isFinalized && !!pvContent;
  const isSent = meeting?.status === "sent";

  return {
    meeting,
    pvContent,
    setPvContent,
    loading,
    saving,
    saveMessage,
    setSaveMessage,
    selectedActions,
    showFinalizeDialog,
    setShowFinalizeDialog,
    showRegenerateDialog,
    setShowRegenerateDialog,
    showDeleteDialog,
    setShowDeleteDialog,
    showSendModal,
    setShowSendModal,
    showTemplateModal,
    setShowTemplateModal,
    finalizing,
    regenerating,
    deletingPv,
    sending,
    isFinalized,
    isSent,
    canSend,
    meetingNumber,
    allActions,
    handleSave,
    handleFinalize,
    handleRegenerate,
    handleExportPDF,
    handleDeletePv,
    handleSend,
    updateSection,
    addSection,
    removeSection,
    addDecision,
    updateDecision,
    removeDecision,
    addAction,
    updateAction,
    removeAction,
    updateCarriedStatus,
    toggleAction,
  };
}
