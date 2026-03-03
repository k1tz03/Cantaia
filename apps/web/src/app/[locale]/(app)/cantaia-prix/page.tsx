"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
  CircleDot,
  Database,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Eye,
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
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-16">
            <BarChart3 className="h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-sm font-medium text-slate-600">
              Benchmark en construction
            </h3>
            <p className="mt-1 max-w-md text-center text-xs text-slate-400">
              Le benchmark se construit automatiquement à mesure que vous recevez
              des offres fournisseurs. Les prix unitaires sont analysés et comparés
              pour vous donner une vision du marché.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-blue-50">
                  <Database className="h-5 w-5 text-blue-500" />
                </div>
                <p className="mt-2 text-xs font-medium text-slate-600">
                  Prix historiques
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Issus de vos soumissions
                </p>
              </div>
              <div>
                <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-purple-50">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                </div>
                <p className="mt-2 text-xs font-medium text-slate-600">
                  Analyse IA
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Tendances et anomalies
                </p>
              </div>
              <div>
                <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-green-50">
                  <CircleDot className="h-5 w-5 text-green-500" />
                </div>
                <p className="mt-2 text-xs font-medium text-slate-600">
                  Références marché
                </p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Indices CRB / BFS
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
