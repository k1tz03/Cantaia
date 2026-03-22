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
} from "lucide-react";
import { cn } from "@cantaia/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/** JM Avatar — Professional monogram badge */
function JMAvatar({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-[#2563EB]",
        size === "lg" ? "h-16 w-16" : "h-8 w-8"
      )}
    >
      <span
        className={cn(
          "font-display font-bold text-white",
          size === "lg" ? "text-2xl" : "text-xs"
        )}
      >
        JM
      </span>
    </div>
  );
}

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
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
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

    for (const conv of conversations) {
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
    return shuffled.slice(0, 3);
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
        }
      } catch (e) {
        console.error("[Chat] Upload error:", e);
      }
    }
    return results;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen">
      {/* Left panel — Conversation list */}
      <div className="hidden md:flex md:w-[240px] lg:w-[260px] flex-col border-r border-border bg-muted shrink-0">
        <div className="p-3 border-b border-border">
          <button
            onClick={startNewConversation}
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            {t("newConversation")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              {t("noConversations")}
            </p>
          ) : (
            groupConversations().map((group) => (
              <div key={group.label}>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                {group.items.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => selectConversation(conv)}
                    className={cn(
                      "group flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-background",
                      activeConvId === conv.id &&
                        "bg-background shadow-sm border-r-2 border-primary"
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-foreground">
                      {conv.title}
                    </span>
                    <button
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-red-500 group-hover:block"
                      title={t("deleteConversation")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel — Chat area */}
      <div
        className={cn("relative flex flex-1 flex-col", dragOver && "ring-2 ring-primary ring-inset")}
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
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-lg">
            <p className="text-sm font-medium text-primary">Déposez vos fichiers ici</p>
          </div>
        )}

        {/* Mobile header with new conversation button */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 md:hidden">
          <button
            onClick={startNewConversation}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
          </button>
          <h1 className="flex-1 text-sm font-semibold text-foreground truncate">
            {t("title")}
          </h1>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 && !loadingMessages ? (
            // Empty state
            <div className="flex h-full flex-col items-center justify-center -mt-8">
              <div className="mb-4">
                <JMAvatar size="lg" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {t("emptyTitle")}
              </h2>
              <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
                {t("emptyDesc")}
              </p>
              <div className="mt-6 flex flex-col gap-2 w-full max-w-md">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="rounded-lg border border-border bg-background px-4 py-3 text-left text-sm text-muted-foreground shadow-sm transition-all hover:border-primary/20 hover:shadow-md"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : loadingMessages ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            // Message list
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <JMAvatar size="sm" />
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                      msg.role === "user"
                        ? "bg-[#2563EB] text-white rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm prose-gray max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        {msg.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        ) : isStreaming && i === messages.length - 1 ? (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {t("sending")}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-border bg-background px-4 py-3">
          <div className="mx-auto max-w-3xl">
            {/* File preview chips */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-1 pb-2">
                {pendingFiles.map((pf, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-foreground"
                  >
                    {pf.file.type.startsWith("image/") ? (
                      <ImageIcon className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                    <span className="max-w-[120px] truncate">{pf.file.name}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(i)}
                      className="text-muted-foreground hover:text-foreground ml-0.5"
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
                className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                title="Joindre un fichier"
              >
                <Paperclip className="h-5 w-5" />
              </button>

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
                className="flex-1 resize-none rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                style={{ maxHeight: 160 }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={(!input.trim() && pendingFiles.length === 0) || isStreaming || uploading}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isStreaming || uploading ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <Send className="h-4.5 w-4.5" />
                )}
              </button>
            </div>
          </div>
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
  );
}
