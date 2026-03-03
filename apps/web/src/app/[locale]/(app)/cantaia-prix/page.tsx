"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Calculator,
  Loader2,
  Download,
  ChevronDown,
  Clock,
  BarChart3,
  FileText,
  MapPin,
  Truck,
  Percent,
  Database,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Eye,
  Mail,
  ChevronRight,
  Upload,
  Package,
} from "lucide-react";
import { cn } from "@cantaia/ui";

// ── Types ──

interface PlanOption {
  id: string;
  plan_number: string;
  plan_title: string;
  project?: { id: string; name: string } | null;
}

interface PricingConfig {
  hourly_rate: number;
  site_location: string;
  departure_location: string;
  margin_level: "tight" | "standard" | "comfortable";
  default_exclusions: string[];
  default_scope: "general" | "line_by_line";
}

interface EstimateLineItem {
  category: string;
  item: string;
  quantity: number | null;
  unit: string;
  unit_price: number;
  total_price: number;
  confidence: "high" | "medium" | "low";
  source: "db_historical" | "ai_knowledge";
  cfc_code?: string;
  source_detail?: string;
  db_matches?: number;
  margin_applied?: number;
  price_range?: { min: number; max: number; median: number };
}

interface EstimateResult {
  line_items: EstimateLineItem[];
  subtotal: number;
  margin_total: number;
  transport_cost: number;
  grand_total: number;
  db_coverage_percent: number;
  confidence_summary: { high: number; medium: number; low: number };
}

interface AnalysisData {
  id: string;
  analysis_result?: {
    quantities?: Array<{
      item: string;
      quantity: number;
      unit: string;
    }>;
  };
  plan_id?: string;
}

// ── Helpers ──

