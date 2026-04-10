"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Calculator,
  Clock,
  BarChart3,
  Upload,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import {
  PlanOption,
  PricingConfig,
  AnalysisData,
  EstimateResult,
  Tab,
  DEFAULT_CONFIG,
} from "@/components/cantaia-prix/types";
import { EstimateTab } from "@/components/cantaia-prix/EstimateTab";
import { HistoryTab } from "@/components/cantaia-prix/HistoryTab";
import { ImportTab } from "@/components/cantaia-prix/ImportTab";
import { AnalysisTab } from "@/components/cantaia-prix/AnalysisTab";
import { useAgent } from "@/lib/hooks/use-agent";
import { AgentAnalysisPanel } from "@/components/agents/AgentAnalysisPanel";

// Feature flag: when true, use Managed Agent for price extraction instead of legacy batch pipeline
const USE_MANAGED_AGENTS = process.env.NEXT_PUBLIC_USE_MANAGED_AGENTS === "true";

// ── Page ──

export default function CantaiaPrixPage() {
  const searchParams = useSearchParams();
  const urlPlanId = searchParams.get("plan_id");
  const urlAnalysisId = searchParams.get("analysis_id");

  // Tab state — default to "import" since "estimate" (Chiffrage IA) is hidden
  const [activeTab, setActiveTab] = useState<Tab>("import");

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

  // Benchmark analysis
  const [benchmarkData, setBenchmarkData] = useState<any[]>([]);
  const [benchmarkSummary, setBenchmarkSummary] = useState<any | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);

  // Projects list for filter
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // ── Managed Agent (price-extractor) ──
  const extractorAgent = useAgent("price-extractor");
  // Upload errors happen BEFORE the agent starts, so useAgent can't capture them.
  // This local state surfaces upload failures to the user.
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Start the agent with uploaded file paths
  const handleAgentExtract = useCallback(
    async (files: File[]) => {
      if (!files.length || extractorAgent.isRunning) return;
      setUploadError(null); // Clear any previous upload error

      try {
        // Step 1: Upload files to Supabase Storage
        const formData = new FormData();
        for (const file of files) {
          formData.append("files", file);
        }
        const uploadRes = await fetch("/api/pricing/upload-for-extraction", {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          throw new Error(err.error || `Échec de l'upload (${uploadRes.status})`);
        }
        const uploadData = await uploadRes.json();
        const uploadedFiles = uploadData.files as {
          file_name: string;
          storage_path: string;
          file_type: string;
        }[];

        if (!uploadedFiles.length) {
          throw new Error("Aucun fichier valide après upload.");
        }

        // Step 2: Build the file list for the agent message
        const fileList = uploadedFiles
          .map(
            (f) =>
              `- ${f.file_name} (type: ${f.file_type}, path: ${f.storage_path})`
          )
          .join("\n");

        // Step 3: Start the agent
        await extractorAgent.start(
          { file_count: uploadedFiles.length },
          `Analyse les ${uploadedFiles.length} fichier(s) suivants et extrais tous les prix :\n\n${fileList}\n\n` +
            `Pour chaque fichier, appelle fetch_file_content avec file_url=<storage_path> et file_type=<type>. ` +
            `Puis regroupe tous les prix trouvés et appelle save_extracted_prices en un seul appel.`,
          `Extraction de prix — ${uploadedFiles.length} fichier(s)`
        );
      } catch (err) {
        console.error("[CantaiaPrix] Agent extract error:", err);
        // FIX: Surface upload errors (which happen BEFORE agent.start) to the user.
        // The useAgent hook only captures errors from the agent session itself.
        setUploadError(err instanceof Error ? err.message : "Erreur lors de l'upload des fichiers");
      }
    },
    [extractorAgent]
  );

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
    } catch {
      setBenchmarkData([]);
      setBenchmarkSummary(null);
    } finally {
      setBenchmarkLoading(false);
    }
  }, []);

  // Auto-load benchmark on tab switch
  useEffect(() => {
    if (activeTab === "analysis" && benchmarkData.length === 0 && !benchmarkLoading) {
      loadBenchmark();
    }
  }, [activeTab]);

  // Refresh benchmark data after agent completes
  useEffect(() => {
    if (!USE_MANAGED_AGENTS) return;
    if (extractorAgent.status === "completed") {
      // Agent saved prices to DB — refresh benchmark data
      loadBenchmark();
    }
  }, [extractorAgent.status, loadBenchmark]);

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

    const analysisId = urlAnalysisId || analysisData?.id;

    if (!analysisId && !selectedPlanId) {
      setEstimateError("Veuillez sélectionner un plan ou fournir un analysis_id.");
      setEstimating(false);
      return;
    }

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
      } catch (err: unknown) {
        setEstimateError(err instanceof Error ? err.message : "Erreur lors de l'analyse du plan.");
        setEstimating(false);
        return;
      }
    }

    if (!finalAnalysisId) {
      setEstimateError("Impossible de déterminer l'analyse à utiliser.");
      setEstimating(false);
      return;
    }

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
        loadHistory();
      }
    } catch (err: unknown) {
      setEstimateError(err instanceof Error ? err.message : "Erreur réseau.");
    } finally {
      setEstimating(false);
    }
  }, [config, exclusionsText, scope, context, selectedPlanId, urlAnalysisId, analysisData, loadHistory]);

  // ── Selected plan display ──
  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId),
    [plans, selectedPlanId]
  );

  // ── Check if we can estimate ──
  const canEstimate = selectedPlanId || urlAnalysisId;

  // ── Quantities preview from analysis ──
  const quantitiesPreview = analysisData?.analysis_result?.quantities;

  return (
    <div className="flex-1 overflow-y-auto min-h-full bg-[#0F0F11]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10">
              <Calculator className="h-5 w-5 text-brand" />
            </div>
            <div>
              <h1 className="text-xl font-display font-extrabold text-[#FAFAFA]">Cantaia Prix</h1>
              <p className="text-sm text-[#71717A]">
                Estimation automatique des coûts pour vos projets de construction
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-1 rounded-lg bg-[#27272A] p-0.5 w-fit">
          {([
            // HIDDEN: Budget estimation temporarily disabled — prices unreliable
            // { key: "estimate" as Tab, label: "Chiffrage IA", icon: Calculator },
            { key: "import" as Tab, label: "Import prix", icon: Upload },
            { key: "analysis" as Tab, label: "Analyse prix", icon: BarChart3 },
            { key: "history" as Tab, label: "Historique", icon: Clock },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-[#0F0F11] text-[#FAFAFA] shadow-sm"
                  : "text-[#71717A] hover:text-[#FAFAFA]"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* HIDDEN: Budget estimation temporarily disabled — prices unreliable */}
        {false && activeTab === "estimate" && (
          <EstimateTab
            config={config}
            setConfig={setConfig}
            scope={scope}
            setScope={setScope}
            exclusionsText={exclusionsText}
            setExclusionsText={setExclusionsText}
            context={context}
            setContext={setContext}
            urlAnalysisId={urlAnalysisId}
            analysisData={analysisData}
            analysisLoading={analysisLoading}
            plans={plans}
            plansLoading={plansLoading}
            selectedPlanId={selectedPlanId}
            setSelectedPlanId={setSelectedPlanId}
            showPlanDropdown={showPlanDropdown}
            setShowPlanDropdown={setShowPlanDropdown}
            setAnalysisData={setAnalysisData}
            canEstimate={!!canEstimate}
            estimating={estimating}
            handleEstimate={handleEstimate}
            selectedPlan={selectedPlan}
            quantitiesPreview={quantitiesPreview}
            estimateError={estimateError}
            estimateResult={estimateResult}
          />
        )}

        {/* Agent Analysis Panel — shown above tab content during agent processing */}
        {USE_MANAGED_AGENTS && extractorAgent.status !== "idle" && (
          <div className="mb-4 -mx-4 sm:-mx-6">
            <AgentAnalysisPanel
              status={extractorAgent.status}
              events={extractorAgent.events}
              lastMessage={extractorAgent.lastMessage}
              result={extractorAgent.result}
              error={extractorAgent.error}
              isRunning={extractorAgent.isRunning}
              onCancel={extractorAgent.cancel}
              agentType="price-extractor"
            />
          </div>
        )}

        {/* TAB 2: Import prix */}
        {activeTab === "import" && (
          <ImportTab
            projects={projects}
            loadBenchmark={loadBenchmark}
            // Managed Agent integration
            useAgentFlow={USE_MANAGED_AGENTS}
            onAgentExtract={handleAgentExtract}
            agentIsRunning={extractorAgent.isRunning}
            agentStatus={extractorAgent.status}
            agentError={extractorAgent.error}
            onAgentReset={extractorAgent.reset}
            uploadError={uploadError}
            onClearUploadError={() => setUploadError(null)}
          />
        )}

        {/* TAB 3: Analyse prix */}
        {activeTab === "analysis" && (
          <AnalysisTab
            benchmarkData={benchmarkData}
            benchmarkSummary={benchmarkSummary}
            benchmarkLoading={benchmarkLoading}
            projects={projects}
            loadBenchmark={loadBenchmark}
            setActiveTab={setActiveTab}
          />
        )}

        {/* TAB 4: Historique */}
        {activeTab === "history" && (
          <HistoryTab
            history={history}
            historyLoading={historyLoading}
            historyDetail={historyDetail}
            historyDetailLoading={historyDetailLoading}
            setHistoryDetail={setHistoryDetail}
            openHistoryDetail={openHistoryDetail}
            setActiveTab={setActiveTab}
          />
        )}
      </div>
    </div>
  );
}
