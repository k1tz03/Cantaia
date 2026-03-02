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
  Loader2,
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
  active: { labelKey: "statusActive", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: CheckCircle },
  superseded: { labelKey: "statusSuperseded", color: "text-gray-500", bg: "bg-gray-50 border-gray-200", icon: XCircle },
  withdrawn: { labelKey: "statusWithdrawn", color: "text-gray-400", bg: "bg-gray-50 border-gray-200", icon: XCircle },
  for_approval: { labelKey: "statusForApproval", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: Clock },
  approved: { labelKey: "statusApproved", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: CheckCircle },
  rejected: { labelKey: "statusRejected", color: "text-red-600", bg: "bg-red-50 border-red-200", icon: AlertTriangle },
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
  architecture: "bg-blue-100 text-blue-700",
  structure: "bg-orange-100 text-orange-700",
  cvcs: "bg-cyan-100 text-cyan-700",
  electricite: "bg-yellow-100 text-yellow-700",
  sanitaire: "bg-teal-100 text-teal-700",
  facades: "bg-purple-100 text-purple-700",
  amenagement: "bg-green-100 text-green-700",
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
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 text-slate-300" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-brand" />
      : <ArrowDown className="h-3 w-3 ml-1 text-brand" />;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{t("title")}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRescan}
              disabled={rescanning}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn("h-4 w-4", rescanning && "animate-spin")} />
              {rescanning ? t("rescanning") : t("rescanEmails")}
            </button>
            <Link
              href="/plans/upload"
              className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("uploadPlan")}
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50">
                <FileStack className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{totalPlans}</p>
                <p className="text-[11px] text-slate-500">{t("totalPlans")}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-green-50">
                <FileText className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{totalVersions}</p>
                <p className="text-[11px] text-slate-500">{t("totalVersions")}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{outdatedAlerts}</p>
                <p className="text-[11px] text-slate-500">{t("outdatedAlerts")}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-50">
                <Clock className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{pendingApproval}</p>
                <p className="text-[11px] text-slate-500">{t("pendingApproval")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar: search + filters + view toggle */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t("searchPlans")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            {/* Project filter */}
            <div className="relative">
              <button
                onClick={() => { setShowProjectDropdown(!showProjectDropdown); setShowDisciplineDropdown(false); setShowStatusDropdown(false); }}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {t("filterProject")}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showProjectDropdown && (
                <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={() => { setProjectFilter("all"); setShowProjectDropdown(false); }}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50",
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
                        "w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50",
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
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {t("filterDiscipline")}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showDisciplineDropdown && (
                <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={() => { setDisciplineFilter("all"); setShowDisciplineDropdown(false); }}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50",
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
                        "w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50",
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
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {t("filterStatus")}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showStatusDropdown && (
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={() => { setStatusFilter("all"); setShowStatusDropdown(false); }}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50",
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
                        "w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50",
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
            <div className="ml-2 flex items-center rounded-md border border-slate-200 bg-white">
              <button
                onClick={() => toggleView("list")}
                className={cn(
                  "flex items-center gap-1 rounded-l-md px-2.5 py-2 text-xs font-medium transition-colors",
                  viewMode === "list" ? "bg-brand text-white" : "text-slate-500 hover:bg-slate-50"
                )}
                title={t("viewList")}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => toggleView("grid")}
                className={cn(
                  "flex items-center gap-1 rounded-r-md px-2.5 py-2 text-xs font-medium transition-colors",
                  viewMode === "grid" ? "bg-brand text-white" : "text-slate-500 hover:bg-slate-50"
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
          <div className="mb-4 flex items-center gap-2 rounded-md bg-blue-50 px-4 py-2.5 text-sm text-blue-700 ring-1 ring-inset ring-blue-200">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {rescanResult.plans_saved > 0
              ? `${rescanResult.scanned} emails analysés, ${rescanResult.plans_saved} plan(s) détecté(s) et sauvegardé(s)`
              : `${rescanResult.scanned} emails analysés, aucun nouveau plan détecté`}
          </div>
        )}

        {/* Empty state */}
        {filteredPlans.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-16">
            <FileStack className="h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600">{t("noPlans")}</p>
            <p className="mt-1 text-xs text-slate-400 max-w-sm text-center">{t("noPlansDescription")}</p>
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
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th
                    className="cursor-pointer px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                    onClick={() => toggleSort("plan_number")}
                  >
                    <span className="flex items-center">
                      {t("colNumber")}
                      <SortIcon field="plan_number" />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                    onClick={() => toggleSort("plan_title")}
                  >
                    <span className="flex items-center">
                      {t("colTitle")}
                      <SortIcon field="plan_title" />
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {t("colProject")}
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                    onClick={() => toggleSort("discipline")}
                  >
                    <span className="flex items-center">
                      {t("colDiscipline")}
                      <SortIcon field="discipline" />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                    onClick={() => toggleSort("version")}
                  >
                    <span className="flex items-center">
                      {t("colVersion")}
                      <SortIcon field="version" />
                    </span>
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                    onClick={() => toggleSort("version_date")}
                  >
                    <span className="flex items-center">
                      {t("colDate")}
                      <SortIcon field="version_date" />
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {t("colAuthor")}
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                    onClick={() => toggleSort("status")}
                  >
                    <span className="flex items-center">
                      {t("colStatus")}
                      <SortIcon field="status" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredPlans.map((plan) => {
                  const statusCfg = STATUS_CONFIG[plan.status] || STATUS_CONFIG.active;
                  const StatusIcon = statusCfg.icon;
                  return (
                    <tr
                      key={plan.id}
                      className="hover:bg-slate-50/50 transition-colors"
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
                          <p className="text-sm font-medium text-slate-800">{plan.plan_title}</p>
                          {plan.zone && (
                            <p className="text-[11px] text-slate-400">{plan.zone}</p>
                          )}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        {plan.project && (
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full shrink-0 bg-brand" />
                            <span className="text-xs text-slate-600 truncate max-w-[120px]">{plan.project.name}</span>
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
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-700">
                            {plan.current_version?.version_code || "—"}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({plan.version_count})
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {plan.current_version?.version_date ? formatDate(plan.current_version.version_date) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 truncate max-w-[140px]">
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
                  className="group rounded-lg border border-slate-200 bg-white p-4 transition-all hover:shadow-md hover:bg-slate-50/50"
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
                  <p className="text-sm font-medium text-slate-800 mb-1 line-clamp-2 group-hover:text-brand transition-colors">
                    {plan.plan_title}
                  </p>

                  {/* Project */}
                  {plan.project && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="h-2 w-2 rounded-full shrink-0 bg-brand" />
                      <span className="text-[11px] text-slate-500 truncate">{plan.project.name}</span>
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
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                        {plan.zone}
                      </span>
                    )}
                    {plan.scale && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                        {plan.scale}
                      </span>
                    )}
                  </div>

                  {/* Footer: version + date + author */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-700">
                        {plan.current_version?.version_code || "—"}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {plan.version_count > 1 ? `${plan.version_count} versions` : "1 version"}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {plan.current_version?.version_date ? formatDate(plan.current_version.version_date) : "—"}
                    </span>
                  </div>
                  {plan.author_company && (
                    <p className="mt-1 text-[10px] text-slate-400 truncate">{plan.author_company}</p>
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