function formatCHF(amount: number): string {
  return new Intl.NumberFormat("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function exportCSV(items: EstimateLineItem[], totals: { subtotal: number; margin: number; transport: number; grand: number }) {
  const header = "Poste;Qté;Unité;PU (CHF);Total (CHF);Confiance;Source\n";
  const rows = items
    .map(
      (item) =>
        `"${item.item}";${item.quantity ?? 0};"${item.unit}";${item.unit_price.toFixed(2)};${item.total_price.toFixed(2)};${item.confidence};${item.source === "db_historical" ? "BD" : "IA"}`
    )
    .join("\n");
  const summary = `\n\nSous-total;;;;;;${totals.subtotal.toFixed(2)}\nMarge;;;;;;${totals.margin.toFixed(2)}\nTransport;;;;;;${totals.transport.toFixed(2)}\nTotal estimé;;;;;;${totals.grand.toFixed(2)}`;
  const csv = header + rows + summary;
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cantaia-estimation-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const MARGIN_OPTIONS = [
  { value: "tight" as const, label: "Serré (5%)", percent: 5 },
  { value: "standard" as const, label: "Standard (12%)", percent: 12 },
  { value: "comfortable" as const, label: "Confortable (20%)", percent: 20 },
];

const DEFAULT_CONFIG: PricingConfig = {
  hourly_rate: 95,
  site_location: "",
  departure_location: "",
  margin_level: "standard",
  default_exclusions: [],
  default_scope: "line_by_line",
};

type Tab = "estimate" | "history" | "benchmark";

// ── Page ──

export default function CantaiaPrixPage() {
  const searchParams = useSearchParams();
  const urlPlanId = searchParams.get("plan_id");
  const urlAnalysisId = searchParams.get("analysis_id");

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>("estimate");

  // Config state
  const [config, setConfig] = useState<PricingConfig>(DEFAULT_CONFIG);
  const [, setConfigLoaded] = useState(false);
  const [exclusionsText, setExclusionsText] = useState("");
  const [context, setContext] = useState("");
  const [scope, setScope] = useState<"general" | "line_by_line">("line_by_line");

  // Plans
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [plansLoading, setPlansLoading] = useState(true);
  const [showPlanDropdown, setShowPlanDropdown] = useState(false);

  // Analysis auto-load
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // Estimation
  const [estimating, setEstimating] = useState(false);
  const [estimateResult, setEstimateResult] = useState<EstimateResult | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  // History
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<any | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);

  // Benchmark / file extraction
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null);
  const [extractionProgress, setExtractionProgress] = useState({ total: 0, processed: 0, withPrices: 0, items: 0, errors: 0 });
  const [extractionResults, setExtractionResults] = useState<any[]>([]);
  const [extractionRunning, setExtractionRunning] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedExtractions, setSelectedExtractions] = useState<Set<string>>(new Set());
  const [expandedExtraction, setExpandedExtraction] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // Benchmark analysis
  const [benchmarkView, setBenchmarkView] = useState<"upload" | "analysis">("upload");
  const [benchmarkData, setBenchmarkData] = useState<any[]>([]);
  const [benchmarkSummary, setBenchmarkSummary] = useState<any | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkSearch, setBenchmarkSearch] = useState("");
  const [benchmarkProjectFilter, setBenchmarkProjectFilter] = useState<string>("");
  const [expandedBenchmarkItem, setExpandedBenchmarkItem] = useState<string | null>(null);

  // Projects list for filter
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // ── Load config from API ──
  useEffect(() => {
    fetch("/api/pricing/config")
      .then((r) => r.json())
      .then((d) => {
        if (d.config) {
          setConfig(d.config);
          setExclusionsText((d.config.default_exclusions || []).join(", "));
          setScope(d.config.default_scope || "line_by_line");
        }
        setConfigLoaded(true);
      })
      .catch(() => setConfigLoaded(true));
  }, []);

  // ── Load plans from API ──
  useEffect(() => {
    fetch("/api/plans")
      .then((r) => r.json())
      .then((d) => {
        const plansList = (d.plans || []).map((p: any) => ({
          id: p.id,
          plan_number: p.plan_number,
          plan_title: p.plan_title,
          project: p.project,
        }));
        setPlans(plansList);
        if (urlPlanId) {
          setSelectedPlanId(urlPlanId);
        }
      })
      .catch(() => {})
      .finally(() => setPlansLoading(false));
  }, [urlPlanId]);

  // ── Auto-load analysis if analysis_id in URL ──
  useEffect(() => {
    if (!urlAnalysisId) return;
    setAnalysisLoading(true);
    // Fetch analysis data — use the analyze-plan endpoint with the analysisId
    // We need to fetch it via the plan_analyses data
    fetch(`/api/ai/analyze-plan/${urlAnalysisId}`, { method: "GET" })
      .then((r) => {
        if (!r.ok) throw new Error("Analysis not found");
        return r.json();
      })
      .then((d) => {
        if (d.analysis) {
          setAnalysisData(d.analysis);
          if (d.analysis.plan_id && !selectedPlanId) {
            setSelectedPlanId(d.analysis.plan_id);
          }
        }
      })
      .catch(() => {
        // Try fetching via POST as fallback — the GET might not exist
        setAnalysisData(null);
      })
      .finally(() => setAnalysisLoading(false));
  }, [urlAnalysisId]);

  // ── Load estimation history ──
  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    fetch("/api/pricing/estimates")
      .then((r) => r.json())
      .then((d) => {
        if (d.estimates) setHistory(d.estimates);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ── Load projects for benchmark filter ──
  useEffect(() => {
    fetch("/api/projects/list")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.projects || d || []).map((p: any) => ({ id: p.id, name: p.name }));
        setProjects(list);
      })
      .catch(() => {});
  }, []);

  // ── Load benchmark data ──
  const loadBenchmark = useCallback(async (projectFilter?: string) => {
    setBenchmarkLoading(true);
    try {
      const url = projectFilter
        ? `/api/pricing/benchmark?project_id=${projectFilter}`
        : "/api/pricing/benchmark";
      const res = await fetch(url);
      const data = await res.json();
      setBenchmarkData(data.items || []);
      setBenchmarkSummary(data.summary || null);
      if (data.items?.length > 0) {
        setBenchmarkView("analysis");
      }
    } catch {
      setBenchmarkData([]);
      setBenchmarkSummary(null);
    } finally {
      setBenchmarkLoading(false);
    }
  }, []);

  // Auto-load benchmark on tab switch
  useEffect(() => {
    if (activeTab === "benchmark" && benchmarkData.length === 0 && !benchmarkLoading) {
      loadBenchmark();
    }
  }, [activeTab]);

  // ── Filtered benchmark data ──
  const filteredBenchmark = useMemo(() => {
    if (!benchmarkSearch.trim()) return benchmarkData;
    const q = benchmarkSearch.toLowerCase();
    return benchmarkData.filter((item: any) =>
      (item.display_description || "").toLowerCase().includes(q) ||
      (item.cfc_subcode || "").toLowerCase().includes(q) ||
      (item.normalized_key || "").includes(q)
    );
  }, [benchmarkData, benchmarkSearch]);

  // ── Accepted file extensions for benchmark upload ──
  const ACCEPTED_EXTENSIONS = [".eml", ".msg", ".pdf", ".txt", ".html", ".htm"];
  const BATCH_SIZE = 3;

  // ── Handle file drop / selection ──
  const handleFilesSelected = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter((f) => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      return ACCEPTED_EXTENSIONS.includes(ext);
    });
    setUploadedFiles((prev) => [...prev, ...valid]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Start extraction from uploaded files ──
  const startExtraction = useCallback(async () => {
    if (uploadedFiles.length === 0) return;
    setExtractionRunning(true);
    setExtractionStatus("extracting");
    setExtractionResults([]);
    setImportResult(null);
    setSelectedExtractions(new Set());
    setExtractionProgress({ total: uploadedFiles.length, processed: 0, withPrices: 0, items: 0, errors: 0 });

    const allResults: any[] = [];
    let processed = 0;
    let withPrices = 0;
    let items = 0;
    let errors = 0;

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < uploadedFiles.length; i += BATCH_SIZE) {
      const batch = uploadedFiles.slice(i, i + BATCH_SIZE);
      const formData = new FormData();
      for (const file of batch) {
        formData.append("files", file);
      }

      try {
        const res = await fetch("/api/pricing/extract-from-files", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          errors += batch.length;
          setExtractionProgress({ total: uploadedFiles.length, processed: processed + batch.length, withPrices, items, errors });
          processed += batch.length;
          continue;
        }

        processed += data.files_processed || batch.length;
        if (data.errors?.length) errors += data.errors.length;

        for (const r of data.results || []) {
          if (r.has_prices) {
            allResults.push(r);
            withPrices++;
            items += r.line_items?.length || 0;
          }
        }

        setExtractionProgress({ total: uploadedFiles.length, processed, withPrices, items, errors });
        setExtractionResults([...allResults]);
        setSelectedExtractions(new Set(allResults.map((r: any) => r.emailId)));
      } catch (err: any) {
        errors += batch.length;
        processed += batch.length;
        setExtractionProgress({ total: uploadedFiles.length, processed, withPrices, items, errors });
      }
    }

    setExtractionStatus("preview_ready");
    setExtractionRunning(false);
  }, [uploadedFiles]);

  // ── Import confirmed results ──
  const handleImport = useCallback(async () => {
    const confirmed = extractionResults.filter((r: any) => selectedExtractions.has(r.emailId));
    if (confirmed.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch("/api/pricing/extract-from-files/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results: confirmed }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setImportResult(data);
        setExtractionStatus("completed");
        // Auto-load benchmark after import
        loadBenchmark();
      } else {
        setExtractionStatus(`error: ${data.error || "Import failed"}`);
      }
    } catch (err: any) {
      setExtractionStatus(`error: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }, [extractionResults, selectedExtractions]);

  // ── Load single estimate detail ──
  const openHistoryDetail = useCallback((estimateId: string) => {
    setHistoryDetailLoading(true);
    setHistoryDetail(null);
    fetch(`/api/pricing/estimates/${estimateId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.estimate) setHistoryDetail(d.estimate);
      })
      .catch(() => {})
      .finally(() => setHistoryDetailLoading(false));
  }, []);

  // ── Run estimation ──
  const handleEstimate = useCallback(async () => {
    setEstimating(true);
    setEstimateError(null);
    setEstimateResult(null);

    // Determine which analysis_id to use
    const analysisId = urlAnalysisId || analysisData?.id;

    if (!analysisId && !selectedPlanId) {
      setEstimateError("Veuillez sélectionner un plan ou fournir un analysis_id.");
      setEstimating(false);
      return;
    }

    // If we have a plan but no analysis, we need to run analysis first
    let finalAnalysisId = analysisId;
    if (!finalAnalysisId && selectedPlanId) {
      try {
        const analyzeRes = await fetch("/api/ai/analyze-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan_id: selectedPlanId }),
        });
        const analyzeData = await analyzeRes.json();
        if (!analyzeRes.ok || !analyzeData.success) {
          setEstimateError(analyzeData.error || "Erreur lors de l'analyse du plan.");
          setEstimating(false);
          return;
        }
        finalAnalysisId = analyzeData.analysis?.id;
        setAnalysisData(analyzeData.analysis);
      } catch (err: any) {
        setEstimateError(err.message || "Erreur lors de l'analyse du plan.");
        setEstimating(false);
        return;
      }
    }

    if (!finalAnalysisId) {
      setEstimateError("Impossible de déterminer l'analyse à utiliser.");
      setEstimating(false);
      return;
    }

    // Build config payload
    const estimateConfig = {
      hourly_rate: config.hourly_rate,
      site_location: config.site_location,
      departure_location: config.departure_location,
      margin_level: config.margin_level,
      default_exclusions: exclusionsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      default_scope: scope,
      context: context || undefined,
    };

    try {
      const res = await fetch("/api/pricing/estimate-from-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: selectedPlanId || analysisData?.plan_id,
          analysis_id: finalAnalysisId,
          config: estimateConfig,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setEstimateError(data.error || "Erreur lors de l'estimation.");
      } else {
        setEstimateResult(data.estimate);
        loadHistory(); // refresh history after successful estimation
      }
    } catch (err: any) {
      setEstimateError(err.message || "Erreur réseau.");
    } finally {
      setEstimating(false);
    }
  }, [config, exclusionsText, scope, context, selectedPlanId, urlAnalysisId, analysisData, loadHistory]);

  // ── Selected plan display ──
  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId),
    [plans, selectedPlanId]
  );

  // ── Confidence dot colors ──
  function confidenceColor(level: "high" | "medium" | "low") {
    switch (level) {
      case "high":
        return "bg-green-500";
      case "medium":
        return "bg-amber-500";
      case "low":
        return "bg-red-500";
    }
  }

  function confidenceLabel(level: "high" | "medium" | "low") {
    switch (level) {
      case "high":
        return "Élevée";
      case "medium":
        return "Moyenne";
      case "low":
        return "Faible";
    }
  }

  // ── Check if we can estimate ──
  const canEstimate = selectedPlanId || urlAnalysisId;

  // ── Quantities preview from analysis ──
  const quantitiesPreview = analysisData?.analysis_result?.quantities;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10">
              <Calculator className="h-5 w-5 text-brand" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Cantaia Prix</h1>
              <p className="text-sm text-slate-500">
                Estimation automatique des coûts pour vos projets de construction
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg bg-slate-100 p-0.5 w-fit">
          <button
            onClick={() => setActiveTab("estimate")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              activeTab === "estimate"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Calculator className="h-3.5 w-3.5" />
            Demande de chiffrage
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              activeTab === "history"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            Historique
          </button>
          <button
            onClick={() => setActiveTab("benchmark")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
              activeTab === "benchmark"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Benchmark
          </button>
        </div>

        {/* ═══════════════════════════════════════════ */}
        {/* TAB 1: Demande de chiffrage                */}
        {/* ═══════════════════════════════════════════ */}
        {activeTab === "estimate" && (
          <div className="space-y-6">
            {/* Config section */}
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-800">
                Configuration
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Taux horaire */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Taux horaire ouvrier
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={config.hourly_rate}
                      onChange={(e) =>
                        setConfig({ ...config, hourly_rate: Number(e.target.value) || 0 })
                      }
                      className="w-full rounded-md border border-slate-200 bg-white py-2 pl-3 pr-14 text-sm text-slate-700 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                      CHF/h
                    </span>
                  </div>
                </div>

                {/* Lieu du chantier */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    <MapPin className="mr-1 inline h-3 w-3" />
                    Lieu du chantier
                  </label>
                  <input
                    type="text"
                    value={config.site_location}
                    onChange={(e) =>
                      setConfig({ ...config, site_location: e.target.value })
                    }
                    placeholder="ex: Lausanne, VD"
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>

                {/* Lieu de départ */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    <Truck className="mr-1 inline h-3 w-3" />
                    Lieu de départ
                  </label>
                  <input
                    type="text"
                    value={config.departure_location}
                    onChange={(e) =>
                      setConfig({ ...config, departure_location: e.target.value })
                    }
                    placeholder="ex: Bussigny, VD"
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>

              {/* Margin level */}
              <div className="mt-4">
                <label className="mb-2 block text-xs font-medium text-slate-600">
                  <Percent className="mr-1 inline h-3 w-3" />
                  Niveau de marge
                </label>
                <div className="flex gap-2">
                  {MARGIN_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setConfig({ ...config, margin_level: opt.value })
                      }
                      className={cn(
                        "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
                        config.margin_level === opt.value
                          ? "border-brand bg-brand/5 text-brand"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scope toggle */}
              <div className="mt-4">
                <label className="mb-2 block text-xs font-medium text-slate-600">
                  Périmètre
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setScope("general")}
                    className={cn(
                      "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
                      scope === "general"
                        ? "border-brand bg-brand/5 text-brand"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    Estimation globale
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope("line_by_line")}
                    className={cn(
                      "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
                      scope === "line_by_line"
                        ? "border-brand bg-brand/5 text-brand"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    Chiffrage poste par poste
                  </button>
                </div>
              </div>

              {/* Exclusions */}
              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Exclusions
                </label>
                <input
                  type="text"
                  value={exclusionsText}
                  onChange={(e) => setExclusionsText(e.target.value)}
                  placeholder="ex: honoraires architecte, mobilier, aménagement extérieur"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Séparez les éléments par des virgules
                </p>
              </div>

              {/* Context textarea */}
              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  À quoi concerne cette demande
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={3}
                  placeholder="ex: Rénovation complète d'un immeuble locatif de 12 appartements, 3 étages, construction 1970..."
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand resize-none"
                />
              </div>
            </div>

            {/* Plan selection */}
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-800">
                <FileText className="mr-1.5 inline h-4 w-4" />
                Sélection du plan
              </h2>

              {urlAnalysisId && analysisData ? (
                <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3">
                  <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Chargé automatiquement depuis l'analyse du plan
                    </p>
                    {quantitiesPreview && (
                      <p className="mt-0.5 text-xs text-green-600">
                        {quantitiesPreview.length} poste(s) de quantité détecté(s)
                      </p>
                    )}
                  </div>
                </div>
              ) : analysisLoading ? (
                <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement de l'analyse...
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPlanDropdown(!showPlanDropdown)}
                    disabled={plansLoading}
                    className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
                  >
                    <span className={selectedPlan ? "text-slate-900" : "text-slate-400"}>
                      {plansLoading
                        ? "Chargement des plans..."
                        : selectedPlan
                          ? `${selectedPlan.plan_number} — ${selectedPlan.plan_title}`
                          : "Sélectionner un plan..."}
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </button>

                  {showPlanDropdown && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                      {plans.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-slate-400">
                          Aucun plan disponible
                        </p>
                      ) : (
                        plans.map((plan) => (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => {
                              setSelectedPlanId(plan.id);
                              setShowPlanDropdown(false);
                              setAnalysisData(null);
                            }}
                            className={cn(
                              "flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-50",
                              selectedPlanId === plan.id &&
                                "bg-brand/5 font-medium"
                            )}
                          >
                            <span className="text-sm text-slate-900">
                              <span className="font-mono text-xs text-brand">
                                {plan.plan_number}
                              </span>{" "}
                              — {plan.plan_title}
                            </span>
                            {plan.project && (
                              <span className="mt-0.5 text-[11px] text-slate-400">
                                {plan.project.name}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Quantities preview */}
              {quantitiesPreview && quantitiesPreview.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-slate-500">
                    Quantités détectées ({quantitiesPreview.length})
                  </p>
                  <div className="max-h-40 overflow-y-auto rounded-md border border-slate-100 bg-slate-50 p-2">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400">
                          <th className="pb-1 text-left font-medium">Poste</th>
                          <th className="pb-1 text-right font-medium">Qté</th>
                          <th className="pb-1 text-left pl-2 font-medium">Unité</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {quantitiesPreview.map((q, idx) => (
                          <tr key={idx}>
                            <td className="py-1 text-slate-700">{q.item}</td>
                            <td className="py-1 text-right font-mono text-slate-600">
                              {q.quantity}
                            </td>
                            <td className="py-1 pl-2 text-slate-500">{q.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Estimate button */}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={handleEstimate}
                  disabled={!canEstimate || estimating}
                  className="inline-flex items-center gap-2 rounded-md bg-gold px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {estimating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Estimation en cours...
                    </>
                  ) : (
                    <>
                      <Calculator className="h-4 w-4" />
                      Lancer l'estimation
                    </>
                  )}
                </button>
                {!canEstimate && (
                  <p className="mt-2 text-xs text-slate-400">
                    Sélectionnez un plan pour lancer l'estimation.
                  </p>
                )}
              </div>
            </div>

            {/* Error */}
            {estimateError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-medium text-red-800">
                    Erreur lors de l'estimation
                  </p>
                  <p className="mt-0.5 text-xs text-red-600">{estimateError}</p>
                </div>
              </div>
            )}

            {/* Estimation loading state */}
            {estimating && (
              <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white py-12">
                <Loader2 className="h-8 w-8 animate-spin text-brand" />
                <p className="mt-3 text-sm font-medium text-slate-600">
                  Analyse et estimation en cours...
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Cela peut prendre 15 à 30 secondes
                </p>
              </div>
            )}

            {/* Results */}
            {estimateResult && !estimating && (
              <div className="space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-medium uppercase text-slate-400">
                      Sous-total
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatCHF(estimateResult.subtotal)}
                    </p>
                    <p className="text-[10px] text-slate-400">CHF</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-medium uppercase text-slate-400">
                      Marge
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatCHF(estimateResult.margin_total)}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {MARGIN_OPTIONS.find((m) => m.value === config.margin_level)?.label || ""}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-medium uppercase text-slate-400">
                      Transport
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatCHF(estimateResult.transport_cost)}
                    </p>
                    <p className="text-[10px] text-slate-400">CHF</p>
                  </div>
                  <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
                    <p className="text-[11px] font-medium uppercase text-brand">
                      Total estimé
                    </p>
                    <p className="mt-1 text-lg font-bold text-brand">
                      {formatCHF(estimateResult.grand_total)}
                    </p>
                    <p className="text-[10px] text-brand/70">CHF TTC</p>
                  </div>
                </div>

                {/* Coverage & confidence */}
                <div className="flex flex-wrap items-center gap-4 rounded-md border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-slate-700">
                      Couverture BD :{" "}
                      <span className="font-semibold">
                        {estimateResult.db_coverage_percent}%
                      </span>
                    </span>
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{
                          width: `${Math.min(100, estimateResult.db_coverage_percent)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-3 text-xs text-slate-600">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      Élevée: {estimateResult.confidence_summary?.high || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Moyenne: {estimateResult.confidence_summary?.medium || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      Faible: {estimateResult.confidence_summary?.low || 0}
                    </span>
                  </div>
                </div>

                {/* Export button */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      exportCSV(estimateResult.line_items, {
                        subtotal: estimateResult.subtotal,
                        margin: estimateResult.margin_total,
                        transport: estimateResult.transport_cost,
                        grand: estimateResult.grand_total,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    <Download className="h-4 w-4" />
                    Exporter CSV
                  </button>
                </div>

                {/* Results table */}
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Poste
                        </th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Qté
                        </th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Unité
                        </th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          PU (CHF)
                        </th>
                        <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Total (CHF)
                        </th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Confiance
                        </th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Source
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {estimateResult.line_items.map((item, idx) => (
                        <tr
                          key={idx}
                          className="transition-colors hover:bg-slate-50/50"
                        >
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-slate-800">
                              {item.item}
                            </p>
                            {item.cfc_code && (
                              <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                                {item.cfc_code}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                            {item.quantity}
                          </td>
                          <td className="px-3 py-2.5 text-center text-xs text-slate-500">
                            {item.unit}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                            {formatCHF(item.unit_price)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-medium text-slate-900">
                            {formatCHF(item.total_price)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full",
                                  confidenceColor(item.confidence)
                                )}
                              />
                              <span className="text-xs text-slate-500">
                                {confidenceLabel(item.confidence)}
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {item.source === "db_historical" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                <Database className="h-3 w-3" />
                                BD
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                                <Sparkles className="h-3 w-3" />
                                IA
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                        <td
                          colSpan={4}
                          className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-slate-500"
                        >
                          Sous-total
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">
                          {formatCHF(estimateResult.subtotal)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                      <tr className="bg-slate-50/80">
                        <td
                          colSpan={4}
                          className="px-3 py-2 text-right text-xs text-slate-500"
                        >
                          Marge ({MARGIN_OPTIONS.find((m) => m.value === config.margin_level)?.label})
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">
                          {formatCHF(estimateResult.margin_total)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                      <tr className="bg-slate-50/80">
                        <td
                          colSpan={4}
                          className="px-3 py-2 text-right text-xs text-slate-500"
                        >
                          Transport
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">
                          {formatCHF(estimateResult.transport_cost)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                      <tr className="border-t-2 border-brand/30 bg-brand/5">
                        <td
                          colSpan={4}
                          className="px-3 py-3 text-right text-sm font-bold text-brand"
                        >
                          Total estimé
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-lg font-bold text-brand">
                          {formatCHF(estimateResult.grand_total)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* TAB 2: Historique                           */}
        {/* ═══════════════════════════════════════════ */}
        {activeTab === "history" && (
          <div>
            {/* ── Detail view ── */}
            {historyDetail ? (
              <div className="space-y-4">
                {/* Back button + title */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setHistoryDetail(null)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Retour
                  </button>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">
                      {historyDetail.plan_title || historyDetail.plan_number || "Estimation"}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {historyDetail.created_at ? formatDate(historyDetail.created_at) : ""}
                    </p>
                  </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-medium uppercase text-slate-400">Sous-total</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatCHF(historyDetail.estimate_result?.subtotal ?? historyDetail.subtotal ?? 0)}
                    </p>
                    <p className="text-[10px] text-slate-400">CHF</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-medium uppercase text-slate-400">Marge</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatCHF(historyDetail.estimate_result?.margin_total ?? historyDetail.margin_total ?? 0)}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {historyDetail.config?.margin_level
                        ? MARGIN_OPTIONS.find((m) => m.value === historyDetail.config.margin_level)?.label || ""
                        : ""}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-medium uppercase text-slate-400">Transport</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatCHF(historyDetail.estimate_result?.transport_cost ?? historyDetail.transport_cost ?? 0)}
                    </p>
                    <p className="text-[10px] text-slate-400">CHF</p>
                  </div>
                  <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
                    <p className="text-[11px] font-medium uppercase text-brand">Total estimé</p>
                    <p className="mt-1 text-lg font-bold text-brand">
                      {formatCHF(historyDetail.estimate_result?.grand_total ?? historyDetail.grand_total ?? 0)}
                    </p>
                    <p className="text-[10px] text-brand/70">CHF TTC</p>
                  </div>
                </div>

                {/* Coverage & confidence */}
                {historyDetail.estimate_result && (
                  <div className="flex flex-wrap items-center gap-4 rounded-md border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-blue-500" />
                      <span className="text-sm text-slate-700">
                        Couverture BD :{" "}
                        <span className="font-semibold">
                          {historyDetail.estimate_result.db_coverage_percent ?? 0}%
                        </span>
                      </span>
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{
                            width: `${Math.min(100, historyDetail.estimate_result.db_coverage_percent ?? 0)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-slate-300">|</span>
                    <div className="flex items-center gap-3 text-xs text-slate-600">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        Élevée: {historyDetail.estimate_result.confidence_summary?.high || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        Moyenne: {historyDetail.estimate_result.confidence_summary?.medium || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        Faible: {historyDetail.estimate_result.confidence_summary?.low || 0}
                      </span>
                    </div>
                  </div>
                )}

                {/* Export CSV */}
                {historyDetail.estimate_result?.line_items && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        exportCSV(historyDetail.estimate_result.line_items, {
                          subtotal: historyDetail.estimate_result.subtotal ?? 0,
                          margin: historyDetail.estimate_result.margin_total ?? 0,
                          transport: historyDetail.estimate_result.transport_cost ?? 0,
                          grand: historyDetail.estimate_result.grand_total ?? 0,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <Download className="h-4 w-4" />
                      Exporter CSV
                    </button>
                  </div>
                )}

                {/* Line items table */}
                {historyDetail.estimate_result?.line_items && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Poste</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Qté</th>
                          <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">Unité</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">PU (CHF)</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total (CHF)</th>
                          <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">Confiance</th>
                          <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {historyDetail.estimate_result.line_items.map((li: any, idx: number) => (
                          <tr key={idx} className="transition-colors hover:bg-slate-50/50">
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-slate-800">{li.item}</p>
                              {li.cfc_code && (
                                <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                                  {li.cfc_code}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-slate-700">{li.quantity}</td>
                            <td className="px-3 py-2.5 text-center text-xs text-slate-500">{li.unit}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-slate-700">{formatCHF(li.unit_price)}</td>
                            <td className="px-3 py-2.5 text-right font-mono font-medium text-slate-900">{formatCHF(li.total_price)}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="inline-flex items-center gap-1.5">
                                <span className={cn("h-2 w-2 rounded-full", confidenceColor(li.confidence))} />
                                <span className="text-xs text-slate-500">{confidenceLabel(li.confidence)}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {li.source === "db_historical" ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                  <Database className="h-3 w-3" />BD
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                                  <Sparkles className="h-3 w-3" />IA
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-slate-50/80">
                          <td colSpan={4} className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-slate-500">Sous-total</td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900">{formatCHF(historyDetail.estimate_result.subtotal)}</td>
                          <td colSpan={2} />
                        </tr>
                        <tr className="bg-slate-50/80">
                          <td colSpan={4} className="px-3 py-2 text-right text-xs text-slate-500">
                            Marge ({historyDetail.config?.margin_level ? MARGIN_OPTIONS.find((m) => m.value === historyDetail.config.margin_level)?.label : ""})
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700">{formatCHF(historyDetail.estimate_result.margin_total)}</td>
                          <td colSpan={2} />
                        </tr>
                        <tr className="bg-slate-50/80">
                          <td colSpan={4} className="px-3 py-2 text-right text-xs text-slate-500">Transport</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-700">{formatCHF(historyDetail.estimate_result.transport_cost)}</td>
                          <td colSpan={2} />
                        </tr>
                        <tr className="border-t-2 border-brand/30 bg-brand/5">
                          <td colSpan={4} className="px-3 py-3 text-right text-sm font-bold text-brand">Total estimé</td>
                          <td className="px-3 py-3 text-right font-mono text-lg font-bold text-brand">{formatCHF(historyDetail.estimate_result.grand_total)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            ) : historyDetailLoading ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-16">
                <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                <p className="mt-3 text-sm text-slate-400">Chargement de l'estimation…</p>
              </div>
            ) : historyLoading ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-16">
                <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                <p className="mt-3 text-sm text-slate-400">Chargement de l'historique…</p>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-16">
                <Clock className="h-12 w-12 text-slate-300" />
                <h3 className="mt-3 text-sm font-medium text-slate-600">
                  Aucune estimation réalisée
                </h3>
                <p className="mt-1 max-w-sm text-center text-xs text-slate-400">
                  Vos estimations apparaîtront ici après avoir lancé un chiffrage
                  depuis l'onglet "Demande de chiffrage".
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("estimate")}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold/90 transition-colors"
                >
                  <Calculator className="h-4 w-4" />
                  Créer une estimation
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Plan
                      </th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Date
                      </th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Total (CHF)
                      </th>
                      <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Postes
                      </th>
                      <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Couverture BD
                      </th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {history.map((item: any) => (
                      <tr
                        key={item.id}
                        onClick={() => openHistoryDetail(item.id)}
                        className="cursor-pointer transition-colors hover:bg-slate-50/50"
                      >
                        <td className="px-3 py-2.5 text-sm font-medium text-slate-800">
                          {item.plan_title || item.plan_id || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          {item.created_at ? formatDate(item.created_at) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-medium text-slate-900">
                          {item.grand_total
                            ? formatCHF(item.grand_total)
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs text-slate-600">
                          {item.items_count || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {item.db_coverage_percent != null ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-blue-500"
                                  style={{
                                    width: `${Math.min(100, item.db_coverage_percent)}%`,
                                  }}
                                />
                              </div>
                              {item.db_coverage_percent}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Eye className="h-4 w-4 text-slate-400" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* TAB 3: Benchmark                           */}
        {/* ═══════════════════════════════════════════ */}
        {activeTab === "benchmark" && (
          <div className="space-y-4">
            {/* ── Sub-view toggle ── */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBenchmarkView("upload")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  benchmarkView === "upload"
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                <Upload className="inline h-3.5 w-3.5 mr-1" />
                Importer des fichiers
              </button>
              <button
                type="button"
                onClick={() => { setBenchmarkView("analysis"); loadBenchmark(benchmarkProjectFilter || undefined); }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  benchmarkView === "analysis"
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                <BarChart3 className="inline h-3.5 w-3.5 mr-1" />
                Analyse des prix
                {benchmarkSummary?.total_data_points > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-white/20 px-1.5 text-[10px]">
                    {benchmarkSummary.total_data_points}
                  </span>
                )}
              </button>
            </div>

            {/* ═══ UPLOAD SUB-VIEW ═══ */}
            {benchmarkView === "upload" && (<>

            {/* ── Import completed ── */}
            {importResult && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h3 className="text-sm font-semibold text-green-800">Import terminé</h3>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-md bg-white p-2.5 text-center">
                    <p className="text-lg font-bold text-slate-900">{importResult.suppliersCreated}</p>
                    <p className="text-[10px] text-slate-500">Fournisseurs créés</p>
                  </div>
                  <div className="rounded-md bg-white p-2.5 text-center">
                    <p className="text-lg font-bold text-slate-900">{importResult.suppliersMatched}</p>
                    <p className="text-[10px] text-slate-500">Fournisseurs existants</p>
                  </div>
                  <div className="rounded-md bg-white p-2.5 text-center">
                    <p className="text-lg font-bold text-slate-900">{importResult.offersCreated}</p>
                    <p className="text-[10px] text-slate-500">Offres importées</p>
                  </div>
                  <div className="rounded-md bg-white p-2.5 text-center">
                    <p className="text-lg font-bold text-brand">{importResult.lineItemsCreated}</p>
                    <p className="text-[10px] text-slate-500">Postes de prix ajoutés</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setImportResult(null);
                    setExtractionStatus(null);
                    setExtractionResults([]);
                    setUploadedFiles([]);
                    setSelectedExtractions(new Set());
                  }}
                  className="mt-3 text-xs text-brand hover:underline"
                >
                  Importer d'autres fichiers
                </button>
              </div>
            )}

            {/* ── Upload zone ── */}
            {!extractionRunning && extractionStatus !== "preview_ready" && (
              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <div className="flex items-start gap-4 mb-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10">
                    <Upload className="h-5 w-5 text-brand" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-slate-800">
                      Importer vos fichiers fournisseurs
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Glissez-déposez vos fichiers (.eml, .msg, .pdf, .txt, .html) contenant des offres de prix.
                      L'IA extrait automatiquement les prix, descriptions et informations fournisseurs.
                    </p>
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const files = Array.from(e.dataTransfer.files);
                    handleFilesSelected(files);
                  }}
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.multiple = true;
                    input.accept = ACCEPTED_EXTENSIONS.join(",");
                    input.onchange = (e) => {
                      const files = Array.from((e.target as HTMLInputElement).files || []);
                      handleFilesSelected(files);
                    };
                    input.click();
                  }}
                  className={cn(
                    "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                    dragOver
                      ? "border-brand bg-brand/5"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                  )}
                >
                  <Upload className={cn("mx-auto h-8 w-8", dragOver ? "text-brand" : "text-slate-300")} />
                  <p className="mt-3 text-sm font-medium text-slate-600">
                    Glissez vos fichiers ici ou <span className="text-brand">cliquez pour sélectionner</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    .eml, .msg, .pdf, .txt, .html — jusqu'à 25 Mo par fichier
                  </p>
                </div>

                {/* File list */}
                {uploadedFiles.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-slate-600">
                        {uploadedFiles.length} fichier{uploadedFiles.length > 1 ? "s" : ""} sélectionné{uploadedFiles.length > 1 ? "s" : ""}
                      </p>
                      <button
                        type="button"
                        onClick={() => setUploadedFiles([])}
                        className="text-xs text-slate-400 hover:text-red-500"
                      >
                        Tout supprimer
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-md border border-slate-100 divide-y divide-slate-50">
                      {uploadedFiles.map((file, idx) => {
                        const ext = file.name.split(".").pop()?.toLowerCase() || "";
                        return (
                          <div key={`${file.name}-${idx}`} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                            <span className={cn(
                              "inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                              ext === "pdf" ? "bg-purple-50 text-purple-600" :
                              ext === "eml" || ext === "msg" ? "bg-blue-50 text-blue-600" :
                              "bg-slate-50 text-slate-500"
                            )}>
                              .{ext}
                            </span>
                            <span className="flex-1 truncate text-slate-700">{file.name}</span>
                            <span className="shrink-0 text-slate-400">{(file.size / 1024).toFixed(0)} Ko</span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                              className="shrink-0 text-slate-300 hover:text-red-500"
                            >
                              &times;
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={startExtraction}
                      className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90"
                    >
                      <Sparkles className="h-4 w-4" />
                      Analyser {uploadedFiles.length} fichier{uploadedFiles.length > 1 ? "s" : ""}
                    </button>
                  </div>
                )}

                {/* Error */}
                {extractionStatus?.startsWith("error:") && (
                  <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
                    {extractionStatus.replace("error: ", "")}
                  </div>
                )}

                {/* Info cards */}
                {uploadedFiles.length === 0 && (
                  <div className="mt-6 grid grid-cols-3 gap-4">
                    <div className="rounded-md border border-slate-100 p-3 text-center">
                      <Mail className="mx-auto h-6 w-6 text-blue-500" />
                      <p className="mt-1.5 text-xs font-medium text-slate-600">Emails (.eml / .msg)</p>
                      <p className="text-[10px] text-slate-400">Corps de texte + PJ PDF</p>
                    </div>
                    <div className="rounded-md border border-slate-100 p-3 text-center">
                      <FileText className="mx-auto h-6 w-6 text-purple-500" />
                      <p className="mt-1.5 text-xs font-medium text-slate-600">PDF / Devis</p>
                      <p className="text-[10px] text-slate-400">Analyse visuelle IA</p>
                    </div>
                    <div className="rounded-md border border-slate-100 p-3 text-center">
                      <Database className="mx-auto h-6 w-6 text-green-500" />
                      <p className="mt-1.5 text-xs font-medium text-slate-600">Base enrichie</p>
                      <p className="text-[10px] text-slate-400">Prix + fournisseurs</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Progress bar ── */}
            {extractionRunning && (
              <div className="rounded-lg border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Loader2 className="h-5 w-5 animate-spin text-brand" />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Analyse en cours…</h3>
                    <p className="text-xs text-slate-400">
                      {extractionProgress.processed} / {extractionProgress.total} fichier{extractionProgress.total > 1 ? "s" : ""} analysé{extractionProgress.total > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-500"
                    style={{
                      width: `${extractionProgress.total > 0 ? Math.round((extractionProgress.processed / extractionProgress.total) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="mt-3 flex gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {extractionProgress.withPrices} fichier{extractionProgress.withPrices > 1 ? "s" : ""} avec prix
                  </span>
                  <span className="flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" />
                    {extractionProgress.items} postes extraits
                  </span>
                  {extractionProgress.errors > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {extractionProgress.errors} erreur{extractionProgress.errors > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── Review results ── */}
            {extractionStatus === "preview_ready" && extractionResults.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">
                      {extractionResults.length} offre{extractionResults.length > 1 ? "s" : ""} trouvée{extractionResults.length > 1 ? "s" : ""}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Sélectionnez les offres à importer dans la base de prix
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedExtractions.size === extractionResults.length) {
                          setSelectedExtractions(new Set());
                        } else {
                          setSelectedExtractions(new Set(extractionResults.map((r: any) => r.emailId)));
                        }
                      }}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      {selectedExtractions.size === extractionResults.length ? "Tout désélectionner" : "Tout sélectionner"}
                    </button>
                    <button
                      type="button"
                      onClick={handleImport}
                      disabled={importing || selectedExtractions.size === 0}
                      className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
                    >
                      {importing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Importer {selectedExtractions.size} offre{selectedExtractions.size > 1 ? "s" : ""}
                    </button>
                  </div>
                </div>

                {/* Results list */}
                <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                  {extractionResults.map((result: any) => (
                    <div key={`${result.emailId}-${result.source_type}`} className="transition-colors hover:bg-slate-50/50">
                      {/* Row header */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedExtractions.has(result.emailId)}
                          onChange={(e) => {
                            const next = new Set(selectedExtractions);
                            if (e.target.checked) next.add(result.emailId);
                            else next.delete(result.emailId);
                            setSelectedExtractions(next);
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-brand"
                        />
                        <button
                          type="button"
                          onClick={() => setExpandedExtraction(expandedExtraction === result.emailId ? null : result.emailId)}
                          className="flex flex-1 items-center gap-3 text-left"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-slate-800 truncate">
                                {result.supplier_info?.company_name || "Fournisseur inconnu"}
                              </p>
                              <span className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                                result.source_type === "pdf_attachment"
                                  ? "bg-purple-50 text-purple-700"
                                  : "bg-blue-50 text-blue-700"
                              )}>
                                {result.source_type === "pdf_attachment" ? (
                                  <><FileText className="h-3 w-3" />PDF</>
                                ) : (
                                  <><Mail className="h-3 w-3" />Email</>
                                )}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 truncate">
                              {result.fileName && <span className="font-mono">{result.fileName}</span>}
                              {result.fileName && (result.supplier_info?.email || result.supplier_info?.city) ? " — " : ""}
                              {result.supplier_info?.email || ""}{result.supplier_info?.city ? ` — ${result.supplier_info.city}` : ""}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-mono text-sm font-semibold text-slate-900">
                              {result.line_items?.length || 0} poste{(result.line_items?.length || 0) > 1 ? "s" : ""}
                            </p>
                            {result.offer_summary?.total_amount && (
                              <p className="font-mono text-xs text-slate-500">
                                {formatCHF(result.offer_summary.total_amount)} CHF
                              </p>
                            )}
                          </div>
                          <ChevronRight className={cn(
                            "h-4 w-4 text-slate-400 transition-transform shrink-0",
                            expandedExtraction === result.emailId && "rotate-90"
                          )} />
                        </button>
                      </div>

                      {/* Expanded detail */}
                      {expandedExtraction === result.emailId && result.line_items && (
                        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                          {/* Supplier info */}
                          <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-500">
                            {result.supplier_info?.phone && (
                              <span>{result.supplier_info.phone}</span>
                            )}
                            {result.supplier_info?.address && (
                              <span>{result.supplier_info.address}, {result.supplier_info.postal_code} {result.supplier_info.city}</span>
                            )}
                            {result.supplier_info?.website && (
                              <span>{result.supplier_info.website}</span>
                            )}
                          </div>
                          {/* Line items table */}
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[10px] uppercase text-slate-400">
                                <th className="pb-1.5 text-left font-semibold">Description</th>
                                <th className="pb-1.5 text-right font-semibold">Qté</th>
                                <th className="pb-1.5 text-center font-semibold">Unité</th>
                                <th className="pb-1.5 text-right font-semibold">PU (CHF)</th>
                                <th className="pb-1.5 text-right font-semibold">Total (CHF)</th>
                                <th className="pb-1.5 text-center font-semibold">CFC</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {result.line_items.map((li: any, idx: number) => (
                                <tr key={idx}>
                                  <td className="py-1.5 pr-2 text-slate-700">{li.description}</td>
                                  <td className="py-1.5 text-right font-mono text-slate-600">{li.quantity ?? "—"}</td>
                                  <td className="py-1.5 text-center text-slate-500">{li.unit}</td>
                                  <td className="py-1.5 text-right font-mono text-slate-700">{formatCHF(li.unit_price)}</td>
                                  <td className="py-1.5 text-right font-mono font-medium text-slate-900">
                                    {li.total_price ? formatCHF(li.total_price) : "—"}
                                  </td>
                                  <td className="py-1.5 text-center">
                                    {li.cfc_code ? (
                                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">{li.cfc_code}</span>
                                    ) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {/* Conditions */}
                          {result.offer_summary && (
                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
                              {result.offer_summary.payment_terms && <span>Paiement: {result.offer_summary.payment_terms}</span>}
                              {result.offer_summary.validity_days && <span>Validité: {result.offer_summary.validity_days}j</span>}
                              {result.offer_summary.vat_rate && <span>TVA: {result.offer_summary.vat_rate}%</span>}
                              {result.offer_summary.delivery_included != null && (
                                <span>Livraison: {result.offer_summary.delivery_included ? "incluse" : "non incluse"}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── No results found ── */}
            {extractionStatus === "preview_ready" && extractionResults.length === 0 && !importResult && (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-12">
                <FileText className="h-10 w-10 text-slate-300" />
                <h3 className="mt-3 text-sm font-medium text-slate-600">Aucune offre de prix trouvée</h3>
                <p className="mt-1 max-w-sm text-center text-xs text-slate-400">
                  Les fichiers analysés ne contenaient pas d'informations de prix exploitables.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setExtractionStatus(null);
                    setUploadedFiles([]);
                    setExtractionResults([]);
                  }}
                  className="mt-4 text-xs text-brand hover:underline"
                >
                  Réessayer avec d'autres fichiers
                </button>
              </div>
            )}

            </>)}

            {/* ═══ ANALYSIS SUB-VIEW ═══ */}
            {benchmarkView === "analysis" && (
              <div className="space-y-4">
                {benchmarkLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-brand" />
                    <span className="ml-2 text-sm text-slate-500">Chargement des données…</span>
                  </div>
                ) : benchmarkData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-12">
                    <Database className="h-10 w-10 text-slate-300" />
                    <h3 className="mt-3 text-sm font-medium text-slate-600">Aucune donnée de prix</h3>
                    <p className="mt-1 max-w-sm text-center text-xs text-slate-400">
                      Importez des fichiers fournisseurs pour alimenter la base de benchmark.
                    </p>
                    <button
                      type="button"
                      onClick={() => setBenchmarkView("upload")}
                      className="mt-4 inline-flex items-center gap-1 text-xs text-brand hover:underline"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Importer des fichiers
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Summary cards */}
                    {benchmarkSummary && (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                          <p className="text-lg font-bold text-slate-900">{benchmarkSummary.total_items}</p>
                          <p className="text-[10px] text-slate-500">Postes distincts</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                          <p className="text-lg font-bold text-slate-900">{benchmarkSummary.total_data_points}</p>
                          <p className="text-[10px] text-slate-500">Points de données</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                          <p className="text-lg font-bold text-slate-900">{benchmarkSummary.total_suppliers}</p>
                          <p className="text-[10px] text-slate-500">Fournisseurs</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                          <p className="text-lg font-bold text-slate-900">{benchmarkSummary.avg_spread_percent}%</p>
                          <p className="text-[10px] text-slate-500">Écart moyen</p>
                        </div>
                      </div>
                    )}

                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="text"
                        value={benchmarkSearch}
                        onChange={(e) => setBenchmarkSearch(e.target.value)}
                        placeholder="Rechercher un poste…"
                        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 w-64"
                      />
                      <select
                        value={benchmarkProjectFilter}
                        onChange={(e) => {
                          setBenchmarkProjectFilter(e.target.value);
                          loadBenchmark(e.target.value || undefined);
                        }}
                        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
                      >
                        <option value="">Tous les projets</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const header = "Poste;CFC;Unité;Min;Médiane;Max;Écart (%);Données\n";
                          const rows = filteredBenchmark.map((item: any) =>
                            `"${item.display_description}";${item.cfc_subcode || ""};${item.unit_normalized};${item.min_unit_price.toFixed(2)};${item.median_unit_price.toFixed(2)};${item.max_unit_price.toFixed(2)};${item.price_spread_percent};${item.data_points}`
                          ).join("\n");
                          const csv = header + rows;
                          const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `cantaia-benchmark-${new Date().toISOString().split("T")[0]}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Export CSV
                      </button>
                    </div>

                    {/* Comparison table */}
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] uppercase text-slate-400">
                            <th className="px-3 py-2 text-left font-semibold">Poste</th>
                            <th className="px-3 py-2 text-center font-semibold">CFC</th>
                            <th className="px-3 py-2 text-center font-semibold">Unité</th>
                            <th className="px-3 py-2 text-right font-semibold">Min</th>
                            <th className="px-3 py-2 text-right font-semibold">Médiane</th>
                            <th className="px-3 py-2 text-right font-semibold">Max</th>
                            <th className="px-3 py-2 text-center font-semibold">Écart</th>
                            <th className="px-3 py-2 text-center font-semibold">N</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {filteredBenchmark.map((item: any) => (
                            <React.Fragment key={item.normalized_key}>
                              <tr
                                className="cursor-pointer transition-colors hover:bg-slate-50/50"
                                onClick={() => setExpandedBenchmarkItem(
                                  expandedBenchmarkItem === item.normalized_key ? null : item.normalized_key
                                )}
                              >
                                <td className="px-3 py-2.5 text-slate-700 max-w-xs truncate">
                                  <ChevronRight className={cn(
                                    "inline h-3.5 w-3.5 mr-1 text-slate-400 transition-transform",
                                    expandedBenchmarkItem === item.normalized_key && "rotate-90"
                                  )} />
                                  {item.display_description}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  {item.cfc_subcode ? (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">{item.cfc_subcode}</span>
                                  ) : "—"}
                                </td>
                                <td className="px-3 py-2.5 text-center text-xs text-slate-500">{item.unit_normalized || "—"}</td>
                                <td className="px-3 py-2.5 text-right font-mono text-green-700">{formatCHF(item.min_unit_price)}</td>
                                <td className="px-3 py-2.5 text-right font-mono font-medium text-slate-900">{formatCHF(item.median_unit_price)}</td>
                                <td className="px-3 py-2.5 text-right font-mono text-red-600">{formatCHF(item.max_unit_price)}</td>
                                <td className="px-3 py-2.5 text-center">
                                  <span className={cn(
                                    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                                    item.price_spread_percent > 50
                                      ? "bg-amber-50 text-amber-700"
                                      : item.price_spread_percent > 20
                                      ? "bg-blue-50 text-blue-700"
                                      : "bg-green-50 text-green-700"
                                  )}>
                                    {item.price_spread_percent}%
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-center text-xs text-slate-500">{item.data_points}</td>
                              </tr>
                              {/* Expanded detail */}
                              {expandedBenchmarkItem === item.normalized_key && (
                                <tr>
                                  <td colSpan={8} className="bg-slate-50/50 px-6 py-3">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-[10px] uppercase text-slate-400">
                                          <th className="pb-1 text-left font-semibold">Fournisseur</th>
                                          <th className="pb-1 text-right font-semibold">PU (CHF)</th>
                                          <th className="pb-1 text-left font-semibold">Projet</th>
                                          <th className="pb-1 text-left font-semibold">Date</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {item.suppliers
                                          .sort((a: any, b: any) => a.unit_price - b.unit_price)
                                          .map((s: any, idx: number) => (
                                          <tr key={idx}>
                                            <td className="py-1.5 text-slate-700">{s.supplier_name}</td>
                                            <td className="py-1.5 text-right font-mono font-medium text-slate-900">{formatCHF(s.unit_price)}</td>
                                            <td className="py-1.5 text-slate-500">{s.project_name || "—"}</td>
                                            <td className="py-1.5 text-slate-400">{s.received_at ? formatDate(s.received_at) : "—"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
