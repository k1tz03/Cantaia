"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Plus,
  Send,
  Square,
  Trash2,
  Loader2,
  Paperclip,
  X,
  Search,
  ClipboardList,
  FolderKanban,
  Copy,
  Check,
  CheckSquare,
  ThumbsUp,
  ThumbsDown,
  Database,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { handleInsufficientCredits } from "@/components/credits/PaywallDialog";
import { notifyCreditsChanged } from "@/lib/hooks/use-credits";
import { useAuth } from "@/components/providers/AuthProvider";
import { useActiveProjectSafe } from "@/lib/contexts/active-project-context";

/* ───────────────────── Typing dots animation ───────────────────── */
const typingKeyframes = `
@keyframes chatTypingDot {
  0% { opacity: 0.3; }
  50% { opacity: 1; }
  100% { opacity: 0.3; }
}
`;

interface Conversation {
  id: string;
  title: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  attachments?: Array<{
    file_url: string;
    file_name: string;
    file_type: string;
    file_size: number;
    extracted_text?: string;
    is_image?: boolean;
  }>;
}

/* ───────────────────── Helpers ───────────────────── */
function getConversationIcon(title: string): { emoji: string; bg: string } {
  const lower = title.toLowerCase();
  if (lower.includes("plan") || lower.includes("structure") || lower.includes("métré"))
    return { emoji: "\uD83D\uDCD0", bg: "bg-[#F97316]/10" }; // 📐
  if (lower.includes("soumission") || lower.includes("offre") || lower.includes("devis"))
    return { emoji: "\uD83D\uDCCB", bg: "bg-[#3B82F6]/10" }; // 📋
  if (lower.includes("prix") || lower.includes("coût") || lower.includes("budget"))
    return { emoji: "\uD83D\uDCB0", bg: "bg-[#10B981]/10" }; // 💰
  if (lower.includes("email") || lower.includes("mail") || lower.includes("réponse"))
    return { emoji: "\uD83D\uDCE7", bg: "bg-[#3B82F6]/10" }; // 📧
  if (lower.includes("planning") || lower.includes("calendrier"))
    return { emoji: "\uD83D\uDCC5", bg: "bg-[#52525B]/10" }; // 📅
  return { emoji: "\u2753", bg: "bg-[#52525B]/10" }; // ❓
}

function formatConvDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d >= today) {
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "maintenant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    return `il y a ${diffH}h`;
  }
  if (d >= yesterday) return "hier";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Initials from the signed-in user, falling back to a neutral glyph. */
function userInitials(
  meta: Record<string, unknown> | undefined,
  email: string | undefined
): string {
  const first = (meta?.first_name as string) || "";
  const last = (meta?.last_name as string) || "";
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?";
  }
  const full = (meta?.full_name as string) || "";
  if (full.trim()) {
    const parts = full.trim().split(/\s+/);
    return (parts[0].charAt(0) + (parts[1]?.charAt(0) || "")).toUpperCase();
  }
  return email ? email.charAt(0).toUpperCase() : "?";
}

/**
 * The last substantive paragraph of an assistant answer — used to pre-fill the
 * "create a task" modal, since that is usually the actionable conclusion.
 */
