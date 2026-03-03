"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  Download,
  Send,
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Eye,
  History,
  Shield,
  Sparkles,
  Copy,
  Loader2,
  ClipboardCopy,
  RefreshCw,
  Info,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Calculator,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import type { PlanStatus, PlanDiscipline, PlanValidationStatus } from "@cantaia/database";

// ── Types ──

interface PlanVersion {
  id: string;
  version_code: string;
  version_number: number;
  version_date: string;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
  source: string;
  source_email_id: string | null;
  received_at: string | null;
  ai_detected: boolean;
  ai_confidence: number | null;
  ai_changes_detected: string | null;
  validation_status: PlanValidationStatus;
  validated_by: string | null;
  validated_at: string | null;
  distributed_to: any | null;
  distribution_date: string | null;
  is_current: boolean;
  created_at: string;
}

interface PlanDetail {
  id: string;
  project_id: string;
  plan_number: string;
  plan_title: string;
  discipline: PlanDiscipline | null;
  status: PlanStatus;
  lot_name: string | null;
  zone: string | null;
  scale: string | null;
  format: string | null;
  author_company: string | null;
  author_name: string | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  projects: { id: string; name: string; code: string | null } | null;
  plan_versions: PlanVersion[];
}

interface AnalysisData {
  id?: string;
  plan_type_detected: string;
  discipline_detected: string;
  summary: string;
  analysis_duration_ms: number;
  analyzed_at: string;
  analysis_result: {
    plan_type: string;
    discipline: string;
    title_block: {
      plan_number: string | null;
      plan_title: string | null;
      scale: string | null;
      date: string | null;
      author: string | null;
      company: string | null;
      revision: string | null;
    } | null;
    legend_items: { symbol: string; description: string; color?: string | null }[];
    quantities: {
      category: string;
      item: string;
      quantity: number | null;
      unit: string;
      specification?: string | null;
      confidence: "high" | "medium" | "low";
    }[];
    observations: string[];
    summary: string;
  };
}

// ── Configs ──

const STATUS_CONFIG: Record<PlanStatus, { labelKey: string; color: string; bg: string; icon: React.ElementType }> = {
  active: { labelKey: "statusActive", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: CheckCircle },
  superseded: { labelKey: "statusSuperseded", color: "text-gray-500", bg: "bg-gray-50 border-gray-200", icon: XCircle },
  withdrawn: { labelKey: "statusWithdrawn", color: "text-gray-400", bg: "bg-gray-50 border-gray-200", icon: XCircle },
  for_approval: { labelKey: "statusForApproval", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: Clock },
  approved: { labelKey: "statusApproved", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: CheckCircle },
  rejected: { labelKey: "statusRejected", color: "text-red-600", bg: "bg-red-50 border-red-200", icon: AlertTriangle },
};

