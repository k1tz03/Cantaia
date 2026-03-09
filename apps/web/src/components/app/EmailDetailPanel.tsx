"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@cantaia/ui";
import DOMPurify from "dompurify";
import {
  X,
  Send,
  Copy,
  RefreshCw,
  Archive,
  Tag,
  CheckCircle,
  AlertTriangle,
  Plus,
  Clock,
  AlertCircle,
  Info,
  Mail,
  Paperclip,
  ChevronDown,
  User,
  Sparkles,
  Loader2,
  FileText,
  FileSpreadsheet,
  ImageIcon,
  Download,
} from "lucide-react";
import type { EmailRecord, Project } from "@cantaia/database";
import { formatDate } from "@/lib/mock-data";

const classificationConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  action_required: { label: "Action", icon: AlertCircle, color: "text-orange-600 bg-orange-50" },
  urgent: { label: "Urgent", icon: AlertTriangle, color: "text-red-600 bg-red-50" },
  waiting_response: { label: "En attente", icon: Clock, color: "text-blue-600 bg-blue-50" },
  info_only: { label: "Info", icon: Info, color: "text-gray-500 bg-gray-100" },
};

interface AttachmentInfo {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

function getAttachmentIcon(contentType: string, name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (contentType === "application/pdf" || ext === "pdf") {
    return { icon: FileText, color: "text-red-500 bg-red-50" };
  }
  if (
    contentType.includes("wordprocessingml") ||
    contentType.includes("msword") ||
    ext === "docx" ||
    ext === "doc"
  ) {
    return { icon: FileText, color: "text-blue-500 bg-blue-50" };
  }
  if (
    contentType.includes("spreadsheetml") ||
    contentType.includes("ms-excel") ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    return { icon: FileSpreadsheet, color: "text-green-500 bg-green-50" };
  }
  if (contentType.startsWith("image/")) {
    return { icon: ImageIcon, color: "text-purple-500 bg-purple-50" };
  }
  return { icon: Paperclip, color: "text-slate-400 bg-slate-100" };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface TaskPrefill {
  title?: string;
  project_id?: string;
  description?: string;
  source?: "email";
  source_id?: string;
  source_reference?: string;
  due_date?: string;
  assigned_to_name?: string;
}

interface EmailDetailPanelProps {
  email: EmailRecord;
  projects: Project[];
  onClose: () => void;
  onEmailUpdated?: () => void;
  onCreateTask?: (prefill: TaskPrefill) => void;
}

export function EmailDetailPanel({ email, projects, onClose, onEmailUpdated, onCreateTask }: EmailDetailPanelProps) {
  const t = useTranslations("dashboard");
  const [replyText, setReplyText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [noReplyNeeded, setNoReplyNeeded] = useState(false);
  const [forceReply, setForceReply] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showReclassDropdown, setShowReclassDropdown] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [markingProcessed, setMarkingProcessed] = useState(false);
  const [markingUrgent, setMarkingUrgent] = useState(false);
  const [taskCreatedIds, setTaskCreatedIds] = useState<Set<string>>(new Set());
  const [extractedTasks, setExtractedTasks] = useState<{ id: string; title: string; responsible?: string | null; deadline?: string | null }[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [extractingTasks, setExtractingTasks] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [emailBody, setEmailBody] = useState<{ contentType: string; content: string } | null>(null);
  const [emailBodyLoading, setEmailBodyLoading] = useState(false);
  const [savedPlans, setSavedPlans] = useState<Map<string, { planId: string; planTitle: string }>>(new Map());

  const project = email.project_id ? projects.find((p) => p.id === email.project_id) : null;
  const detailedSummary = email.ai_summary || null;
  const config = email.classification ? classificationConfig[email.classification] : null;

  // Fetch AI reply when panel opens
  const fetchReply = useCallback(async () => {
    setReplyLoading(true);
    setNoReplyNeeded(false);
    setForceReply(false);
    try {
      const res = await fetch("/api/ai/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: email.id }),
      });
      const data = await res.json();
      if (data.no_reply_needed) {
        setNoReplyNeeded(true);
        setReplyText("");
      } else if (data.reply_text) {
        setReplyText(data.reply_text);
      } else {
        // Insufficient context or fallback
        setReplyText("");
      }
    } catch {
      setReplyText("");
    } finally {
      setReplyLoading(false);
    }
  }, [email.id]);

  useEffect(() => {
    fetchReply();
  }, [fetchReply]);

  // Fetch attachments if email has them
  useEffect(() => {
    if (!email.has_attachments || !email.outlook_message_id) {
      setAttachments([]);
      return;
    }
    setAttachmentsLoading(true);
    fetch(`/api/outlook/attachments?messageId=${encodeURIComponent(email.outlook_message_id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.attachments) setAttachments(data.attachments);
      })
      .catch(() => setAttachments([]))
      .finally(() => setAttachmentsLoading(false));
  }, [email.id, email.has_attachments, email.outlook_message_id]);

  // Fetch saved plans for this email (to show badges on attachments)
  useEffect(() => {
    setSavedPlans(new Map());
    fetch(`/api/plans?source_email_id=${encodeURIComponent(email.id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.plans?.length > 0) {
          const map = new Map<string, { planId: string; planTitle: string }>();
          for (const pv of data.plans) {
            const fileName = pv.file_name;
            const reg = pv.plan_registry;
            if (fileName) {
              map.set(fileName, {
                planId: reg?.id || pv.plan_id,
                planTitle: reg?.plan_title || fileName,
              });
            }
          }
          setSavedPlans(map);
        }
      })
      .catch(() => { /* ignore */ });
  }, [email.id]);

  // Fetch email body from Microsoft Graph (inline images resolved server-side)
  useEffect(() => {
    if (!email.outlook_message_id) {
      setEmailBody(null);
      return;
    }
    setEmailBodyLoading(true);
    fetch(`/api/outlook/email-body?messageId=${encodeURIComponent(email.outlook_message_id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.content) {
          setEmailBody({ contentType: data.contentType, content: data.content });
        }
      })
      .catch(() => setEmailBody(null))
      .finally(() => setEmailBodyLoading(false));
  }, [email.id, email.outlook_message_id]);

  // Fetch existing tasks linked to this email, then auto-extract if none found
  useEffect(() => {
    let cancelled = false;
    setTasksLoading(true);
    setExtractedTasks([]);

    fetch(`/api/tasks/by-email?email_id=${encodeURIComponent(email.id)}`)
      .then((res) => res.json())
      .then(async (data) => {
        if (cancelled) return;
        if (data.tasks?.length > 0) {
          setExtractedTasks(
            data.tasks.map((t: { id: string; title: string; assigned_to_name?: string | null; due_date?: string | null }) => ({
              id: t.id,
              title: t.title,
              responsible: t.assigned_to_name,
              deadline: t.due_date,
            }))
          );
          setTasksLoading(false);
          return;
        }

        // No tasks in DB — auto-extract via AI
        setExtractingTasks(true);
        setTasksLoading(false);
        try {
          const aiRes = await fetch("/api/ai/extract-tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email_id: email.id }),
          });
          const aiData = await aiRes.json();
          if (!cancelled && aiData.tasks?.length > 0) {
            setExtractedTasks(
              aiData.tasks.map((t: { title: string; assigned_to_name?: string | null; due_date?: string | null }, idx: number) => ({
                id: `ai-${Date.now()}-${idx}`,
                title: t.title,
                responsible: t.assigned_to_name,
                deadline: t.due_date,
              }))
            );
          }
        } catch {
          // ignore
        } finally {
          if (!cancelled) setExtractingTasks(false);
        }
      })
      .catch(() => {
        if (!cancelled) setTasksLoading(false);
      });

    return () => { cancelled = true; };
  }, [email.id]);

  // Manual re-extract tasks from email using AI
  async function handleExtractTasks() {
    setExtractingTasks(true);
    try {
      const res = await fetch("/api/ai/extract-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: email.id }),
      });
      const data = await res.json();
      if (data.tasks?.length > 0) {
        setExtractedTasks((prev) => [
          ...prev,
          ...data.tasks.map((t: { title: string; assigned_to_name?: string | null; due_date?: string | null }, idx: number) => ({
            id: `ai-${Date.now()}-${idx}`,
            title: t.title,
            responsible: t.assigned_to_name,
            deadline: t.due_date,
          })),
        ]);
      }
    } catch {
      // ignore
    } finally {
      setExtractingTasks(false);
    }
  }

  function handleAttachmentClick(att: AttachmentInfo) {
    if (!email.outlook_message_id) return;
    const url = `/api/outlook/attachments/download?messageId=${encodeURIComponent(email.outlook_message_id)}&attachmentId=${encodeURIComponent(att.id)}`;

    const ext = att.name.split(".").pop()?.toLowerCase() || "";
    if (att.contentType === "application/pdf" || ext === "pdf") {
      window.open(url, "_blank");
    } else if (att.contentType.startsWith("image/")) {
      window.open(url, "_blank");
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = att.name;
      a.click();
    }
  }

  function handleDownloadAll() {
    if (!email.outlook_message_id) return;
    for (const att of attachments) {
      const url = `/api/outlook/attachments/download?messageId=${encodeURIComponent(email.outlook_message_id)}&attachmentId=${encodeURIComponent(att.id)}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = att.name;
      a.click();
    }
  }

  async function handleCreateTask(taskId: string, taskTitle?: string, taskResponsible?: string | null, taskDeadline?: string | null) {
    const taskData: TaskPrefill = {
      title: taskTitle || email.subject,
      project_id: email.project_id || undefined,
      description: email.ai_summary || email.body_preview || "",
      source: "email",
      source_id: email.id,
      source_reference: `Email «${email.subject}» du ${formatDate(email.received_at)}`,
      due_date: taskDeadline || undefined,
      assigned_to_name: taskResponsible || undefined,
    };

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskData),
      });
      const data = await res.json();
      if (data.success) {
        setTaskCreatedIds((prev) => new Set(prev).add(taskId));
      } else {
        console.error("[Task] Creation failed:", data.error);
      }
    } catch (err) {
      console.error("[Task] Creation error:", err);
    }

