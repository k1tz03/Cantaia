"use client";

import { useState, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  Plus,
  Search,
  MapPin,
  CalendarDays,
  FolderOpen,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  AlertTriangle,
  Download,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/components/providers/AuthProvider";
import { useProjects, useUserProfile } from "@/lib/hooks/use-supabase-data";

type ViewMode = "cards" | "list";
type SortOption = "urgency" | "name" | "created" | "activity";
type StatusFilter = "all" | "active" | "attention";
type SortDirection = "asc" | "desc";
type HealthStatus = "good" | "warning" | "critical";

function getProjectHealth(overdueTasks: number, openTasks: number): HealthStatus {
  if (overdueTasks > 3) return "critical";
  if (overdueTasks > 0 || openTasks > 10) return "warning";
  return "good";
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function formatCHF(amount: number | null | undefined): string {
  if (!amount) return "—";
  if (amount >= 1_000_000) return `CHF ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `CHF ${(amount / 1_000).toFixed(0)}K`;
  return `CHF ${amount.toFixed(0)}`;
}

function getRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "maintenant";
  if (diffMin < 60) return `il y a ${diffMin}min`;
  if (diffH < 24) return `il y a ${diffH}h`;
  if (diffD === 1) return "hier";
  if (diffD < 7) return `il y a ${diffD}j`;
  return formatDate(dateStr);
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const AVATAR_COLORS = ["#3B82F6", "#10B981", "#F97316", "#8B5CF6", "#EF4444", "#F59E0B", "#EC4899", "#06B6D4"];

function getProgressPercent(startDate: string | null | undefined, endDate: string | null | undefined): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

function getGradientForColor(color: string | null | undefined): string {
  const c = (color || "#F97316").toLowerCase();
  if (c.includes("3b82f6") || c === "blue") return "linear-gradient(90deg, #3B82F6, #60A5FA)";
  if (c.includes("10b981") || c === "green") return "linear-gradient(90deg, #10B981, #34D399)";
  if (c.includes("8b5cf6") || c === "purple") return "linear-gradient(90deg, #8B5CF6, #A78BFA)";
  if (c.includes("ef4444") || c === "red") return "linear-gradient(90deg, #EF4444, #F87171)";
  if (c.includes("f59e0b") || c === "yellow") return "linear-gradient(90deg, #F59E0B, #FBBF24)";
  return "linear-gradient(90deg, #F97316, #FB923C)";
}

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const router = useRouter();
  const { user } = useAuth();
  const { profile, loaded: profileLoaded } = useUserProfile(user?.id);
  const { projects, loading: projectsLoading } = useProjects(profile?.organization_id ?? undefined);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOption] = useState<SortOption>("urgency");
  const [searchQuery, setSearchQuery] = useState("");
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
        submissionCount: (pa.submissionCount as number) ?? 0,
        workerCount: (pa.workerCount as number) ?? 0,
        members: (pa.members as { name: string }[]) ?? [],
        nextMeeting: (pa.nextMeeting as { title: string; meeting_date: string } | null) ?? null,
        health: getProjectHealth(pa.overdueTasks ?? 0, pa.openTasks ?? 0),
      };
    });
  }, [projects]);

  // Filter
  const filteredProjects = useMemo(() => {
    return enrichedProjects.filter((p) => {
      if (statusFilter === "active" && p.status !== "active") return false;
      if (statusFilter === "attention" && p.health === "good") return false;
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
  }, [enrichedProjects, statusFilter, searchQuery]);

  // Sort
  const sortedProjects = useMemo(() => {
    const sorted = [...filteredProjects];

    if (viewMode === "list" && tableSortCol) {
      sorted.sort((a, b) => {
        let valA: string | number, valB: string | number;
        switch (tableSortCol) {
          case "name": valA = a.name; valB = b.name; break;
          case "client": valA = a.client_name || ""; valB = b.client_name || ""; break;
          case "city": valA = a.city || ""; valB = b.city || ""; break;
          case "emails": valA = a.emailCount; valB = b.emailCount; break;
          case "tasks": valA = a.openTasks; valB = b.openTasks; break;
          case "overdue": valA = a.overdueTasks; valB = b.overdueTasks; break;
          case "budget": valA = (a as any).budget_total || 0; valB = (b as any).budget_total || 0; break;
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

  const activeCount = enrichedProjects.filter((p) => p.status === "active" || p.status === "planning").length;
  const attentionCount = enrichedProjects.filter((p) => p.health !== "good").length;
  const totalBudget = enrichedProjects.reduce((sum, p) => sum + ((p as any).budget_total || 0), 0);

  // Loading state
  const isLoading = !profileLoaded || projectsLoading;
  if (isLoading) {
    return (
      <div className="min-h-full px-4 py-5 sm:px-6 lg:px-8" style={{ background: "#0F0F11" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-32 animate-pulse rounded-lg" style={{ background: "#27272A" }} />
            <div className="mt-2 h-4 w-56 animate-pulse rounded-lg" style={{ background: "#27272A" }} />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 animate-pulse rounded-lg" style={{ background: "#27272A" }} />
            <div className="h-9 w-36 animate-pulse rounded-lg" style={{ background: "#27272A" }} />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl p-5" style={{ background: "#18181B", border: "1px solid #27272A" }}>
              <div className="h-5 w-3/4 animate-pulse rounded" style={{ background: "#27272A" }} />
              <div className="mt-2 h-3 w-1/2 animate-pulse rounded" style={{ background: "#27272A" }} />
              <div className="mt-4 grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="h-14 animate-pulse rounded-md" style={{ background: "#27272A" }} />
                ))}
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
    <div className="min-h-full px-4 py-5 sm:px-6 lg:px-8" style={{ background: "#0F0F11" }}>
      {/* ===== PAGE HEADER ===== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif", fontSize: "24px", fontWeight: 800, color: "#FAFAFA" }}>
            {t("title")}
          </h1>
          <p style={{ fontSize: "13px", color: "#71717A", marginTop: "2px" }}>
            {activeCount} {activeCount === 1 ? "projet actif" : "projets actifs"}
            {totalBudget > 0 && <> · {formatCHF(totalBudget)} budget total</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            style={{
              fontSize: "12px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid #3F3F46",
              background: "#18181B",
              color: "#D4D4D8",
              cursor: "pointer",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            className="transition-colors hover:border-[#52525B] hover:bg-[#27272A] hover:text-[#FAFAFA]"
          >
            <Download className="h-3.5 w-3.5" />
            Importer
          </button>
          <Link
            href="/projects/new"
            style={{
              fontSize: "12px",
              padding: "8px 16px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #F97316, #EA580C)",
              color: "white",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              border: "1px solid transparent",
            }}
            className="transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("newProject")}
          </Link>
        </div>
      </div>

      {/* ===== TOOLBAR ===== */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          {/* View toggle */}
          <div className="flex p-[3px]" style={{ background: "#18181B", border: "1px solid #3F3F46", borderRadius: "8px" }}>
            <button
              onClick={() => changeViewMode("cards")}
              className="transition-all"
              style={{
                fontSize: "12px",
                padding: "5px 12px",
                borderRadius: "6px",
                border: "none",
                background: viewMode === "cards" ? "#27272A" : "transparent",
                color: viewMode === "cards" ? "#FAFAFA" : "#71717A",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Cards
            </button>
            <button
              onClick={() => changeViewMode("list")}
              className="transition-all"
              style={{
                fontSize: "12px",
                padding: "5px 12px",
                borderRadius: "6px",
                border: "none",
                background: viewMode === "list" ? "#27272A" : "transparent",
                color: viewMode === "list" ? "#FAFAFA" : "#71717A",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Table
            </button>
          </div>

          {/* Filter chips */}
          <button
            onClick={() => setStatusFilter("all")}
            className="transition-all"
            style={{
              fontSize: "12px",
              padding: "6px 12px",
              borderRadius: "7px",
              border: statusFilter === "all" ? "1px solid #F97316" : "1px solid #3F3F46",
              background: statusFilter === "all" ? "rgba(249,115,22,0.06)" : "#18181B",
              color: statusFilter === "all" ? "#F97316" : "#A1A1AA",
              cursor: "pointer",
            }}
          >
            Tous · {enrichedProjects.length}
          </button>
          <button
            onClick={() => setStatusFilter("active")}
            className="transition-all"
            style={{
              fontSize: "12px",
              padding: "6px 12px",
              borderRadius: "7px",
              border: statusFilter === "active" ? "1px solid #F97316" : "1px solid #3F3F46",
              background: statusFilter === "active" ? "rgba(249,115,22,0.06)" : "#18181B",
              color: statusFilter === "active" ? "#F97316" : "#A1A1AA",
              cursor: "pointer",
            }}
          >
            Actifs · {activeCount}
          </button>
          {attentionCount > 0 && (
            <button
              onClick={() => setStatusFilter("attention")}
              className="transition-all"
              style={{
                fontSize: "12px",
                padding: "6px 12px",
                borderRadius: "7px",
                border: statusFilter === "attention" ? "1px solid #F97316" : "1px solid #3F3F46",
                background: statusFilter === "attention" ? "rgba(249,115,22,0.06)" : "#18181B",
                color: statusFilter === "attention" ? "#F97316" : "#A1A1AA",
                cursor: "pointer",
              }}
            >
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Attention · {attentionCount}
              </span>
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "#52525B" }} />
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="transition-all"
            style={{
              background: "#18181B",
              border: "1px solid #3F3F46",
              borderRadius: "8px",
              padding: "7px 14px 7px 34px",
              fontSize: "12px",
              color: "#D4D4D8",
              width: "220px",
              outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#F97316"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#3F3F46"; }}
          />
        </div>
      </div>

      {/* ===== CONTENT ===== */}
      {sortedProjects.length === 0 ? (
        <div className="mt-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "#27272A" }}>
            <Search className="h-5 w-5" style={{ color: "#71717A" }} />
          </div>
          <p className="mt-3 text-sm font-medium" style={{ color: "#71717A" }}>{t("noProjects")}</p>
        </div>
      ) : viewMode === "cards" ? (
        /* ==================== CARD VIEW ==================== */
        <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {sortedProjects.map((project) => {
            const progress = getProgressPercent(project.start_date, project.end_date);
            const gradient = getGradientForColor(project.color);
            const pa = project as any;
            const members: { name: string }[] = project.members || [];
            const healthLabel = project.health === "good" ? "En ordre" : project.health === "warning" ? "Attention" : "Critique";
            const healthBadgeStyle: React.CSSProperties =
              project.health === "good"
                ? { background: "rgba(16,185,129,0.09)", color: "#34D399" }
                : project.health === "warning"
                  ? { background: "rgba(245,158,11,0.09)", color: "#FBBF24" }
                  : { background: "rgba(239,68,68,0.09)", color: "#F87171" };
            const healthIcon = project.health === "good" ? "\u2713" : project.health === "warning" ? "\u26A0" : "\u{1F534}";

            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group relative block overflow-hidden transition-all"
                style={{
                  background: "#18181B",
                  border: "1px solid #27272A",
                  borderRadius: "12px",
                  padding: "18px 20px",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#3F3F46";
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#27272A";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                {/* Left colored border */}
                <div
                  className="absolute left-0 top-0 bottom-0"
                  style={{ width: "4px", background: project.color || "#F97316" }}
                />

                {/* Header: name + health badge */}
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div
                      style={{
                        fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif",
                        fontSize: "16px",
                        fontWeight: 700,
                        color: "#FAFAFA",
                      }}
                      className="truncate group-hover:text-[#F97316] transition-colors"
                    >
                      {project.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "#71717A", marginTop: "2px" }}>
                      {[project.code, project.client_name, project.city].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span
                    className="ml-3 shrink-0"
                    style={{
                      ...healthBadgeStyle,
                      fontSize: "10px",
                      padding: "3px 10px",
                      borderRadius: "6px",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {healthIcon} {healthLabel}
                  </span>
                </div>

                {/* Info row: address + dates */}
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1" style={{ fontSize: "12px", color: "#71717A" }}>
                  {(pa.address || project.city) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{pa.address || project.city}</span>
                    </span>
                  )}
                  {(project.start_date || project.end_date) && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3 shrink-0" />
                      {formatDate(project.start_date)}
                      {project.start_date && project.end_date && " — "}
                      {formatDate(project.end_date)}
                    </span>
                  )}
                </div>

                {/* 4 stats grid */}
                <div className="mt-3.5 grid grid-cols-4 gap-2">
                  <div className="rounded-md text-center" style={{ background: "#27272A", padding: "8px 10px" }}>
                    <div
                      style={{
                        fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif",
                        fontSize: "18px",
                        fontWeight: 700,
                        color: "#FAFAFA",
                      }}
                    >
                      {project.emailCount}
                    </div>
                    <div style={{ fontSize: "9px", color: "#71717A", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      Emails
                    </div>
                  </div>
                  <div className="rounded-md text-center" style={{ background: "#27272A", padding: "8px 10px" }}>
                    <div
                      style={{
                        fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif",
                        fontSize: "18px",
                        fontWeight: 700,
                        color: project.overdueTasks > 0 ? "#F87171" : "#34D399",
                      }}
                    >
                      {project.overdueTasks}
                    </div>
                    <div style={{ fontSize: "9px", color: "#71717A", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      En retard
                    </div>
                  </div>
                  <div className="rounded-md text-center" style={{ background: "#27272A", padding: "8px 10px" }}>
                    <div
                      style={{
                        fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif",
                        fontSize: "18px",
                        fontWeight: 700,
                        color: "#FAFAFA",
                      }}
                    >
                      {project.submissionCount}
                    </div>
                    <div style={{ fontSize: "9px", color: "#71717A", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      Soumissions
                    </div>
                  </div>
                  <div className="rounded-md text-center" style={{ background: "#27272A", padding: "8px 10px" }}>
                    <div
                      style={{
                        fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif",
                        fontSize: "18px",
                        fontWeight: 700,
                        color: "#FAFAFA",
                      }}
                    >
                      {project.workerCount}
                    </div>
                    <div style={{ fontSize: "9px", color: "#71717A", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      Ouvriers
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 overflow-hidden rounded-sm" style={{ height: "3px", background: "#27272A" }}>
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${progress}%`,
                      background: gradient,
                      transition: "width 0.8s ease-out",
                    }}
                  />
                </div>

                {/* Footer: activity + team avatars */}
                <div className="mt-2.5 flex items-center justify-between">
                  <span style={{ fontSize: "10px", color: "#52525B" }}>
                    {project.updated_at ? `Dernière activité ${getRelativeTime(project.updated_at)}` : ""}
                  </span>
                  <div className="flex">
                    {members.length > 0 ? (
                      members.slice(0, 4).map((m, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-center"
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "6px",
                            fontSize: "8px",
                            color: "white",
                            fontWeight: 600,
                            marginLeft: idx === 0 ? 0 : "-4px",
                            border: "2px solid #18181B",
                            background: AVATAR_COLORS[idx % AVATAR_COLORS.length],
                          }}
                        >
                          {getInitials(m.name)}
                        </div>
                      ))
                    ) : (
                      /* Fallback: show a single avatar with org user initials */
                      <div
                        className="flex items-center justify-center"
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "6px",
                          fontSize: "8px",
                          color: "white",
                          fontWeight: 600,
                          background: AVATAR_COLORS[0],
                        }}
                      >
                        {profile?.first_name && profile?.last_name
                          ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
                          : "??"}
                      </div>
                    )}
                    {members.length > 4 && (
                      <div
                        className="flex items-center justify-center"
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "6px",
                          fontSize: "8px",
                          color: "#A1A1AA",
                          fontWeight: 600,
                          marginLeft: "-4px",
                          border: "2px solid #18181B",
                          background: "#3F3F46",
                        }}
                      >
                        +{members.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        /* ==================== TABLE VIEW ==================== */
        <div className="mt-4 -mx-4 overflow-x-auto sm:mx-0" style={{ borderRadius: "12px" }}>
          <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "800px" }}>
            <thead>
              <tr>
                <TableHeader col="name" label={t("colProject") || "Projet"} active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} />
                <TableHeader col="client" label="Client" active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} />
                <TableHeader col="city" label="Ville" active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} />
                <th style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#52525B", fontWeight: 600, padding: "8px 14px", textAlign: "left", borderBottom: "1px solid #27272A", whiteSpace: "nowrap" }}>
                  Santé
                </th>
                <TableHeader col="emails" label="Emails" active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} />
                <TableHeader col="tasks" label="Tâches" active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} />
                <TableHeader col="overdue" label="En retard" active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} />
                <th style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#52525B", fontWeight: 600, padding: "8px 14px", textAlign: "left", borderBottom: "1px solid #27272A", whiteSpace: "nowrap" }}>
                  Soumissions
                </th>
                <TableHeader col="budget" label="Budget" active={tableSortCol} dir={tableSortDir} onClick={handleTableSort} />
                <th style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#52525B", fontWeight: 600, padding: "8px 14px", textAlign: "left", borderBottom: "1px solid #27272A", whiteSpace: "nowrap" }}>
                  Activité
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedProjects.map((project) => {
                const healthLabel = project.health === "good" ? "En ordre" : project.health === "warning" ? "Attention" : "Critique";
                const healthBadgeStyle: React.CSSProperties =
                  project.health === "good"
                    ? { background: "rgba(16,185,129,0.09)", color: "#34D399" }
                    : project.health === "warning"
                      ? { background: "rgba(245,158,11,0.09)", color: "#FBBF24" }
                      : { background: "rgba(239,68,68,0.09)", color: "#F87171" };
                const healthIcon = project.health === "good" ? "\u2713" : project.health === "warning" ? "\u26A0" : "\u{1F534}";
                const pa = project as any;

                return (
                  <tr
                    key={project.id}
                    onClick={() => router.push(`/projects/${project.id}`)}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: "1px solid #1C1C1F" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#18181B"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    {/* Projet (dot + name + code) */}
                    <td style={{ padding: "12px 14px", fontSize: "13px", color: "#D4D4D8", verticalAlign: "middle" }}>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="shrink-0 rounded-full"
                          style={{ width: "8px", height: "8px", background: project.color || "#F97316" }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, color: "#FAFAFA" }}>{project.name}</div>
                          <div style={{ fontSize: "11px", color: "#71717A" }}>{project.code || ""}</div>
                        </div>
                      </div>
                    </td>
                    {/* Client */}
                    <td style={{ padding: "12px 14px", fontSize: "13px", color: "#D4D4D8", verticalAlign: "middle" }}>
                      {project.client_name || "\u2014"}
                    </td>
                    {/* Ville */}
                    <td style={{ padding: "12px 14px", fontSize: "13px", color: "#D4D4D8", verticalAlign: "middle" }}>
                      {project.city || "\u2014"}
                    </td>
                    {/* Santé */}
                    <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                      <span
                        style={{
                          ...healthBadgeStyle,
                          fontSize: "9px",
                          padding: "2px 7px",
                          borderRadius: "4px",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {healthIcon} {healthLabel}
                      </span>
                    </td>
                    {/* Emails */}
                    <td style={{ padding: "12px 14px", fontSize: "13px", verticalAlign: "middle" }}>
                      <span style={{ fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif", fontWeight: 700, color: "#D4D4D8" }}>
                        {project.emailCount}
                      </span>
                    </td>
                    {/* Tâches */}
                    <td style={{ padding: "12px 14px", fontSize: "13px", verticalAlign: "middle" }}>
                      <span style={{ fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif", fontWeight: 700, color: "#D4D4D8" }}>
                        {project.openTasks}
                      </span>
                    </td>
                    {/* En retard */}
                    <td style={{ padding: "12px 14px", fontSize: "13px", verticalAlign: "middle" }}>
                      <span
                        style={{
                          fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif",
                          fontWeight: 700,
                          color: project.overdueTasks > 0 ? "#F87171" : "#34D399",
                        }}
                      >
                        {project.overdueTasks}
                      </span>
                    </td>
                    {/* Soumissions */}
                    <td style={{ padding: "12px 14px", fontSize: "13px", color: "#D4D4D8", verticalAlign: "middle" }}>
                      {project.submissionCount}
                    </td>
                    {/* Budget */}
                    <td style={{ padding: "12px 14px", fontSize: "13px", color: "#FAFAFA", fontWeight: 600, verticalAlign: "middle" }}>
                      {formatCHF(pa.budget_total)}
                    </td>
                    {/* Activité */}
                    <td style={{ padding: "12px 14px", fontSize: "13px", color: "#71717A", verticalAlign: "middle" }}>
                      {getRelativeTime(project.updated_at)}
                    </td>
                  </tr>
                );
              })}
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
}: {
  col: string;
  label: string;
  active: string | null;
  dir: SortDirection;
  onClick: (col: string) => void;
}) {
  const isActive = active === col;
  return (
    <th
      className="cursor-pointer select-none transition-colors"
      style={{
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: isActive ? "#FAFAFA" : "#52525B",
        fontWeight: 600,
        padding: "8px 14px",
        textAlign: "left",
        borderBottom: "1px solid #27272A",
        whiteSpace: "nowrap",
      }}
      onClick={() => onClick(col)}
      onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "#A1A1AA"; }}
      onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "#52525B"; }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          dir === "asc" ? <ChevronUp className="h-3 w-3" style={{ color: "#F97316" }} /> : <ChevronDown className="h-3 w-3" style={{ color: "#F97316" }} />
        ) : (
          <ArrowUpDown className="h-2.5 w-2.5" style={{ color: "#52525B" }} />
        )}
      </span>
    </th>
  );
}
