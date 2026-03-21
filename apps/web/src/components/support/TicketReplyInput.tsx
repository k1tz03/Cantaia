"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { SendHorizontal, Paperclip, X, Loader2 } from "lucide-react";

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
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
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
      // Upload files first
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
    <div className="border-t border-border p-4">
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-foreground">
              <span className="max-w-[150px] truncate">{f.name}</span>
              <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("writeReply")}
            disabled={disabled || sending}
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
        </div>
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
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          title={t("attachments")}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || sending || (!content.trim() && files.length === 0)}
          className="rounded-lg bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