    if (onCreateTask) {
      onCreateTask(taskData);
    }
  }

  function handleCopyReply() {
    navigator.clipboard.writeText(replyText);
  }

  function handleRegenerate() {
    fetchReply();
  }

  async function handleSendReply() {
    if (!replyText || !email.outlook_message_id) return;
    setSendingReply(true);
    try {
      await fetch("/api/outlook/send-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlook_message_id: email.outlook_message_id,
          reply_content: replyText,
        }),
      });
    } finally {
      setSendingReply(false);
    }
  }

  async function handleArchive() {
    if (!email.outlook_message_id) return;
    setArchiving(true);
    try {
      const folderName = project ? `Cantaia - ${project.name}` : "Cantaia Archive";
      await fetch("/api/outlook/move-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlook_message_id: email.outlook_message_id,
          folder_name: folderName,
        }),
      });
    } finally {
      setArchiving(false);
    }
  }

  // Bug 4 — Manual reclassification: update project_id in Supabase
  async function handleReclassify(projectId: string) {
    setShowReclassDropdown(false);
    setReclassifying(true);
    try {
      console.log(`[EmailDetail] Reclassifying email ${email.id} to project ${projectId}`);
      const res = await fetch("/api/emails/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: email.id,
          project_id: projectId,
          add_sender_to_project: true,
        }),
      });
      const data = await res.json();
      console.log(`[EmailDetail] Reclassify result:`, data);
      if (data.success) {
        onEmailUpdated?.();
      }
    } catch (err) {
      console.error("[EmailDetail] Reclassify error:", err);
    } finally {
      setReclassifying(false);
    }
  }

  // Bug 5 — Mark as processed
  async function handleMarkProcessed() {
    setMarkingProcessed(true);
    try {
      console.log(`[EmailDetail] Marking email ${email.id} as processed`);
      const res = await fetch("/api/emails/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: email.id,
          classification: "archived",
        }),
      });
      const data = await res.json();
      console.log(`[EmailDetail] Mark processed result:`, data);
      if (data.success) {
        onEmailUpdated?.();
      }
    } catch (err) {
      console.error("[EmailDetail] Mark processed error:", err);
    } finally {
      setMarkingProcessed(false);
    }
  }

  // Bug 5 — Mark as urgent
  async function handleMarkUrgent() {
    setMarkingUrgent(true);
    try {
      console.log(`[EmailDetail] Marking email ${email.id} as urgent`);
      const res = await fetch("/api/emails/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: email.id,
          classification: "urgent",
        }),
      });
      const data = await res.json();
      console.log(`[EmailDetail] Mark urgent result:`, data);
      if (data.success) {
        onEmailUpdated?.();
      }
    } catch (err) {
      console.error("[EmailDetail] Mark urgent error:", err);
    } finally {
      setMarkingUrgent(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Sticky header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-800">
          {t("emailDetail")}
        </h3>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="space-y-5">
          {/* Section 1 — Header */}
          <div className="space-y-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {t("from")}
              </p>
              <p className="text-sm font-medium text-slate-800">
                {email.sender_name || email.sender_email}
              </p>
              <p className="text-xs text-slate-400">{email.sender_email}</p>
            </div>
            {email.recipients.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {t("recipients")}
                </p>
                <p className="text-xs text-slate-600">
                  {email.recipients.join(", ")}
                </p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {t("subject")}
              </p>
              <p className="text-sm font-medium text-slate-800">
                {email.subject}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">
                {formatDate(email.received_at)}
              </span>
              {email.has_attachments && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Paperclip className="h-3 w-3" />
                  {t("attachment")}
                </span>
              )}
              {project && (
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: `${project.color}15`,
                    color: project.color,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  {project.name}
                </span>
              )}
              {config && (
                <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium", config.color)}>
                  <config.icon className="h-3 w-3" />
                  {config.label}
                </span>
              )}
            </div>
          </div>

          {/* Bug 8 — AI Summary: always visible, not collapsible */}
          {(detailedSummary || email.ai_summary) && detailedSummary !== "—" && (
            <div className="rounded-md border border-blue-100 bg-blue-50/50 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                <Sparkles className="h-3 w-3" />
                {t("detailedSummary")}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
                {detailedSummary || email.ai_summary}
              </p>
            </div>
          )}

          {/* Section 1b — Email Content */}
          <div>
            <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <Mail className="h-3 w-3" />
              {t("emailContent")}
            </h4>
            {emailBodyLoading ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("loadingBody")}
              </div>
            ) : emailBody ? (
              <div
                className="mt-2 max-h-[400px] overflow-y-auto rounded-md border border-slate-200 bg-white p-3"
              >
                {emailBody.contentType === "html" ? (
                  <div
                    className="prose prose-sm max-w-none text-slate-700 [&_a]:text-brand [&_a]:underline [&_img]:max-w-full [&_table]:text-xs"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(emailBody.content, {
                        ALLOWED_TAGS: ["p", "br", "b", "i", "u", "strong", "em", "a", "ul", "ol", "li", "table", "tr", "td", "th", "thead", "tbody", "span", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "hr", "img"],
                        ALLOWED_ATTR: ["href", "target", "style", "class", "src", "alt", "width", "height"],
                        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
                      }),
                    }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans">{emailBody.content}</pre>
                )}
              </div>
            ) : email.body_preview ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {email.body_preview}
              </p>
            ) : null}
          </div>

          {/* Section 2b — Attachments */}
          {email.has_attachments && (
            <div>
              <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <Paperclip className="h-3 w-3" />
                {t("attachments")}
              </h4>
              {attachmentsLoading ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("loadingAttachments")}
                </div>
              ) : attachments.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {attachments.map((att) => {
                    const attStyle = getAttachmentIcon(att.contentType, att.name);
                    const AttIcon = attStyle.icon;
                    const savedPlan = savedPlans.get(att.name);
                    return (
                      <div key={att.id}>
                        <button
                          onClick={() => handleAttachmentClick(att)}
                          className="flex w-full items-center gap-2.5 rounded-md border border-slate-200 bg-white p-2.5 text-left transition-colors hover:bg-slate-50"
                        >
                          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", attStyle.color)}>
                            <AttIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-700">
                              {att.name}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {formatFileSize(att.size)}
                            </p>
                          </div>
                        </button>
                        {savedPlan && (
                          <div className="ml-10 mt-0.5 flex items-center gap-1 text-[11px] text-green-600">
                            <CheckCircle className="h-3 w-3" />
                            <span>{t("planSaved")}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {attachments.length > 1 && (
                    <button
                      onClick={handleDownloadAll}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t("downloadAll")}
                    </button>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-400">{t("noAttachmentsFound")}</p>
              )}
            </div>
          )}

          {/* Section 3 — Extracted Tasks */}
          <div>
            <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <CheckCircle className="h-3 w-3" />
              {t("extractedTasks")}
            </h4>
            {tasksLoading || extractingTasks ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {extractingTasks ? (t("extractingTasks") || "Analyse en cours...") : (t("loadingTasks") || "Chargement...")}
              </div>
            ) : extractedTasks.length > 0 ? (
              <div className="mt-2 space-y-2">
                {extractedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-md border border-slate-200 bg-white p-3"
                  >
                    <p className="text-sm font-medium text-slate-800">
                      {task.title}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                      {task.responsible && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {task.responsible}
                        </span>
                      )}
                      {task.deadline && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(task.deadline)}
                        </span>
                      )}
                    </div>
                    {taskCreatedIds.has(task.id) ? (
                      <p className="mt-2 text-xs font-medium text-green-600">
                        {t("taskCreated")}
                      </p>
                    ) : (
                      <button
                        onClick={() => handleCreateTask(task.id, task.title, task.responsible, task.deadline)}
                        className="mt-2 flex items-center gap-1 text-xs font-medium text-brand hover:text-brand/80"
                      >
                        <Plus className="h-3 w-3" />
                        {t("createTask")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-400">
                {t("noExtractedTasks")}
              </p>
            )}
            {!extractingTasks && !tasksLoading && (
              <button
                onClick={handleExtractTasks}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand/80"
              >
                <Sparkles className="h-3 w-3" />
                {extractedTasks.length > 0
                  ? (t("redetectTasks") || "Relancer la détection")
                  : (t("extractMoreTasks") || "Détecter les tâches")}
              </button>
            )}
          </div>

          {/* Section 4 — AI Reply Proposal */}
          <div>
            <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <Mail className="h-3 w-3" />
              {t("aiReplyProposal")}
            </h4>
            {replyLoading ? (
              <div className="mt-2 flex h-40 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("generatingReply") || "Génération en cours..."}
                </div>
              </div>
            ) : noReplyNeeded && !forceReply ? (
              <div className="mt-2 rounded-md border border-green-200 bg-green-50 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-green-700">
                  <CheckCircle className="h-4 w-4" />
                  {t("noReplyNeeded")}
                </p>
                <button
                  onClick={() => setForceReply(true)}
                  className="mt-2 text-xs font-medium text-green-600 underline hover:text-green-800"
                >
                  {t("composeAnyway")}
                </button>
              </div>
            ) : (
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={8}
                placeholder={t("insufficientContext")}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
              />
            )}
            {(!noReplyNeeded || forceReply) && !replyLoading && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={handleSendReply}
                  disabled={sendingReply || !replyText}
                  className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold/90 disabled:opacity-50"
                >
                  {sendingReply ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  {t("send")}
                </button>
                <button
                  onClick={handleCopyReply}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Copy className="h-3 w-3" />
                  {t("copy")}
                </button>
                <button
                  onClick={handleRegenerate}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3 w-3" />
                  {t("regenerate")}
                </button>
              </div>
            )}
          </div>

          {/* Section 5 — Quick Actions */}
          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {t("quickActions")}
            </h4>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {archiving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                {t("archiveOutlook")}
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowReclassDropdown(!showReclassDropdown)}
                  disabled={reclassifying}
                  className="flex w-full items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {reclassifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5" />}
                  {t("reclassify")}
                  <ChevronDown className="ml-auto h-3 w-3" />
                </button>
                {showReclassDropdown && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleReclassify(p.id)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleMarkProcessed}
                disabled={markingProcessed}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {markingProcessed ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                {t("markProcessed")}
              </button>
              <button
                onClick={handleMarkUrgent}
                disabled={markingUrgent}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50"
              >
                {markingUrgent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {t("markUrgent")}
              </button>
              <button
                onClick={() => {
                  if (onCreateTask) {
                    onCreateTask({
                      title: email.subject,
                      project_id: email.project_id || undefined,
                      description: email.ai_summary || email.body_preview || "",
                      source: "email",
                      source_id: email.id,
                      source_reference: `Email «${email.subject}» du ${formatDate(email.received_at)}`,
                    });
                  }
                }}
                className="col-span-2 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("createManualTask")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
