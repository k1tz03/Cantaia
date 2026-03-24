"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { X, Loader2 } from "lucide-react";

interface Attachment {
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
}

interface TicketReplyInputProps {
  ticketId: string;
  onSend: (content: string, attachments: Attachment[]) => Promise<void>;
  disabled?: boolean;
}

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 3;

export function TicketReplyInput({ ticketId, onSend, disabled }: TicketReplyInputProps) {
  const t = useTranslations("support");
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter(
      (f) => ALLOWED_TYPES.includes(f.type) && f.size <= MAX_FILE_SIZE
    );
    setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES));
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    if (!content.trim() && files.length === 0) return;
    setSending(true);
    try {
      const attachments: Attachment[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/support/tickets/${ticketId}/attachments`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          attachments.push(data);
        }
      }
      await onSend(content.trim(), attachments);
      setContent("");
      setFiles([]);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div>
      {/* File chips above the bar */}
      {files.length > 0 && (
        <div style={{ padding: "8px 24px 0", display: "flex", flexWrap: "wrap", gap: 6, background: "#18181B", borderTop: "1px solid #27272A" }}>
          {files.map((f, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#27272A",
                borderRadius: 5,
                padding: "4px 8px",
                fontSize: 10,
                color: "#D4D4D8",
              }}
            >
              <span style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              <button type="button" onClick={() => removeFile(i)} style={{ color: "#71717A", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Reply bar */}
      <div
        style={{
          padding: "12px 24px",
          borderTop: files.length > 0 ? "none" : "1px solid #27272A",
          background: "#18181B",
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        {/* Paperclip button */}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(",")}
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || sending || files.length >= MAX_FILES}
          style={{
            width: 34,
            height: 34,
            borderRadius: 7,
            background: "#27272A",
            border: "1px solid #3F3F46",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            cursor: disabled ? "default" : "pointer",
            flexShrink: 0,
            opacity: disabled ? 0.5 : 1,
            color: "#D4D4D8",
          }}
          title={t("attachments")}
        >
          {"\uD83D\uDCCE"}
        </button>

        {/* Textarea */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("writeReply")}
          disabled={disabled || sending}
          rows={1}
          style={{
            flex: 1,
            background: "#27272A",
            border: "1px solid #3F3F46",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            color: "#D4D4D8",
            resize: "none",
            outline: "none",
            minHeight: 38,
            fontFamily: "'Inter', sans-serif",
            opacity: disabled ? 0.5 : 1,
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#F97316"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#3F3F46"; }}
        />

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || sending || (!content.trim() && files.length === 0)}
          style={{
            width: 34,
            height: 34,
            borderRadius: 7,
            background: "linear-gradient(135deg, #F97316, #EA580C)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            cursor: disabled || sending ? "default" : "pointer",
            flexShrink: 0,
            border: "none",
            color: "white",
            opacity: (disabled || sending || (!content.trim() && files.length === 0)) ? 0.5 : 1,
          }}
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : "\u27A4"}
        </button>
      </div>
    </div>
  );
}
