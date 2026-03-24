"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@cantaia/ui";
import {
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Loader2,
  Mail,
} from "lucide-react";
import type { EmailRecord } from "@cantaia/database";

function stripSignature(text: string): string {
  if (!text) return "";
  const patterns = [
    /[Mm]eilleures salutations[\s\S]*/,
    /[Cc]ordialement[\s\S]*/,
    /[Bb]est regards[\s\S]*/,
    /[Mm]it freundlichen[\s\S]*/,
    /[Rr]estant à votre disposition[\s\S]*/,
    /\n--\n[\s\S]*/,
    /^(\+41|\+33).*/m,
  ];
  let cleaned = text;
  for (const p of patterns) {
    const idx = cleaned.search(p);
    if (idx > 0) cleaned = cleaned.substring(0, idx);
  }
  return cleaned.replace(/\s+/g, " ").trim().substring(0, 100);
}

interface EmailThreadViewProps {
  email: EmailRecord;
  onSelectEmail: (email: EmailRecord) => void;
}

export function EmailThreadView({ email, onSelectEmail }: EmailThreadViewProps) {
  const t = useTranslations("mail");
  const [threadEmails, setThreadEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const threadId = email.provider_thread_id;

  useEffect(() => {
    if (!threadId) return;
    setLoading(true);
    // Fetch thread emails via search
    fetch(`/api/email/search?thread_id=${encodeURIComponent(threadId)}&limit=20`)
      .then((r) => r.json())
      .then((d) => {
        const results = (d.results || []) as EmailRecord[];
        // Sort by date ascending for thread view
        setThreadEmails(results.sort((a, b) =>
          new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
        ));
      })
      .catch(() => setThreadEmails([]))
      .finally(() => setLoading(false));
  }, [threadId]);

  if (!threadId || threadEmails.length <= 1) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-[#71717A]">
        <Mail className="h-3 w-3" />
        {t("noThread")}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#27272A] bg-[#0F0F11]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#27272A]"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-[#71717A]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-[#71717A]" />
        )}
        <MessageSquare className="h-3.5 w-3.5 text-brand" />
        <span className="text-xs font-medium text-[#FAFAFA]">
          {t("threadView")}
        </span>
        <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
          {threadEmails.length} {t("threadEmails")}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[#27272A]">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-[#71717A]" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {threadEmails.map((te) => {
                const isActive = te.id === email.id;
                const senderName = te.from_name || te.sender_name || te.from_email || te.sender_email || "";
                return (
                  <button
                    key={te.id}
                    onClick={() => onSelectEmail(te)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                      isActive ? "bg-brand/5" : "hover:bg-[#27272A]"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "truncate text-xs",
                            isActive ? "font-semibold text-brand" : "font-medium text-[#FAFAFA]"
                          )}
                        >
                          {senderName}
                        </span>
                        <span className="shrink-0 text-[10px] text-[#71717A]">
                          {new Date(te.received_at).toLocaleDateString("fr-CH", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-[#71717A]">
                        {stripSignature(te.body_preview || "") || te.subject}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
