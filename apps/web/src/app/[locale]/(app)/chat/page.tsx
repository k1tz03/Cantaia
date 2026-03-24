"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Plus,
  Send,
  Trash2,
  MessageSquare,
  Loader2,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Search,
  ClipboardList,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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
    return { emoji: "\uD83D\uDCE7", bg: "bg-[#8B5CF6]/10" }; // 📧
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

export default function ChatPage() {
  const t = useTranslations("chat");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Smooth streaming: buffer incoming tokens and flush via rAF
  const streamBufferRef = useRef("");
  const rafRef = useRef<number | null>(null);

  const flushStreamBuffer = useCallback(() => {
    if (streamBufferRef.current) {
      const chunk = streamBufferRef.current;
      streamBufferRef.current = "";
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content: last.content + chunk,
          };
        }
        return updated;
      });
    }
    rafRef.current = requestAnimationFrame(flushStreamBuffer);
  }, []);

  // Clean up rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

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
    loadMessages(conv.id);
  }

  function startNewConversation() {
    setActiveConvId(null);
    setMessages([]);
    setInput("");
    setQuestionSeed((s) => s + 1);
    textareaRef.current?.focus();
  }

  function deleteConversation(convId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDeleteConvId(convId);
  }

  async function executeDeleteConversation() {
    if (!deleteConvId) return;
    try {
      await fetch(`/api/chat/conversations/${deleteConvId}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== deleteConvId));
      if (activeConvId === deleteConvId) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch {
      // ignore
    }
  }

  async function sendMessage(text?: string) {
    const msg = (text || input).trim();
    if (!msg || isStreaming) return;

    setInput("");
    setIsStreaming(true);

    // Add user message optimistically
    const userMsg: Message = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);

    // Add empty assistant message for streaming
    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    // Auto-resize textarea back
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      // Upload pending files before sending message
      let attachments: Array<{ file_url: string; file_name: string; file_type: string; file_size: number; extracted_text?: string; is_image?: boolean }> = [];
      if (pendingFiles.length > 0) {
        setUploading(true);
        attachments = await uploadFiles();
        setUploading(false);
        setPendingFiles([]);
      }

      abortRef.current = new AbortController();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: activeConvId || undefined,
          message: msg,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error("Stream failed");
      }

      // Start rAF loop for smooth rendering
      streamBufferRef.current = "";
      rafRef.current = requestAnimationFrame(flushStreamBuffer);

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
              // Buffer text for smooth rAF-based rendering
              streamBufferRef.current += event.data;
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

      // Final flush — ensure all buffered text is rendered
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (streamBufferRef.current) {
        const remaining = streamBufferRef.current;
        streamBufferRef.current = "";
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + remaining,
            };
          }
          return updated;
        });
      }
    } catch (err: unknown) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      streamBufferRef.current = "";
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
      setIsStreaming(false);
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
    const selected = Array.from(files).filter(
      (f) =>
        (ALLOWED_TYPES.includes(f.type) || f.name.endsWith(".msg") || f.name.endsWith(".eml")) &&
        f.size <= MAX_FILE_SIZE
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

  async function uploadFiles(): Promise<
    Array<{
      file_url: string;
      file_name: string;
      file_type: string;
      file_size: number;
      extracted_text?: string;
      is_image?: boolean;
    }>
  > {
    const results = [];
    for (const pf of pendingFiles) {
      if (pf.uploaded) {
        results.push(pf.uploaded);
        continue;
      }
      const formData = new FormData();
      formData.append("file", pf.file);
      formData.append("conversation_id", activeConvId || "temp");
      try {
        const res = await fetch("/api/chat/upload", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          results.push(data);
        } else {
          const errData = await res.json().catch(() => ({}));
          console.error("[Chat] Upload failed:", res.status, errData);
        }
      } catch (e) {
        console.error("[Chat] Upload error:", e);
      }
    }
    return results;
  }

  // Active conversation object
  const activeConv = conversations.find((c) => c.id === activeConvId);

  return (
    <>
      {/* Inject typing animation keyframes */}
      <style dangerouslySetInnerHTML={{ __html: typingKeyframes }} />

      <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-[#0C0C0E]">
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
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#52525B]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                className="w-full rounded-md bg-[#18181B] border border-[#27272A] py-1.5 pl-7 pr-2.5 text-[11px] text-[#D4D4D8] placeholder-[#52525B] outline-none focus:border-[#3F3F46]"
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto p-1.5">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[#71717A]" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-3 py-8 text-center text-[11px] text-[#71717A]">
                {t("noConversations")}
              </p>
            ) : (
              groupConversations().map((group) => (
                <div key={group.label}>
                  <p className="px-2 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-[#71717A]">
                    {group.label}
                  </p>
                  {group.items.map((conv) => {
                    const icon = getConversationIcon(conv.title);
                    const isActive = activeConvId === conv.id;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => selectConversation(conv)}
                        className={cn(
                          "group flex w-full items-center gap-2 rounded-[7px] px-2.5 py-2 text-left transition-all mb-px",
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
                          <div className="text-[9px] text-[#71717A]">
                            {formatConvDate(conv.updated_at)}
                          </div>
                        </div>
                        <button
                          onClick={(e) => deleteConversation(conv.id, e)}
                          className="hidden shrink-0 rounded p-0.5 text-[#71717A] hover:text-red-400 group-hover:block"
                          title={t("deleteConversation")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </button>
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
              <p className="font-display text-base font-bold text-[#F97316]">Déposez vos fichiers ici</p>
            </div>
          )}

          {/* ── Chat Header ── */}
          <div className="flex items-center justify-between border-b border-[#27272A] px-5 py-3">
            <div className="flex items-center gap-2">
              {/* Mobile new conversation button */}
              <button
                onClick={startNewConversation}
                className="rounded-md border border-[#27272A] p-1.5 text-[#71717A] hover:bg-[#27272A] md:hidden"
              >
                <Plus className="h-4 w-4" />
              </button>
              <h1 className="font-display text-sm font-bold text-[#FAFAFA]">
                {activeConv?.title || t("title")}
              </h1>
              {activeConv?.project_id && (
                <span className="text-[11px] px-2 py-0.5 rounded-[5px] bg-[#3B82F6]/[0.07] text-[#60A5FA]">
                  Projet
                </span>
              )}
            </div>
            {activeConvId && (
              <div className="flex gap-1.5">
                <button className="text-[10px] px-2.5 py-1.5 rounded-md border border-[#3F3F46] bg-[#18181B] text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#D4D4D8] transition-colors">
                  <ClipboardList className="h-3 w-3 inline mr-1" />
                  {t("summarize") || "Résumer"}
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
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {messages.length === 0 && !loadingMessages ? (
              /* ── Empty State ── */
              <div className="flex h-full flex-col items-center justify-center -mt-4">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F97316] to-[#EF4444]">
                  <span className="text-2xl font-display font-bold text-white">C</span>
                </div>
                <h2 className="font-display text-lg font-bold text-[#FAFAFA]">
                  {t("emptyTitle")}
                </h2>
                <p className="mt-1.5 max-w-md text-center text-[13px] text-[#71717A] leading-relaxed">
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
                <Loader2 className="h-6 w-6 animate-spin text-[#71717A]" />
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
                        >
                          JR
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
                          {isUser ? "Vous" : "Cantaia IA"}
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
                                <span className="text-[11px] text-[#52525B]">
                                  {uploading ? "Upload en cours..." : "Cantaia IA analyse..."}
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
                                  <div className="text-[9px] text-[#52525B]">{formatFileSize(att.file_size)}</div>
                                </div>
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#10B981]/10 text-[#34D399] font-semibold">
                                  {att.is_image ? "Vision IA" : "Analysé"}
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
                      className="text-[#52525B] hover:text-[#F87171] ml-0.5 text-xs"
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
                accept={[...ALLOWED_TYPES, ".msg", ".eml"].join(",")}
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
                className="flex-1 resize-none rounded-xl border border-[#3F3F46] bg-[#18181B] px-3.5 py-2 text-[13px] text-[#D4D4D8] placeholder-[#52525B] outline-none focus:border-[#F97316] disabled:opacity-50"
                style={{ maxHeight: 120, lineHeight: "1.5", fontFamily: "inherit" }}
              />

              {/* Send button */}
              <button
                onClick={() => sendMessage()}
                disabled={(!input.trim() && pendingFiles.length === 0) || isStreaming || uploading}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all",
                  (!input.trim() && pendingFiles.length === 0) || isStreaming || uploading
                    ? "bg-[#27272A] text-[#52525B] cursor-default"
                    : "text-white cursor-pointer hover:opacity-90"
                )}
                style={
                  (!input.trim() && pendingFiles.length === 0) || isStreaming || uploading
                    ? undefined
                    : { background: "linear-gradient(135deg, #F97316, #EA580C)" }
                }
              >
                {isStreaming || uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Hint */}
            <p className="text-[10px] text-[#3F3F46] text-center mt-1.5">
              Glissez-déposez des fichiers ici &middot; PDF, images, Excel &middot; Max 3 fichiers, 10 Mo
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