const VALIDATION_CONFIG: Record<PlanValidationStatus, { labelKey: string; color: string; bg: string; icon: React.ElementType }> = {
  pending: { labelKey: "validationPending", color: "text-amber-600", bg: "bg-amber-50", icon: Clock },
  approved: { labelKey: "validationApproved", color: "text-green-600", bg: "bg-green-50", icon: CheckCircle },
  rejected: { labelKey: "validationRejected", color: "text-red-600", bg: "bg-red-50", icon: XCircle },
  for_info: { labelKey: "validationForInfo", color: "text-blue-600", bg: "bg-blue-50", icon: Eye },
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

const PLAN_TYPE_KEYS: Record<string, string> = {
  planting: "planTypePlanting",
  network: "planTypeNetwork",
  site_layout: "planTypeSiteLayout",
  electrical: "planTypeElectrical",
  facade: "planTypeFacade",
  structural: "planTypeStructural",
  hvac: "planTypeHvac",
  plumbing: "planTypePlumbing",
  architecture: "planTypeArchitecture",
  other: "planTypeOther",
};

const CONFIDENCE_CONFIG = {
  high: { labelKey: "confidenceHigh", color: "bg-green-500" },
  medium: { labelKey: "confidenceMedium", color: "bg-amber-400" },
  low: { labelKey: "confidenceLow", color: "bg-red-400" },
};

// ── Helpers ──

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${formatDate(dateStr)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Page ──

export default function PlanDetailPage() {
  const params = useParams();
  const planId = params.id as string;
  const t = useTranslations("plans");

  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"viewer" | "versions" | "info" | "analysis">("viewer");

  // Analysis state
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [, setAnalysisCached] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  // Editable quantities state
  const [editMode, setEditMode] = useState(false);
  const [editedQuantities, setEditedQuantities] = useState<Record<string, any>>({});
  const [savingEdits, setSavingEdits] = useState(false);

  const fetchPlan = useCallback(async () => {
    try {
      const res = await fetch(`/api/plans/${planId}`);
      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan || null);
      }
    } catch (err) {
      console.error("Failed to fetch plan:", err);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // Trigger AI analysis
  const handleAnalyze = async (force = false) => {
    if (!plan) return;
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const res = await fetch("/api/ai/analyze-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: plan.id, force }),
      });
      const data = await res.json();
      if (data.success) {
        setAnalysis(data.analysis);
        setAnalysisCached(!!data.cached);
        // Auto-fill plan info from AI analysis (if not cached — first analysis only)
        if (!data.cached && data.analysis?.analysis_result?.title_block) {
          autoFillPlanInfo(data.analysis.analysis_result);
        }
      } else {
        setAnalysisError(data.error || "Erreur lors de l'analyse");
      }
    } catch (err) {
      console.error("[analyze] Error:", err);
      setAnalysisError("Erreur réseau");
    } finally {
      setAnalyzing(false);
    }
  };

  // Copy quantities table
  const handleCopyTable = () => {
    if (!analysis?.analysis_result?.quantities) return;
    const rows = analysis.analysis_result.quantities.map(
      (q) => `${q.category}\t${q.item}\t${q.quantity ?? ""}\t${q.unit}\t${q.specification || ""}`
    );
    const header = "Catégorie\tPoste\tQuantité\tUnité\tSpécification";
    navigator.clipboard.writeText([header, ...rows].join("\n"));
  };

  // Edit quantity helpers
  const getEditKey = (category: string, index: number) => `${category}::${index}`;

  const getEditedValue = (category: string, index: number, field: string, original: any) => {
    const key = getEditKey(category, index);
    if (editedQuantities[key] && field in editedQuantities[key]) {
      return editedQuantities[key][field];
    }
    return original;
  };

  const setEditedValue = (category: string, index: number, field: string, value: any) => {
    const key = getEditKey(category, index);
    setEditedQuantities((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: value },
    }));
  };

  const handleSaveQuantityEdits = async () => {
    if (!analysis?.id || !analysis.analysis_result?.quantities) return;
    setSavingEdits(true);
    try {
      // Apply edits to quantities array
      const updated = analysis.analysis_result.quantities.map((q, globalIdx) => {
        // Find the per-category index
        let catIdx = 0;
        for (let i = 0; i <= globalIdx; i++) {
          if (analysis.analysis_result.quantities[i].category === q.category) {
            if (i < globalIdx) catIdx++;
          }
        }
        const key = getEditKey(q.category, catIdx);
        const edits = editedQuantities[key];
        if (!edits) return q;
        return {
          ...q,
          item: edits.item ?? q.item,
          quantity: edits.quantity !== undefined ? (edits.quantity === "" ? null : Number(edits.quantity)) : q.quantity,
          unit: edits.unit ?? q.unit,
          specification: edits.specification ?? q.specification,
          manually_edited: true,
        };
      });

      const res = await fetch(`/api/ai/analyze-plan/${analysis.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantities: updated }),
      });

      if (res.ok) {
        // Update local state
        setAnalysis({
          ...analysis,
          analysis_result: { ...analysis.analysis_result, quantities: updated },
        });
        setEditMode(false);
        setEditedQuantities({});
      }
    } catch (err) {
      console.error("Failed to save quantity edits:", err);
    } finally {
      setSavingEdits(false);
    }
  };

  // Auto-fill plan info from AI analysis results
  const autoFillPlanInfo = async (result: any) => {
    if (!plan) return;
    const tb = result.title_block;
    const updates: Record<string, any> = {};

    // Only fill fields that are currently empty
    if (!plan.scale && tb?.scale) updates.scale = tb.scale;
    if (!plan.author_name && tb?.author) updates.author_name = tb.author;
    if (!plan.author_company && tb?.company) updates.author_company = tb.company;
    if (!plan.discipline && result.discipline) {
      // Map AI discipline to our enum
      const disc = result.discipline?.toLowerCase() || "";
      const disciplineMap: Record<string, string> = {
        architecture: "architecture", structure: "structure",
        "gros-œuvre": "structure", "gros-oeuvre": "structure",
        cvcs: "cvcs", cvc: "cvcs", chauffage: "cvcs", ventilation: "cvcs",
        "électricité": "electricite", electricite: "electricite", electrical: "electricite",
        sanitaire: "sanitaire", plumbing: "sanitaire",
        "façades": "facades", facades: "facades",
        "aménagement": "amenagement", amenagement: "amenagement", paysagisme: "amenagement",
        plantation: "amenagement",
      };
      for (const [key, val] of Object.entries(disciplineMap)) {
        if (disc.includes(key)) { updates.discipline = val; break; }
      }
    }

    if (Object.keys(updates).length === 0) return;

    try {
      await fetch(`/api/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      // Refresh plan data to reflect changes
      fetchPlan();
    } catch {
      // Silent — not critical
    }
  };

  // Check for cached analysis when switching to analysis tab
  useEffect(() => {
    if (activeTab === "analysis" && plan && !analysis && !analyzing) {
      handleAnalyze(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, plan]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <Link href="/plans" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
            <ArrowLeft className="h-4 w-4" />
            {t("title")}
          </Link>
          <div className="flex flex-col items-center justify-center py-20">
            <FileText className="h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600">{t("planNotFound")}</p>
          </div>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[plan.status];
  const StatusIcon = statusCfg.icon;
  const project = plan.projects;
  const versions = plan.plan_versions || [];
  const currentVersion = versions.find((v) => v.is_current) || versions[0];
  const result = analysis?.analysis_result;

  // Group quantities by category
  const quantityGroups: Record<string, NonNullable<typeof result>["quantities"]> = {};
  if (result?.quantities) {
    for (const q of result.quantities) {
      if (!quantityGroups[q.category]) quantityGroups[q.category] = [];
      quantityGroups[q.category].push(q);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* Back link */}
        <Link href="/plans" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="h-4 w-4" />
          {t("title")}
        </Link>

        {/* Header */}
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg font-bold text-brand">{plan.plan_number}</span>
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                statusCfg.bg, statusCfg.color
              )}>
                <StatusIcon className="h-3.5 w-3.5" />
                {t(statusCfg.labelKey)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5" />
                {t("uploadNewVersion")}
              </button>
              <button className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <Send className="h-3.5 w-3.5" />
                {t("distribute")}
              </button>
            </div>
          </div>

          <h1 className="text-xl font-semibold text-slate-900 mb-2">{plan.plan_title}</h1>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {project && (
              <Link href={`/projects/${project.id}`} className="flex items-center gap-1.5 hover:text-brand transition-colors">
                <span className="h-2 w-2 rounded-full shrink-0 bg-brand" />
                {project.name}
              </Link>
            )}
            {plan.discipline && (
              <>
                <span className="text-slate-300">·</span>
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", DISCIPLINE_COLORS[plan.discipline])}>
                  {t(DISCIPLINE_KEYS[plan.discipline])}
                </span>
              </>
            )}
            {plan.lot_name && <><span className="text-slate-300">·</span><span>{plan.lot_name}</span></>}
            {plan.zone && <><span className="text-slate-300">·</span><span>{plan.zone}</span></>}
            {plan.scale && <><span className="text-slate-300">·</span><span>{plan.scale}</span></>}
          </div>

          {plan.author_company && (
            <p className="mt-2 text-xs text-slate-500">
              {t("author")}: <span className="font-medium text-slate-700">{plan.author_name || plan.author_company}</span>
              {plan.author_name && plan.author_company && ` — ${plan.author_company}`}
            </p>
          )}

          {/* Current version highlight */}
          {currentVersion && (
            <div className="mt-3 flex items-center gap-3 rounded-md bg-blue-50 border border-blue-100 px-3 py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-brand text-white text-sm font-bold">
                {currentVersion.version_code}
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-slate-700">
                  {t("versionCurrent")} — {currentVersion.file_name}
                </p>
                <p className="text-[11px] text-slate-500">
                  {formatDate(currentVersion.version_date)} · {formatFileSize(currentVersion.file_size)}
                </p>
              </div>
              {currentVersion.file_url && (
                <a
                  href={currentVersion.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-md bg-white border border-blue-200 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t("download")}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex items-center gap-1 border-b border-slate-200">
          <button
            onClick={() => setActiveTab("viewer")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === "viewer" ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <Eye className="h-4 w-4" />
            {t("tabViewer")}
          </button>
          <button
            onClick={() => setActiveTab("versions")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === "versions" ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <History className="h-4 w-4" />
            {t("tabVersions")} ({versions.length})
          </button>
          <button
            onClick={() => setActiveTab("info")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === "info" ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <Info className="h-4 w-4" />
            {t("tabInfo")}
          </button>
          <button
            onClick={() => setActiveTab("analysis")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === "analysis" ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <Sparkles className="h-4 w-4" />
            {t("tabAnalysis")}
          </button>
        </div>

        {/* ════════════════════════════ VIEWER TAB ════════════════════════════ */}
        {activeTab === "viewer" && (
          <PlanViewer version={currentVersion} t={t} />
        )}

        {/* ════════════════════════════ VERSIONS TAB ════════════════════════════ */}
        {activeTab === "versions" && (
          <div className="space-y-3">
            {versions.length === 0 && (
              <div className="text-center py-10 text-sm text-slate-400">Aucune version</div>
            )}
            {[...versions].sort((a, b) => b.version_number - a.version_number).map((version) => {
              const validCfg = VALIDATION_CONFIG[version.validation_status] || VALIDATION_CONFIG.pending;
              const ValidIcon = validCfg.icon;
              return (
                <div
                  key={version.id}
                  className={cn(
                    "rounded-lg border bg-white p-4",
                    version.is_current ? "border-brand/30 ring-1 ring-brand/10" : "border-slate-200"
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded text-sm font-bold text-white",
                        version.is_current ? "bg-brand" : "bg-slate-400"
                      )}>
                        {version.version_code}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">Version {version.version_code}</span>
                          {version.is_current && (
                            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">{t("versionCurrent")}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {formatDate(version.version_date)} · {version.file_name} · {formatFileSize(version.file_size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {version.file_url && (
                        <a href={version.file_url} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title={t("download")}>
                          <Download className="h-4 w-4" />
                        </a>
                      )}
                      <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title={t("copyLink")}>
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Source */}
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                    {version.ai_detected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-purple-600">
                        <Sparkles className="h-3 w-3" />
                        {t("sourceAutoDetected")}
                        {version.ai_confidence != null && ` (${Math.round(version.ai_confidence * 100)}%)`}
                      </span>
                    )}
                  </div>

                  {/* AI changes */}
                  {version.ai_changes_detected && (
                    <div className="mb-2 rounded-md bg-amber-50 border border-amber-100 px-3 py-2">
                      <p className="text-[11px] font-medium text-amber-700 mb-0.5">{t("changesDetected")}:</p>
                      <p className="text-[11px] text-amber-600">{version.ai_changes_detected}</p>
                    </div>
                  )}

                  {/* Validation */}
                  <div className="flex items-center gap-4 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-slate-400" />
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", validCfg.bg, validCfg.color)}>
                        <ValidIcon className="h-3 w-3" />
                        {t(validCfg.labelKey)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ════════════════════════════ INFO TAB ════════════════════════════ */}
        {activeTab === "info" && (
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colNumber")}</p>
                <p className="font-mono font-medium text-slate-800">{plan.plan_number}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colTitle")}</p>
                <p className="text-slate-800">{plan.plan_title}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colProject")}</p>
                {project ? (
                  <Link href={`/projects/${project.id}`} className="flex items-center gap-1.5 text-slate-800 hover:text-brand">
                    <span className="h-2 w-2 rounded-full bg-brand" />
                    {project.name}
                  </Link>
                ) : (
                  <p className="text-slate-400">—</p>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colDiscipline")}</p>
                {plan.discipline ? (
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", DISCIPLINE_COLORS[plan.discipline])}>
                    {t(DISCIPLINE_KEYS[plan.discipline])}
                  </span>
                ) : <p className="text-slate-400">—</p>}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colScale")}</p>
                <p className="text-slate-800">{plan.scale || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colAuthor")}</p>
                <p className="text-slate-800">
                  {plan.author_name || "—"}
                  {plan.author_company && <span className="text-slate-500"> — {plan.author_company}</span>}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colZone")}</p>
                <p className="text-slate-800">{plan.zone || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("createdAt")}</p>
                <p className="text-slate-800">{formatDateTime(plan.created_at)}</p>
              </div>
            </div>
            {plan.notes && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("notes")}</p>
                <p className="text-sm text-slate-700">{plan.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════ ANALYSIS TAB ════════════════════════════ */}
        {activeTab === "analysis" && (
          <div className="space-y-4">
            {/* Loading state */}
            {analyzing && (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-16">
                <Loader2 className="h-10 w-10 animate-spin text-brand mb-4" />
                <p className="text-sm font-medium text-slate-600">{t("analyzing")}</p>
                <p className="mt-1 text-xs text-slate-400">L&apos;IA analyse le plan comme un métreur professionnel...</p>
              </div>
            )}

            {/* Error state */}
            {analysisError && !analyzing && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {analysisError}
              </div>
            )}

            {/* Empty state — no analysis yet */}
            {!analysis && !analyzing && !analysisError && (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-16">
                <Sparkles className="h-12 w-12 text-slate-300 mb-3" />
                <p className="text-sm font-medium text-slate-600">{t("noAnalysisYet")}</p>
                <p className="mt-1 text-xs text-slate-400 max-w-sm text-center">{t("noAnalysisDesc")}</p>
                <button
                  onClick={() => handleAnalyze(false)}
                  className="mt-4 flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
                >
                  <Sparkles className="h-4 w-4" />
                  {t("analyzeWithAI")}
                </button>
              </div>
            )}

            {/* Analysis result */}
            {result && !analyzing && (
              <>
                {/* Header bar */}
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5 text-brand" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {t(PLAN_TYPE_KEYS[result.plan_type] || "planTypeOther")}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {result.discipline}
                        {analysis.analysis_duration_ms && ` · ${t("analysisTime", { seconds: (analysis.analysis_duration_ms / 1000).toFixed(1) })}`}
                        {analysis.analyzed_at && ` · ${t("analysisCached", { date: formatDateTime(analysis.analyzed_at) })}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAnalyze(true)}
                    disabled={analyzing}
                    className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("reAnalyze")}
                  </button>
                </div>

                {/* Title block */}
                {result.title_block && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{t("titleBlock")}</h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                      {result.title_block.plan_number && (
                        <div><p className="text-[10px] text-slate-400">N°</p><p className="font-mono font-medium text-slate-800">{result.title_block.plan_number}</p></div>
                      )}
                      {result.title_block.plan_title && (
                        <div className="col-span-2 sm:col-span-3"><p className="text-[10px] text-slate-400">Titre</p><p className="text-slate-800">{result.title_block.plan_title}</p></div>
                      )}
                      {result.title_block.scale && (
                        <div><p className="text-[10px] text-slate-400">Échelle</p><p className="text-slate-800">{result.title_block.scale}</p></div>
                      )}
                      {result.title_block.date && (
                        <div><p className="text-[10px] text-slate-400">Date</p><p className="text-slate-800">{result.title_block.date}</p></div>
                      )}
                      {result.title_block.company && (
                        <div><p className="text-[10px] text-slate-400">Bureau</p><p className="text-slate-800">{result.title_block.company}</p></div>
                      )}
                      {result.title_block.revision && (
                        <div><p className="text-[10px] text-slate-400">Indice</p><p className="font-mono font-bold text-slate-800">{result.title_block.revision}</p></div>
                      )}
                    </div>
                  </div>
                )}

                {/* Legend */}
                {result.legend_items.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{t("legendLabel")}</h3>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {result.legend_items.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          {item.color && (
                            <span className="h-3 w-3 rounded-full shrink-0 border border-slate-200" style={{ backgroundColor: item.color }} />
                          )}
                          <span className="text-xs font-medium text-slate-700">{item.symbol}</span>
                          <span className="text-xs text-slate-500">— {item.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quantities table */}
                {result.quantities.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("quantitiesLabel")}</h3>
                      <div className="flex items-center gap-2">
                        {editMode ? (
                          <>
                            <button
                              onClick={() => { setEditMode(false); setEditedQuantities({}); }}
                              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
                            >
                              <X className="h-3.5 w-3.5" />
                              Annuler
                            </button>
                            <button
                              onClick={handleSaveQuantityEdits}
                              disabled={savingEdits}
                              className="flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand/90"
                            >
                              {savingEdits ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                              Enregistrer
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditMode(true)}
                              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Corriger
                            </button>
                            <button
                              onClick={handleCopyTable}
                              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
                            >
                              <ClipboardCopy className="h-3.5 w-3.5" />
                              {t("copyTable")}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("colItem")}</th>
                          <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("colQuantity")}</th>
                          <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("colUnit")}</th>
                          <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 hidden sm:table-cell">{t("colSpecification")}</th>
                          <th className="px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("colConfidence")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(quantityGroups).map(([category, items]) => (
                          <>{/* Category header row */}
                            <tr key={`cat-${category}`} className="bg-slate-50">
                              <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold text-slate-700">{category}</td>
                            </tr>
                            {items.map((q, i) => (
                              <tr key={`${category}-${i}`} className={cn("border-b border-slate-50", editMode ? "bg-blue-50/20" : "hover:bg-slate-50/30")}>
                                <td className="px-4 py-2 text-xs text-slate-700">
                                  {editMode ? (
                                    <input
                                      type="text"
                                      value={getEditedValue(category, i, "item", q.item)}
                                      onChange={(e) => setEditedValue(category, i, "item", e.target.value)}
                                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand focus:outline-none"
                                    />
                                  ) : q.item}
                                </td>
                                <td className="px-4 py-2 text-right text-xs font-semibold text-slate-900 tabular-nums">
                                  {editMode ? (
                                    <input
                                      type="number"
                                      value={getEditedValue(category, i, "quantity", q.quantity ?? "")}
                                      onChange={(e) => setEditedValue(category, i, "quantity", e.target.value)}
                                      className="w-20 rounded border border-slate-200 px-2 py-1 text-xs text-right focus:border-brand focus:outline-none"
                                    />
                                  ) : q.quantity != null ? q.quantity.toLocaleString("fr-CH") : "—"}
                                </td>
                                <td className="px-4 py-2 text-xs text-slate-500">
                                  {editMode ? (
                                    <input
                                      type="text"
                                      value={getEditedValue(category, i, "unit", q.unit)}
                                      onChange={(e) => setEditedValue(category, i, "unit", e.target.value)}
                                      className="w-16 rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand focus:outline-none"
                                    />
                                  ) : q.unit}
                                </td>
                                <td className="px-4 py-2 text-xs text-slate-500 hidden sm:table-cell">
                                  {editMode ? (
                                    <input
                                      type="text"
                                      value={getEditedValue(category, i, "specification", q.specification || "")}
                                      onChange={(e) => setEditedValue(category, i, "specification", e.target.value)}
                                      className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand focus:outline-none"
                                    />
                                  ) : q.specification || "—"}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <span
                                    className={cn("inline-block h-2.5 w-2.5 rounded-full", CONFIDENCE_CONFIG[q.confidence].color)}
                                    title={t(CONFIDENCE_CONFIG[q.confidence].labelKey)}
                                  />
                                </td>
                              </tr>
                            ))}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Observations */}
                {result.observations.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{t("observationsLabel")}</h3>
                    <ul className="space-y-2">
                      {result.observations.map((obs, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                          <Eye className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                          {obs}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Summary */}
                {result.summary && (
                  <div className="rounded-lg border border-slate-200 bg-blue-50 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("summaryLabel")}</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">{result.summary}</p>
                  </div>
                )}

                {/* CTA — Chiffrage automatique */}
                {result.quantities.length > 0 && (
                  <div className="rounded-lg border-2 border-dashed border-brand/30 bg-brand/5 p-6 text-center">
                    <Calculator className="h-8 w-8 text-brand mx-auto mb-2" />
                    <h3 className="text-sm font-semibold text-slate-800">Chiffrage automatique</h3>
                    <p className="text-xs text-slate-500 mt-1 mb-4 max-w-md mx-auto">
                      Estimez automatiquement les coûts à partir des {result.quantities.length} postes extraits ci-dessus
                    </p>
                    <Link
                      href={`/cantaia-prix?plan_id=${plan.id}&analysis_id=${analysis?.id || ""}`}
                      className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
                    >
                      <Calculator className="h-4 w-4" />
                      Estimer les coûts
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Plan Viewer Component ──

function PlanViewer({ version, t }: { version: PlanVersion | undefined; t: any }) {
  const [viewerLoading, setViewerLoading] = useState(true);
  const [zoom, setZoom] = useState(100);
  const containerRef = useRef<HTMLDivElement>(null);

  if (!version?.file_url) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-col items-center justify-center py-20">
          <FileText className="h-12 w-12 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">{t("noFileAvailable")}</p>
        </div>
      </div>
    );
  }

  const isImage = version.file_type?.startsWith("image/");

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 bg-slate-50">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <FileText className="h-4 w-4 text-slate-400" />
          <span className="font-medium truncate max-w-[200px]">{version.file_name}</span>
          <span className="text-slate-300">·</span>
          <span className="text-xs text-slate-400">{formatFileSize(version.file_size)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isImage && (
            <>
              <button
                onClick={() => setZoom((z) => Math.max(25, z - 25))}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                title="Zoom -"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-500 min-w-[3rem] text-center">{zoom}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(400, z + 25))}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                title="Zoom +"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <div className="w-px h-4 bg-slate-200 mx-1" />
            </>
          )}
          <a
            href={version.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("openNewTab")}
          </a>
          <a
            href={version.file_url}
            download={version.file_name}
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            {t("download")}
          </a>
        </div>
      </div>

      {/* Content */}
      <div ref={containerRef} className="relative bg-slate-100" style={{ height: "80vh" }}>
        {/* Loading overlay */}
        {viewerLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
            <p className="text-sm text-slate-500">{t("loadingViewer")}</p>
          </div>
        )}

        {isImage ? (
          <div className="h-full overflow-auto flex items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={version.file_url}
              alt={version.file_name}
              onLoad={() => setViewerLoading(false)}
              style={{ width: `${zoom}%`, maxWidth: "none" }}
              className="object-contain rounded shadow-sm"
            />
          </div>
        ) : (
          <object
            data={`${version.file_url}#toolbar=1&navpanes=0&view=FitH`}
            type="application/pdf"
            className="w-full h-full"
            onLoad={() => setViewerLoading(false)}
          >
            {/* Fallback if browser can't render PDF inline */}
            <div className="flex flex-col items-center justify-center h-full">
              <FileText className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-sm text-slate-600 mb-3">{t("pdfCannotDisplay")}</p>
              <a
                href={version.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
              >
                <ExternalLink className="h-4 w-4" />
                {t("openNewTab")}
              </a>
            </div>
          </object>
        )}
      </div>
    </div>
  );
}
