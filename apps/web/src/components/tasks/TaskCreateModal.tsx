"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { X, Loader2, AlertCircle } from "lucide-react";
import type { TaskPriority, TaskSource, TaskStatus, Project } from "@cantaia/database";

interface TaskCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  projects?: Project[];
  prefill?: {
    title?: string;
    project_id?: string;
    description?: string;
    source?: TaskSource;
    source_id?: string;
    source_reference?: string;
    due_date?: string;
    assigned_to_name?: string;
    assigned_to_company?: string;
  };
  editTask?: {
    id: string;
    title: string;
    project_id: string;
    description: string | null;
    assigned_to_name: string | null;
    assigned_to_company: string | null;
    priority: TaskPriority;
    status: TaskStatus;
    due_date: string | null;
    reminder: "none" | "1_day" | "3_days" | "1_week";
    lot_code: string | null;
    source: TaskSource;
    source_reference: string | null;
  };
}

export function TaskCreateModal({
  open,
  onClose,
  onCreated,
  projects = [],
  prefill,
  editTask,
}: TaskCreateModalProps) {
  const t = useTranslations("tasks");
  const isEdit = !!editTask;

  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [assignedName, setAssignedName] = useState("");
  const [assignedCompany, setAssignedCompany] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [dueDate, setDueDate] = useState("");
  const [reminder, setReminder] = useState("none");
  const [lotCode, setLotCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Reset form when modal opens/closes or prefill/editTask changes
  useEffect(() => {
    if (open) {
      setTitle(editTask?.title ?? prefill?.title ?? "");
      setProjectId(editTask?.project_id ?? prefill?.project_id ?? "");
      setDescription(editTask?.description ?? prefill?.description ?? "");
      setAssignedName(editTask?.assigned_to_name ?? prefill?.assigned_to_name ?? "");
      setAssignedCompany(editTask?.assigned_to_company ?? prefill?.assigned_to_company ?? "");
      setPriority(editTask?.priority ?? "medium");
      setStatus(editTask?.status ?? "todo");
      setDueDate(editTask?.due_date ?? prefill?.due_date ?? "");
      setReminder(editTask?.reminder ?? "none");
      setLotCode(editTask?.lot_code ?? "");
      setSaving(false);
      setError("");
      setSubmitted(false);
    }
  }, [open, editTask, prefill]);

  if (!open) return null;

  const missingTitle = !title.trim();
  const missingProject = !projectId;
  const missingDeadline = !dueDate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError("");

    if (missingTitle || missingProject || missingDeadline) return;

    setSaving(true);
    try {
      const payload = {
        title,
        project_id: projectId,
        description,
        assigned_to_name: assignedName || null,
        assigned_to_company: assignedCompany || null,
        priority,
        status,
        due_date: dueDate,
        reminder,
        lot_code: lotCode || null,
        source: prefill?.source ?? editTask?.source ?? "manual",
        source_id: prefill?.source_id ?? null,
        source_reference: prefill?.source_reference ?? editTask?.source_reference ?? null,
      };

      const url = isEdit ? `/api/tasks/${editTask!.id}` : "/api/tasks";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        let msg = `Erreur serveur (${res.status})`;
        try {
          const parsed = JSON.parse(text);
          if (parsed.error) msg = parsed.error;
        } catch { /* non-JSON response */ }
        setError(msg);
        setSaving(false);
        return;
      }

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Erreur lors de la sauvegarde");
        setSaving(false);
        return;
      }
    } catch (err) {
      console.error("[TaskCreateModal] Save error:", err);
      setError("Erreur réseau, veuillez réessayer");
      setSaving(false);
      return;
    }
    setSaving(false);
    onCreated();
    onClose();
  }

  const fieldErrorClass = "border-red-400 ring-1 ring-red-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-background shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">
            {isEdit ? t("editTask") : t("newTask")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-4">
              {/* Error banner */}
              {error && (
                <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-500/20">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  {t("taskTitle")} *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                    submitted && missingTitle ? fieldErrorClass : "border-border"
                  }`}
                  placeholder="Ex: Valider plans béton sous-sol B2"
                />
                {submitted && missingTitle && (
                  <p className="mt-1 text-xs text-red-600">Champ obligatoire</p>
                )}
              </div>

              {/* Project */}
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  {t("taskProject")} *
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none ${
                    submitted && missingProject ? fieldErrorClass : "border-border"
                  }`}
                >
                  <option value="">— Sélectionner un projet —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {submitted && missingProject && (
                  <p className="mt-1 text-xs text-red-600">Veuillez sélectionner un projet</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  {t("taskDescription")}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Détails optionnels..."
                />
              </div>

              {/* Assigned + Company */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    {t("taskAssigned")}
                  </label>
                  <input
                    type="text"
                    value={assignedName}
                    onChange={(e) => setAssignedName(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
                    placeholder="Nom"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    {t("taskCompany")}
                  </label>
                  <input
                    type="text"
                    value={assignedCompany}
                    onChange={(e) => setAssignedCompany(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
                    placeholder="Entreprise"
                  />
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  {t("priority")}
                </label>
                <div className="flex gap-3">
                  {(["low", "medium", "high", "urgent"] as TaskPriority[]).map((p) => (
                    <label key={p} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name="priority"
                        checked={priority === p}
                        onChange={() => setPriority(p)}
                        className="h-3.5 w-3.5 border-border text-primary"
                      />
                      {t(`priority${p.charAt(0).toUpperCase() + p.slice(1)}` as "priorityLow")}
                    </label>
                  ))}
                </div>
              </div>

              {/* Deadline + Status */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    {t("taskDeadline")} *
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none ${
                      submitted && missingDeadline ? fieldErrorClass : "border-border"
                    }`}
                  />
                  {submitted && missingDeadline && (
                    <p className="mt-1 text-xs text-red-600">Champ obligatoire</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    {t("status")}
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="todo">{t("statusTodo")}</option>
                    <option value="in_progress">{t("statusInProgress")}</option>
                    <option value="waiting">{t("statusWaiting")}</option>
                    <option value="done">{t("statusDone")}</option>
                  </select>
                </div>
              </div>

              {/* Reminder + Lot */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    {t("taskReminder")}
                  </label>
                  <select
                    value={reminder}
                    onChange={(e) => setReminder(e.target.value as "none")}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="none">{t("reminderNone")}</option>
                    <option value="1_day">{t("reminder1Day")}</option>
                    <option value="3_days">{t("reminder3Days")}</option>
                    <option value="1_week">{t("reminder1Week")}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    {t("taskLot")}
                  </label>
                  <input
                    type="text"
                    value={lotCode}
                    onChange={(e) => setLotCode(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
                    placeholder="Ex: CFC 211"
                  />
                </div>
              </div>

              {/* Source info (read-only) */}
              {(prefill?.source || editTask?.source_reference) && (
                <div className="rounded-md bg-muted px-3 py-2">
                  <p className="text-[10px] font-medium uppercase text-muted-foreground">{t("sourceLabel")}</p>
                  <p className="text-xs text-muted-foreground">
                    {prefill?.source_reference || editTask?.source_reference || "—"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Fixed footer — always visible */}
          <div className="border-t border-border px-5 py-3.5">
            {/* Error shown near submit button so user always sees it */}
            {error && (
              <div className="mb-3 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-500/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              {t("cancel") || "Annuler"}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? t("editTask") : t("createTask")}
            </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
