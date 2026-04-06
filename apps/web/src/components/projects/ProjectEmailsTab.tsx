"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@cantaia/ui";
import { Mail, Loader2, Search, X, Paperclip } from "lucide-react";
import { EmailDetailPanel } from "@/components/app/EmailDetailPanel";
import type { EmailRecord, Project } from "@cantaia/database";

export function ProjectEmailsTab({ projectId }: { projectId: string }) {
  const t = useTranslations("projects");
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [search, setSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchEmails = useCallback((searchQuery?: string) => {
    const params = new URLSearchParams();
    params.set("limit", "200");
    if (searchQuery) params.set("search", searchQuery);
    fetch(`/api/projects/${projectId}/emails?${params}`)
      .then((res) => {
        if (!res.ok) return { emails: [], count: 0 };
        const count = parseInt(res.headers.get("X-Total-Count") || "0");
        return res.json().then((data: any) => ({ ...data, count }));
      })
      .then((data: any) => {
        setEmails(data.emails || []);
        setTotalCount(data.count || data.emails?.length || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    fetchEmails();
    fetch("/api/projects/list")
      .then((res) => res.json())
      .then((data) => setAllProjects(data.projects || []))
      .catch(() => {});
  }, [fetchEmails]);

  // Debounced server-side search
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchEmails(value.trim() || undefined);
    }, 300);
  }, [fetchEmails]);

  const handleEmailUpdated = useCallback(() => {
    fetchEmails(search.trim() || undefined);
    if (selectedEmail) {
      const stillHere = emails.find((e) => e.id === selectedEmail.id);
      if (!stillHere) setSelectedEmail(null);
    }
  }, [fetchEmails, search, selectedEmail, emails]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="flex gap-0 -mx-4 sm:-mx-6" style={{ height: "calc(100vh - 260px)" }}>
      <div className={cn(
        "flex flex-col border-r border-[#27272A] overflow-hidden",
        selectedEmail ? "w-[380px] shrink-0" : "flex-1"
      )}>
        <div className="px-3 py-2 border-b border-[#27272A]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
            <input
              type="text"
              placeholder={t("searchEmails")}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] py-1.5 pl-8 pr-8 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            {search && (
              <button
                onClick={() => handleSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-[#71717A]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-[#71717A]">
            {totalCount} email{totalCount !== 1 ? "s" : ""} classé{totalCount !== 1 ? "s" : ""}
          </p>
        </div>

        {emails.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-4">
              <Mail className="mx-auto h-8 w-8 text-[#71717A]" />
              <p className="mt-2 text-sm text-[#71717A]">
                {search ? "Aucun email ne correspond a la recherche" : t("noEmailsYet")}
              </p>
            </div>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto">
          {emails.map((email) => (
            <button
              key={email.id}
              onClick={() => setSelectedEmail(email)}
              className={cn(
                "w-full text-left px-3 py-2.5 border-b border-[#27272A] transition-colors hover:bg-[#27272A]",
                selectedEmail?.id === email.id && "bg-[#F97316]/10 border-l-2 border-l-brand"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#FAFAFA] truncate">
                  {email.sender_name || email.sender_email}
                </span>
                <span className="flex-shrink-0 text-[10px] text-[#71717A] ml-auto">
                  {new Date(email.received_at).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-sm text-[#FAFAFA] truncate flex-1">{email.subject}</p>
                {email.has_attachments && (
                  <Paperclip className="h-3 w-3 flex-shrink-0 text-[#71717A]" />
                )}
                {email.classification && (
                  <span className={cn(
                    "flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                    email.classification === "urgent" ? "bg-red-500/10 text-red-400" :
                    email.classification === "action_required" ? "bg-amber-500/10 text-amber-400" :
                    "bg-[#27272A] text-[#71717A]"
                  )}>
                    {email.classification === "urgent" ? "Urgent" :
                     email.classification === "action_required" ? "Action" : "Info"}
                  </span>
                )}
              </div>
              {email.ai_summary ? (
                <p className="mt-1 text-[11px] text-[#71717A] line-clamp-1">{email.ai_summary}</p>
              ) : email.body_preview ? (
                <p className="mt-1 text-[11px] text-[#71717A] line-clamp-1">{email.body_preview}</p>
              ) : null}
            </button>
          ))}
        </div>
        )}
      </div>

      {selectedEmail ? (
        <div className="flex-1 overflow-y-auto bg-[#0F0F11]">
          <EmailDetailPanel
            email={selectedEmail}
            projects={allProjects as Project[]}
            onClose={() => setSelectedEmail(null)}
            onEmailUpdated={handleEmailUpdated}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-[#27272A]/50">
          <div className="text-center">
            <Mail className="mx-auto h-10 w-10 text-[#71717A]" />
            <p className="mt-2 text-sm text-[#71717A]">{t("selectEmailToRead")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
