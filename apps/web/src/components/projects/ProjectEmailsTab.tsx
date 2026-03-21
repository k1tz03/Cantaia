"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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

  const fetchEmails = useCallback(() => {
    fetch(`/api/projects/${projectId}/emails`)
      .then((res) => res.ok ? res.json() : { emails: [] })
      .then((data) => {
        setEmails(data.emails || []);
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

  const filteredEmails = useMemo(() => {
    if (!search.trim()) return emails;
    const q = search.toLowerCase();
    return emails.filter((e) =>
      (e.subject || "").toLowerCase().includes(q) ||
      (e.sender_email || "").toLowerCase().includes(q) ||
      (e.sender_name || "").toLowerCase().includes(q) ||
      (e.body_preview || "").toLowerCase().includes(q) ||
      (e.ai_summary || "").toLowerCase().includes(q)
    );
  }, [emails, search]);

  const handleEmailUpdated = useCallback(() => {
    fetchEmails();
    if (selectedEmail) {
      const stillHere = emails.find((e) => e.id === selectedEmail.id);
      if (!stillHere) setSelectedEmail(null);
    }
  }, [fetchEmails, selectedEmail, emails]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-brand" />
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border bg-background">
        <div className="text-center">
          <Mail className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">{t("noEmailsYet")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-0 -mx-4 sm:-mx-6" style={{ height: "calc(100vh - 260px)" }}>
      <div className={cn(
        "flex flex-col border-r border-border overflow-hidden",
        selectedEmail ? "w-[380px] shrink-0" : "flex-1"
      )}>
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("searchEmails")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {filteredEmails.length} email{filteredEmails.length !== 1 ? "s" : ""} classé{filteredEmails.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredEmails.map((email) => (
            <button
              key={email.id}
              onClick={() => setSelectedEmail(email)}
              className={cn(
                "w-full text-left px-3 py-2.5 border-b border-border transition-colors hover:bg-muted",
                selectedEmail?.id === email.id && "bg-primary/10 border-l-2 border-l-brand"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground truncate">
                  {email.sender_name || email.sender_email}
                </span>
                <span className="flex-shrink-0 text-[10px] text-muted-foreground ml-auto">
                  {new Date(email.received_at).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-sm text-foreground truncate flex-1">{email.subject}</p>
                {email.has_attachments && (
                  <Paperclip className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                )}
                {email.classification && (
                  <span className={cn(
                    "flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                    email.classification === "urgent" ? "bg-red-500/10 text-red-700 dark:text-red-400" :
                    email.classification === "action_required" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {email.classification === "urgent" ? "Urgent" :
                     email.classification === "action_required" ? "Action" : "Info"}
                  </span>
                )}
              </div>
              {email.ai_summary ? (
                <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">{email.ai_summary}</p>
              ) : email.body_preview ? (
                <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">{email.body_preview}</p>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {selectedEmail ? (
        <div className="flex-1 overflow-y-auto bg-background">
          <EmailDetailPanel
            email={selectedEmail}
            projects={allProjects as Project[]}
            onClose={() => setSelectedEmail(null)}
            onEmailUpdated={handleEmailUpdated}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-muted/50">
          <div className="text-center">
            <Mail className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">{t("selectEmailToRead")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
