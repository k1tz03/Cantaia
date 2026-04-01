"use client";

import { useState, useEffect } from "react";

export function usePVContent(id: string) {
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
  const [finalizing, setFinalizing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [deletingPv, setDeletingPv] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/pv/${id}`);
        const data = await res.json();
        if (data.success && data.meeting) {
          setMeeting(data.meeting);
          // Use existing pv_content or initialize an empty structure for drafts
          const content = data.meeting.pv_content || {
            project_name: data.meeting.projects?.name || "",
            project_code: data.meeting.projects?.code || "",
            meeting_number: data.meeting.meeting_number || 1,
            date: data.meeting.meeting_date || new Date().toISOString().split("T")[0],
            location: data.meeting.location || "",
            participants: data.meeting.participants || [],
            sections: [],
            next_meeting: "",
            summary: "",
          };
          setPvContent(content);
          const allActions: number[] = [];
          let idx = 0;
          for (const section of content.sections || []) {
            for (const _ of section.actions || []) { // eslint-disable-line @typescript-eslint/no-unused-vars
              allActions.push(idx++);
            }
          }
          setSelectedActions(new Set(allActions));
        }
      } catch (err) {
        console.error("Failed to load meeting:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleSave = async (savedLabel: string) => {
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
        setSaveMessage(savedLabel);
        setTimeout(() => setSaveMessage(null), 2000);
      }
    } catch (err) {
      console.error("Save failed:", err);
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
        setSaveMessage(`Erreur: ${data.error || "Échec de la finalisation"}`);
        console.error("[Finalize] Failed:", data);
        setTimeout(() => setSaveMessage(null), 5000);
      }
    } catch (err) {
      console.error("Finalize failed:", err);
      setSaveMessage("Erreur réseau lors de la finalisation");
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

  const handleExportPDF = async (savedLabel: string) => {
    await handleSave(savedLabel);
    window.open(`/api/pv/${id}/export-pdf`, "_blank");
  };

  const handleDeletePv = async (onDeleted: () => void) => {
    setDeletingPv(true);
    try {
      const res = await fetch(`/api/pv/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        onDeleted();
      }
    } catch (err) {
      console.error("Delete failed:", err);
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

  const toggleAction = (index: number) => {
    const next = new Set(selectedActions);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedActions(next);
  };

  const allActions: Array<
    { description: string; responsible_name: string; responsible_company: string; deadline: string | null; priority: "normal" | "urgent" } & { sectionTitle: string; globalIndex: number }
  > = [];
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

  const isFinalized = meeting?.status === "finalized" || meeting?.status === "sent";

  return {
    meeting,
    pvContent,
    setPvContent,
    loading,
    saving,
    saveMessage,
    selectedActions,
    showFinalizeDialog,
    setShowFinalizeDialog,
    showRegenerateDialog,
    setShowRegenerateDialog,
    showDeleteDialog,
    setShowDeleteDialog,
    finalizing,
    regenerating,
    deletingPv,
    isFinalized,
    allActions,
    handleSave,
    handleFinalize,
    handleRegenerate,
    handleExportPDF,
    handleDeletePv,
    updateSection,
    addSection,
    removeSection,
    addDecision,
    updateDecision,
    removeDecision,
    addAction,
    updateAction,
    removeAction,
    toggleAction,
  };
}
