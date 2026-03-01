"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useEmailContext } from "@/lib/contexts/email-context";
import { cn } from "@cantaia/ui";
import {
  Mail,
  Inbox,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  RefreshCw,
  Loader2,
  Filter,
  ChevronDown,
  ChevronRight,
  Paperclip,
  Sparkles,
  MailX,
  ArrowUpDown,
  Link2,
  Settings,
} from "lucide-react";
import type { EmailRecord, Project } from "@cantaia/database";
import { EmailDetailPanel } from "@/components/app/EmailDetailPanel";
import { useEmailKeyboardShortcuts } from "@/hooks/useEmailKeyboardShortcuts";
import { useRouter } from "next/navigation";

type TabKey = "inbox" | "processed" | "snoozed";

const TAB_CONFIG: Record<TabKey, { icon: React.ElementType; color: string }> = {
  inbox: { icon: Inbox, color: "text-brand" },
  processed: { icon: CheckCircle2, color: "text-green-600" },
  snoozed: { icon: Clock, color: "text-amber-600" },
};

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "maintenant";
  if (diffMin < 60) return `${diffMin}min`;
  if (diffHrs < 24) return `${diffHrs}h`;
  if (diffDays < 7) return `${diffDays}j`;
  return date.toLocaleDateString("fr-CH", { day: "numeric", month: "short" });
}

function getClassificationBadge(email: EmailRecord) {
  if (email.classification === "urgent" || email.importance === "high") {
    return { label: "Urgent", color: "bg-red-100 text-red-700", icon: AlertTriangle };
  }
  if (email.classification === "action_required") {
    return { label: "Action", color: "bg-orange-100 text-orange-700", icon: AlertTriangle };
  }
  if (email.classification === "waiting_response") {
    return { label: "Attente", color: "bg-blue-100 text-blue-700", icon: Clock };
  }
  return null;
}

