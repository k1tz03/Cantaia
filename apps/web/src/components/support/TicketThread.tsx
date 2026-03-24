"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

interface Attachment {
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
}

interface Message {
  id: string;
  sender_id: string;
  sender_role: "user" | "admin";
  content: string;
  attachments: Attachment[];
  created_at: string;
  sender_name?: string;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const hours = d.getHours().toString().padStart(2, "0");
  const mins = d.getMinutes().toString().padStart(2, "0");
  return `${day}.${month} \u00B7 ${hours}:${mins}`;
}

function getInitials(name: string | undefined): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TicketThread({
  messages,
  currentUserId: _currentUserId,
  userName,
}: {
  messages: Message[];
  currentUserId: string;
  userName?: string;
}) {
  const t = useTranslations("support");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{ padding: "60px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🎫</div>
        <div style={{ fontSize: 14, color: "#71717A" }}>Aucun message</div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto flex flex-col"
      style={{ padding: "16px 24px", gap: 12 }}
    >
      {messages.map((msg) => {
        const isUser = msg.sender_role === "user";
        const initials = isUser ? getInitials(userName || msg.sender_name) : "CA";
        const displayName = isUser ? (userName || msg.sender_name || "Vous") : t("teamCantaia");

        return (
          <div
            key={msg.id}
            className="flex"
            style={{
              gap: 10,
              maxWidth: "80%",
              alignSelf: isUser ? "flex-start" : "flex-end",
              flexDirection: isUser ? "row" : "row-reverse",
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                color: "white",
                fontWeight: 600,
                flexShrink: 0,
                background: isUser
                  ? "linear-gradient(135deg, #F97316, #EF4444)"
                  : "#3B82F6",
              }}
            >
              {initials}
            </div>

            {/* Bubble */}
            <div
              style={{
                borderRadius: 10,
                padding: "10px 14px",
                background: isUser ? "#18181B" : "rgba(249, 115, 22, 0.07)",
                border: isUser ? "1px solid #27272A" : "1px solid rgba(249, 115, 22, 0.15)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  marginBottom: 3,
                  color: isUser ? "#D4D4D8" : "#FB923C",
                }}
              >
                {displayName}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#D4D4D8",
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {msg.content}
              </div>

              {/* Attachments */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {msg.attachments.map((att, i) => (
                    <a
                      key={i}
                      href={att.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: "#27272A",
                        borderRadius: 5,
                        padding: "5px 8px",
                        fontSize: 10,
                        color: "#D4D4D8",
                        textDecoration: "none",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#3F3F46"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#27272A"; }}
                    >
                      {att.file_type?.startsWith("image/") ? "\uD83D\uDCF8" : "\uD83D\uDCC4"} {att.file_name} {att.file_size ? `\u00B7 ${formatFileSize(att.file_size)}` : ""}
                    </a>
                  ))}
                </div>
              )}

              <div style={{ fontSize: 9, color: "#52525B", marginTop: 4 }}>
                {formatShortDate(msg.created_at)}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
