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
} from "lucide-react";
import { cn } from "@cantaia/ui";

/** JM Avatar — Professional monogram badge */
function JMAvatar({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <div className={cn("flex shrink-0 items-center justify-center", size === "lg" ? "h-16 w-16" : "h-8 w-8")}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="h-full w-full">
        <circle cx="50" cy="50" r="48" fill="none" stroke="#0A1F30" strokeWidth="3" />
        <g strokeWidth="0.5" fill="none" stroke="#8A9CA8" strokeOpacity="0.3">
          <ellipse cx="50" cy="50" rx="40" ry="12" transform="rotate(30 50 50)"/>
          <ellipse cx="50" cy="50" rx="40" ry="12" transform="rotate(150 50 50)"/>
          <ellipse cx="50" cy="50" rx="40" ry="12" transform="rotate(90 50 50)"/>
        </g>
        <text x="50" y="58" fontFamily="'Playfair Display', serif" fontSize="28" fill="#C4A661" textAnchor="middle" letterSpacing="-1">JM</text>
        <g stroke="#C4A661" strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M35 70 A 20 20 0 0 1 65 70"/>
          <circle cx="50" cy="70" r="2" fill="#C4A661"/>
        </g>
      </svg>
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

  async function deleteConversation(convId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(t("deleteConfirm"))) return;

    try {
      await fetch(`/api/chat/conversations/${convId}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) {
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
      abortRef.current = new AbortController();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: activeConvId || undefined,
          message: msg,
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen">
      {/* Left panel — Conversation list */}
      <div className="hidden md:flex md:w-[240px] lg:w-[260px] flex-col border-r border-slate-200 bg-slate-50 shrink-0">
        <div className="p-3 border-b border-slate-200">
          <button
            onClick={startNewConversation}
            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            {t("newConversation")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-400">
              {t("noConversations")}
            </p>
          ) : (
            groupConversations().map((group) => (
              <div key={group.label}>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.label}
                </p>
                {group.items.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => selectConversation(conv)}
                    className={cn(
                      "group flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-white",
                      activeConvId === conv.id &&
                        "bg-white shadow-sm border-r-2 border-brand"
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="flex-1 truncate text-slate-700">
                      {conv.title}
                    </span>
                    <button
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="hidden shrink-0 rounded p-0.5 text-slate-300 hover:text-red-500 group-hover:block"
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
      <div className="flex flex-1 flex-col">
        {/* Mobile header with new conversation button */}
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 md:hidden">
          <button
            onClick={startNewConversation}
            className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
          </button>
          <h1 className="flex-1 text-sm font-semibold text-slate-800 truncate">
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
              <h2 className="text-lg font-semibold text-slate-800">
                {t("emptyTitle")}
              </h2>
              <p className="mt-2 max-w-md text-center text-sm text-slate-500">
                {t("emptyDesc")}
              </p>
              <div className="mt-6 flex flex-col gap-2 w-full max-w-md">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-600 shadow-sm transition-all hover:border-cyan-300 hover:shadow-md"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : loadingMessages ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
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
                        ? "bg-gold text-white rounded-br-md"
                        : "bg-slate-100 text-slate-800 rounded-bl-md"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm prose-slate max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        {msg.content ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        ) : isStreaming && i === messages.length - 1 ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-400">
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
        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
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
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:border-cyan-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-cyan-400 disabled:opacity-50"
              style={{ maxHeight: 160 }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isStreaming}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold text-white transition-colors hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isStreaming ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin" />
              ) : (
                <Send className="h-4.5 w-4.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
