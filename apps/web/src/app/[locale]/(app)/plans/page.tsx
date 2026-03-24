"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Search,
  LayoutGrid,
  List,
  Plus,
  ChevronDown,
  FileStack,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileText,
  RefreshCw,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import type { PlanStatus } from "@cantaia/database";

// Plan shape from API
interface PlanFromApi {
  id: string;
  plan_number: string;
  plan_title: string;
  plan_type: string;
  discipline: string | null;
  lot_name: string | null;
  cfc_code: string | null;
  zone: string | null;
  scale: string | null;
  author_company: string | null;
  status: PlanStatus;
  created_at: string;
  project_id: string;
  project: { id: string; name: string; code: string | null } | null;
  current_version: {
    id: string;
    version_code: string;
    version_number: number;
    version_date: string;
    file_url: string;
    file_name: string;
    file_size: number;
    file_type: string;
    validation_status: string;
  } | null;
  version_count: number;
}

// ── Status config ──

const STATUS_CONFIG: Record<PlanStatus, { labelKey: string; color: string; bg: string; icon: React.ElementType }> = {
  active: { labelKey: "statusActive", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", icon: CheckCircle },
  superseded: { labelKey: "statusSuperseded", color: "text-[#71717A]", bg: "bg-[#27272A] border-[#27272A]", icon: XCircle },
  withdrawn: { labelKey: "statusWithdrawn", color: "text-[#71717A]", bg: "bg-[#27272A] border-[#27272A]", icon: XCircle },
  for_approval: { labelKey: "statusForApproval", color: "text-amber-600", bg: "bg-amber-500/10 border-amber-500/20", icon: Clock },
  approved: { labelKey: "statusApproved", color: "text-[#F97316]", bg: "bg-[#F97316]/10 border-[#F97316]/20", icon: CheckCircle },
  rejected: { labelKey: "statusRejected", color: "text-red-600", bg: "bg-red-500/10 border-red-500/20", icon: AlertTriangle },
};

const DISCIPLINE_KEYS: Record<string, string> = {
  architecture: "disciplineArchitecture",
  structure: "disciplineStructure",
  cvcs: "disciplineCvcs",
  electricite: "disciplineElectricite",
  sanitaire: "disciplineSanitaire",
  facades: "disciplineFacades",
  amenagement: "disciplineAmenagement",
};

const DISCIPLINE_COLORS: Record<string, string> = {
  architecture: "bg-[#F97316]/10 text-[#F97316]",
  structure: "bg-orange-500/10 text-orange-400",
  cvcs: "bg-cyan-500/10 text-cyan-400",
  electricite: "bg-yellow-500/10 text-yellow-400",
  sanitaire: "bg-teal-500/10 text-teal-400",
  facades: "bg-purple-500/10 text-purple-400",
  amenagement: "bg-green-500/10 text-green-400",
};

// ── Helpers ──

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(2);
  return `${day}.${month}.${year}`;
}

type SortField = "plan_number" | "plan_title" | "discipline" | "version" | "version_date" | "status";
type SortDir = "asc" | "desc";

const STORAGE_KEY = "cantaia_plans_view";

// ── Page ──

