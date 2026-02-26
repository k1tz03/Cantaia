"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@cantaia/ui";
import {
  Mail,
  Paperclip,
  CheckSquare,
  Calendar,
  Filter,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Building2,
  Archive,
  Tag,
  BookOpen,
  CheckCircle,
  Check,
  Sparkles,
  RefreshCw,
  Loader2,
  X,
} from "lucide-react";
import { EmailDetailPanel } from "@/components/app/EmailDetailPanel";
import type { TaskPrefill } from "@/components/app/EmailDetailPanel";
import { TaskCreateModal } from "@/components/tasks/TaskCreateModal";
import { BriefingPanel } from "@/components/briefing/BriefingPanel";
import {
  formatDate,
  getRelativeTime,
  pluralize,
} from "@/lib/mock-data";
import type { EmailRecord } from "@cantaia/database";
import { useAuth } from "@/components/providers/AuthProvider";
import { useEmailContext } from "@/lib/contexts/email-context";
import { useProjects, useUserProfile } from "@/lib/hooks/use-supabase-data";
import { ClassificationSuggestions } from "@/components/emails/ClassificationSuggestions";

type EmailFilter = "all" | "action_required" | "urgent" | "waiting_response" | "info_only" | "unclassified";

// Classification left-border colors are applied inline in the email row

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const { user } = useAuth();
  const userProfile = useUserProfile(user?.id);
  const { emails, syncing, syncEmails, readIds, markAsRead, reclassifyAll, refetch } = useEmailContext();
  const { projects: dbProjects } = useProjects(userProfile?.profile?.organization_id ?? undefined);
  const allProjects = dbProjects;

  const [filter, setFilter] = useState<EmailFilter>("all");
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkReclassDropdown, setShowBulkReclassDropdown] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [panelWidthPercent, setPanelWidthPercent] = useState(45);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | undefined>(undefined);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Persist side panel state in localStorage
  useEffect(() => {
    const saved = localStorage.getItem("cantaia_side_panel_open");
    if (saved !== null) {
      setSidePanelOpen(saved === "true");
    }
    const savedWidth = localStorage.getItem("cantaia_panel_width");
    if (savedWidth !== null) {
      const w = parseFloat(savedWidth);
      if (w >= 25 && w <= 70) setPanelWidthPercent(w);
    }
  }, []);

  function toggleSidePanel() {
    const next = !sidePanelOpen;
    setSidePanelOpen(next);
    localStorage.setItem("cantaia_side_panel_open", String(next));
  }

  // Bug 7 — Resizable panel drag handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const totalWidth = rect.width;
      const panelPx = totalWidth - x;
      const minPx = 350;
      const maxPx = totalWidth * 0.7;
      const clampedPx = Math.max(minPx, Math.min(maxPx, panelPx));
      const percent = (clampedPx / totalWidth) * 100;
      setPanelWidthPercent(percent);
    }

    function handleMouseUp() {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // Save to localStorage
        setPanelWidthPercent((w) => {
          localStorage.setItem("cantaia_panel_width", String(w));
          return w;
        });
      }
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Refresh emails after an email update (reclassify, mark processed, etc.)
  const handleEmailUpdated = useCallback(() => {
    refetch();
  }, []);

  function handleCreateTaskFromEmail(prefill: TaskPrefill) {
    setTaskPrefill(prefill);
    setTaskModalOpen(true);
  }

  const stats = useMemo(() => {
    const totalEmails = emails.length;
    const actionRequired = emails.filter((e) => e.classification === "action_required").length;
    const urgentEmails = emails.filter((e) => e.classification === "urgent").length;
    const pendingClassification = emails.filter(
      (e) => (e as any).classification_status === "suggested" || (e as any).classification_status === "new_project_suggested"
    ).length;
    return { totalEmails, actionRequired, urgentEmails, pendingClassification };
  }, [emails]);

  // Tasks will come from Supabase later — using empty arrays for now
  const overdueTasks: any[] = [];
  const todayTasks: any[] = [];

  const activeProjects = useMemo(
    () => allProjects.filter((p) => p.status === "active" || p.status === "planning"),
    [allProjects]
  );

  async function handleSync() {
    setSyncMessage(null);
    const result = await syncEmails();
    if (result.success) {
      const parts = [
        `${result.emails_synced} emails synchronisés`,
        `${result.emails_classified} classifiés`,
        `${result.tasks_created} tâches créées`,
      ];
      if (result.emails_archived > 0) {
        parts.push(`${result.emails_archived} archivés`);
      }
      if (result.new_projects_suggested > 0) {
        parts.push(`${result.new_projects_suggested} nouveaux projets suggérés`);
      }
      setSyncMessage(parts.join(", "));
    } else {
      setSyncMessage(result.error || "Erreur de synchronisation");
    }
    setTimeout(() => setSyncMessage(null), 8000);
  }

  function handleSelectEmail(email: EmailRecord) {
    setSelectedEmail(email);
    markAsRead(email.id);
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredEmails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEmails.map((e) => e.id)));
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setShowBulkReclassDropdown(false);
  }

  const unclassifiedCount = emails.filter((e) => !e.project_id || !e.classification).length;

  const filteredEmails = emails
    .filter((e) => {
      if (filter === "unclassified") {
        if (e.project_id && e.classification) return false;
      } else if (filter !== "all" && e.classification !== filter) {
        return false;
      }
      if (projectFilter && e.project_id !== projectFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          e.subject.toLowerCase().includes(q) ||
          (e.sender_name || "").toLowerCase().includes(q) ||
          (e.ai_summary || "").toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => b.received_at.localeCompare(a.received_at));

  // Meetings will come from Supabase later — using empty array for now
  const meetings: any[] = [];
  const upcomingMeetings = meetings;

  const filters: { key: EmailFilter; label: string; count: number }[] = [
    { key: "all", label: t("filterAll"), count: emails.length },
    { key: "action_required", label: t("filterAction"), count: stats.actionRequired },
    { key: "urgent", label: t("filterUrgent"), count: stats.urgentEmails },
    { key: "waiting_response", label: t("filterWaiting"), count: emails.filter((e) => e.classification === "waiting_response").length },
    { key: "info_only", label: t("filterInfo"), count: emails.filter((e) => e.classification === "info_only").length },
    ...(unclassifiedCount > 0 ? [{ key: "unclassified" as EmailFilter, label: t("filterUnclassified"), count: unclassifiedCount }] : []),
  ];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:h-screen">
      {/* Summary bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-2.5">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-medium text-gray-800">
            {t("inboxTitle")}
          </span>
          <span className="text-gray-300">·</span>
          <span>
            {pluralize(stats.totalEmails, t("emailSingular"), t("emailPlural"))}
          </span>
          {stats.actionRequired > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span className="font-medium text-amber-600">
                {pluralize(stats.actionRequired, t("actionSingular"), t("actionPlural"))}
              </span>
            </>
          )}
          {stats.urgentEmails > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span className="font-medium text-red-600">
                {pluralize(stats.urgentEmails, t("urgentSingular"), t("urgentPlural"))}
              </span>
            </>
          )}
          {stats.pendingClassification > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span className="font-medium text-blue-600">
                {stats.pendingClassification} à traiter
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {syncMessage && (
            <span className="text-xs text-green-600">{syncMessage}</span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {syncing ? t("syncing") || "Sync..." : t("syncButton") || "Synchroniser"}
          </button>
          <button
            onClick={async () => {
              setSyncMessage(null);
              const result = await reclassifyAll();
              if (result.success) {
                const parts: string[] = [];
                if (result.emails_classified > 0) parts.push(`${result.emails_classified} classifié(s)`);
                if (result.emails_declassified > 0) parts.push(`${result.emails_declassified} déclassé(s)`);
                if (result.new_projects_suggested > 0) parts.push(`${result.new_projects_suggested} suggestion(s)`);
                setSyncMessage(parts.length > 0 ? parts.join(", ") : "Aucun changement");
              } else {
                setSyncMessage(result.error || "Erreur");
              }
              setTimeout(() => setSyncMessage(null), 8000);
            }}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1 text-[11px] text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {t("reclassifyAll")}
          </button>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t("searchEmails")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-44 rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-800 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
            />
          </div>
        </div>
      </div>

      {/* Classification suggestions panel */}
      <ClassificationSuggestions
        emails={emails as any}
        projects={allProjects as any}
        onAction={() => refetch()}
      />

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 px-5 py-2">
        <Filter className="mr-1 h-3.5 w-3.5 text-gray-400" />
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              filter === f.key
                ? "bg-brand text-white"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            )}
          >
            {f.label}
            {f.count > 0 && (
              <span className={cn(
                "ml-1.5",
                filter === f.key ? "text-white/70" : "text-gray-400"
              )}>
                {f.count}
              </span>
            )}
          </button>
        ))}

        {/* Project filter dropdown */}
        <div className="relative ml-2 border-l border-gray-200 pl-2">
          <button
            onClick={() => setShowProjectDropdown(!showProjectDropdown)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              projectFilter
                ? "bg-brand/10 text-brand"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            )}
          >
            <Building2 className="h-3 w-3" />
            {projectFilter
              ? allProjects.find((p) => p.id === projectFilter)?.name || t("filterByProject")
              : t("filterByProject")}
            <ChevronDown className="h-3 w-3" />
          </button>
          {showProjectDropdown && (
            <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              <button
                onClick={() => { setProjectFilter(null); setShowProjectDropdown(false); }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-gray-50",
                  !projectFilter ? "font-semibold text-brand" : "text-gray-600"
                )}
              >
                {t("allProjects")}
              </button>
              {activeProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setProjectFilter(p.id); setShowProjectDropdown(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-gray-50",
                    projectFilter === p.id ? "font-semibold text-brand" : "text-gray-600"
                  )}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
        {/* Email list — expands when panel closed */}
        <div className="flex-1 overflow-y-auto">
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 border-b border-gray-200 bg-brand/5 px-5 py-2">
              <span className="text-xs font-semibold text-brand">
                {selectedIds.size} {t("selected")}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { clearSelection(); }}
                  className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  <Archive className="h-3 w-3" />
                  {t("bulkArchive")}
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowBulkReclassDropdown(!showBulkReclassDropdown)}
                    className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    <Tag className="h-3 w-3" />
                    {t("bulkReclassify")}
                  </button>
                  {showBulkReclassDropdown && (
                    <div className="absolute left-0 top-full z-30 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                      {activeProjects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setShowBulkReclassDropdown(false); clearSelection(); }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    selectedIds.forEach((id) => markAsRead(id));
                    clearSelection();
                  }}
                  className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  <BookOpen className="h-3 w-3" />
                  {t("bulkMarkRead")}
                </button>
                <button
                  onClick={() => { clearSelection(); }}
                  className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  <CheckCircle className="h-3 w-3" />
                  {t("bulkMarkProcessed")}
                </button>
              </div>
              <button
                onClick={clearSelection}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600"
              >
                {t("close")}
              </button>
            </div>
          )}

          {/* Select all header */}
          {filteredEmails.length > 0 && selectedIds.size === 0 && (
            <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-1.5">
              <div
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-sm border transition-colors cursor-pointer",
                  selectedIds.size === filteredEmails.length && filteredEmails.length > 0
                    ? "border-blue-600 bg-blue-600"
                    : "border-gray-300 bg-white hover:border-blue-400"
                )}
                onClick={toggleSelectAll}
              >
                {selectedIds.size === filteredEmails.length && filteredEmails.length > 0 && (
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                )}
              </div>
              <span className="text-[11px] text-gray-400">
                {pluralize(filteredEmails.length, t("emailSingular"), t("emailPlural"))}
              </span>
            </div>
          )}

          {filteredEmails.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {filteredEmails.map((email) => {
                const project = email.project_id ? allProjects.find((p) => p.id === email.project_id) : null;
                const isSelected = selectedEmail?.id === email.id;
                const isUnread = !readIds.has(email.id);
                const isChecked = selectedIds.has(email.id);

                const leftBorderClass = isSelected
                  ? "border-l-[3px] border-l-blue-600"
                  : email.classification === "urgent"
                    ? "border-l-[3px] border-l-red-500"
                    : email.classification === "action_required"
                      ? "border-l-[3px] border-l-amber-500"
                      : email.classification === "waiting_response"
                        ? "border-l-[3px] border-l-blue-400"
                        : "border-l-[3px] border-l-transparent";

                return (
                  <div
                    key={email.id}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-5 py-2.5 text-left cursor-pointer transition-colors duration-150",
                      leftBorderClass,
                      isSelected && "bg-blue-50",
                      isUnread && !isSelected && !isChecked && "bg-blue-50/50",
                      !isUnread && !isSelected && !isChecked && "bg-white",
                      isChecked && !isSelected && "bg-blue-50/30",
                      !isSelected && "hover:bg-gray-50"
                    )}
                    onClick={() => handleSelectEmail(email)}
                  >
                    {/* Checkbox */}
                    <div className="mt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <div
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-sm border transition-colors cursor-pointer",
                          isChecked
                            ? "border-blue-600 bg-blue-600"
                            : "border-gray-300 bg-white hover:border-blue-400"
                        )}
                        onClick={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(email.id)) next.delete(email.id);
                            else next.add(email.id);
                            return next;
                          });
                        }}
                      >
                        {isChecked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      {/* Line 1: unread dot + sender + date */}
                      <div className="flex items-center gap-1.5">
                        {isUnread && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                        )}
                        <span className={cn(
                          "truncate text-sm",
                          isUnread ? "font-semibold text-gray-900" : "font-normal text-gray-600"
                        )}>
                          {email.sender_name || email.sender_email}
                        </span>
                        <span className="ml-auto shrink-0 text-[11px] text-gray-400">
                          {getRelativeTime(email.received_at)}
                        </span>
                      </div>
                      {/* Line 2: subject + PJ icon + project tag */}
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          isUnread ? "font-semibold text-gray-800" : "font-normal text-gray-700"
                        )}>
                          {email.subject}
                        </p>
                        {email.has_attachments && (
                          <Paperclip className="h-3 w-3 shrink-0 text-gray-400" />
                        )}
                        {project ? (
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: `${project.color}15`,
                              color: project.color,
                            }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: project.color }}
                            />
                            {project.name}
                          </span>
                        ) : (
                          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                            Non classifié
                          </span>
                        )}
                      </div>
                      {/* New project suggestion */}
                      {!email.project_id && (email as any).suggested_project_data && (
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            Nouveau projet : &quot;{(email as any).suggested_project_data?.name}&quot;
                          </span>
                          <Link
                            href={`/projects/new?name=${encodeURIComponent((email as any).suggested_project_data?.name || "")}`}
                            className="text-[10px] font-medium text-brand hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Créer ce projet
                          </Link>
                        </div>
                      )}
                      {/* Line 3: AI summary */}
                      {email.ai_summary && email.ai_summary !== "—" && (
                        <p className="mt-0.5 truncate text-[11px] leading-tight text-gray-400">
                          <Sparkles className="mr-1 inline h-2.5 w-2.5" />
                          {email.ai_summary}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <Mail className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">{t("noEmails")}</p>
              </div>
            </div>
          )}
        </div>

        {/* Desktop: Toggle button when panel is closed */}
        {!sidePanelOpen && (
          <button
            onClick={toggleSidePanel}
            className="absolute right-0 top-1/2 z-20 hidden -translate-y-1/2 rounded-l-md border border-r-0 border-gray-200 bg-white p-1.5 text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 lg:block"
            title={t("openPanel")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Mobile: Toggle button to open panel as overlay */}
        <button
          onClick={() => setMobilePanelOpen(true)}
          className="absolute right-0 top-1/2 z-20 -translate-y-1/2 rounded-l-md border border-r-0 border-gray-200 bg-white p-1.5 text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 lg:hidden"
          title={t("openPanel")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Contextual panel — Desktop (collapsible + resizable) */}
        <div
          className={cn(
            "hidden border-l border-gray-200 lg:block transition-all duration-200",
            sidePanelOpen ? "" : "w-0 min-w-0 overflow-hidden border-l-0",
            selectedEmail ? "bg-white" : "bg-gray-50"
          )}
          style={sidePanelOpen ? { width: `${panelWidthPercent}%`, minWidth: "350px", maxWidth: "70%" } : undefined}
        >
          {sidePanelOpen && (
            <div className="relative h-full">
              {/* Drag handle for resizing */}
              <div
                onMouseDown={handleMouseDown}
                className="absolute -left-1 top-0 z-30 h-full w-2 cursor-col-resize hover:bg-brand/10 active:bg-brand/20"
              />

              {/* Toggle button on left edge */}
              <button
                onClick={toggleSidePanel}
                className="absolute -left-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-gray-200 bg-white p-1 text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600"
                title={t("closePanel")}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>

              <div className={cn("h-full", selectedEmail ? "" : "overflow-y-auto p-4")}>
                {selectedEmail ? (
                  <EmailDetailPanel
                    email={selectedEmail}
                    projects={allProjects as any}
                    onClose={() => setSelectedEmail(null)}
                    onEmailUpdated={handleEmailUpdated}
                    onCreateTask={handleCreateTaskFromEmail}
                  />
                ) : (
                  <div className="space-y-5">
                    {/* AI Briefing — compact panel */}
                    <BriefingPanel compact />

                    {/* Today's tasks */}
                    {todayTasks.length > 0 && (
                      <div>
                        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          <CheckSquare className="h-3.5 w-3.5" />
                          {t("todayTasks")} ({todayTasks.length})
                        </h3>
                        <div className="mt-2 space-y-1.5">
                          {todayTasks.slice(0, 5).map((task) => {
                            const proj = allProjects.find((p) => p.id === task.project_id);
                            return (
                              <div key={task.id} className="rounded-md border border-gray-200 bg-white px-3 py-2">
                                <p className="text-xs font-medium text-gray-800 line-clamp-1">{task.title}</p>
                                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400">
                                  {proj && (
                                    <span className="flex items-center gap-1">
                                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: proj.color }} />
                                      {proj.name}
                                    </span>
                                  )}
                                  {task.assigned_to_name && <span>{task.assigned_to_name}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Overdue tasks — compact */}
                    <div>
                      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        <CheckSquare className="h-3.5 w-3.5" />
                        {t("overdueTasks")}
                      </h3>
                      {overdueTasks.length > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          {overdueTasks.slice(0, 5).map((task) => {
                            const proj = allProjects.find((p) => p.id === task.project_id);
                            return (
                              <div key={task.id} className="rounded-md border border-red-100 bg-red-50/50 px-3 py-2">
                                <p className="text-xs font-medium text-gray-800 line-clamp-1">
                                  {task.title}
                                </p>
                                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400">
                                  {proj && (
                                    <span className="flex items-center gap-1">
                                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: proj.color }} />
                                      {proj.name}
                                    </span>
                                  )}
                                  {task.due_date && (
                                    <span className="font-medium text-red-500">{formatDate(task.due_date)}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-green-600">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Aucune tâche en retard
                        </p>
                      )}
                    </div>

                    {/* Upcoming meetings — compact, max 2 */}
                    <div>
                      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        <Calendar className="h-3.5 w-3.5" />
                        {t("upcomingMeetings")}
                      </h3>
                      {upcomingMeetings.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {upcomingMeetings.slice(0, 2).map((meeting) => {
                            const proj = allProjects.find((p) => p.id === meeting.project_id);
                            return (
                              <p key={meeting.id} className="truncate text-xs text-gray-600">
                                {meeting.title}
                                {proj && <span className="text-gray-400"> · {proj.name}</span>}
                                <span className="text-gray-400"> · {formatDate(meeting.meeting_date)}</span>
                                {meeting.location && <span className="text-gray-400"> · {meeting.location}</span>}
                              </p>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-1.5 text-xs text-gray-400">{t("noMeetings")}</p>
                      )}
                    </div>

                    {/* Active submissions — will come from Supabase later */}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mobile: Panel overlay */}
        {mobilePanelOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/20"
              onClick={() => setMobilePanelOpen(false)}
            />
            {/* Panel sliding from right */}
            <div className={cn(
              "absolute right-0 top-0 h-full w-[85%] max-w-[400px] border-l border-gray-200 shadow-xl",
              selectedEmail ? "bg-white" : "bg-gray-50"
            )}>
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <span className="text-sm font-semibold text-gray-700">
                  {selectedEmail ? selectedEmail.subject : t("briefingTitle")}
                </span>
                <button
                  onClick={() => setMobilePanelOpen(false)}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className={cn("h-[calc(100%-49px)]", selectedEmail ? "" : "overflow-y-auto p-4")}>
                {selectedEmail ? (
                  <EmailDetailPanel
                    email={selectedEmail}
                    projects={allProjects as any}
                    onClose={() => { setSelectedEmail(null); setMobilePanelOpen(false); }}
                    onEmailUpdated={handleEmailUpdated}
                    onCreateTask={handleCreateTaskFromEmail}
                  />
                ) : (
                  <div className="space-y-5">
                    {/* AI Briefing — compact panel */}
                    <BriefingPanel compact />
                    {/* Today's tasks (mobile) */}
                    {todayTasks.length > 0 && (
                      <div>
                        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          <CheckSquare className="h-3.5 w-3.5" />
                          {t("todayTasks")} ({todayTasks.length})
                        </h3>
                        <div className="mt-2 space-y-1.5">
                          {todayTasks.slice(0, 5).map((task) => {
                            const proj = allProjects.find((p) => p.id === task.project_id);
                            return (
                              <div key={task.id} className="rounded-md border border-gray-200 bg-white px-3 py-2">
                                <p className="text-xs font-medium text-gray-800 line-clamp-1">{task.title}</p>
                                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400">
                                  {proj && (
                                    <span className="flex items-center gap-1">
                                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: proj.color }} />
                                      {proj.name}
                                    </span>
                                  )}
                                  {task.assigned_to_name && <span>{task.assigned_to_name}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* Overdue tasks (mobile) */}
                    <div>
                      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        <CheckSquare className="h-3.5 w-3.5" />
                        {t("overdueTasks")}
                      </h3>
                      {overdueTasks.length > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          {overdueTasks.slice(0, 5).map((task) => {
                            const proj = allProjects.find((p) => p.id === task.project_id);
                            return (
                              <div key={task.id} className="rounded-md border border-red-100 bg-red-50/50 px-3 py-2">
                                <p className="text-xs font-medium text-gray-800 line-clamp-1">{task.title}</p>
                                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400">
                                  {proj && (
                                    <span className="flex items-center gap-1">
                                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: proj.color }} />
                                      {proj.name}
                                    </span>
                                  )}
                                  {task.due_date && <span className="font-medium text-red-500">{formatDate(task.due_date)}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-green-600">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Aucune tâche en retard
                        </p>
                      )}
                    </div>
                    {/* Upcoming meetings */}
                    <div>
                      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                        <Calendar className="h-3.5 w-3.5" />
                        {t("upcomingMeetings")}
                      </h3>
                      {upcomingMeetings.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {upcomingMeetings.slice(0, 2).map((meeting) => {
                            const proj = allProjects.find((p) => p.id === meeting.project_id);
                            return (
                              <p key={meeting.id} className="truncate text-xs text-gray-600">
                                {meeting.title}
                                {proj && <span className="text-gray-400"> · {proj.name}</span>}
                                <span className="text-gray-400"> · {formatDate(meeting.meeting_date)}</span>
                                {meeting.location && <span className="text-gray-400"> · {meeting.location}</span>}
                              </p>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-1.5 text-xs text-gray-400">{t("noMeetings")}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Task creation modal from email */}
      <TaskCreateModal
        open={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setTaskPrefill(undefined); }}
        onCreated={() => { setTaskModalOpen(false); setTaskPrefill(undefined); }}
        prefill={taskPrefill}
      />
    </div>
  );
}
