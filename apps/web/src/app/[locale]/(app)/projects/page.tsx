"use client";

import { useState, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { StatusBadge, cn } from "@cantaia/ui";
import {
  Plus,
  CheckSquare,
  Calendar,
  Mail,
  AlertTriangle,
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  FolderOpen,
  MapPin,
  Clock,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/components/providers/AuthProvider";
import { useProjects, useUserProfile } from "@/lib/hooks/use-supabase-data";

type ViewMode = "cards" | "list";
type SortOption = "urgency" | "name" | "created" | "activity";
type StatusFilter = "all" | "active" | "planning" | "paused" | "completed" | "archived";
type HealthFilter = "all" | "attention";
type SortDirection = "asc" | "desc";
type HealthStatus = "good" | "warning" | "critical";

function getProjectHealth(overdueTasks: number, openTasks: number): HealthStatus {
  if (overdueTasks > 3) return "critical";
  if (overdueTasks > 0 || openTasks > 10) return "warning";
  return "good";
}

function formatMeetingDate(dateStr: string): string {
  const date = new Date(dateStr);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}.${mm} ${hh}h${min !== "00" ? min : ""}`;
}

const healthConfig = {
  good: { dot: "bg-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-l-emerald-500", ring: "" },
  warning: { dot: "bg-amber-500", text: "text-amber-400", bg: "bg-amber-500/10", border: "border-l-amber-500", ring: "ring-1 ring-amber-500/30" },
  critical: { dot: "bg-red-500", text: "text-red-400", bg: "bg-red-500/10", border: "border-l-red-500", ring: "ring-1 ring-red-500/30" },
};

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const router = useRouter();
  const { user } = useAuth();
  const { profile, loaded: profileLoaded } = useUserProfile(user?.id);
  const { projects, loading: projectsLoading } = useProjects(profile?.organization_id ?? undefined);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("urgency");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [tableSortCol, setTableSortCol] = useState<string | null>(null);
  const [tableSortDir, setTableSortDir] = useState<SortDirection>("desc");

  // Persist view mode
  useEffect(() => {
    const saved = localStorage.getItem("cantaia_projects_view");
    if (saved === "cards" || saved === "list") setViewMode(saved);
  }, []);

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem("cantaia_projects_view", mode);
  }

  // Enrich projects with computed data (stats come from API)
  const enrichedProjects = useMemo(() => {
    return projects.map((p) => {
      const pa = p as any;
      return {
        ...p,
        openTasks: (pa.openTasks as number) ?? 0,
        overdueTasks: (pa.overdueTasks as number) ?? 0,
        emailCount: (pa.emailCount as number) ?? 0,
        nextMeeting: (pa.nextMeeting as { title: string; meeting_date: string } | null) ?? null,
        health: getProjectHealth(pa.overdueTasks ?? 0, pa.openTasks ?? 0),
      };
    });
  }, [projects]);

  // Filter
  const filteredProjects = useMemo(() => {
    return enrichedProjects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (healthFilter === "attention" && p.health === "good") return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.code || "").toLowerCase().includes(q) ||
          (p.client_name || "").toLowerCase().includes(q) ||
          (p.city || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [enrichedProjects, statusFilter, healthFilter, searchQuery]);

  // Sort
  const sortedProjects = useMemo(() => {
    const sorted = [...filteredProjects];

    if (viewMode === "list" && tableSortCol) {
      sorted.sort((a, b) => {
        let valA: string | number, valB: string | number;
        switch (tableSortCol) {
          case "name": valA = a.name; valB = b.name; break;
          case "code": valA = a.code || ""; valB = b.code || ""; break;
          case "client": valA = a.client_name || ""; valB = b.client_name || ""; break;
          case "city": valA = a.city || ""; valB = b.city || ""; break;
          case "emails": valA = a.emailCount; valB = b.emailCount; break;
          case "tasks": valA = a.openTasks; valB = b.openTasks; break;
          case "overdue": valA = a.overdueTasks; valB = b.overdueTasks; break;
          default: return 0;
        }
        if (typeof valA === "string") {
          return tableSortDir === "asc" ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA);
        }
        return tableSortDir === "asc" ? valA - (valB as number) : (valB as number) - valA;
      });
      return sorted;
    }

    switch (sortOption) {
      case "urgency":
        sorted.sort((a, b) => {
          const scoreA = a.overdueTasks * 10 + a.emailCount;
          const scoreB = b.overdueTasks * 10 + b.emailCount;
          return scoreB - scoreA;
        });
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "created":
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
        break;
      case "activity":
        sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        break;
    }
    return sorted;
  }, [filteredProjects, sortOption, viewMode, tableSortCol, tableSortDir]);

  function handleTableSort(col: string) {
    if (tableSortCol === col) {
      setTableSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTableSortCol(col);
      setTableSortDir("asc");
    }
  }

  const attentionCount = enrichedProjects.filter((p) => p.health !== "good").length;

  const statusFilterLabel: Record<StatusFilter, string> = {
    all: t("filter_all"),
    active: t("filter_active"),
    planning: t("filter_planning"),
    paused: t("filter_paused"),
    completed: t("filter_completed"),
    archived: t("filter_archived"),
  };

  const sortLabels: Record<SortOption, string> = {
    urgency: t("sortUrgency"),
    name: t("sortName"),
    created: t("sortCreated"),
    activity: t("sortActivity"),
  };

  // Loading state — wait for profile to load, then projects
  const isLoading = !profileLoaded || projectsLoading;
  if (isLoading) {
    return (
      <div className="min-h-full bg-[#0F0F11] px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-32 animate-pulse rounded-lg bg-[#27272A]" />
            <div className="mt-2 h-4 w-56 animate-pulse rounded-lg bg-[#27272A]" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 animate-pulse rounded-lg bg-[#27272A]" />
            <div className="h-9 w-32 animate-pulse rounded-lg bg-[#27272A]" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl border border-[#27272A] bg-[#18181B] p-4 shadow-sm">
              <div className="flex items-start gap-2.5">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#27272A]" />
                <div className="flex-1">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-[#27272A]" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-[#27272A]" />
                </div>
              </div>
              <div className="mt-4 flex gap-2 border-t border-[#27272A] pt-3">
                <div className="h-6 w-14 animate-pulse rounded-md bg-[#27272A]" />
                <div className="h-6 w-14 animate-pulse rounded-md bg-[#27272A]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (projects.length === 0) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-6">
        <EmptyState
          icon={FolderOpen}
          title="Aucun projet"
          description="Créez votre premier projet pour commencer à organiser vos emails."
          action={{ label: "Créer un projet", onClick: () => router.push("/projects/new") }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0F0F11] px-4 py-5 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#FAFAFA]">{t("title")}</h1>
          <p className="mt-0.5 text-[13px] text-[#71717A]">
            {t("subtitle")}
            {enrichedProjects.length > 0 && (
              <span className="ml-2 text-[#71717A]">
                ({enrichedProjects.length})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowSortDropdown(!showSortDropdown); setShowStatusDropdown(false); }}
              className="flex items-center gap-1.5 rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2 text-xs text-[#71717A] hover:bg-[#1C1C1F] transition-colors"
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-[#71717A]" />
              {sortLabels[sortOption]}
              <ChevronDown className="h-3 w-3 text-[#71717A]" />
            </button>
            {showSortDropdown && (
              <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border border-[#27272A] bg-[#18181B] py-1 shadow-lg">
                {(Object.keys(sortLabels) as SortOption[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => { setSortOption(key); setShowSortDropdown(false); setTableSortCol(null); }}
                    className={cn(
                      "flex w-full px-3 py-2 text-xs transition-colors hover:bg-[#1C1C1F]",
                      sortOption === key ? "font-semibold text-[#F97316] bg-[#F97316]/10" : "text-[#71717A]"
                    )}
                  >
                    {sortLabels[key]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-[#27272A] bg-[#18181B] p-0.5">
            <button
              onClick={() => changeViewMode("cards")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                viewMode === "cards"
                  ? "bg-[#F97316] text-white shadow-sm"
                  : "text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#1C1C1F]"
              )}
              title={t("viewCards")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => changeViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                viewMode === "list"
                  ? "bg-[#F97316] text-white shadow-sm"
                  : "text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#1C1C1F]"
              )}
              title={t("viewList")}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* New project */}
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#F97316] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#EA580C] hover:shadow"
          >
            <Plus className="h-4 w-4" />
            {t("newProject")}
          </Link>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717A]" />
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-[#27272A] bg-[#18181B] py-2 pl-10 pr-3 text-sm text-[#FAFAFA] placeholder:text-[#52525B] focus:border-[#F97316] focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Status dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowStatusDropdown(!showStatusDropdown); setShowSortDropdown(false); }}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                statusFilter !== "all"
                  ? "border-[#F97316]/30 bg-[#F97316]/10 text-[#F97316]"
                  : "border-[#27272A] bg-[#18181B] text-[#71717A] hover:bg-[#1C1C1F]"
              )}
            >
              {t("status")}: {statusFilterLabel[statusFilter]}
              <ChevronDown className="h-3 w-3" />
            </button>
            {showStatusDropdown && (
              <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-lg border border-[#27272A] bg-[#18181B] py-1 shadow-lg">
                {(Object.keys(statusFilterLabel) as StatusFilter[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => { setStatusFilter(key); setShowStatusDropdown(false); }}
                    className={cn(
                      "flex w-full px-3 py-2 text-xs transition-colors hover:bg-[#1C1C1F]",
                      statusFilter === key ? "font-semibold text-[#F97316] bg-[#F97316]/10" : "text-[#71717A]"
                    )}
                  >
                    {statusFilterLabel[key]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Health filter pill */}
          <button
            onClick={() => setHealthFilter(healthFilter === "all" ? "attention" : "all")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              healthFilter === "attention"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                : "border-[#27272A] bg-[#18181B] text-[#71717A] hover:bg-[#1C1C1F]"
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {t("filterAttention")}
            {attentionCount > 0 && (
              <span className={cn(
                "ml-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                healthFilter === "attention" ? "bg-amber-500/20 text-amber-400" : "bg-[#27272A] text-[#71717A]"
              )}>
                {attentionCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {sortedProjects.length === 0 ? (
        <div className="mt-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#27272A]">
            <Search className="h-5 w-5 text-[#71717A]" />
          </div>
          <p className="mt-3 text-sm font-medium text-[#71717A]">{t("noProjects")}</p>
        </div>
      ) : viewMode === "cards" ? (
        /* ==================== CARD VIEW ==================== */
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {sortedProjects.map((project) => {
            const hcfg = healthConfig[project.health];
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className={cn(
                  "group relative overflow-hidden rounded-xl border border-[#27272A] bg-[#18181B] shadow-sm transition-all duration-200 hover:shadow-md hover:border-[#3F3F46] border-l-[3px]",
                  hcfg.border,
                  hcfg.ring
                )}
              >
                {/* Card content */}
                <div className="p-4">
                  {/* Header: color dot + name + code + status */}
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-[#18181B] shadow-sm"
                      style={{ backgroundColor: project.color || "#F97316" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate text-[13px] font-semibold text-[#FAFAFA] group-hover:text-[#F97316] transition-colors">
                          {project.name}
                        </h3>
                        <StatusBadge
                          status={project.status}
                          label={t(`status_${project.status}`)}
                          className="!px-2 !py-0.5 !text-[10px] shrink-0"
                        />
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#71717A]">
                        {project.code && <span className="font-medium text-[#71717A]">{project.code}</span>}
                        {project.code && project.client_name && <span>·</span>}
                        {project.client_name && <span className="truncate">{project.client_name}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  {project.city && (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-[#71717A]">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{project.city}</span>
                    </div>
                  )}

                  {/* Stats row */}
                  <div className="mt-3 flex items-center gap-2 border-t border-[#27272A] pt-3">
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#27272A] px-2 py-1 text-[11px] text-[#D4D4D8]">
                      <Mail className="h-3 w-3 text-[#71717A]" />
                      <span className="font-medium">{project.emailCount}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#27272A] px-2 py-1 text-[11px] text-[#D4D4D8]">
                      <CheckSquare className="h-3 w-3 text-[#71717A]" />
                      <span className="font-medium">{project.openTasks}</span>
                    </span>
                    {project.overdueTasks > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-400">
                        <AlertTriangle className="h-3 w-3" />
                        {project.overdueTasks} {t("overdueTasks")}
                      </span>
                    )}
                  </div>

                  {/* Next meeting */}
                  {project.nextMeeting && (
                    <div className="mt-2.5 flex items-center gap-1.5 rounded-md bg-[#F97316]/10 px-2 py-1.5 text-[11px] text-[#F97316]">
                      <Clock className="h-3 w-3 shrink-0 text-[#F97316]" />
                      <span className="truncate font-medium">{project.nextMeeting.title}</span>
                      <span className="ml-auto shrink-0 text-[#F97316]">{formatMeetingDate(project.nextMeeting.meeting_date)}</span>
                    </div>
                  )}
                </div>

                {/* Quick actions overlay on hover */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 rounded-b-xl border-t border-[#27272A] bg-[#18181B]/95 px-3 py-2.5 opacity-0 backdrop-blur-sm transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push("/dashboard"); }}
                    className="flex items-center gap-1 rounded-lg border border-[#27272A] bg-[#18181B] px-2.5 py-1 text-[10px] font-medium text-[#71717A] hover:bg-[#1C1C1F] hover:border-[#3F3F46] transition-colors"
                  >
                    <Mail className="h-3 w-3" />
                    {t("viewEmails")}
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/projects/${project.id}`); }}
                    className="flex items-center gap-1 rounded-lg border border-[#27272A] bg-[#18181B] px-2.5 py-1 text-[10px] font-medium text-[#71717A] hover:bg-[#1C1C1F] hover:border-[#3F3F46] transition-colors"
                  >
                    <CheckSquare className="h-3 w-3" />
                    {t("createTask")}
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/projects/${project.id}`); }}
                    className="flex items-center gap-1 rounded-lg border border-[#27272A] bg-[#18181B] px-2.5 py-1 text-[10px] font-medium text-[#71717A] hover:bg-[#1C1C1F] hover:border-[#3F3F46] transition-colors"
                  >
                    <Calendar className="h-3 w-3" />
                    {t("createMeeting")}
                  </button>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        /* ==================== LIST/TABLE VIEW ==================== */
        <div className="mt-5 -mx-4 sm:mx-0 overflow-x-auto rounded-xl sm:border border-[#27272A] bg-[#18181B] shadow-sm">
          <table className="min-w-[700px] w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#27272A] bg-[#27272A]/80">
                <th className="w-10 px-3 py-2.5" />
                <TableHeader col="name" label={t("colProject")} active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} />
                <TableHeader col="code" label={t("colCode")} active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} className="hidden sm:table-cell" />
                <TableHeader col="client" label={t("colClient")} active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} />
                <TableHeader col="city" label={t("colCity")} active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} className="hidden md:table-cell" />
                <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">{t("colStatus")}</th>
                <TableHeader col="emails" label={t("colEmails")} active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} className="text-center" />
                <TableHeader col="tasks" label={t("colTasks")} active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} className="text-center" />
                <TableHeader col="overdue" label={t("colOverdue")} active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} className="text-center" />
              </tr>
            </thead>
            <tbody>
              {sortedProjects.map((project) => (
                <tr
                  key={project.id}
                  onClick={() => router.push(`/projects/${project.id}`)}
                  className="cursor-pointer border-b border-[#27272A]/50 transition-colors duration-100 hover:bg-[#1C1C1F] last:border-b-0"
                >
                  {/* Color + health */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full ring-1 ring-[#18181B] shadow-sm" style={{ backgroundColor: project.color || "#F97316" }} />
                      <span className={cn("h-1.5 w-1.5 rounded-full", healthConfig[project.health].dot)} />
                    </div>
                  </td>
                  {/* Project name */}
                  <td className="px-3 py-2.5 font-medium text-[#FAFAFA] max-w-[200px] truncate">{project.name}</td>
                  {/* Code */}
                  <td className="hidden sm:table-cell px-3 py-2.5 text-[#71717A] font-mono text-[11px]">{project.code || "\u2014"}</td>
                  {/* Client */}
                  <td className="max-w-[150px] truncate px-3 py-2.5 text-[#71717A]">{project.client_name || "\u2014"}</td>
                  {/* City */}
                  <td className="hidden md:table-cell px-3 py-2.5 text-[#71717A]">{project.city || "\u2014"}</td>
                  {/* Status */}
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      status={project.status}
                      label={t(`status_${project.status}`)}
                      className="!px-2 !py-0.5 !text-[10px]"
                    />
                  </td>
                  {/* Emails */}
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1 text-[#71717A]">
                      <Mail className="h-3 w-3 text-[#52525B]" />
                      {project.emailCount}
                    </span>
                  </td>
                  {/* Tasks */}
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1 text-[#71717A]">
                      <CheckSquare className="h-3 w-3 text-[#52525B]" />
                      {project.openTasks}
                    </span>
                  </td>
                  {/* Overdue */}
                  <td className="px-3 py-2.5 text-center">
                    {project.overdueTasks > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-red-400">
                        <AlertTriangle className="h-3 w-3" />
                        {project.overdueTasks}
                      </span>
                    ) : (
                      <span className="text-[#52525B]">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Sortable table header */
function TableHeader({
  col,
  label,
  active,
  dir,
  onClick,
  className,
}: {
  col: string;
  label: string;
  active: string | null;
  dir: SortDirection;
  onClick: (col: string) => void;
  className?: string;
}) {
  const isActive = active === col;
  return (
    <th
      className={cn("cursor-pointer select-none px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#71717A] hover:text-[#FAFAFA] transition-colors", className)}
      onClick={() => onClick(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          dir === "asc" ? <ChevronUp className="h-3 w-3 text-[#F97316]" /> : <ChevronDown className="h-3 w-3 text-[#F97316]" />
        ) : (
          <ArrowUpDown className="h-2.5 w-2.5 text-[#52525B]" />
        )}
      </span>
    </th>
  );
}