export default function PlansPage() {
  const t = useTranslations("plans");

  // Data from API
  const [plans, setPlans] = useState<PlanFromApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [rescanResult, setRescanResult] = useState<{ scanned: number; plans_saved: number } | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/plans");
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    } catch (err) {
      console.error("Failed to fetch plans:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleRescan = async () => {
    setRescanning(true);
    setRescanResult(null);
    try {
      const res = await fetch("/api/plans/rescan", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setRescanResult({ scanned: data.scanned, plans_saved: data.plans_saved });
        // Refresh plans list
        await fetchPlans();
      } else {
        console.error("[rescan] Error:", data.error);
      }
    } catch (err) {
      console.error("[rescan] Error:", err);
    } finally {
      setRescanning(false);
    }
  };

  // View mode (list/grid) persisted in localStorage
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "grid" || saved === "list") setViewMode(saved);
  }, []);
  const toggleView = (mode: "list" | "grid") => {
    setViewMode(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  };

  // Filters
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [disciplineFilter, setDisciplineFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showDisciplineDropdown, setShowDisciplineDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<SortField>("plan_number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // Filtered & sorted plans
  const filteredPlans = useMemo(() => {
    let list = [...plans];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.plan_number.toLowerCase().includes(q) ||
          p.plan_title.toLowerCase().includes(q) ||
          (p.author_company && p.author_company.toLowerCase().includes(q))
      );
    }
    if (projectFilter !== "all") {
      list = list.filter((p) => p.project_id === projectFilter);
    }
    if (disciplineFilter !== "all") {
      list = list.filter((p) => p.discipline === disciplineFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((p) => p.status === statusFilter);
    }
    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "plan_number":
          cmp = a.plan_number.localeCompare(b.plan_number);
          break;
        case "plan_title":
          cmp = a.plan_title.localeCompare(b.plan_title);
          break;
        case "discipline":
          cmp = (a.discipline || "").localeCompare(b.discipline || "");
          break;
        case "version":
          cmp = (a.current_version?.version_code || "").localeCompare(b.current_version?.version_code || "");
          break;
        case "version_date":
          cmp = (a.current_version?.version_date || "").localeCompare(b.current_version?.version_date || "");
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [plans, search, projectFilter, disciplineFilter, statusFilter, sortField, sortDir]);

  // Stats
  const totalPlans = plans.length;
  const totalVersions = plans.reduce((sum, p) => sum + p.version_count, 0);
  const outdatedAlerts = plans.filter((p) => p.status === "superseded").length;
  const pendingApproval = plans.filter((p) => p.status === "for_approval").length;

  // Unique disciplines for filter
  const disciplines = [...new Set(plans.map((p) => p.discipline).filter(Boolean))] as string[];

  // Unique projects from plans
  const projectsInPlans = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const p of plans) {
      if (p.project && !map.has(p.project.id)) {
        map.set(p.project.id, { id: p.project.id, name: p.project.name });
      }
    }
    return Array.from(map.values());
  }, [plans]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 text-[#71717A]" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-brand" />
      : <ArrowDown className="h-3 w-3 ml-1 text-brand" />;
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto min-h-full bg-[#0F0F11]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <div className="h-6 w-40 animate-pulse rounded-lg bg-[#27272A]" />
              <div className="mt-2 h-4 w-56 animate-pulse rounded-lg bg-[#27272A]" />
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-36 animate-pulse rounded-lg bg-[#27272A]" />
              <div className="h-9 w-32 animate-pulse rounded-lg bg-[#27272A]" />
            </div>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl border border-[#27272A] bg-[#0F0F11] p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 animate-pulse rounded-lg bg-[#27272A]" />
                  <div>
                    <div className="h-5 w-10 animate-pulse rounded bg-[#27272A] mb-1" />
                    <div className="h-3 w-20 animate-pulse rounded bg-[#27272A]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="h-10 w-full animate-pulse rounded-lg bg-[#27272A] mb-4" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 w-full animate-pulse rounded-xl bg-[#0F0F11] border border-[#27272A] shadow-sm" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-full bg-[#0F0F11]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-[#FAFAFA]">{t("title")}</h1>
            <p className="mt-0.5 text-[13px] text-[#71717A]">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRescan}
              disabled={rescanning}
              className="flex items-center gap-1.5 rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm font-medium text-[#71717A] hover:bg-[#27272A] hover:border-[#27272A] disabled:opacity-50 transition-all"
            >
              <RefreshCw className={cn("h-4 w-4", rescanning && "animate-spin")} />
              {rescanning ? t("rescanning") : t("rescanEmails")}
            </button>
            <Link
              href="/plans/upload"
              className="flex items-center gap-1.5 rounded-lg bg-[#F97316] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#F97316]/90 hover:shadow transition-all"
            >
              <Plus className="h-4 w-4" />
              {t("uploadPlan")}
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-[#27272A] bg-[#0F0F11] p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F97316]/10">
                <FileStack className="h-4 w-4 text-[#F97316]" />
              </div>
              <div>
                <p className="text-lg font-bold text-[#FAFAFA]">{totalPlans}</p>
                <p className="text-[11px] font-medium text-[#71717A]">{t("totalPlans")}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-[#27272A] bg-[#0F0F11] p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                <FileText className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-[#FAFAFA]">{totalVersions}</p>
                <p className="text-[11px] font-medium text-[#71717A]">{t("totalVersions")}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-[#27272A] bg-[#0F0F11] p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-[#FAFAFA]">{outdatedAlerts}</p>
                <p className="text-[11px] font-medium text-[#71717A]">{t("outdatedAlerts")}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-[#27272A] bg-[#0F0F11] p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
                <Clock className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-[#FAFAFA]">{pendingApproval}</p>
                <p className="text-[11px] font-medium text-[#71717A]">{t("pendingApproval")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar: search + filters + view toggle */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717A]" />
            <input
              type="text"
              placeholder={t("searchPlans")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] py-2 pl-10 pr-3 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-[#F97316] focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 transition-all"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            {/* Project filter */}
            <div className="relative">
              <button
                onClick={() => { setShowProjectDropdown(!showProjectDropdown); setShowDisciplineDropdown(false); setShowStatusDropdown(false); }}
                className="flex items-center gap-1.5 rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-xs font-medium text-[#71717A] hover:bg-[#27272A] hover:border-[#27272A] transition-all"
              >
                {t("filterProject")}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showProjectDropdown && (
                <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl border border-[#27272A] bg-[#0F0F11] py-1 shadow-lg">
                  <button
                    onClick={() => { setProjectFilter("all"); setShowProjectDropdown(false); }}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-xs hover:bg-[#27272A] transition-colors",
                      projectFilter === "all" && "font-semibold text-brand"
                    )}
                  >
                    {t("allProjects")}
                  </button>
                  {projectsInPlans.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setProjectFilter(p.id); setShowProjectDropdown(false); }}
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-xs hover:bg-[#27272A] transition-colors",
                        projectFilter === p.id && "font-semibold text-brand"
                      )}
                    >
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand" />
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Discipline filter */}
            <div className="relative">
              <button
                onClick={() => { setShowDisciplineDropdown(!showDisciplineDropdown); setShowProjectDropdown(false); setShowStatusDropdown(false); }}
                className="flex items-center gap-1.5 rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-xs font-medium text-[#71717A] hover:bg-[#27272A] hover:border-[#27272A] transition-all"
              >
                {t("filterDiscipline")}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showDisciplineDropdown && (
                <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-[#27272A] bg-[#0F0F11] py-1 shadow-lg">
                  <button
                    onClick={() => { setDisciplineFilter("all"); setShowDisciplineDropdown(false); }}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-xs hover:bg-[#27272A] transition-colors",
                      disciplineFilter === "all" && "font-semibold text-brand"
                    )}
                  >
                    {t("allDisciplines")}
                  </button>
                  {disciplines.map((d) => (
                    <button
                      key={d}
                      onClick={() => { setDisciplineFilter(d); setShowDisciplineDropdown(false); }}
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-xs hover:bg-[#27272A] transition-colors",
                        disciplineFilter === d && "font-semibold text-brand"
                      )}
                    >
                      {t(DISCIPLINE_KEYS[d] || d)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Status filter */}
            <div className="relative">
              <button
                onClick={() => { setShowStatusDropdown(!showStatusDropdown); setShowProjectDropdown(false); setShowDisciplineDropdown(false); }}
                className="flex items-center gap-1.5 rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-xs font-medium text-[#71717A] hover:bg-[#27272A] hover:border-[#27272A] transition-all"
              >
                {t("filterStatus")}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showStatusDropdown && (
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-[#27272A] bg-[#0F0F11] py-1 shadow-lg">
                  <button
                    onClick={() => { setStatusFilter("all"); setShowStatusDropdown(false); }}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-xs hover:bg-[#27272A] transition-colors",
                      statusFilter === "all" && "font-semibold text-brand"
                    )}
                  >
                    {t("allStatuses")}
                  </button>
                  {(Object.keys(STATUS_CONFIG) as PlanStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => { setStatusFilter(s); setShowStatusDropdown(false); }}
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-xs hover:bg-[#27272A] transition-colors",
                        statusFilter === s && "font-semibold text-brand"
                      )}
                    >
                      {t(STATUS_CONFIG[s].labelKey)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* View toggle */}
            <div className="ml-2 flex items-center rounded-md border border-[#27272A] bg-[#0F0F11]">
              <button
                onClick={() => toggleView("list")}
                className={cn(
                  "flex items-center gap-1 rounded-l-md px-2.5 py-2 text-xs font-medium transition-colors",
                  viewMode === "list" ? "bg-brand text-white" : "text-[#71717A] hover:bg-[#27272A] transition-colors"
                )}
                title={t("viewList")}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => toggleView("grid")}
                className={cn(
                  "flex items-center gap-1 rounded-r-md px-2.5 py-2 text-xs font-medium transition-colors",
                  viewMode === "grid" ? "bg-brand text-white" : "text-[#71717A] hover:bg-[#27272A] transition-colors"
                )}
                title={t("viewGrid")}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Rescan result banner */}
        {rescanResult && (
          <div className="mb-4 flex items-center gap-2 rounded-md bg-[#F97316]/10 px-4 py-2.5 text-sm text-[#F97316] ring-1 ring-inset ring-[#F97316]/20">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {rescanResult.plans_saved > 0
              ? `${rescanResult.scanned} emails analysés, ${rescanResult.plans_saved} plan(s) détecté(s) et sauvegardé(s)`
              : `${rescanResult.scanned} emails analysés, aucun nouveau plan détecté`}
          </div>
        )}

        {/* Empty state */}
        {filteredPlans.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#27272A] bg-[#0F0F11] py-16">
            <FileStack className="h-12 w-12 text-[#71717A] mb-3" />
            <p className="text-sm font-medium text-[#71717A]">{t("noPlans")}</p>
            <p className="mt-1 text-xs text-[#71717A] max-w-sm text-center">{t("noPlansDescription")}</p>
            {!rescanning && !rescanResult && (
              <button
                onClick={handleRescan}
                className="mt-4 flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                {t("rescanEmails")}
              </button>
            )}
          </div>
        )}

        {/* List view */}
        {filteredPlans.length > 0 && viewMode === "list" && (
          <div className="overflow-x-auto rounded-lg border border-[#27272A] bg-[#0F0F11]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                  <th
                    className="cursor-pointer px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#71717A] hover:text-[#FAFAFA]"
                    onClick={() => toggleSort("plan_number")}
                  >
                    <span className="flex items-center">
                      {t("colNumber")}
                      <SortIcon field="plan_number" />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#71717A] hover:text-[#FAFAFA]"
                    onClick={() => toggleSort("plan_title")}
                  >
                    <span className="flex items-center">
                      {t("colTitle")}
                      <SortIcon field="plan_title" />
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                    {t("colProject")}
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#71717A] hover:text-[#FAFAFA]"
                    onClick={() => toggleSort("discipline")}
                  >
                    <span className="flex items-center">
                      {t("colDiscipline")}
                      <SortIcon field="discipline" />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#71717A] hover:text-[#FAFAFA]"
                    onClick={() => toggleSort("version")}
                  >
                    <span className="flex items-center">
                      {t("colVersion")}
                      <SortIcon field="version" />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#71717A] hover:text-[#FAFAFA]"
                    onClick={() => toggleSort("version_date")}
                  >
                    <span className="flex items-center">
                      {t("colDate")}
                      <SortIcon field="version_date" />
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                    {t("colAuthor")}
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#71717A] hover:text-[#FAFAFA]"
                    onClick={() => toggleSort("status")}
                  >
                    <span className="flex items-center">
                      {t("colStatus")}
                      <SortIcon field="status" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPlans.map((plan) => {
                  const statusCfg = STATUS_CONFIG[plan.status] || STATUS_CONFIG.active;
                  const StatusIcon = statusCfg.icon;
                  return (
                    <tr
                      key={plan.id}
                      className="hover:bg-[#27272A]/50 transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/plans/${plan.id}`}
                          className="font-mono text-xs font-semibold text-brand hover:underline"
                        >
                          {plan.plan_number}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/plans/${plan.id}`} className="hover:text-brand transition-colors">
                          <p className="text-sm font-medium text-[#FAFAFA]">{plan.plan_title}</p>
                          {plan.zone && (
                            <p className="text-[11px] text-[#71717A]">{plan.zone}</p>
                          )}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        {plan.project && (
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full shrink-0 bg-brand" />
                            <span className="text-xs text-[#71717A] truncate max-w-[120px]">{plan.project.name}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {plan.discipline && (
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                            DISCIPLINE_COLORS[plan.discipline]
                          )}>
                            {t(DISCIPLINE_KEYS[plan.discipline] || plan.discipline)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[#27272A] text-[10px] font-bold text-[#FAFAFA]">
                            {plan.current_version?.version_code || "—"}
                          </span>
                          <span className="text-[10px] text-[#71717A]">
                            ({plan.version_count})
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#71717A]">
                        {plan.current_version?.version_date ? formatDate(plan.current_version.version_date) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#71717A] truncate max-w-[140px]">
                        {plan.author_company || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                          statusCfg.bg, statusCfg.color
                        )}>
                          <StatusIcon className="h-3 w-3" />
                          {t(statusCfg.labelKey)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Grid view */}
        {filteredPlans.length > 0 && viewMode === "grid" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPlans.map((plan) => {
              const statusCfg = STATUS_CONFIG[plan.status] || STATUS_CONFIG.active;
              const StatusIcon = statusCfg.icon;
              return (
                <Link
                  key={plan.id}
                  href={`/plans/${plan.id}`}
                  className="group rounded-lg border border-[#27272A] bg-[#0F0F11] p-4 transition-all hover:shadow-md hover:bg-[#27272A]/50"
                >
                  {/* Header: number + status */}
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-brand">{plan.plan_number}</span>
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      statusCfg.bg, statusCfg.color
                    )}>
                      <StatusIcon className="h-3 w-3" />
                      {t(statusCfg.labelKey)}
                    </span>
                  </div>

                  {/* Title */}
                  <p className="text-sm font-medium text-[#FAFAFA] mb-1 line-clamp-2 group-hover:text-brand transition-colors">
                    {plan.plan_title}
                  </p>

                  {/* Project */}
                  {plan.project && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="h-2 w-2 rounded-full shrink-0 bg-brand" />
                      <span className="text-[11px] text-[#71717A] truncate">{plan.project.name}</span>
                    </div>
                  )}

                  {/* Tags row */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    {plan.discipline && (
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                        DISCIPLINE_COLORS[plan.discipline]
                      )}>
                        {t(DISCIPLINE_KEYS[plan.discipline] || plan.discipline)}
                      </span>
                    )}
                    {plan.zone && (
                      <span className="inline-flex items-center rounded-full bg-[#27272A] px-2 py-0.5 text-[10px] text-[#71717A]">
                        {plan.zone}
                      </span>
                    )}
                    {plan.scale && (
                      <span className="inline-flex items-center rounded-full bg-[#27272A] px-2 py-0.5 text-[10px] text-[#71717A]">
                        {plan.scale}
                      </span>
                    )}
                  </div>

                  {/* Footer: version + date + author */}
                  <div className="flex items-center justify-between border-t border-[#27272A] pt-2">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[#27272A] text-[10px] font-bold text-[#FAFAFA]">
                        {plan.current_version?.version_code || "—"}
                      </span>
                      <span className="text-[10px] text-[#71717A]">
                        {plan.version_count > 1 ? `${plan.version_count} versions` : "1 version"}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#71717A]">
                      {plan.current_version?.version_date ? formatDate(plan.current_version.version_date) : "—"}
                    </span>
                  </div>
                  {plan.author_company && (
                    <p className="mt-1 text-[10px] text-[#71717A] truncate">{plan.author_company}</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
