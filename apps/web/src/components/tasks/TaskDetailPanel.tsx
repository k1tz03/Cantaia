"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  X,
  Edit3,
  Trash2,
  CheckCircle2,
  Clock,
  Mail,
  FileText,
  Hand,
  Shield,
  Paperclip,
  MessageSquare,
  History,
  Send,
  Download,
} from "lucide-react";
import type { Task, TaskComment, Project } from "@cantaia/database";

const projects: Project[] = [];

interface TaskDetailPanelProps {
  task: Task;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: Task["status"]) => void;
}

type DetailTab = "detail" | "comments" | "history" | "attachments";

const SOURCE_ICONS: Record<string, React.ElementType> = {
  email: Mail,
  meeting: FileText,
  manual: Hand,
  reserve: Shield,
};

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === "done" || task.status === "cancelled") return false;
  return task.due_date < new Date().toISOString().split("T")[0];
}

const PRIORITY_STYLES: Record<string, { dot: string; text: string }> = {
  urgent: { dot: "bg-red-500", text: "text-red-700" },
  high: { dot: "bg-red-400", text: "text-red-600" },
  medium: { dot: "bg-amber-400", text: "text-amber-600" },
  low: { dot: "bg-green-400", text: "text-green-600" },
};

const STATUS_STYLES: Record<string, string> = {
  todo: "bg-blue-100 text-blue-700",
  in_progress: "bg-indigo-100 text-indigo-700",
  waiting: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export function TaskDetailPanel({
  task,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
}: TaskDetailPanelProps) {
  const t = useTranslations("tasks");
  const [activeTab, setActiveTab] = useState<DetailTab>("detail");
  const [newComment, setNewComment] = useState("");

  const project = projects.find((p) => p.id === task.project_id);
  const overdue = isOverdue(task);
  const priorityStyle = PRIORITY_STYLES[task.priority];
  const SourceIcon = SOURCE_ICONS[task.source] || Hand;

  function handleAddComment() {
    if (!newComment.trim()) return;
    // Mock — in production: POST /api/tasks/[id]/comments
    const comment: TaskComment = {
      user_id: "user-001",
      user_name: "Julien RAY",
      text: newComment.trim(),
      created_at: new Date().toISOString(),
    };
    task.comments.push(comment);
    setNewComment("");
  }

  const tabs: { key: DetailTab; icon: React.ElementType; count?: number }[] = [
    { key: "detail", icon: FileText },
    { key: "comments", icon: MessageSquare, count: task.comments.length },
    { key: "history", icon: History, count: task.history.length },
    { key: "attachments", icon: Paperclip, count: task.attachments.length },
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
        <div className="flex items-center gap-2">
          {task.status !== "done" ? (
            <button
              type="button"
              onClick={() => onStatusChange(task.id, "done")}
              title={t("markDone")}
              className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600"
            >
              <CheckCircle2 className="h-5 w-5" />
            </button>
          ) : (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          )}
          <h2 className="text-sm font-semibold text-gray-900 line-clamp-1">
            {task.title}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title={t("editTask")}
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(task.id)}
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
            title={t("deleteTask")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          const tabKey = `tab${tab.key.charAt(0).toUpperCase() + tab.key.slice(1)}` as "tabDetail";
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-medium transition-colors ${
                isActive
                  ? "border-brand text-brand"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(tabKey)}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                  isActive ? "bg-brand/10 text-brand" : "bg-gray-100 text-gray-500"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Detail Tab */}
        {activeTab === "detail" && (
          <div className="space-y-4 p-5">
            {/* Status + Priority row */}
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[task.status]}`}>
                {t(`status${task.status.charAt(0).toUpperCase() + task.status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}` as "statusTodo")}
              </span>
              <span className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${priorityStyle.dot}`} />
                <span className={`text-xs font-medium ${priorityStyle.text}`}>
                  {t(`priority${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}` as "priorityUrgent")}
                </span>
              </span>
            </div>

            {/* Description */}
            {task.description && (
              <div>
                <h4 className="mb-1 text-xs font-medium text-gray-500">{t("taskDescription")}</h4>
                <p className="text-sm leading-relaxed text-gray-700">{task.description}</p>
              </div>
            )}

            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Project */}
              <div>
                <h4 className="mb-1 text-xs font-medium text-gray-500">{t("taskProject")}</h4>
                {project ? (
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                    <span className="text-sm text-gray-700">{project.name}</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </div>

              {/* Deadline */}
              <div>
                <h4 className="mb-1 text-xs font-medium text-gray-500">{t("taskDeadline")}</h4>
                {task.due_date ? (
                  <span className={`flex items-center gap-1 text-sm font-medium ${
                    overdue ? "text-red-600" : task.status === "done" ? "text-green-600" : "text-gray-700"
                  }`}>
                    <Clock className="h-3.5 w-3.5" />
                    {formatDateFull(task.due_date)}
                    {overdue && " (en retard)"}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </div>

              {/* Assigned */}
              <div>
                <h4 className="mb-1 text-xs font-medium text-gray-500">{t("taskAssigned")}</h4>
                <span className="text-sm text-gray-700">
                  {task.assigned_to_name || "—"}
                </span>
                {task.assigned_to_company && (
                  <p className="text-xs text-gray-400">{task.assigned_to_company}</p>
                )}
              </div>

              {/* Lot / CFC */}
              <div>
                <h4 className="mb-1 text-xs font-medium text-gray-500">{t("taskLot")}</h4>
                <span className="text-sm text-gray-700">
                  {task.lot_code || task.cfc_code || "—"}
                  {task.lot_name && <span className="text-gray-400"> — {task.lot_name}</span>}
                </span>
              </div>

              {/* Source */}
              <div>
                <h4 className="mb-1 text-xs font-medium text-gray-500">{t("source")}</h4>
                <span className="flex items-center gap-1 text-sm text-gray-700">
                  <SourceIcon className="h-3.5 w-3.5 text-gray-400" />
                  {t(`source${task.source.charAt(0).toUpperCase() + task.source.slice(1)}` as "sourceEmail")}
                </span>
                {task.source_reference && (
                  <p className="mt-0.5 text-xs text-gray-400">{task.source_reference}</p>
                )}
              </div>

              {/* Reminder */}
              <div>
                <h4 className="mb-1 text-xs font-medium text-gray-500">{t("taskReminder")}</h4>
                <span className="text-sm text-gray-700">
                  {t(`reminder${task.reminder === "none" ? "None" : task.reminder === "1_day" ? "1Day" : task.reminder === "3_days" ? "3Days" : "1Week"}` as "reminderNone")}
                </span>
              </div>
            </div>

            {/* Dates */}
            <div className="rounded-md bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Créé : {formatDateTime(task.created_at)}</span>
                <span>Modifié : {formatDateTime(task.updated_at)}</span>
              </div>
              {task.completed_at && (
                <p className="mt-1 text-xs text-green-600">
                  Terminé : {formatDateTime(task.completed_at)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Comments Tab */}
        {activeTab === "comments" && (
          <div className="flex h-full flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {task.comments.length > 0 ? (
                task.comments.map((comment, i) => (
                  <div key={i} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-700">
                        {comment.user_name}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {formatDateTime(comment.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                      {comment.text}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-gray-400">
                  Aucun commentaire
                </p>
              )}
            </div>

            {/* Comment input */}
            <div className="border-t border-gray-200 p-4">
              <div className="flex items-end gap-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={t("addComment")}
                  rows={2}
                  className="flex-1 resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      handleAddComment();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="rounded-md bg-brand p-2 text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="p-5">
            {task.history.length > 0 ? (
              <div className="relative space-y-4 pl-4">
                {/* Timeline line */}
                <div className="absolute bottom-0 left-1.5 top-0 w-px bg-gray-200" />

                {task.history.map((entry, i) => (
                  <div key={i} className="relative flex gap-3">
                    <div className="absolute -left-2.5 top-1 h-2 w-2 rounded-full bg-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(entry.created_at)}
                      </p>
                      <p className="mt-0.5 text-sm text-gray-700">
                        <span className="font-medium">{entry.user_name}</span>
                        {entry.action === "created" && " a créé la tâche"}
                        {entry.action === "updated" && entry.field && (
                          <>
                            {" "}a modifié <span className="font-medium">{entry.field}</span>
                            {entry.old_value && (
                              <> de <span className="line-through text-gray-400">{entry.old_value}</span></>
                            )}
                            {entry.new_value && (
                              <> à <span className="font-medium text-brand">{entry.new_value}</span></>
                            )}
                          </>
                        )}
                        {entry.action === "completed" && " a terminé la tâche"}
                        {entry.action === "commented" && " a ajouté un commentaire"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">
                Aucun historique
              </p>
            )}
          </div>
        )}

        {/* Attachments Tab */}
        {activeTab === "attachments" && (
          <div className="p-5">
            {task.attachments.length > 0 ? (
              <div className="space-y-2">
                {task.attachments.map((attachment, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-3 transition-colors hover:bg-gray-50"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-100">
                      <Paperclip className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-700">
                        {attachment.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatFileSize(attachment.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="Télécharger"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-gray-400">
                Aucune pièce jointe
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
