"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { FileText, Image as ImageIcon } from "lucide-react";

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
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `il y a ${diffMin}min`;
  if (diffHrs < 24) return `il y a ${diffHrs}h`;
  if (diffDays < 7) return `il y a ${diffDays}j`;
  return date.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isImage(type: string) {
  return type.startsWith("image/");
}

export function TicketThread({ messages, currentUserId: _currentUserId }: { messages: Message[]; currentUserId: string }) {
  const t = useTranslations("support");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-[#71717A] text-sm py-12">Aucun message</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-4 p-4">
      {messages.map((msg) => {
        const isUser = msg.sender_role === "user";
        return (
          <div key={msg.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[75%] rounded-lg px-4 py-3 ${isUser ? "bg-[#F97316]/10" : "bg-[#27272A]"}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-[#FAFAFA]">
                  {isUser ? "Vous" : t("teamCantaia")}
                </span>
                <span className="text-xs text-[#71717A]">{formatRelative(msg.created_at)}</span>
              </div>
              <p className="text-sm text-[#FAFAFA] whitespace-pre-wrap">{msg.content}</p>
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {msg.attachments.map((att, i) => (
                    <a
                      key={i}
                      href={att.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-md bg-[#0F0F11]/50 px-2 py-1.5 text-xs text-[#F97316] hover:underline"
                    >
                      {isImage(att.file_type) ? (
                        <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                      )}
                      {att.file_name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