export default function MailPage() {
  const t = useTranslations("mail");
  const router = useRouter();
  const { emails, loading, syncing, hasRealData, syncEmails, refetch, readIds, markAsRead } = useEmailContext();
  const [activeTab, setActiveTab] = useState<TabKey>("inbox");
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EmailRecord[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Fetch projects
  useEffect(() => {
    fetch("/api/projects/list")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => {});
  }, []);

  // Filter emails by tab
  const tabEmails = useMemo(() => {
    const source = searchResults || emails;
    return source.filter((e) => {
      const triage = e.triage_status || "unprocessed";
      switch (activeTab) {
        case "inbox":
          return triage === "unprocessed" || triage === "pending_classification";
        case "processed":
          return triage === "processed";
        case "snoozed":
          return triage === "snoozed";
        default:
          return true;
      }
    });
  }, [emails, searchResults, activeTab]);

  // Apply project filter
  const filteredEmails = useMemo(() => {
    let result = tabEmails;
    if (filterProjectId) {
      result = result.filter((e) => e.project_id === filterProjectId);
    }
    return result.sort((a, b) => {
      const da = new Date(a.received_at).getTime();
      const db = new Date(b.received_at).getTime();
      return sortOrder === "desc" ? db - da : da - db;
    });
  }, [tabEmails, filterProjectId, sortOrder]);

  // Group emails by project
  const groupedByProject = useMemo(() => {
    const groups = new Map<string, { project: Project | null; emails: EmailRecord[] }>();
    // "Unclassified" group
    const unclassifiedKey = "__unclassified__";
    groups.set(unclassifiedKey, { project: null, emails: [] });

    for (const project of projects) {
      groups.set(project.id, { project, emails: [] });
    }

    for (const email of filteredEmails) {
      const key = email.project_id || unclassifiedKey;
      const group = groups.get(key);
      if (group) {
        group.emails.push(email);
      } else {
        // Project not in list, add to unclassified
        groups.get(unclassifiedKey)!.emails.push(email);
      }
    }

    // Return only groups with emails, sorted by project name
    return Array.from(groups.entries())
      .filter(([, g]) => g.emails.length > 0)
      .sort(([keyA, a], [keyB, b]) => {
        if (keyA === unclassifiedKey) return 1;
        if (keyB === unclassifiedKey) return -1;
        return (a.project?.name || "").localeCompare(b.project?.name || "");
      });
  }, [filteredEmails, projects]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const source = searchResults || emails;
    return {
      inbox: source.filter((e) => !e.triage_status || e.triage_status === "unprocessed" || e.triage_status === "pending_classification").length,
      processed: source.filter((e) => e.triage_status === "processed").length,
      snoozed: source.filter((e) => e.triage_status === "snoozed").length,
    };
  }, [emails, searchResults]);

  const toggleProjectCollapse = useCallback((projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({ q: searchQuery, limit: "100" });
      if (filterProjectId) params.set("project_id", filterProjectId);
      const res = await fetch(`/api/email/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch {
      // fallback: client-side filter
      const q = searchQuery.toLowerCase();
      setSearchResults(
        emails.filter(
          (e) =>
            e.subject?.toLowerCase().includes(q) ||
            (e.from_email || e.sender_email || "").toLowerCase().includes(q) ||
            (e.body_preview || "").toLowerCase().includes(q)
        )
      );
    } finally {
      setSearching(false);
    }
  }, [searchQuery, filterProjectId, emails]);

  const handleSync = useCallback(async () => {
    await syncEmails();
  }, [syncEmails]);

  const handleSelectEmail = useCallback(
    (email: EmailRecord) => {
      setSelectedEmail(email);
      markAsRead(email.id);
    },
    [markAsRead]
  );

  const handleEmailUpdated = useCallback(() => {
    refetch();
    setSelectedEmail(null);
  }, [refetch]);

  // Keyboard shortcuts
  const searchInputRef = { current: null as HTMLInputElement | null };
  useEmailKeyboardShortcuts({
    onNextEmail: () => {
      const idx = filteredEmails.findIndex((e) => e.id === selectedEmail?.id);
      const next = filteredEmails[idx + 1];
      if (next) handleSelectEmail(next);
    },
    onPrevEmail: () => {
      const idx = filteredEmails.findIndex((e) => e.id === selectedEmail?.id);
      const prev = filteredEmails[idx - 1];
      if (prev) handleSelectEmail(prev);
    },
    onReadOk: () => {
      if (selectedEmail) {
        fetch(`/api/email/${selectedEmail.id}/process`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "read_ok" }),
        }).then(() => handleEmailUpdated());
      }
    },
    onArchive: () => {
      if (selectedEmail) {
        fetch(`/api/email/${selectedEmail.id}/archive`, { method: "POST" })
          .then(() => handleEmailUpdated());
      }
    },
    onSearch: () => {
      searchInputRef.current?.focus();
    },
    onEscape: () => {
      if (selectedEmail) setSelectedEmail(null);
    },
  });

  return (
    <div className="flex h-[calc(100vh-120px)] sm:h-[calc(100vh-56px)] lg:h-screen">
      {/* Left: Email list */}
      <div
        className={cn(
          "flex flex-col border-r border-slate-200 bg-white",
          selectedEmail ? "hidden lg:flex lg:w-[420px]" : "w-full"
        )}
      >
        {/* Header */}
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <Mail className="h-5 w-5 text-brand" />
              {t("title")}
            </h1>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                title={t("sort")}
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "rounded-md p-1.5 hover:bg-slate-100",
                  showFilters || filterProjectId ? "text-brand" : "text-slate-400 hover:text-slate-600"
                )}
                title={t("filter")}
              >
                <Filter className="h-4 w-4" />
              </button>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                title={t("sync")}
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value.trim()) setSearchResults(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={t("searchPlaceholder")}
                className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand/20"
              />
              {searching && (
                <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />
              )}
            </div>
          </div>

          {/* Project filter */}
          {showFilters && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilterProjectId(null)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  !filterProjectId
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {t("allProjects")}
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setFilterProjectId(filterProjectId === p.id ? null : p.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    filterProjectId === p.id
                      ? "bg-brand text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-0.5">
            {(["inbox", "processed", "snoozed"] as TabKey[]).map((tab) => {
              const Icon = TAB_CONFIG[tab].icon;
              const count = tabCounts[tab];
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
                    activeTab === tab
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t(`tab_${tab}`)}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        activeTab === tab
                          ? "bg-brand/10 text-brand"
                          : "bg-slate-200 text-slate-500"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              {searchResults ? (
                <>
                  <MailX className="h-10 w-10 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-500">
                    {t("noSearchResults")}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {t("tryDifferentSearch")}
                  </p>
                </>
              ) : !hasRealData ? (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10">
                    <Link2 className="h-8 w-8 text-brand" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-700">
                    {t("connectTitle")}
                  </p>
                  <p className="mt-1 max-w-xs text-xs text-slate-400">
                    {t("connectDesc")}
                  </p>
                  <button
                    onClick={() => router.push("/settings?tab=outlook")}
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-500"
                  >
                    <Settings className="h-4 w-4" />
                    {t("connectButton")}
                  </button>
                </>
              ) : (
                <>
                  <MailX className="h-10 w-10 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-500">
                    {t("noEmails")}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {t("noEmailsDesc")}
                  </p>
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
                  >
                    {syncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {syncing ? t("syncing") : t("sync")}
                  </button>
                </>
              )}
            </div>
          ) : activeTab === "inbox" && !filterProjectId ? (
            // Group by project for inbox
            <div className="divide-y divide-slate-100">
              {groupedByProject.map(([groupKey, group]) => {
                const isCollapsed = collapsedProjects.has(groupKey);
                const projectName = group.project?.name || t("unclassified");
                const projectColor = group.project?.color || "#94a3b8";

                return (
                  <div key={groupKey}>
                    {/* Project header */}
                    <button
                      onClick={() => toggleProjectCollapse(groupKey)}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-slate-50"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: projectColor }}
                      />
                      <span className="text-xs font-semibold text-slate-700">
                        {projectName}
                      </span>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        {group.emails.length}
                      </span>
                    </button>

                    {/* Email items */}
                    {!isCollapsed && (
                      <div>
                        {group.emails.map((email) => (
                          <EmailListItem
                            key={email.id}
                            email={email}
                            isSelected={selectedEmail?.id === email.id}
                            isRead={readIds.has(email.id)}
                            onClick={() => handleSelectEmail(email)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            // Flat list for processed/snoozed/filtered
            <div>
              {filteredEmails.map((email) => (
                <EmailListItem
                  key={email.id}
                  email={email}
                  isSelected={selectedEmail?.id === email.id}
                  isRead={readIds.has(email.id)}
                  onClick={() => handleSelectEmail(email)}
                  showProject
                  projects={projects}
                />
              ))}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="border-t border-slate-200 px-4 py-2">
          <p className="text-[11px] text-slate-400">
            {filteredEmails.length} {t("emailCount")}
            {searchResults && (
              <button
                onClick={() => {
                  setSearchResults(null);
                  setSearchQuery("");
                }}
                className="ml-2 text-brand hover:underline"
              >
                {t("clearSearch")}
              </button>
            )}
          </p>
        </div>
      </div>

      {/* Right: Detail panel */}
      {selectedEmail ? (
        <div className="flex-1 bg-white">
          <EmailDetailPanel
            email={selectedEmail}
            projects={projects}
            onClose={() => setSelectedEmail(null)}
            onEmailUpdated={handleEmailUpdated}
          />
        </div>
      ) : (
        <div className="hidden flex-1 items-center justify-center bg-slate-50 lg:flex">
          <div className="text-center">
            <Mail className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">
              {t("selectEmail")}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {t("selectEmailDesc")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EmailListItem ────────────────────────────────────────────────────

interface EmailListItemProps {
  email: EmailRecord;
  isSelected: boolean;
  isRead: boolean;
  onClick: () => void;
  showProject?: boolean;
  projects?: Project[];
}

function EmailListItem({
  email,
  isSelected,
  isRead,
  onClick,
  showProject,
  projects,
}: EmailListItemProps) {
  const senderName = email.from_name || email.sender_name || email.from_email || email.sender_email || "";
  const badge = getClassificationBadge(email);
  const project = showProject && email.project_id && projects
    ? projects.find((p) => p.id === email.project_id)
    : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full gap-3 px-4 py-3 text-left transition-colors border-b border-slate-100",
        isSelected
          ? "bg-brand/5 border-l-2 border-l-brand"
          : "hover:bg-slate-50",
        !isRead && "bg-blue-50/30"
      )}
    >
      {/* Unread indicator */}
      <div className="mt-1.5 shrink-0">
        {!isRead ? (
          <div className="h-2 w-2 rounded-full bg-brand" />
        ) : (
          <div className="h-2 w-2" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* Row 1: Sender + time */}
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-sm",
              !isRead ? "font-semibold text-slate-900" : "font-medium text-slate-700"
            )}
          >
            {senderName}
          </p>
          <span className="shrink-0 text-[11px] text-slate-400">
            {formatRelativeDate(email.received_at)}
          </span>
        </div>

        {/* Row 2: Subject */}
        <p
          className={cn(
            "truncate text-sm",
            !isRead ? "font-medium text-slate-800" : "text-slate-600"
          )}
        >
          {email.subject}
        </p>

        {/* Row 3: Preview + badges */}
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-xs text-slate-400">
            {email.body_preview || ""}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {email.has_attachments && (
              <Paperclip className="h-3 w-3 text-slate-400" />
            )}
            {badge && (
              <span
                className={cn(
                  "rounded px-1 py-0.5 text-[10px] font-medium",
                  badge.color
                )}
              >
                {badge.label}
              </span>
            )}
            {email.ai_summary && (
              <Sparkles className="h-3 w-3 text-amber-400" />
            )}
            {project && (
              <span
                className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `${project.color}15`,
                  color: project.color,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                {project.code || project.name?.substring(0, 8)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