function lastParagraph(markdown: string): string {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((b) => b.replace(/^[#>\-*\d.\s]+/, "").trim())
    .filter((b) => b.length > 0);
  return (blocks[blocks.length - 1] || markdown).slice(0, 500);
}

/** Human label for a tool call, shown while the assistant queries data. */
const TOOL_LABELS: Record<string, string> = {
  get_project_overview: "Consultation du projet…",
  list_overdue_tasks: "Lecture des tâches en retard…",
  get_submission_status: "Vérification de la soumission…",
  search_data: "Recherche dans vos données…",
  get_recent_activity: "Lecture de l'activité récente…",
};

interface ProjectOption {
  id: string;
  name: string;
  code: string | null;
  status: string;
}

interface TaskDraft {
  title: string;
  description: string;
  projectId: string | null;
  saving: boolean;
  error: string | null;
  createdId: string | null;
}

export default function ChatPage() {
  const t = useTranslations("chat");
  const { user } = useAuth();
  const { activeProject } = useActiveProjectSafe();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Project context ────────────────────────────────────────
  // The backend already accepts `project_id`; this exposes it to the user and
  // defaults to whatever project the app-wide context is pointing at.
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const projectTouchedRef = useRef(false);

  // ── Per-message affordances ────────────────────────────────
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Record<number, "up" | "down">>({});
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);

  const [deleteConvId, setDeleteConvId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<Array<{
    file: File;
    preview?: string;
    uploaded?: { file_url: string; file_name: string; file_type: string; file_size: number; extracted_text?: string; is_image?: boolean };
  }>>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Typewriter streaming engine ────────────────────────────
  // TCP always delivers data in bursts, regardless of server-side fixes.
  // Instead of rendering tokens as they arrive (which creates block effect),
  // we buffer ALL incoming text and reveal it character-by-character at a
  // smooth, fixed rate via requestAnimationFrame. This is the same technique
  // used by ChatGPT, Claude.ai, and every polished AI chat UI.
  const pendingTextRef = useRef("");   // text waiting to be revealed
  const revealedTextRef = useRef("");  // text already shown on screen
  const animFrameRef = useRef<number>(0);
  const streamDoneRef = useRef(false); // true when SSE stream has ended

  /** Reveal loop — runs at 60fps while there is pending text. */
  const tickReveal = useCallback(() => {
    const pending = pendingTextRef.current;
    if (pending.length === 0) {
      animFrameRef.current = 0; // stop loop, restart on next appendToken
      return;
    }

    // Adaptive speed: reveal faster when the buffer is large (catching up)
    // or when the stream is done (drain remaining text quickly).
    let charsThisFrame: number;
    if (streamDoneRef.current) {
      charsThisFrame = Math.max(8, Math.ceil(pending.length / 10));
    } else if (pending.length > 300) {
      charsThisFrame = 8;
    } else if (pending.length > 100) {
      charsThisFrame = 5;
    } else {
      charsThisFrame = 3; // ~180 chars/sec at 60fps — smooth default
    }

    const chars = pending.slice(0, charsThisFrame);
    pendingTextRef.current = pending.slice(charsThisFrame);
    revealedTextRef.current += chars;

    const revealed = revealedTextRef.current;
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last.role === "assistant") {
        updated[updated.length - 1] = { ...last, content: revealed };
      }
      return updated;
    });

    // Auto-scroll
    const el = scrollContainerRef.current;
    if (el) {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      if (nearBottom) el.scrollTop = el.scrollHeight;
    }

    // Continue animation
    animFrameRef.current = requestAnimationFrame(tickReveal);
  }, []);

  /** Called by the SSE reader for each token — just buffers, never renders. */
  const appendToken = useCallback((token: string) => {
    pendingTextRef.current += token;
    // Start the reveal animation if not already running
    if (!animFrameRef.current) {
      animFrameRef.current = requestAnimationFrame(tickReveal);
    }
  }, [tickReveal]);

  /** Flush remaining text instantly (e.g. when loading history). */
  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Auto-scroll only on non-streaming events (loading history)
  useEffect(() => {
    if (!isStreaming) scrollToBottom();
  }, [messages, isStreaming, scrollToBottom]);

  // Cleanup animation frame + in-flight stream on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      // Abort any streaming request so the server stops generating tokens
      // nobody will read once the page is gone.
      abortRef.current?.abort();
    };
  }, []);

  /** Interrupt the in-flight assistant response (Stop button). */
  function stopStreaming() {
    abortRef.current?.abort();
  }

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
    loadProjects();
  }, []);

  // Default the chat scope to the app-wide active project — until the user
  // picks something else, at which point their choice sticks.
  useEffect(() => {
    if (projectTouchedRef.current) return;
    if (activeProject?.id) setSelectedProjectId(activeProject.id);
  }, [activeProject?.id]);

  async function loadProjects() {
    try {
      const res = await fetch("/api/projects/list");
      if (!res.ok) return;
      const data = await res.json();
      setProjects(
        (data.projects || []).map((p: ProjectOption) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          status: p.status,
        }))
      );
    } catch {
      // Non-fatal — the selector simply stays empty.
    }
  }

  async function loadConversations() {
    try {
      const res = await fetch("/api/chat/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingConvs(false);
    }
  }

  async function loadMessages(convId: string) {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/chat/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingMessages(false);
    }
  }

  function selectConversation(conv: Conversation) {
    if (conv.id === activeConvId) return;
    setActiveConvId(conv.id);
    setMessages([]);
    setFeedback({});
    // A conversation carries its own project scope — adopt it on open.
    if (conv.project_id) {
      setSelectedProjectId(conv.project_id);
      projectTouchedRef.current = true;
    }
    loadMessages(conv.id);
  }

  function startNewConversation() {
    setActiveConvId(null);
    setMessages([]);
    setInput("");
    setFeedback({});
    setQuestionSeed((s) => s + 1);
    textareaRef.current?.focus();
  }

  // ── Actionable outputs ─────────────────────────────────────

  async function copyMessage(index: number, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1800);
    } catch {
      // Clipboard blocked (insecure context / permission) — fail quietly.
    }
  }

  function openTaskDraft(content: string) {
    const seed = lastParagraph(content);
    setTaskDraft({
      // The task title is a single line; the full paragraph goes in the body.
      title: seed.split("\n")[0].slice(0, 120),
      description: seed,
      projectId: selectedProjectId,
      saving: false,
      error: null,
      createdId: null,
    });
  }

  async function submitTaskDraft() {
    if (!taskDraft) return;
    if (!taskDraft.projectId) {
      setTaskDraft({ ...taskDraft, error: "Sélectionnez un projet." });
      return;
    }
    if (!taskDraft.title.trim()) {
      setTaskDraft({ ...taskDraft, error: "Le titre est obligatoire." });
      return;
    }

    setTaskDraft({ ...taskDraft, saving: true, error: null });
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: taskDraft.projectId,
          title: taskDraft.title.trim(),
          description: taskDraft.description.trim() || null,
          source: "manual",
          priority: "medium",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setTaskDraft((d) =>
          d
            ? {
                ...d,
                saving: false,
                error: err?.error || "La création de la tâche a échoué.",
              }
            : d
        );
        return;
      }
      const data = await res.json();
      setTaskDraft((d) =>
        d ? { ...d, saving: false, createdId: data.task?.id || "ok" } : d
      );
    } catch {
      setTaskDraft((d) =>
        d ? { ...d, saving: false, error: "Erreur réseau." } : d
      );
    }
  }

  async function rateMessage(index: number, rating: "up" | "down") {
    if (!activeConvId) return;
    // Optimistic — feedback is advisory, a failed write should not block the UI.
    setFeedback((prev) => ({ ...prev, [index]: rating }));
    try {
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: activeConvId,
          message_index: index,
          rating,
        }),
      });
    } catch {
      // ignore
    }
  }

  function summarizeConversation() {
    if (isStreaming || messages.length === 0) return;
    sendMessage(
      "Résume cette conversation : les points clés abordés, les décisions prises " +
        "et les actions à entreprendre. Format court, en puces."
    );
  }

  function deleteConversation(convId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteConvId(convId);
  }

  async function executeDeleteConversation() {
    if (!deleteConvId) return;
    try {
      const res = await fetch(`/api/chat/conversations/${deleteConvId}`, { method: "DELETE" });
      if (!res.ok) {
        // Never drop the conversation from the list on a failed delete —
        // that would fake a success the server did not grant.
        toast.error(t("deleteFailed"));
        return;
      }
      setConversations((prev) => prev.filter((c) => c.id !== deleteConvId));
      if (activeConvId === deleteConvId) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch {
      toast.error(t("deleteFailed"));
    }
  }

  async function sendMessage(text?: string) {
    if (isStreaming) return;
    const typed = (text || input).trim();
    const hasFiles = pendingFiles.length > 0;
    // Attachments alone are a valid message — fall back to a default prompt so
    // the button (enabled when files are attached) is never a dead no-op.
    const msg = typed || (hasFiles ? t("analyzeAttachmentsDefault") : "");
    if (!msg) return;

    // ── Upload BEFORE any optimistic UI ──────────────────────────
    // A failed upload must cancel the send cleanly: never post a message that
    // implies Claude analysed a file it never received.
    let attachments: UploadedAttachment[] = [];
    if (hasFiles) {
      setUploading(true);
      const uploadResult = await uploadFiles();
      setUploading(false);
      if (uploadResult.failed.length > 0) {
        toast.error(t("uploadFailed", { names: uploadResult.failed.join(", ") }));
        // Keep only the failed chips so the user can retry or remove them.
        setPendingFiles((prev) =>
          prev.filter((pf) => uploadResult.failed.includes(pf.file.name)),
        );
        return;
      }
      attachments = uploadResult.attachments;
      setPendingFiles([]);
    }

    setInput("");
    setIsStreaming(true);
    setToolStatus(null);

    // Reset typewriter engine for new message
    pendingTextRef.current = "";
    revealedTextRef.current = "";
    streamDoneRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }

    // Add user message + empty assistant placeholder
    const userMsg: Message = { role: "user", content: msg };
    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    // Scroll to show the new messages immediately
    requestAnimationFrame(() => scrollToBottom());

    // Auto-resize textarea back
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      abortRef.current = new AbortController();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: activeConvId || undefined,
          message: msg,
          project_id: selectedProjectId || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
        signal: abortRef.current.signal,
      });

      // Insufficient credits: the 402 lands BEFORE the SSE stream starts, so it
      // must be handled before touching res.body.
      if (await handleInsufficientCredits(res)) {
        // Paywall is open — roll back the optimistic bubbles and give the draft
        // back to the composer instead of surfacing a generic error.
        setMessages((prev) => prev.slice(0, -2));
        setInput(msg);
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error("Stream failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "conversation_id" && !activeConvId) {
              setActiveConvId(event.data);
              loadConversations();
            } else if (event.type === "text") {
              appendToken(event.data);
            } else if (event.type === "tool") {
              // Tool round-trips are otherwise an unexplained pause.
              setToolStatus(
                TOOL_LABELS[event.data?.name] || "Consultation des données…"
              );
            } else if (event.type === "error") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: t("errorStream"),
                  };
                }
                return updated;
              });
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      // Stream completed — the message consumed credits, refresh the badge.
      notifyCreditsChanged();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === "assistant" && !last.content) {
          updated[updated.length - 1] = {
            ...last,
            content: t("errorNetwork"),
          };
        }
        return updated;
      });
    } finally {
      // Signal typewriter engine that all tokens have arrived.
      // It will drain remaining pending text at accelerated speed.
      streamDoneRef.current = true;
      // Kick the reveal loop if it stopped between the last token and now
      if (!animFrameRef.current && pendingTextRef.current.length > 0) {
        animFrameRef.current = requestAnimationFrame(tickReveal);
      }
      setIsStreaming(false);
      setToolStatus(null);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleTextareaInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  // Group conversations by date
  function groupConversations() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { label: string; items: Conversation[] }[] = [
      { label: t("today"), items: [] },
      { label: t("yesterday"), items: [] },
      { label: t("older"), items: [] },
    ];

    const filtered = searchQuery
      ? conversations.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : conversations;

    for (const conv of filtered) {
      const d = new Date(conv.updated_at);
      d.setHours(0, 0, 0, 0);
      if (d >= today) groups[0].items.push(conv);
      else if (d >= yesterday) groups[1].items.push(conv);
      else groups[2].items.push(conv);
    }

    return groups.filter((g) => g.items.length > 0);
  }

  // Pool of suggested questions — pick 3 random ones, reshuffle on new conversation
  const [questionSeed, setQuestionSeed] = useState(0);
  const suggestedQuestions = useMemo(() => {
    const pool = Array.from({ length: 15 }, (_, i) => t(`suggestQ${i + 1}`));
    // Fisher-Yates shuffle with seed-based trigger
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionSeed]);

  // --- File upload helpers ---
  const ALLOWED_TYPES = [
    "image/jpeg", "image/png", "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
  ];
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_FILES = 3;

  function handleFileSelect(files: FileList | File[]) {
    // .msg / .eml are intentionally excluded: the server has no extractor for
    // them, so they would reach Claude empty. Reject them at selection time.
    const selected = Array.from(files).filter(
      (f) => ALLOWED_TYPES.includes(f.type) && f.size <= MAX_FILE_SIZE
    );
    setPendingFiles((prev) => {
      const combined = [
        ...prev,
        ...selected.map((file) => ({
          file,
          preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        })),
      ];
      return combined.slice(0, MAX_FILES);
    });
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => {
      const removed = prev[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  interface UploadedAttachment {
    file_url: string;
    storage_path?: string;
    file_name: string;
    file_type: string;
    file_size: number;
    extracted_text?: string;
    is_image?: boolean;
  }

  /**
   * Upload every pending file. Returns the successful attachments AND the names
   * of the files that failed — the caller must surface failures rather than
   * silently sending a message that pretends an un-uploaded file was analysed.
   */
  async function uploadFiles(): Promise<{ attachments: UploadedAttachment[]; failed: string[] }> {
    const attachments: UploadedAttachment[] = [];
    const failed: string[] = [];
    for (const pf of pendingFiles) {
      if (pf.uploaded) {
        attachments.push(pf.uploaded);
        continue;
      }
      const formData = new FormData();
      formData.append("file", pf.file);
      formData.append("conversation_id", activeConvId || "temp");
      try {
        const res = await fetch("/api/chat/upload", { method: "POST", body: formData });
        if (res.ok) {
          attachments.push(await res.json());
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error("[Chat] Upload failed:", res.status, errData);
          failed.push(pf.file.name);
        }
      } catch (e) {
        console.error("[Chat] Upload error:", e);
        failed.push(pf.file.name);
      }
    }
    return { attachments, failed };
  }

  // Active conversation object
  const activeConv = conversations.find((c) => c.id === activeConvId);
  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const initials = userInitials(user?.user_metadata, user?.email);

  return (
    <>
      {/* Inject typing animation keyframes */}
      <style dangerouslySetInnerHTML={{ __html: typingKeyframes }} />

      <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-[#0F0F11]">
        {/* ───────── Conversation Sidebar (280px) ───────── */}
        <div className="hidden md:flex w-[280px] flex-col border-r border-[#27272A] bg-[#0F0F11] shrink-0">
          {/* Sidebar header */}
          <div className="p-3 border-b border-[#27272A]">
            <button
              onClick={startNewConversation}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#3F3F46] bg-transparent px-3 py-2 text-xs font-medium text-[#A1A1AA] transition-colors hover:border-[#F97316] hover:text-[#F97316] hover:bg-[#F97316]/[0.03]"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("newConversation")}
            </button>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#A1A1AA]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="w-full rounded-md bg-[#18181B] border border-[#27272A] py-1.5 pl-7 pr-2.5 text-[11px] text-[#D4D4D8] placeholder-[#71717A] outline-none focus:border-[#3F3F46]"
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto p-1.5">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[#A1A1AA]" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-3 py-8 text-center text-[11px] text-[#A1A1AA]">
                {t("noConversations")}
              </p>
            ) : (
              groupConversations().map((group) => (
                <div key={group.label}>
                  <p className="px-2 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                    {group.label}
                  </p>
                  {group.items.map((conv) => {
                    const icon = getConversationIcon(conv.title);
                    const isActive = activeConvId === conv.id;
                    return (
                      // Row is a div (not a <button>) so the delete control can
                      // be a real, focusable <button> child — nesting buttons is
                      // invalid HTML and breaks keyboard / screen-reader use.
                      <div
                        key={conv.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectConversation(conv)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectConversation(conv);
                          }
                        }}
                        className={cn(
                          "group flex w-full cursor-pointer items-center gap-2 rounded-[7px] px-2.5 py-2 text-left transition-all mb-px outline-none focus-visible:ring-1 focus-visible:ring-[#F97316]",
                          isActive
                            ? "bg-[#F97316]/[0.07]"
                            : "hover:bg-[#18181B]"
                        )}
                      >
                        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-xs", icon.bg)}>
                          {icon.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            "text-xs font-medium truncate",
                            isActive ? "text-[#F97316]" : "text-[#D4D4D8]"
                          )}>
                            {conv.title}
                          </div>
                          <div className="text-[9px] text-[#A1A1AA]">
                            {formatConvDate(conv.updated_at)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => deleteConversation(conv.id, e)}
                          className="shrink-0 rounded p-0.5 text-[#A1A1AA] opacity-0 transition-opacity hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                          aria-label={t("deleteConversation")}
                          title={t("deleteConversation")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ───────── Chat Main Panel ───────── */}
        <div
          className={cn("relative flex flex-1 flex-col bg-[#0F0F11]", dragOver && "ring-2 ring-[#F97316] ring-inset")}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length > 0) {
              handleFileSelect(e.dataTransfer.files);
            }
          }}
        >
          {/* Drag overlay */}
          {dragOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#F97316]/[0.06] border-2 border-dashed border-[#F97316] rounded-xl">
              <p className="font-display text-base font-bold text-[#F97316]">{t("dropFilesHere")}</p>
            </div>
          )}

          {/* ── Chat Header ── */}
          <div className="flex items-center justify-between border-b border-[#27272A] px-5 py-3">
            <div className="flex items-center gap-2">
              {/* Mobile new conversation button */}
              <button aria-label="Ajouter"
                onClick={startNewConversation}
                className="rounded-md border border-[#27272A] p-1.5 text-[#A1A1AA] hover:bg-[#27272A] md:hidden"
              >
                <Plus className="h-4 w-4" />
              </button>
              <h1 className="font-display text-sm font-bold text-[#FAFAFA]">
                {activeConv?.title || t("title")}
              </h1>

              {/* Project scope — drives the assistant's data tools */}
              <div className="relative flex items-center">
                <FolderKanban className="pointer-events-none absolute left-2 h-3 w-3 text-[#A1A1AA]" />
                <select
                  value={selectedProjectId || ""}
                  onChange={(e) => {
                    projectTouchedRef.current = true;
                    setSelectedProjectId(e.target.value || null);
                  }}
                  aria-label="Projet de référence pour l'assistant"
                  className={cn(
                    "appearance-none rounded-[5px] border py-1 pl-7 pr-6 text-[11px] outline-none transition-colors cursor-pointer",
                    selectedProjectId
                      ? "border-[#3B82F6]/30 bg-[#3B82F6]/[0.07] text-[#60A5FA]"
                      : "border-[#3F3F46] bg-[#18181B] text-[#A1A1AA] hover:border-[#52525B]"
                  )}
                >
                  <option value="">Tous les projets</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.code ? ` (${p.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {selectedProject && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-[5px] bg-[#10B981]/[0.08] text-[#34D399]">
                  <Database className="h-2.5 w-2.5" />
                  Données projet actives
                </span>
              )}
            </div>
            {activeConvId && (
              <div className="flex gap-1.5">
                <button
                  onClick={summarizeConversation}
                  disabled={isStreaming || messages.length === 0}
                  className="text-[10px] px-2.5 py-1.5 rounded-md border border-[#3F3F46] bg-[#18181B] text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#D4D4D8] transition-colors disabled:opacity-40 disabled:cursor-default"
                >
                  <ClipboardList className="h-3 w-3 inline mr-1" />
                  {t("summarize")}
                </button>
                <button
                  onClick={() => activeConvId && setDeleteConvId(activeConvId)}
                  className="text-[10px] px-2.5 py-1.5 rounded-md border border-[#3F3F46] bg-[#18181B] text-[#A1A1AA] hover:bg-[#27272A] hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3 w-3 inline mr-1" />
                  {t("deleteConversation")}
                </button>
              </div>
            )}
          </div>

          {/* ── Messages Area ── */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 py-4">
            {messages.length === 0 && !loadingMessages ? (
              /* ── Empty State ── */
              <div className="flex h-full flex-col items-center justify-center -mt-4">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F97316] to-[#EF4444]">
                  <span className="text-2xl font-display font-bold text-white">C</span>
                </div>
                <h2 className="font-display text-lg font-bold text-[#FAFAFA]">
                  {t("emptyTitle")}
                </h2>
                <p className="mt-1.5 max-w-md text-center text-[13px] text-[#A1A1AA] leading-relaxed">
                  {t("emptyDesc")}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-lg">
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(q)}
                      className="rounded-full border border-[#27272A] bg-[#18181B] px-3.5 py-2 text-[11px] text-[#A1A1AA] transition-all hover:border-[#F97316] hover:text-[#F97316] hover:bg-[#F97316]/[0.03]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : loadingMessages ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#A1A1AA]" />
              </div>
            ) : (
              /* ── Message List ── */
              <div className="mx-auto max-w-3xl flex flex-col gap-4">
                {messages.map((msg, i) => {
                  const isUser = msg.role === "user";
                  const isAI = msg.role === "assistant";
                  const isLastAssistant = isAI && i === messages.length - 1;
                  const isEmptyStreaming = isLastAssistant && isStreaming && !msg.content;

                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex gap-2.5 max-w-[85%]",
                        isUser ? "self-end flex-row-reverse" : "self-start"
                      )}
                      style={{ animation: "fadeInUp 0.3s ease-out" }}
                    >
                      {/* Avatar */}
                      {isAI && (
                        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#3B82F6] text-[10px] text-white font-semibold">
                          <span>AI</span>
                        </div>
                      )}
                      {isUser && (
                        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-[10px] text-white font-semibold"
                          style={{ background: "linear-gradient(135deg, #F97316, #EF4444)" }}
                          title={user?.email || undefined}
                        >
                          {initials}
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={cn(
                          "rounded-xl px-3.5 py-2.5",
                          isUser
                            ? "bg-[#F97316]/[0.08] border border-[#F97316]/[0.15]"
                            : "bg-[#18181B] border border-[#27272A]"
                        )}
                      >
                        {/* Name */}
                        <div className={cn(
                          "text-[10px] font-semibold mb-1",
                          isUser ? "text-[#FB923C]" : "text-[#60A5FA]"
                        )}>
                          {isUser ? t("roleYou") : t("roleAssistant")}
                        </div>

                        {/* Content */}
                        {isAI ? (
                          <div className="text-[13px] text-[#D4D4D8] leading-[1.6] [&_p]:mb-2 [&_p:last-child]:mb-0 [&_b]:text-[#FAFAFA] [&_code]:bg-[#27272A] [&_code]:px-1 [&_code]:py-px [&_code]:rounded [&_code]:text-[11px] [&_code]:text-[#FB923C] [&_ul]:my-1.5 [&_ul]:pl-4 [&_li]:mb-1 [&_h1]:text-[#FAFAFA] [&_h1]:font-bold [&_h1]:text-base [&_h1]:mb-2 [&_h2]:text-[#FAFAFA] [&_h2]:font-semibold [&_h2]:text-sm [&_h2]:mb-1.5 [&_h3]:text-[#FAFAFA] [&_h3]:font-semibold [&_h3]:text-[13px] [&_h3]:mb-1">
                            {msg.content ? (
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.content}
                              </ReactMarkdown>
                            ) : isEmptyStreaming ? (
                              /* Typing indicator inline */
                              <div className="flex items-center gap-2.5">
                                <div className="flex gap-1">
                                  <div className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" style={{ animation: "chatTypingDot 1s 0s infinite" }} />
                                  <div className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" style={{ animation: "chatTypingDot 1s 0.2s infinite" }} />
                                  <div className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" style={{ animation: "chatTypingDot 1s 0.4s infinite" }} />
                                </div>
                                <span className="text-[11px] text-[#A1A1AA]">
                                  {uploading
                                    ? t("uploadingStatus")
                                    : toolStatus || t("analyzingStatus")}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-[13px] text-[#D4D4D8] leading-[1.6] whitespace-pre-wrap">{msg.content}</p>
                        )}

                        {/* File attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-1.5 flex flex-col gap-1.5">
                            {msg.attachments.map((att, ai) => (
                              <div key={ai} className="flex items-center gap-2 rounded-md bg-[#27272A] px-2.5 py-1.5">
                                <span className="text-base">
                                  {att.file_type?.startsWith("image/") ? "\uD83D\uDDBC\uFE0F" : "\uD83D\uDCC4"}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[11px] text-[#D4D4D8] font-medium truncate">{att.file_name}</div>
                                  <div className="text-[9px] text-[#A1A1AA]">{formatFileSize(att.file_size)}</div>
                                </div>
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#10B981]/10 text-[#34D399] font-semibold">
                                  {att.is_image ? t("badgeVision") : t("badgeAnalyzed")}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Timestamp */}
                        {msg.created_at && (
                          <div className="text-[9px] text-[#3F3F46] mt-1">
                            {formatConvDate(msg.created_at)}
                          </div>
                        )}

                        {/* ── Actionable outputs (assistant only, once settled) ── */}
                        {isAI && msg.content && !(isLastAssistant && isStreaming) && (
                          <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-[#27272A] pt-2">
                            <button
                              onClick={() => openTaskDraft(msg.content)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-[#A1A1AA] transition-colors hover:bg-[#27272A] hover:text-[#F97316]"
                              title="Créer une tâche à partir de cette réponse"
                            >
                              <CheckSquare className="h-3 w-3" />
                              Créer une tâche
                            </button>
                            <button
                              onClick={() => copyMessage(i, msg.content)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-[#A1A1AA] transition-colors hover:bg-[#27272A] hover:text-[#D4D4D8]"
                              title="Copier la réponse"
                            >
                              {copiedIndex === i ? (
                                <>
                                  <Check className="h-3 w-3 text-[#34D399]" />
                                  <span className="text-[#34D399]">Copié</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  Copier
                                </>
                              )}
                            </button>

                            {/* Feedback — only meaningful on a persisted conversation */}
                            {activeConvId && (
                              <div className="ml-auto flex items-center gap-0.5">
                                <button
                                  onClick={() => rateMessage(i, "up")}
                                  aria-label="Réponse utile"
                                  aria-pressed={feedback[i] === "up"}
                                  className={cn(
                                    "rounded-md p-1 transition-colors hover:bg-[#27272A]",
                                    feedback[i] === "up"
                                      ? "text-[#34D399]"
                                      : "text-[#A1A1AA] hover:text-[#A1A1AA]"
                                  )}
                                >
                                  <ThumbsUp className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => rateMessage(i, "down")}
                                  aria-label="Réponse à améliorer"
                                  aria-pressed={feedback[i] === "down"}
                                  className={cn(
                                    "rounded-md p-1 transition-colors hover:bg-[#27272A]",
                                    feedback[i] === "down"
                                      ? "text-[#F87171]"
                                      : "text-[#A1A1AA] hover:text-[#A1A1AA]"
                                  )}
                                >
                                  <ThumbsDown className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* ── Suggestions (shown when not empty and not streaming) ── */}
          {messages.length > 0 && !isStreaming && (
            <div className="flex flex-wrap gap-1.5 px-5 pb-2">
              {suggestedQuestions.slice(0, 4).map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="rounded-full border border-[#27272A] bg-[#18181B] px-3 py-1.5 text-[11px] text-[#A1A1AA] transition-all hover:border-[#F97316] hover:text-[#F97316] hover:bg-[#F97316]/[0.03]"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* ── Input Area ── */}
          <div className="border-t border-[#27272A] bg-[#0F0F11] px-5 py-3">
            {/* File preview chips */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {pendingFiles.map((pf, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 rounded-md bg-[#27272A] border border-[#3F3F46] px-2 py-1 text-[10px] text-[#D4D4D8]"
                  >
                    <span className="text-xs">
                      {pf.file.type.startsWith("image/") ? "\uD83D\uDDBC\uFE0F" : "\uD83D\uDCC4"}
                    </span>
                    <span className="max-w-[120px] truncate">{pf.file.name}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(i)}
                      className="text-[#A1A1AA] hover:text-[#F87171] ml-0.5 text-xs"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ALLOWED_TYPES.join(",")}
                onChange={(e) => {
                  if (e.target.files) handleFileSelect(e.target.files);
                  e.target.value = "";
                }}
                className="hidden"
              />

              {/* Paperclip button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || pendingFiles.length >= MAX_FILES}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#18181B] border border-[#3F3F46] text-[#A1A1AA] hover:bg-[#27272A] hover:border-[#52525B] transition-colors disabled:opacity-50"
                title="Joindre un fichier"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  handleTextareaInput();
                }}
                onKeyDown={handleKeyDown}
                placeholder={t("placeholder")}
                rows={1}
                disabled={isStreaming}
                className="flex-1 resize-none rounded-xl border border-[#3F3F46] bg-[#18181B] px-3.5 py-2 text-[13px] text-[#D4D4D8] placeholder-[#71717A] outline-none focus:border-[#F97316] disabled:opacity-50"
                style={{ maxHeight: 120, lineHeight: "1.5", fontFamily: "inherit" }}
              />

              {/* Send / Stop button — while streaming it interrupts the answer */}
              {isStreaming ? (
                <button
                  onClick={stopStreaming}
                  aria-label={t("stop")}
                  title={t("stop")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#18181B] border border-[#3F3F46] text-[#F87171] cursor-pointer transition-colors hover:bg-[#27272A] hover:border-[#52525B]"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => sendMessage()}
                  disabled={(!input.trim() && pendingFiles.length === 0) || uploading}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all",
                    (!input.trim() && pendingFiles.length === 0) || uploading
                      ? "bg-[#27272A] text-[#A1A1AA] cursor-default"
                      : "text-white cursor-pointer hover:opacity-90"
                  )}
                  style={
                    (!input.trim() && pendingFiles.length === 0) || uploading
                      ? undefined
                      : { background: "linear-gradient(135deg, #F97316, #EA580C)" }
                  }
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>

            {/* Hint */}
            <p className="text-[10px] text-[#3F3F46] text-center mt-1.5">
              {t("inputHint")}
            </p>
          </div>
        </div>

        <ConfirmDialog
          open={!!deleteConvId}
          onClose={() => setDeleteConvId(null)}
          onConfirm={executeDeleteConversation}
          title={t("deleteConfirm")}
          description={t("deleteDescription")}
          variant="danger"
        />

        {/* ── Lightweight "create a task" modal ── */}
        {taskDraft && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Créer une tâche"
            onClick={() => setTaskDraft(null)}
          >
            <div
              className="w-full max-w-md rounded-xl border border-[#27272A] bg-[#18181B] p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-[#FAFAFA]">
                  Créer une tâche
                </h3>
                <button
                  onClick={() => setTaskDraft(null)}
                  aria-label="Fermer"
                  className="rounded p-1 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#D4D4D8]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {taskDraft.createdId ? (
                <div className="py-4 text-center">
                  <Check className="mx-auto mb-2 h-8 w-8 text-[#34D399]" />
                  <p className="text-[13px] text-[#D4D4D8]">Tâche créée.</p>
                  <button
                    onClick={() => setTaskDraft(null)}
                    className="mt-4 rounded-lg bg-[#27272A] px-4 py-2 text-[11px] font-medium text-[#D4D4D8] hover:bg-[#3F3F46]"
                  >
                    Fermer
                  </button>
                </div>
              ) : (
                <>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">
                    Projet
                  </label>
                  <select
                    value={taskDraft.projectId || ""}
                    onChange={(e) =>
                      setTaskDraft({
                        ...taskDraft,
                        projectId: e.target.value || null,
                        error: null,
                      })
                    }
                    className="mb-3 w-full rounded-lg border border-[#3F3F46] bg-[#0F0F11] px-3 py-2 text-[12px] text-[#D4D4D8] outline-none focus:border-[#F97316]"
                  >
                    <option value="">— Sélectionner —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.code ? ` (${p.code})` : ""}
                      </option>
                    ))}
                  </select>

                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">
                    Titre
                  </label>
                  <input
                    value={taskDraft.title}
                    onChange={(e) =>
                      setTaskDraft({ ...taskDraft, title: e.target.value, error: null })
                    }
                    className="mb-3 w-full rounded-lg border border-[#3F3F46] bg-[#0F0F11] px-3 py-2 text-[12px] text-[#D4D4D8] outline-none focus:border-[#F97316]"
                  />

                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#A1A1AA]">
                    Description
                  </label>
                  <textarea
                    value={taskDraft.description}
                    onChange={(e) =>
                      setTaskDraft({ ...taskDraft, description: e.target.value })
                    }
                    rows={4}
                    className="mb-3 w-full resize-none rounded-lg border border-[#3F3F46] bg-[#0F0F11] px-3 py-2 text-[12px] text-[#D4D4D8] outline-none focus:border-[#F97316]"
                  />

                  {taskDraft.error && (
                    <p className="mb-2 rounded-md border border-[#EF4444]/25 bg-[#EF4444]/10 px-3 py-2 text-[11px] text-[#F87171]">
                      {taskDraft.error}
                    </p>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setTaskDraft(null)}
                      className="rounded-lg border border-[#3F3F46] px-3 py-2 text-[11px] font-medium text-[#A1A1AA] hover:bg-[#27272A]"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={submitTaskDraft}
                      disabled={taskDraft.saving}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#F97316] px-3 py-2 text-[11px] font-semibold text-[#0F0F11] hover:bg-[#EA580C] disabled:opacity-50"
                    >
                      {taskDraft.saving && <Loader2 className="h-3 w-3 animate-spin" />}
                      Créer
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* fadeInUp animation for messages */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      ` }} />
    </>
  );
}
