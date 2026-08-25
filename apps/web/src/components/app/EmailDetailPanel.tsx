"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@cantaia/ui";
import DOMPurify from "dompurify";
import {
  X,
  Send,
  Copy,
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
  RotateCcw,
  Forward,
  Trash2,
} from "lucide-react";
import type { EmailRecord, Project } from "@cantaia/database";
import { formatDate } from "@/lib/format";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { handleInsufficientCredits } from "@/components/credits/PaywallDialog";
import { notifyCreditsChanged } from "@/lib/hooks/use-credits";

// Dark theme is forced app-wide — use the hardcoded hex palette, never `dark:`
// variants or semantic Tailwind colors (which don't resolve under forcedTheme).
const classificationConfig: Record<string, { label: string; icon: React.ComponentType<any>; color: string }> = {
  action_required: { label: "Action", icon: AlertCircle, color: "text-[#F97316] bg-[#F97316]/10" },
  urgent: { label: "Urgent", icon: AlertTriangle, color: "text-[#EF4444] bg-[#EF4444]/10" },
  waiting_response: { label: "En attente", icon: Clock, color: "text-[#3B82F6] bg-[#3B82F6]/10" },
  info_only: { label: "Info", icon: Info, color: "text-[#A1A1AA] bg-[#27272A]" },
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
    return { icon: FileText, color: "text-red-500 bg-red-500/10" };
  }
  if (
    contentType.includes("wordprocessingml") ||
    contentType.includes("msword") ||
    ext === "docx" ||
    ext === "doc"
  ) {
    return { icon: FileText, color: "text-blue-500 bg-blue-500/10" };
  }
  if (
    contentType.includes("spreadsheetml") ||
    contentType.includes("ms-excel") ||
    ext === "xlsx" ||
    ext === "xls"
  ) {
    return { icon: FileSpreadsheet, color: "text-green-500 bg-green-500/10" };
  }
  if (contentType.startsWith("image/")) {
    return { icon: ImageIcon, color: "text-purple-500 bg-purple-500/10" };
  }
  return { icon: Paperclip, color: "text-[#A1A1AA] bg-[#27272A]" };
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
  // D-FIX8 — ONE reply mechanism.
  //
  // The panel used to carry two: an always-auto-generated "AI reply proposal"
  // section and a separate "direct reply" composer opened from the action bar.
  // They had different state, different buttons and posted to the SAME
  // endpoint, so the user could type into one box and send the other's
  // (possibly stale) text. They are now a single composer whose body can be
  // filled by hand or by the AI.
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [noReplyNeeded, setNoReplyNeeded] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [showReclassDropdown, setShowReclassDropdown] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [markingProcessed, setMarkingProcessed] = useState(false);
  const [markingUrgent, setMarkingUrgent] = useState(false);
  const [extractedTasks, setExtractedTasks] = useState<{ id: string; title: string; responsible?: string | null; deadline?: string | null }[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [extractingTasks, setExtractingTasks] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [emailBody, setEmailBody] = useState<{ contentType: string; content: string } | null>(null);
  const [emailBodyLoading, setEmailBodyLoading] = useState(false);
  const [savedPlans, setSavedPlans] = useState<Map<string, { planId: string; planTitle: string }>>(new Map());
  // Forward / delete states
  const [showForward, setShowForward] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [forwardTo, setForwardTo] = useState("");
  const [forwardNote, setForwardNote] = useState("");
  const [sendingForward, setSendingForward] = useState(false);
  const [forwardError, setForwardError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const project = email.project_id ? projects.find((p) => p.id === email.project_id) : null;
  const detailedSummary = email.ai_summary || null;
  const config = email.classification ? classificationConfig[email.classification] : null;

  /**
   * D-FIX8 — AI reply generation is now ON DEMAND.
   *
   * This used to run in a `useEffect` on every panel open: opening an email to
   * read it billed a Claude call whose output was usually discarded when the
   * panel closed. The user asks for a draft when they want one.
   */
  const fetchReply = useCallback(async () => {
    setReplyLoading(true);
    setNoReplyNeeded(false);
    setReplyError(null);
    try {
      const res = await fetch("/api/ai/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: email.id }),
      });
      // 402 → open the global paywall instead of showing a raw error string.
      if (await handleInsufficientCredits(res)) {
        setReplyLoading(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReplyError(data.error || `Erreur ${res.status}`);
      } else if (data.no_reply_needed) {
        setNoReplyNeeded(true);
        notifyCreditsChanged();
      } else if (data.reply_text) {
        setReplyText(data.reply_text);
        notifyCreditsChanged();
      } else {
        setReplyError(t("insufficientContext"));
      }
    } catch {
      setReplyError(t("insufficientContext"));
    } finally {
      setReplyLoading(false);
    }
  }, [email.id, t]);

  // Reset the composer whenever the panel switches to another email —
  // otherwise a draft written for email A stayed loaded over email B.
  useEffect(() => {
    setShowReply(false);
    setReplyText("");
    setReplyError(null);
    setNoReplyNeeded(false);
    setShowForward(false);
    setForwardError(null);
    setExtractError(null);
    setConfirmDeleteOpen(false);
  }, [email.id]);

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

  /**
   * D-FIX5 — load the tasks that EXIST for this email.
   *
   * This effect used to fall through to `/api/ai/extract-tasks` whenever the
   * email had no task yet: every single panel open on such an email paid for a
   * Claude extraction whose result was held in local state and thrown away on
   * close — the same emails were re-extracted forever and never persisted.
   * Extraction is now an explicit user action that writes real `tasks` rows.
   */
  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const res = await fetch(`/api/tasks/by-email?email_id=${encodeURIComponent(email.id)}`);
      const data = await res.json();
      setExtractedTasks(
        (data.tasks || []).map((task: { id: string; title: string; assigned_to_name?: string | null; due_date?: string | null }) => ({
          id: task.id,
          title: task.title,
          responsible: task.assigned_to_name,
          deadline: task.due_date,
        }))
      );
    } catch {
      setExtractedTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [email.id]);

  useEffect(() => {
    setExtractedTasks([]);
    loadTasks();
  }, [loadTasks]);

  /**
   * Extract tasks with `persist: true`: the route enforces the org check and
   * inserts the rows, so the AI spend produces something that survives the
   * panel closing. Then re-read from the DB — a single source of truth.
   */
  async function handleExtractTasks() {
    setExtractingTasks(true);
    setExtractError(null);
    try {
      const res = await fetch("/api/ai/extract-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: email.id, persist: true }),
      });
      // 402 → global paywall; abort silently (dialog handles messaging).
      if (await handleInsufficientCredits(res)) {
        setExtractingTasks(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.persisted) {
        notifyCreditsChanged();
        await loadTasks();
        onEmailUpdated?.();
      } else {
        const msg = data.error || `Erreur ${res.status}`;
        console.error("[EmailDetail] Task extraction failed:", msg);
        setExtractError(t("taskExtractionFailed"));
      }
    } catch (err) {
      console.error("[EmailDetail] Task extraction error:", err);
      setExtractError(t("taskExtractionFailed"));
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

  function handleCopyReply() {
    navigator.clipboard.writeText(replyText);
  }

  /** The single send path for this panel (D-FIX8). */
  async function handleSendReply() {
    if (!replyText.trim() || !email.outlook_message_id) return;
    setSendingReply(true);
    setReplyError(null);
    try {
      const res = await fetch("/api/outlook/send-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlook_message_id: email.outlook_message_id,
          reply_content: replyText,
        }),
      });
      // A non-2xx used to be ignored entirely: the spinner stopped and the user
      // believed the reply had gone out.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReplyError(data.error || `Envoi échoué (${res.status})`);
        return;
      }
      setShowReply(false);
      setReplyText("");
      onEmailUpdated?.();
    } catch {
      setReplyError(t("replyNetworkError"));
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

  // Forward email to another recipient.
  // /api/email/send always treats `body` as HTML (it has no content_type
  // handling), so we must build HTML: text newlines → <br>, and embed the FULL
  // original body (loaded from Graph into `emailBody`) rather than the truncated
  // preview.
  async function handleSendForward() {
    if (!forwardTo.trim() || !email.outlook_message_id) return;
    setSendingForward(true);
    setForwardError(null);
    try {
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const textToHtml = (s: string) => esc(s).replace(/\r?\n/g, "<br>");

      // Prefer the full body already fetched from Graph; fall back to preview.
      const originalHtml =
        emailBody && emailBody.contentType === "html"
          ? emailBody.content
          : textToHtml(emailBody?.content || email.body_preview || "");

      const subject = `TR: ${email.subject}`;
      const header =
        `---------- Message transféré ----------<br>` +
        `De : ${esc(email.sender_name || email.sender_email)}<br>` +
        `Date : ${esc(formatDate(email.received_at))}<br>` +
        `Objet : ${esc(email.subject)}<br><br>`;
      const notePart = forwardNote ? `${textToHtml(forwardNote)}<br><br>` : "";
      const forwardBody = `${notePart}${header}${originalHtml}`;

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: forwardTo.split(",").map((e: string) => e.trim()),
          subject,
          body: forwardBody,
        }),
      });
      if (await handleInsufficientCredits(res)) {
        setSendingForward(false);
        return;
      }
      if (res.ok) {
        setShowForward(false);
        setForwardTo("");
        setForwardNote("");
      } else {
        const data = await res.json().catch(() => ({}));
        setForwardError(data.error || `Erreur ${res.status}`);
      }
    } catch (err) {
      console.error("[EmailDetail] Forward error:", err);
      setForwardError(t("forwardFailed"));
    } finally {
      setSendingForward(false);
    }
  }

  /**
   * Delete email (move to Deleted Items in Outlook).
   * D-FIX8 — a single click on a small icon button used to move the message to
   * the bin with no confirmation and no undo; it now goes through a dialog.
   */
  async function handleDeleteEmail() {
    if (!email.outlook_message_id) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/outlook/move-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlook_message_id: email.outlook_message_id,
          folder_name: "Deleted Items",
        }),
      });
      if (!res.ok) {
        console.error("[EmailDetail] Delete failed:", res.status);
        return;
      }
      setConfirmDeleteOpen(false);
      onEmailUpdated?.();
      onClose();
    } catch (err) {
      console.error("[EmailDetail] Delete error:", err);
    } finally {
      setDeleting(false);
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
      <div className="flex items-center justify-between border-b border-[#27272A] bg-[#0F0F11] px-5 py-3">
        <h3 className="text-sm font-semibold text-[#FAFAFA]">
          {t("emailDetail")}
        </h3>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#A1A1AA]"
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
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">
                {t("from")}
              </p>
              <p className="text-sm font-medium text-[#FAFAFA]">
                {email.sender_name || email.sender_email}
              </p>
              <p className="text-xs text-[#A1A1AA]">{email.sender_email}</p>
            </div>
            {(email.recipients?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">
                  {t("recipients")}
                </p>
                <p className="text-xs text-[#A1A1AA]">
                  {email.recipients?.join(", ")}
                </p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">
                {t("subject")}
              </p>
              <p className="text-sm font-medium text-[#FAFAFA]">
                {email.subject}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#A1A1AA]">
                {formatDate(email.received_at)}
              </span>
              {email.has_attachments && (
                <span className="flex items-center gap-1 text-xs text-[#A1A1AA]">
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

          {/* ACTION BAR — Reply, Forward, Delete */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[#27272A] pb-4">
            <button
              onClick={() => { setShowReply(!showReply); setShowForward(false); }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                showReply
                  ? "bg-[#F97316] text-[#0F0F11]"
                  : "bg-[#F97316]/10 text-[#F97316] hover:bg-[#F97316]/20 border border-[#F97316]/20"
              )}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Répondre
            </button>
            <button
              onClick={() => { setShowForward(!showForward); setShowReply(false); }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border",
                showForward
                  ? "bg-[#3B82F6] text-white border-[#3B82F6]"
                  : "text-[#A1A1AA] bg-[#27272A] hover:bg-[#3F3F46] border-[#3F3F46]"
              )}
            >
              <Forward className="h-3.5 w-3.5" />
              Transférer
            </button>
            <button
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleting || !email.outlook_message_id}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Supprimer
            </button>
          </div>

          {/* Reply composer — ONE box, hand-written or AI-filled (D-FIX8) */}
          {showReply && (
            <div className="rounded-lg border border-[#F97316]/20 bg-[#F97316]/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#F97316]">
                  Répondre à {email.sender_name || email.sender_email}
                </p>
                <button
                  onClick={fetchReply}
                  disabled={replyLoading}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#F97316]/20 px-2 py-1 text-[11px] font-medium text-[#F97316] hover:bg-[#F97316]/10 disabled:opacity-50"
                >
                  {replyLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {replyText ? t("regenerate") : t("aiReplyProposal")}
                </button>
              </div>

              {noReplyNeeded && !replyText && (
                <p className="flex items-center gap-1.5 rounded-md border border-green-500/20 bg-green-500/10 px-2.5 py-2 text-xs text-green-400">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                  {t("noReplyNeeded")}
                </p>
              )}

              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={6}
                placeholder={t("replyPlaceholder")}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] p-2.5 text-sm leading-relaxed text-[#FAFAFA] placeholder:text-[#A1A1AA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]/20"
              />

              {replyError && (
                <p className="flex items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-2 text-xs text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {replyError}
                </p>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSendReply}
                  disabled={sendingReply || !replyText.trim() || !email.outlook_message_id}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#F97316] px-3 py-1.5 text-xs font-medium text-[#0F0F11] hover:bg-[#EA580C] disabled:opacity-50"
                >
                  {sendingReply ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  {t("send")}
                </button>
                <button
                  onClick={handleCopyReply}
                  disabled={!replyText}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A] disabled:opacity-50"
                >
                  <Copy className="h-3 w-3" />
                  {t("copy")}
                </button>
                <button
                  onClick={() => { setShowReply(false); setReplyText(""); setReplyError(null); }}
                  className="ml-auto rounded-md px-3 py-1.5 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A]"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          )}

          {/* Forward Compose */}
          {showForward && (
            <div className="rounded-lg border border-[#3B82F6]/20 bg-[#3B82F6]/5 p-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#3B82F6]">
                {t("forwardTitle")}
              </p>
              <input
                type="email"
                value={forwardTo}
                onChange={(e) => setForwardTo(e.target.value)}
                placeholder={t("forwardToPlaceholder")}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-2.5 py-1.5 text-sm text-[#FAFAFA] placeholder:text-[#A1A1AA] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/20"
              />
              <textarea
                value={forwardNote}
                onChange={(e) => setForwardNote(e.target.value)}
                rows={3}
                placeholder={t("forwardNotePlaceholder")}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] p-2.5 text-sm text-[#FAFAFA] placeholder:text-[#A1A1AA] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/20"
              />
              {forwardError && (
                <p className="flex items-center gap-1.5 rounded-md border border-[#EF4444]/20 bg-[#EF4444]/10 px-2.5 py-2 text-xs text-[#EF4444]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {forwardError}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSendForward}
                  disabled={sendingForward || !forwardTo.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#3B82F6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2563EB] disabled:opacity-50"
                >
                  {sendingForward ? <Loader2 className="h-3 w-3 animate-spin" /> : <Forward className="h-3 w-3" />}
                  {t("forwardAction")}
                </button>
                <button
                  onClick={() => { setShowForward(false); setForwardTo(""); setForwardNote(""); }}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A]"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          )}

          {/* Bug 8 — AI Summary: always visible, not collapsible */}
          {(detailedSummary || email.ai_summary) && detailedSummary !== "—" && (
            <div className="rounded-md border border-[#F97316]/20 bg-[#F97316]/10 p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#F97316]">
                <Sparkles className="h-3 w-3" />
                {t("detailedSummary")}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#FAFAFA]">
                {detailedSummary || email.ai_summary}
              </p>
            </div>
          )}

          {/* Section 1b — Email Content */}
          <div>
            <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">
              <Mail className="h-3 w-3" />
              {t("emailContent")}
            </h4>
            {emailBodyLoading ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-[#A1A1AA]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("loadingBody")}
              </div>
            ) : emailBody ? (
              <div
                className="mt-2 max-h-[400px] overflow-y-auto rounded-md border border-[#27272A] bg-white p-3 text-black"
              >
                {emailBody.contentType === "html" ? (
                  <div
                    className="prose prose-sm max-w-none text-[#1A1A1A] [&_a]:text-blue-600 [&_a]:underline [&_img]:max-w-full [&_table]:text-xs"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(emailBody.content, {
                        ALLOWED_TAGS: ["p", "br", "b", "i", "u", "strong", "em", "a", "ul", "ol", "li", "table", "tr", "td", "th", "thead", "tbody", "span", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "hr", "img"],
                        ALLOWED_ATTR: ["href", "target", "style", "class", "src", "alt", "width", "height"],
                        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|data:image\/|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
                      }),
                    }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-[#1A1A1A] font-sans">{emailBody.content}</pre>
                )}
              </div>
            ) : email.body_preview ? (
              <p className="mt-2 text-sm leading-relaxed text-[#A1A1AA]">
                {email.body_preview}
              </p>
            ) : null}
          </div>

          {/* Section 2b — Attachments */}
          {email.has_attachments && (
            <div>
              <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">
                <Paperclip className="h-3 w-3" />
                {t("attachments")}
              </h4>
              {attachmentsLoading ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-[#A1A1AA]">
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
                          className="flex w-full items-center gap-2.5 rounded-md border border-[#27272A] bg-[#0F0F11] p-2.5 text-left transition-colors hover:bg-[#27272A]"
                        >
                          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", attStyle.color)}>
                            <AttIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[#FAFAFA]">
                              {att.name}
                            </p>
                            <p className="text-[11px] text-[#A1A1AA]">
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
                      className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[#27272A] bg-[#0F0F11] px-3 py-2 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t("downloadAll")}
                    </button>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#A1A1AA]">{t("noAttachmentsFound")}</p>
              )}
            </div>
          )}

          {/* Section 3 — Extracted Tasks */}
          <div>
            <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">
              <CheckCircle className="h-3 w-3" />
              {t("extractedTasks")}
            </h4>
            {tasksLoading || extractingTasks ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-[#A1A1AA]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {extractingTasks ? t("extractingTasks") : t("loadingTasks")}
              </div>
            ) : extractedTasks.length > 0 ? (
              <div className="mt-2 space-y-2">
                {extractedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-md border border-[#27272A] bg-[#0F0F11] p-3"
                  >
                    <p className="text-sm font-medium text-[#FAFAFA]">
                      {task.title}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-[#A1A1AA]">
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
                    {/*
                      D-FIX5 — every row here is now a REAL `tasks` row loaded
                      from the DB, so the old per-row "Créer la tâche" button
                      would have created a duplicate.
                    */}
                    <p className="mt-2 flex items-center gap-1 text-xs font-medium text-green-500">
                      <CheckCircle className="h-3 w-3" />
                      {t("taskCreated")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-[#A1A1AA]">
                {t("noExtractedTasks")}
              </p>
            )}
            {extractError && (
              <p className="mt-2 flex items-center gap-1.5 rounded-md border border-[#EF4444]/20 bg-[#EF4444]/10 px-2.5 py-2 text-xs text-[#EF4444]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {extractError}
              </p>
            )}
            {!extractingTasks && !tasksLoading && (
              <button
                onClick={handleExtractTasks}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#F97316] hover:text-[#EA580C]"
              >
                <Sparkles className="h-3 w-3" />
                {extractedTasks.length > 0 ? t("redetectTasks") : t("extractMoreTasks")}
              </button>
            )}
          </div>

          {/*
            D-FIX8 — the old "Section 4 — AI Reply Proposal" lived here. It was
            a second, always-visible composer over the SAME `replyText` and the
            same send endpoint as the action-bar one. Replying is now a single
            composer opened from the action bar above.
          */}

          {/* Section 5 — Quick Actions */}
          <div className="border-t border-[#27272A] pt-4">
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">
              {t("quickActions")}
            </h4>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="flex items-center gap-1.5 rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A] disabled:opacity-50"
              >
                {archiving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                {t("archiveOutlook")}
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowReclassDropdown(!showReclassDropdown)}
                  disabled={reclassifying}
                  className="flex w-full items-center gap-1.5 rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A] disabled:opacity-50"
                >
                  {reclassifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5" />}
                  {t("reclassify")}
                  <ChevronDown className="ml-auto h-3 w-3" />
                </button>
                {showReclassDropdown && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] py-1 shadow-lg">
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleReclassify(p.id)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[#A1A1AA] hover:bg-[#27272A]"
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
                className="flex items-center gap-1.5 rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A] disabled:opacity-50"
              >
                {markingProcessed ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                {t("markProcessed")}
              </button>
              <button
                onClick={handleMarkUrgent}
                disabled={markingUrgent}
                className="flex items-center gap-1.5 rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-xs font-medium text-[#F97316] hover:bg-[#F97316]/10 disabled:opacity-50"
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
                className="col-span-2 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-[#27272A] bg-[#0F0F11] px-3 py-2 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A]"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("createManualTask")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* D-FIX8 — deleting an email now asks first. */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDeleteEmail}
        variant="danger"
        title={t("deleteEmailTitle")}
        description={t("deleteEmailDescription", { subject: email.subject })}
      />
    </div>
  );
}
