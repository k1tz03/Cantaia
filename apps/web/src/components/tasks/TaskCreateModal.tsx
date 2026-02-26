"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X, Loader2 } from "lucide-react";
import type { TaskPriority, TaskSource, TaskStatus, Project } from "@cantaia/database";

const projects: Project[] = [];

interface TaskCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
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
  prefill,
  editTask,
}: TaskCreateModalProps) {
  const t = useTranslations("tasks");
  const isEdit = !!editTask;

  const [title, setTitle] = useState(editTask?.title ?? prefill?.title ?? "");
  const [projectId, setProjectId] = useState(editTask?.project_id ?? prefill?.project_id ?? "");
  const [description, setDescription] = useState(editTask?.description ?? prefill?.description ?? "");
  const [assignedName, setAssignedName] = useState(editTask?.assigned_to_name ?? prefill?.assigned_to_name ?? "");
  const [assignedCompany, setAssignedCompany] = useState(editTask?.assigned_to_company ?? prefill?.assigned_to_company ?? "");
  const [priority, setPriority] = useState<TaskPriority>(editTask?.priority ?? "medium");
  const [status, setStatus] = useState<TaskStatus>(editTask?.status ?? "todo");
  const [dueDate, setDueDate] = useState(editTask?.due_date ?? prefill?.due_date ?? "");
  const [reminder, setReminder] = useState(editTask?.reminder ?? "none");
  const [lotCode, setLotCode] = useState(editTask?.lot_code ?? "");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !projectId || !dueDate) return;

    setSaving(true);
    try {
      // Mock save — in production: POST /api/tasks/create or PUT /api/tasks/[id]
      console.log(isEdit ? "[Task] Updating:" : "[Task] Creating:", {
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
      });

      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error("[TaskCreateModal] Save error:", err);
    } finally {
      setSaving(false);
    }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-gray-900">
            {isEdit ? t("editTask") : t("newTask")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto p-5">
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("taskTitle")} *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Ex: Valider plans béton sous-sol B2"
              />
            </div>

            {/* Project */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("taskProject")} *
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t("taskDescription")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Détails optionnels..."
              />
            </div>

            {/* Assigned + Company */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {t("taskAssigned")}
                </label>
                <input
                  type="text"
                  value={assignedName}
                  onChange={(e) => setAssignedName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                  placeholder="Nom"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {t("taskCompany")}
                </label>
                <input
                  type="text"
                  value={assignedCompany}
                  onChange={(e) => setAssignedCompany(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                  placeholder="Entreprise"
                />
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
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
                      className="h-3.5 w-3.5 border-gray-300 text-blue-600"
                    />
                    {t(`priority${p.charAt(0).toUpperCase() + p.slice(1)}` as "priorityLow")}
                  </label>
                ))}
              </div>
            </div>

            {/* Deadline + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {t("taskDeadline")} *
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {t("status")}
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="todo">{t("statusTodo")}</option>
                  <option value="in_progress">{t("statusInProgress")}</option>
                  <option value="waiting">{t("statusWaiting")}</option>
                  <option value="done">{t("statusDone")}</option>
                </select>
              </div>
            </div>

            {/* Reminder + Lot */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {t("taskReminder")}
                </label>
                <select
                  value={reminder}
                  onChange={(e) => setReminder(e.target.value as "none")}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="none">{t("reminderNone")}</option>
                  <option value="1_day">{t("reminder1Day")}</option>
                  <option value="3_days">{t("reminder3Days")}</option>
                  <option value="1_week">{t("reminder1Week")}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {t("taskLot")}
                </label>
                <input
                  type="text"
                  value={lotCode}
                  onChange={(e) => setLotCode(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                  placeholder="Ex: CFC 211"
                />
              </div>
            </div>

            {/* Source info (read-only) */}
            {(prefill?.source || editTask?.source_reference) && (
              <div className="rounded-md bg-gray-50 px-3 py-2">
                <p className="text-[10px] font-medium uppercase text-gray-500">{t("sourceLabel")}</p>
                <p className="text-xs text-gray-600">
                  {prefill?.source_reference || editTask?.source_reference || "—"}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-5 flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              {t("cancel") || "Annuler"}
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim() || !projectId || !dueDate}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? t("editTask") : t("createTask")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
