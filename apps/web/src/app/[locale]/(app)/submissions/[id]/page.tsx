"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { formatCHF } from "@/lib/format";
import {
  ArrowLeft,
  FileSpreadsheet,
  Send,
  BarChart3,
  ClipboardList,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  X,
  Calculator,
  CalendarRange,
  TrendingUp,
  Database,
  Search,
  Download,
  FileDown,
  Mail,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import MonteCarloChart from "@/components/submissions/MonteCarloChart";
import { useActiveProject } from "@/lib/contexts/active-project-context";
import { ProjectBreadcrumb } from "@/components/ui/ProjectBreadcrumb";
import { PriceRequestWizard } from "@/components/submissions/detail/PriceRequestWizard";
// ── Local types matching API response ────────────────────────
interface SubmissionData {
  id: string;
  project_id: string;
  organization_id: string;
  file_name: string | null;
  file_type: string | null;
  file_url: string | null;
  analysis_status: string;
  analysis_error: string | null;
  created_at: string;
  updated_at: string;
  projects?: {
    id: string;
    name: string;
    code: string | null;
    color: string | null;
    client_name: string | null;
    city: string | null;
    address: string | null;
  };
}

interface SubmissionItem {
  id: string;
  submission_id: string;
  item_number: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  cfc_code: string | null;
  material_group: string;
  product_name: string | null;
  status: string;
}

interface BudgetEstimate {
  item_id: string;
  item_number: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  material_group: string;
  prix_min: number;
  prix_median: number;
  prix_max: number;
  confidence: number;
  source: string;
  detail_source?: string;
  ajustements?: string[];
  variance?: {
    std_dev_prix: number;
    std_dev_quantite: number;
  };
  market_benchmark?: {
    p25: number;
    p75: number;
    median: number;
    contributors: number;
    region: string;
    quarter: string;
  };
}

interface BudgetResult {
  estimates: BudgetEstimate[];
  total_min: number;
  total_median: number;
  total_max: number;
  crb_count: number;
  ai_count: number;
  unestimated_count: number;
  source_breakdown?: {
    historique_interne: number;
    benchmark_cantaia: number;
    referentiel_crb: number;
    estimation_ia: number;
    non_estime: number;
  };
}

interface FeedbackStats {
  price_count: number;
  avg_accuracy: number | null;
  calibration_count: number;
  monthly_trend: { month: string; accuracy: number }[];
}

interface PriceRequestData {
  id: string;
  submission_id: string;
  supplier_id: string | null;
  tracking_code: string;
  material_group: string;
  items_requested: any[];
  sent_at: string | null;
  status: string;
  deadline: string | null;
  relance_count: number;
  last_relance_at: string | null;
  suppliers?: {
    id: string;
    company_name: string;
    contact_name: string | null;
    email: string | null;
  };
}

interface QuoteData {
  id: string;
  request_id: string;
  submission_id: string;
  item_id: string;
  unit_price_ht: number | null;
  total_ht: number | null;
  currency: string;
  confidence: number | null;
  extracted_at: string;
}

type Tab = "items" | "requests" | "comparison" | "budget" | "summary";

export default function SubmissionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState<Tab>("items");
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [items, setItems] = useState<SubmissionItem[]>([]);
  const [priceRequests, setPriceRequests] = useState<PriceRequestData[]>([]);
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0); // 0-100, for chunked scanned PDFs
  // Mutex: true while handleReanalyze owns the analysis loop.
  // Prevents the polling useEffect from interfering (overwriting "error" back to "analyzing").
  const reanalyzeActiveRef = useRef(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const { setActiveProject } = useActiveProject();

  useEffect(() => {
    if (submission?.project_id) {
      setActiveProject(submission.project_id);
    }
  }, [submission?.project_id, setActiveProject]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/submissions/${id}`);
      const json = await res.json();
      if (!json.success) return;
      setSubmission(json.submission);
      setItems(json.items || []);
      setPriceRequests(json.priceRequests || []);
      setQuotes(json.quotes || []);

      // Auto-expand all groups
      const groups = new Set<string>((json.items || []).map((i: SubmissionItem) => i.material_group));
      setExpandedGroups(groups);
    } catch (err) {
      console.error("[submission detail] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load org suppliers for the price request wizard
  useEffect(() => {
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((json) => {
        if (json.suppliers) setSuppliers(json.suppliers);
        else if (Array.isArray(json)) setSuppliers(json);
      })
      .catch(() => {});
  }, []);

  // Poll during analysis — only active when the page loads with a stale "analyzing"/"pending"
  // DB state (i.e. a previous run was killed server-side before it could update the status).
  //
  // MUTEX: If reanalyzeActiveRef.current is true, handleReanalyze is running its own loop.
  // We must yield immediately — do NOT setAnalyzing(true) or overwrite submission state.
  // The banner is driven by `analyzing` state (handleReanalyze) OR by
  // `submission.analysis_status === "analyzing"` (stale-state page load), see JSX below.
  useEffect(() => {
    // Yield to handleReanalyze if it has taken over
    if (reanalyzeActiveRef.current) return;
    if (!submission || (submission.analysis_status !== "analyzing" && submission.analysis_status !== "pending")) return;

    // NOTE: We do NOT call setAnalyzing(true) here.
    // The banner condition below handles stale-state display without touching `analyzing`.
    const startTime = Date.now();
    const interval = setInterval(async () => {
      // Bail out immediately if handleReanalyze started while we were waiting
      if (reanalyzeActiveRef.current) { clearInterval(interval); return; }

      // Client-side 300s timeout (matches server maxDuration=300)
      if (Date.now() - startTime > 300_000) {
        // Check server one last time before declaring timeout
        try {
          const res = await fetch(`/api/submissions/${id}`);
          const json = await res.json();
          if (json.success && json.submission.analysis_status === "done") {
            setSubmission(json.submission);
            setItems(json.items || []);
            setPriceRequests(json.priceRequests || []);
            setQuotes(json.quotes || []);
            const groups = new Set<string>((json.items || []).map((i: SubmissionItem) => i.material_group));
            setExpandedGroups(groups);
            clearInterval(interval);
            return;
          }
        } catch {}
        setSubmission((prev) =>
          prev ? { ...prev, analysis_status: "error", analysis_error: "L'analyse a pris trop de temps. Cliquez sur « Ré-analyser » pour réessayer." } : prev
        );
        clearInterval(interval);
        return;
      }
      try {
        const res = await fetch(`/api/submissions/${id}`);
        const json = await res.json();
        if (!json.success) return;
        // Only update if handleReanalyze hasn't taken over in the meantime
        if (reanalyzeActiveRef.current) { clearInterval(interval); return; }
        setSubmission(json.submission);
        if (json.submission.analysis_status === "done" || json.submission.analysis_status === "error") {
          setItems(json.items || []);
          setPriceRequests(json.priceRequests || []);
          setQuotes(json.quotes || []);
          const groups = new Set<string>((json.items || []).map((i: SubmissionItem) => i.material_group));
          setExpandedGroups(groups);
          clearInterval(interval);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [submission?.analysis_status, id]);

  // ── Client-driven chunked analysis orchestrator ───────────────────────────────
  // Each server call processes ≤10 pages in ~35s (safe under Vercel's 60s limit).
  // The client drives the loop so that no single HTTP request needs to run 150-300s.
  //
  // IMPORTANT: Do NOT update analysis_status to "analyzing" here — that would
  // trigger the polling useEffect which would overwrite the UI state after 2s
  // (the DB still shows "error" until PREPARE completes). We only clear analysis_error
  // to hide the red banner; the orange progress banner is controlled by `analyzing`.
  const handleReanalyze = async () => {
    if (!submission || analyzing) return;
    // Claim the mutex BEFORE setAnalyzing so the polling useEffect yields
    // immediately on its next dep-change re-run or interval tick.
    reanalyzeActiveRef.current = true;
    setAnalyzing(true);
    setAnalysisProgress(0);
    // Clear error message without changing status (avoids triggering polling useEffect)
    setSubmission(prev => prev ? { ...prev, analysis_error: null } : prev);

    try {
      // ── Step 1: PREPARE — clear items, fast-path Excel/text PDFs, or get chunk plan ──
      const prepRes = await fetch(`/api/submissions/${id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!prepRes.ok) {
        const err = await prepRes.json().catch(() => ({ error: `HTTP ${prepRes.status}` }));
        throw new Error(err.error || `Erreur de préparation (HTTP ${prepRes.status})`);
      }

      const prep = await prepRes.json();

      if (prep.done) {
        // Excel or text-based PDF: analysis is already complete
        setAnalysisProgress(100);
        await fetchData();
        setAnalyzing(false);
        setAnalysisProgress(0);
        return;
      }

      // ── Step 2: CHUNKS — iterate over scanned PDF page ranges ──
      const { totalChunks, pageCount } = prep as { totalChunks: number; pageCount: number };

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        // 120s client-side timeout — generous buffer for Vision on dense pages.
        // Server maxDuration=300, Anthropic SDK timeout=90s. Client timeout > SDK timeout
        // ensures server returns an error response rather than client aborting prematurely.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120_000);

        let chunkRes: Response;
        try {
          chunkRes = await fetch(`/api/submissions/${id}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chunkIndex, totalChunks, pageCount }),
            signal: controller.signal,
          });
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          if (fetchErr.name === "AbortError") {
            throw new Error(
              `La partie ${chunkIndex + 1}/${totalChunks} a dépassé 120s. ` +
              `Vérifiez les logs Vercel ou réessayez.`
            );
          }
          throw fetchErr;
        }
        clearTimeout(timeoutId);

        if (!chunkRes.ok) {
          const err = await chunkRes.json().catch(() => ({ error: `HTTP ${chunkRes.status}` }));
          throw new Error(err.error || `Erreur partie ${chunkIndex + 1}/${totalChunks} (HTTP ${chunkRes.status})`);
        }

        const chunk = await chunkRes.json();
        setAnalysisProgress(chunk.progress ?? Math.round((chunkIndex + 1) / totalChunks * 100));

        if (chunk.done) {
          await fetchData();
          setAnalyzing(false);
          setAnalysisProgress(0);
          return;
        }
      }

      // All chunks sent but last chunk didn't return done — reload anyway
      await fetchData();
      setAnalyzing(false);
      setAnalysisProgress(0);

    } catch (err: any) {
      console.error("[handleReanalyze]", err);
      setAnalyzing(false);
      setAnalysisProgress(0);
      setSubmission((prev) =>
        prev
          ? { ...prev, analysis_status: "error", analysis_error: err.message || "Erreur lors de l'analyse" }
          : prev
      );
    } finally {
      // Always release the mutex — even if an unhandled exception occurs.
      // The polling useEffect is now free to resume if the status is still "analyzing".
      reanalyzeActiveRef.current = false;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 text-[#F97316] animate-spin" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="p-6 text-center bg-[#0F0F11]">
        <h2 className="text-lg font-medium text-[#FAFAFA]">Soumission introuvable</h2>
        <Link href="/submissions" className="text-sm text-[#F97316] hover:underline mt-2 inline-block">
          Retour aux soumissions
        </Link>
      </div>
    );
  }

  const materialGroups = [...new Set(items.map((i) => i.material_group))].sort();

  const tabs: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "items", label: "Postes", icon: FileSpreadsheet, count: items.length },
    { key: "requests", label: "Demandes de prix", icon: Send, count: priceRequests.length },
    { key: "comparison", label: "Analyse comparative", icon: BarChart3, count: quotes.length },
    // HIDDEN: Budget estimation temporarily disabled — prices unreliable
    // { key: "budget", label: "Budget IA", icon: Calculator },
    { key: "summary", label: "Récapitulatif", icon: ClipboardList },
  ];

  return (
    <div className="h-full overflow-auto bg-[#0F0F11]">
      {/* Header */}
      <div className="bg-[#18181B] border-b border-[#27272A] px-6 py-4">
        <ProjectBreadcrumb section="submissions" />
        <div className="flex items-center gap-3 mb-3">
          <Link href="/submissions" className="p-1 hover:bg-[#1C1C1F] rounded">
            <ArrowLeft className="h-4 w-4 text-[#71717A]" />
          </Link>
          {submission.projects && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: submission.projects.color || "#94a3b8" }} />
              <span className="text-sm text-[#71717A]">{submission.projects.name}</span>
            </div>
          )}
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-xl font-extrabold text-[#FAFAFA]">
              {submission.file_name || "Soumission"}
            </h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-[#71717A]">
              <AnalysisStatusBadge status={submission.analysis_status} />
              {items.length > 0 && (
                <span>{items.length} postes · {materialGroups.length} groupes</span>
              )}
              <span>{new Date(submission.created_at).toLocaleDateString("fr-CH")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {submission.analysis_status === "done" && submission.project_id && (
              <Link
                href={`/projects/${submission.project_id}/planning`}
                className="text-xs px-3 py-1.5 border border-[#F97316]/20 rounded-lg hover:bg-[#F97316]/10 text-[#F97316] flex items-center gap-1.5"
              >
                <CalendarRange className="h-3 w-3" />
                Planning
              </Link>
            )}
            {(submission.analysis_status === "done" || submission.analysis_status === "error") && (
              <button
                onClick={handleReanalyze}
                disabled={analyzing}
                className="text-xs px-3 py-1.5 border border-[#27272A] rounded-lg hover:bg-[#1C1C1F] text-[#71717A] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw className="h-3 w-3" />
                Ré-analyser
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? "text-[#F97316] border-[#F97316] bg-[#18181B]"
                    : "text-[#71717A] border-transparent hover:text-[#FAFAFA] hover:border-[#27272A]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="text-[10px] bg-[#27272A] text-[#71717A] px-1.5 py-0.5 rounded-full ml-1">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Analysis in progress — shown either when handleReanalyze is running (analyzing=true)
           OR when the page loaded with a stale "analyzing" DB state from a killed server run */}
      {(analyzing || submission?.analysis_status === "analyzing") && (
        <div className="mx-6 mt-6 bg-[#F97316]/10 border border-[#F97316]/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-[#F97316] animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#FAFAFA]">Analyse IA en cours...</p>
              <p className="text-xs text-[#F97316]">
                {analysisProgress > 0
                  ? `Extraction des postes — ${analysisProgress}% (pages scannées, traitement par lot)`
                  : "Extraction des postes du descriptif"}
              </p>
            </div>
            {analysisProgress > 0 && (
              <span className="text-xs font-mono text-[#F97316] shrink-0">{analysisProgress}%</span>
            )}
          </div>
          {analysisProgress > 0 && (
            <div className="mt-2 h-1.5 bg-[#27272A] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#F97316] rounded-full transition-all duration-500"
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Analysis error */}
      {submission.analysis_status === "error" && submission.analysis_error && (
        <div className="mx-6 mt-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Erreur d&apos;analyse</p>
            <p className="text-xs text-red-500">{submission.analysis_error}</p>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="p-6">
        {activeTab === "items" && (
          <ItemsTabContent
            items={items}
            materialGroups={materialGroups}
            expandedGroups={expandedGroups}
            setExpandedGroups={setExpandedGroups}
            quotes={quotes}
            budgetEstimates={((submission as any).budget_estimate as BudgetResult | null)?.estimates}
            submissionId={id}
            onBudgetCalculated={(budget, feedbackData) => {
              setSubmission((prev) => prev ? { ...prev, budget_estimate: budget, budget_feedback: feedbackData } as any : prev);
            }}
          />
        )}
        {activeTab === "requests" && (
          <div className="space-y-6">
            {/* Sent requests history */}
            {priceRequests.length > 0 && (
              <div className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-[#27272A] border-b border-[#27272A]">
                  <h3 className="text-sm font-medium text-[#FAFAFA]">Demandes envoyées ({priceRequests.filter((pr) => pr.sent_at).length})</h3>
                </div>
                <div className="divide-y divide-[#27272A]">
                  {priceRequests.filter((pr) => pr.sent_at).map((pr) => {
                    const hasQuotes = quotes.some((q) => q.request_id === pr.id);
                    const isResponded = pr.status === "responded" || hasQuotes;
                    return (
                      <div key={pr.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-[#FAFAFA] font-medium truncate">
                            {pr.suppliers?.company_name || "Fournisseur manuel"}
                          </div>
                          <div className="text-xs text-[#71717A] mt-0.5">
                            {pr.material_group} · {pr.items_requested?.length || 0} postes · Code: {pr.tracking_code}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            isResponded
                              ? "bg-green-500/10 text-green-400"
                              : "bg-amber-500/10 text-amber-400"
                          }`}>
                            {isResponded ? (
                              <><CheckCircle2 className="h-3 w-3" /> Répondu</>
                            ) : (
                              <><Send className="h-3 w-3" /> En attente</>
                            )}
                          </span>
                          <div className="text-[10px] text-[#71717A] mt-0.5">
                            Envoyé le {new Date(pr.sent_at!).toLocaleDateString("fr-CH")}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* New price request wizard */}
            <PriceRequestWizard
              submissionId={id}
              lots={materialGroups.map((g) => {
                const groupItems = items.filter((i) => i.material_group === g);
                const firstItem = groupItems[0];
                return {
                  id: g,
                  name: g,
                  cfc_code: firstItem?.cfc_code || null,
                  items_count: groupItems.length,
                } as any;
              })}
              items={items}
              suppliers={suppliers}
              budgetGroups={
                ((submission as any)?.budget_estimate as BudgetResult | null)?.estimates
                  ? Object.entries(
                      (((submission as any).budget_estimate as BudgetResult).estimates || []).reduce(
                        (acc: Record<string, number>, item: BudgetEstimate) => {
                          const g = item.material_group;
                          acc[g] = (acc[g] || 0) + (item.prix_median || 0) * (item.quantity || 1);
                          return acc;
                        },
                        {} as Record<string, number>
                      )
                    ).map(([group, total]) => ({ group, total_median: total }))
                  : undefined
              }
              existingRequests={priceRequests as any}
              deadline={(submission as any)?.deadline || null}
              onComplete={fetchData}
            />
          </div>
        )}
        {activeTab === "comparison" && (
          <ComparisonTabContent
            submissionId={id}
            items={items}
            materialGroups={materialGroups}
            priceRequests={priceRequests}
            quotes={quotes}
            awardedRequestId={(submission as any).budget_estimate?.awarded_request_id ?? null}
            onRefresh={fetchData}
          />
        )}
        {/* HIDDEN: Budget estimation temporarily disabled — prices unreliable */}
        {false && activeTab === "budget" && (
          <BudgetTabContent
            submissionId={id}
            items={items}
            budgetEstimate={(submission as any).budget_estimate}
            feedbackStats={(submission as any).budget_feedback ?? null}
          />
        )}
        {activeTab === "summary" && (
          <SummaryTabContent
            submission={submission}
            items={items}
            materialGroups={materialGroups}
            priceRequests={priceRequests}
            quotes={quotes}
          />
        )}
      </div>
    </div>
  );
}

// ── Analysis status badge ────────────────────────────────────
function AnalysisStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: "En attente", className: "bg-[#27272A] text-[#71717A]" },
    analyzing: { label: "Analyse en cours...", className: "bg-purple-500/10 text-purple-400" },
    done: { label: "Analysé", className: "bg-green-500/10 text-green-400" },
    error: { label: "Erreur", className: "bg-red-500/10 text-red-400" },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${c.className}`}>
      {c.label}
    </span>
  );
}

// ── Tab 1: Items grouped by material_group ───────────────────
function ItemsTabContent({
  items,
  materialGroups,
  expandedGroups,
  setExpandedGroups,
  quotes,
  budgetEstimates,
  submissionId,
  onBudgetCalculated,
}: {
  items: SubmissionItem[];
  materialGroups: string[];
  expandedGroups: Set<string>;
  setExpandedGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
  quotes: QuoteData[];
  budgetEstimates?: BudgetEstimate[];
  submissionId: string;
  onBudgetCalculated?: (budget: BudgetResult, feedback?: FeedbackStats | null) => void;
}) {
  const [estimatingBudget, setEstimatingBudget] = useState(false);
  // Build maps for budget estimate lookup: by item_id (primary) + item_number (fallback after re-analysis)
  const budgetByIdMap = new Map<string, BudgetEstimate>();
  const budgetByNumberMap = new Map<string, BudgetEstimate>();
  if (budgetEstimates) {
    for (const est of budgetEstimates) {
      budgetByIdMap.set(est.item_id, est);
      if (est.item_number) budgetByNumberMap.set(est.item_number, est);
    }
  }
  const getBudget = (item: SubmissionItem): BudgetEstimate | undefined =>
    budgetByIdMap.get(item.id) ?? (item.item_number ? budgetByNumberMap.get(item.item_number) : undefined);
  const hasBudget = budgetByIdMap.size > 0 || budgetByNumberMap.size > 0;
  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <FileSpreadsheet className="h-12 w-12 text-[#71717A] mx-auto mb-3" />
        <p className="text-sm text-[#71717A]">Aucun poste extrait</p>
        <p className="text-xs text-[#71717A] mt-1">Lancez l'analyse IA pour extraire les postes du descriptif</p>
      </div>
    );
  }

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  async function handleEstimateBudget() {
    setEstimatingBudget(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/estimate-budget`, { method: "POST" });
      const json = await res.json();
      if (json.success && onBudgetCalculated) {
        onBudgetCalculated(json, json.feedback ?? null);
      }
    } catch {}
    setEstimatingBudget(false);
  }

  return (
    <div className="space-y-3">
      {/* HIDDEN: Budget estimation temporarily disabled — prices unreliable */}
      {false && !hasBudget && items.length > 0 && (
        <div className="bg-[#F97316]/10 border border-[#F97316]/20 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calculator className="h-5 w-5 text-[#F97316] shrink-0" />
            <div>
              <p className="text-sm font-medium text-[#FAFAFA]">Estimer les prix de cette soumission</p>
              <p className="text-xs text-[#F97316]">Utilise vos offres fournisseurs, le référentiel CRB 2025 et l&apos;IA pour estimer chaque poste</p>
            </div>
          </div>
          <button
            onClick={handleEstimateBudget}
            disabled={estimatingBudget}
            className="px-4 py-2 bg-cta text-white rounded-lg text-xs font-medium hover:bg-[#EA580C] disabled:opacity-50 flex items-center gap-1.5 shrink-0"
          >
            {estimatingBudget ? <Loader2 className="h-3 w-3 animate-spin" /> : <Calculator className="h-3 w-3" />}
            {estimatingBudget ? "Estimation..." : "Estimer les prix"}
          </button>
        </div>
      )}
      {materialGroups.map((group) => {
        const groupItems = items.filter((i) => i.material_group === group);
        const expanded = expandedGroups.has(group);
        const quotedCount = groupItems.filter((i) => i.status === "quoted").length;
        // Sum group total from budget estimates
        const groupTotal = groupItems.reduce((sum, i) => {
          const est = getBudget(i);
          if (est && est.prix_median > 0 && i.quantity != null) {
            return sum + est.prix_median * Number(i.quantity);
          }
          return sum;
        }, 0);

        return (
          <div key={group} className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
            <button
              onClick={() => toggleGroup(group)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1C1C1F]"
            >
              <div className="flex items-center gap-3">
                <svg className={`h-4 w-4 text-[#71717A] transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                <span className="text-sm font-medium text-[#FAFAFA]">{group}</span>
                <span className="text-xs text-[#71717A]">{groupItems.length} postes</span>
              </div>
              <div className="flex items-center gap-3">
                {quotedCount > 0 && (
                  <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">
                    {quotedCount}/{groupItems.length} cotés
                  </span>
                )}
                {/* HIDDEN: Budget estimation temporarily disabled — prices unreliable */}
                {false && hasBudget && groupTotal > 0 && (
                  <span className="text-sm font-semibold text-[#FAFAFA]">
                    {formatCHF(groupTotal)}
                  </span>
                )}
              </div>
            </button>
            {expanded && (
              <div className="border-t border-[#27272A] overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="bg-[#27272A] text-[11px] font-medium text-[#71717A] uppercase">
                      <th className="text-left px-4 py-2 w-20">N°</th>
                      <th className="text-left px-4 py-2">Description</th>
                      <th className="text-center px-4 py-2 w-16">Unité</th>
                      <th className="text-right px-4 py-2 w-20">Quantité</th>
                      <th className="text-center px-4 py-2 w-20">CFC</th>
                      {/* HIDDEN: Budget estimation temporarily disabled — prices unreliable */}
                      {false && hasBudget && <th className="text-right px-4 py-2 w-24">PU Méd.</th>}
                      {false && hasBudget && <th className="text-right px-4 py-2 w-24">Total</th>}
                      {false && <th className="text-center px-4 py-2 w-20">Source</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {groupItems.map((item) => {
                      const itemQuotes = quotes.filter((q) => q.item_id === item.id);
                      const bestPrice = itemQuotes.length > 0
                        ? Math.min(...itemQuotes.filter((q) => q.unit_price_ht != null).map((q) => q.unit_price_ht!))
                        : null;
                      const budget = getBudget(item);
                      const hasQuote = item.status === "quoted" && bestPrice != null;
                      const unitPrice = hasQuote ? bestPrice : budget?.prix_median ?? null;
                      const totalPrice = unitPrice != null && item.quantity != null ? unitPrice * Number(item.quantity) : null;
                      const source = hasQuote ? "fournisseur" : budget?.source ?? null;

                      return (
                        <tr key={item.id} className="hover:bg-[#1C1C1F] text-sm">
                          <td className="px-4 py-2 text-xs font-mono text-[#71717A]">{item.item_number || "—"}</td>
                          <td className="px-4 py-2 text-[#FAFAFA]">
                            <div>{item.description}</div>
                            {item.product_name && (
                              <span className="inline-block mt-0.5 text-[11px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded font-medium">
                                {item.product_name}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center text-xs text-[#71717A]">{item.unit || "—"}</td>
                          <td className="px-4 py-2 text-right text-[#71717A]">
                            {item.quantity != null ? Number(item.quantity).toLocaleString("fr-CH") : "—"}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {item.cfc_code && (
                              <span className="text-xs font-mono bg-[#F97316]/10 text-[#F97316] px-1.5 py-0.5 rounded">
                                {item.cfc_code}
                              </span>
                            )}
                          </td>
                          {/* HIDDEN: Budget estimation temporarily disabled — prices unreliable */}
                          {false && hasBudget && (
                            <td className="px-4 py-2 text-right font-medium text-[#FAFAFA]">
                              {unitPrice != null ? formatCHF(unitPrice as number) : "—"}
                            </td>
                          )}
                          {false && hasBudget && (
                            <td className="px-4 py-2 text-right text-[#71717A]">
                              {totalPrice != null ? formatCHF(totalPrice as number) : "—"}
                            </td>
                          )}
                          {false && (
                          <td className="px-4 py-2 text-center">
                            {hasQuote ? (
                              <span className="text-[10px] font-medium bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-full">
                                Fournisseur
                              </span>
                            ) : source === "historique_interne" ? (
                              <span className="text-[10px] font-medium bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-full" title={budget?.detail_source}>
                                Fournisseur
                              </span>
                            ) : source === "referentiel_crb" ? (
                              <span className="text-[10px] font-medium bg-teal-500/10 text-teal-400 px-1.5 py-0.5 rounded-full" title={budget?.detail_source}>
                                CRB
                              </span>
                            ) : source === "benchmark_cantaia" ? (
                              <span className="text-[10px] font-medium bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-full" title={budget?.detail_source}>
                                Marché
                              </span>
                            ) : source === "estimation_ia" ? (
                              <span className="text-[10px] font-medium bg-[#F97316]/10 text-[#F97316] px-1.5 py-0.5 rounded-full">
                                IA
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium bg-[#27272A] text-[#71717A] px-1.5 py-0.5 rounded-full">
                                En attente
                              </span>
                            )}
                          </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tab 3: Comparative analysis ──────────────────────────────
function ComparisonTabContent({
  submissionId,
  items,
  materialGroups,
  priceRequests,
  quotes,
  awardedRequestId,
  onRefresh,
}: {
  submissionId: string;
  items: SubmissionItem[];
  materialGroups: string[];
  priceRequests: PriceRequestData[];
  quotes: QuoteData[];
  awardedRequestId: string | null;
  onRefresh: () => void;
}) {
  const [confirmAward, setConfirmAward] = useState<{ requestId: string; supplierName: string } | null>(null);
  const [awarding, setAwarding] = useState(false);
  const [awardError, setAwardError] = useState<string | null>(null);
  const [awardSuccess, setAwardSuccess] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [emailModal, setEmailModal] = useState<{ requestId: string; supplierName: string } | null>(null);
  const [emailData, setEmailData] = useState<{ subject: string; sender_email: string; sender_name: string; received_at: string; body_html: string | null; body_text: string | null } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Derive "effectively responded" requests: status === "responded" OR has associated quotes
  const requestIdsWithQuotes = new Set(quotes.map((q) => q.request_id));
  const effectivelyResponded = priceRequests.filter(
    (pr) => pr.status === "responded" || requestIdsWithQuotes.has(pr.id)
  );

  // Search filter
  const searchLower = searchQuery.toLowerCase().trim();
  const filteredItems = searchLower
    ? items.filter(
        (i) =>
          i.description?.toLowerCase().includes(searchLower) ||
          i.item_number?.toLowerCase().includes(searchLower) ||
          i.cfc_code?.toLowerCase().includes(searchLower) ||
          i.material_group?.toLowerCase().includes(searchLower) ||
          i.product_name?.toLowerCase().includes(searchLower)
      )
    : items;

  const respondedWithoutQuotes = priceRequests.filter(
    (pr) => (pr.status === "responded" || requestIdsWithQuotes.has(pr.id)) && !quotes.some((q) => q.request_id === pr.id)
  );

  const handleExtractPrices = async () => {
    setExtracting(true);
    setExtractResult(null);
    let totalExtracted = 0;
    try {
      for (const pr of respondedWithoutQuotes) {
        const res = await fetch("/api/submissions/receive-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tracking_code: pr.tracking_code }),
        });
        if (res.ok) {
          const json = await res.json();
          totalExtracted += json.quotes_extracted || 0;
        }
      }
      setExtractResult(totalExtracted > 0 ? `${totalExtracted} prix extraits` : "Aucun prix trouvé dans les emails");
      onRefresh();
    } catch (err: any) {
      setExtractResult(`Erreur: ${err.message}`);
    } finally {
      setExtracting(false);
    }
  };

  const handleAward = async () => {
    if (!confirmAward) return;
    setAwarding(true);
    setAwardError(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "award", price_request_id: confirmAward.requestId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Erreur lors de l'attribution");
      }
      setAwardSuccess(`Fournisseur "${confirmAward.supplierName}" attribué`);
      setConfirmAward(null);
      onRefresh();
      setTimeout(() => setAwardSuccess(null), 4000);
    } catch (err: any) {
      setAwardError(err.message || "Erreur inconnue");
    } finally {
      setAwarding(false);
    }
  };

  const openEmailModal = async (requestId: string, supplierName: string) => {
    setEmailModal({ requestId, supplierName });
    setEmailData(null);
    setEmailError(null);
    setEmailLoading(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/supplier-email?request_id=${requestId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      if (json.email) {
        setEmailData(json.email);
      } else {
        setEmailError("Aucun email de réponse trouvé pour ce fournisseur");
      }
    } catch (err: any) {
      setEmailError(err.message || "Erreur lors du chargement de l'email");
    } finally {
      setEmailLoading(false);
    }
  };

  if (quotes.length === 0) {
    const hasRespondedRequests = respondedWithoutQuotes.length > 0;
    return (
      <div className="text-center py-16">
        <BarChart3 className="h-12 w-12 text-[#71717A] mx-auto mb-3" />
        <p className="text-sm text-[#71717A]">
          {hasRespondedRequests ? `${respondedWithoutQuotes.length} réponse(s) reçue(s) — prix non encore extraits` : "Aucune offre reçue"}
        </p>
        <p className="text-xs text-[#71717A] mt-1">
          {hasRespondedRequests
            ? "Cliquez ci-dessous pour extraire automatiquement les prix des emails de réponse"
            : "Les résultats apparaîtront ici après réception des réponses fournisseurs"}
        </p>
        {hasRespondedRequests && (
          <button
            onClick={handleExtractPrices}
            disabled={extracting}
            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-[#F97316] hover:bg-[#EA580C] rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
          >
            {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            {extracting ? "Extraction en cours..." : "Extraire les prix"}
          </button>
        )}
        {extractResult && (
          <p className="text-xs mt-3 text-[#A1A1AA]">{extractResult}</p>
        )}
      </div>
    );
  }

  // Build comparison: for each item, show prices from each supplier
  // Use effectivelyResponded (status "responded" OR has quotes) instead of just status filter
  const supplierNames: Record<string, string> = {};
  for (const pr of effectivelyResponded) {
    supplierNames[pr.id] = pr.suppliers?.company_name || "Fournisseur";
  }

  // ── Export helpers ──────────────────────────────────────────
  const buildExportData = () => {
    const rows: Array<Record<string, any>> = [];
    for (const group of materialGroups) {
      const groupItems = filteredItems.filter((i) => i.material_group === group);
      const groupRequests = effectivelyResponded.filter((pr) => pr.material_group === group);
      if (groupRequests.length === 0) continue;
      for (const item of groupItems) {
        const row: Record<string, any> = {
          Groupe: group,
          "N° Poste": item.item_number || "",
          Description: item.description || "",
          Unité: item.unit || "",
          Quantité: item.quantity != null ? Number(item.quantity) : "",
        };
        const prices: number[] = [];
        for (const pr of groupRequests) {
          const q = quotes.find((qt) => qt.request_id === pr.id && qt.item_id === item.id);
          const price = q?.unit_price_ht ?? null;
          row[supplierNames[pr.id] || "Fournisseur"] = price != null ? price : "";
          if (price != null) prices.push(price);
        }
        const min = prices.length > 0 ? Math.min(...prices) : null;
        const max = prices.length > 0 ? Math.max(...prices) : null;
        row["Écart (%)"] = min && max && min > 0 ? Math.round(((max - min) / min) * 100) : "";
        rows.push(row);
      }
    }
    return rows;
  };

  const handleExportExcel = async () => {
    const XLSX = await import("xlsx");
    const data = buildExportData();
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    // Auto-size columns
    const colWidths = Object.keys(data[0]).map((key) => {
      const maxLen = Math.max(key.length, ...data.map((r) => String(r[key] ?? "").length));
      return { wch: Math.min(maxLen + 2, 60) };
    });
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analyse comparative");
    XLSX.writeFile(wb, `analyse-comparative-${submissionId.slice(0, 8)}.xlsx`);
  };

  const handleExportPdf = async () => {
    const { default: jsPDF } = await import("jspdf");
    const data = buildExportData();
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const pageW = doc.internal.pageSize.getWidth();

    // ── Header bar ──
    doc.setFillColor(15, 15, 17); // #0F0F11
    doc.rect(0, 0, pageW, 22, "F");
    doc.setFillColor(249, 115, 22); // #F97316 orange accent line
    doc.rect(0, 22, pageW, 1.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(250, 250, 250); // #FAFAFA
    doc.text("Cantaia", 12, 14);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(161, 161, 170); // #A1A1AA
    doc.text("Analyse comparative des prix", 42, 14);
    doc.setFontSize(8);
    doc.text(new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "long", year: "numeric" }), pageW - 12, 14, { align: "right" });

    // ── Table ──
    const startY = 28;
    const rowH = 7;
    const margin = 8;
    const availW = pageW - margin * 2;
    // Proportional column widths: Description gets more space
    const descIdx = headers.indexOf("Description");
    const baseCols = headers.length - 1; // all except Description
    const descShare = 3; // Description = 3x normal column
    const totalShares = baseCols + descShare;
    const colW = availW / totalShares;
    const colWidths = headers.map((_, i) => i === descIdx ? colW * descShare : colW);

    let y = startY;
    // Header row
    doc.setFillColor(39, 39, 42); // #27272A
    doc.rect(margin, y, availW, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(250, 250, 250);
    let x = margin;
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x + 1.5, y + 5, { maxWidth: colWidths[i] - 3 });
      x += colWidths[i];
    }
    y += rowH;

    // Data rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    let currentGroup = "";
    for (const row of data) {
      // New page check
      if (y + rowH > doc.internal.pageSize.getHeight() - 10) {
        doc.addPage();
        y = 10;
      }
      // Group separator
      if (row.Groupe !== currentGroup) {
        currentGroup = row.Groupe;
        doc.setFillColor(24, 24, 27); // #18181B
        doc.rect(margin, y, availW, rowH, "F");
        doc.setFont("helvetica", "bold");
        doc.setTextColor(249, 115, 22); // orange
        doc.text(String(currentGroup), margin + 1.5, y + 5);
        doc.setFont("helvetica", "normal");
        y += rowH;
        if (y + rowH > doc.internal.pageSize.getHeight() - 10) {
          doc.addPage();
          y = 10;
        }
      }
      // Alternate row bg
      const rowIdx = data.indexOf(row);
      if (rowIdx % 2 === 0) {
        doc.setFillColor(24, 24, 27); // #18181B
        doc.rect(margin, y, availW, rowH, "F");
      }
      x = margin;
      doc.setTextColor(200, 200, 200);
      for (let i = 0; i < headers.length; i++) {
        const val = row[headers[i]];
        const text = val != null && val !== "" ? String(typeof val === "number" && i >= 5 ? val.toFixed(2) : val) : "—";
        // Right-align numeric columns (after Quantité)
        if (i >= 4 && headers[i] !== "Description") {
          doc.text(text, x + colWidths[i] - 1.5, y + 5, { align: "right", maxWidth: colWidths[i] - 3 });
        } else {
          doc.text(text, x + 1.5, y + 5, { maxWidth: colWidths[i] - 3 });
        }
        x += colWidths[i];
      }
      // Row border
      doc.setDrawColor(39, 39, 42);
      doc.line(margin, y + rowH, margin + availW, y + rowH);
      y += rowH;
    }

    // ── Footer ──
    const footerY = doc.internal.pageSize.getHeight() - 6;
    doc.setFontSize(6);
    doc.setTextColor(113, 113, 122);
    doc.text("Cantaia — L'IA au service du chantier", margin, footerY);
    doc.text(`Généré le ${new Date().toLocaleDateString("fr-CH")}`, pageW - margin, footerY, { align: "right" });

    doc.save(`analyse-comparative-${submissionId.slice(0, 8)}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Toolbar: search + export */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#71717A]" />
          <input
            type="text"
            placeholder="Rechercher par description, n° poste, code CFC..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-[#18181B] border border-[#27272A] rounded-lg text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none focus:border-[#F97316]/50 focus:ring-1 focus:ring-[#F97316]/30"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-[#FAFAFA]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {searchQuery && (
          <span className="text-xs text-[#71717A]">{filteredItems.length} résultat(s)</span>
        )}
        <div className="flex gap-2 sm:ml-auto">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#FAFAFA] border border-[#27272A] rounded-lg hover:bg-[#1C1C1F] transition-colors"
          >
            <FileDown className="h-3.5 w-3.5 text-green-500" />
            Excel
          </button>
          <button
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#FAFAFA] border border-[#27272A] rounded-lg hover:bg-[#1C1C1F] transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-red-400" />
            PDF
          </button>
        </div>
      </div>

      {/* Award success banner */}
      {awardSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {awardSuccess}
        </div>
      )}
      {/* Award error banner */}
      {awardError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {awardError}
          <button onClick={() => setAwardError(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Confirm award dialog */}
      {confirmAward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[#18181B] rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-[#FAFAFA] mb-2">Attribuer la soumission</h3>
            <p className="text-sm text-[#71717A] mb-5">
              Attribuer cette soumission à <strong>{confirmAward.supplierName}</strong> ?
              Les autres fournisseurs seront marqués comme non retenus.
            </p>
            {awardError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {awardError}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setConfirmAward(null); setAwardError(null); }}
                disabled={awarding}
                className="px-4 py-2 text-sm font-medium text-[#FAFAFA] border border-[#27272A] rounded-lg hover:bg-[#1C1C1F] disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleAward}
                disabled={awarding}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {awarding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Attribuer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier email modal */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEmailModal(null)}>
          <div className="bg-[#18181B] rounded-xl shadow-2xl border border-[#27272A] max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#27272A]">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F97316]/10">
                  <Mail className="h-4 w-4 text-[#F97316]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#FAFAFA]">Email de réponse</h3>
                  <p className="text-xs text-[#71717A]">{emailModal.supplierName}</p>
                </div>
              </div>
              <button onClick={() => setEmailModal(null)} className="text-[#71717A] hover:text-[#FAFAFA] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {emailLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
                  <span className="ml-2 text-sm text-[#71717A]">Chargement de l'email...</span>
                </div>
              )}
              {emailError && !emailLoading && (
                <div className="text-center py-12">
                  <Mail className="h-10 w-10 text-[#52525B] mx-auto mb-3" />
                  <p className="text-sm text-[#71717A]">{emailError}</p>
                  <p className="text-xs text-[#52525B] mt-1">L'email de réponse n'a pas pu être retrouvé.</p>
                </div>
              )}
              {emailData && !emailLoading && (
                <div className="space-y-4">
                  {/* Email metadata */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-[#71717A] w-12 shrink-0 pt-0.5">De</span>
                      <div>
                        <span className="text-sm text-[#FAFAFA]">{emailData.sender_name || emailData.sender_email}</span>
                        {emailData.sender_name && (
                          <span className="text-xs text-[#71717A] ml-2">&lt;{emailData.sender_email}&gt;</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#71717A] w-12 shrink-0">Objet</span>
                      <span className="text-sm text-[#FAFAFA] font-medium">{emailData.subject}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#71717A] w-12 shrink-0">Date</span>
                      <span className="text-xs text-[#A1A1AA]">
                        {new Date(emailData.received_at).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>

                  {/* Separator */}
                  <div className="border-t border-[#27272A]" />

                  {/* Email body */}
                  <div className="bg-white text-black rounded-lg p-4 text-sm leading-relaxed overflow-auto max-h-[45vh]">
                    {emailData.body_html ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: emailData.body_html }}
                        className="[&_img]:max-w-full [&_img]:h-auto [&_table]:border-collapse [&_td]:p-1"
                      />
                    ) : emailData.body_text ? (
                      <pre className="whitespace-pre-wrap font-sans">{emailData.body_text}</pre>
                    ) : (
                      <p className="text-[#71717A] italic">Contenu de l'email non disponible</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {materialGroups.map((group) => {
        const groupItems = filteredItems.filter((i) => i.material_group === group);
        const groupRequests = effectivelyResponded.filter((pr) => pr.material_group === group);
        if (groupRequests.length === 0 || groupItems.length === 0) return null;

        return (
          <div key={group} className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-[#27272A] border-b border-[#27272A] flex items-center gap-3">
              <span className="text-sm font-medium text-[#FAFAFA]">{group}</span>
              <span className="text-xs text-[#71717A]">{groupRequests.length} offre(s) · {groupItems.length} poste(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-[#27272A] text-[11px] font-medium text-[#71717A] uppercase">
                    <th className="text-left px-3 py-2 sticky left-0 bg-[#18181B] z-10 min-w-[280px]">Description</th>
                    <th className="text-center px-2 py-2 w-12">Unité</th>
                    <th className="text-right px-2 py-2 w-16">Qté</th>
                    {groupRequests.map((pr) => {
                      const isAwarded = awardedRequestId === pr.id;
                      const hasAward = !!awardedRequestId;
                      return (
                        <th key={pr.id} className={`px-3 py-2 w-32 ${isAwarded ? "bg-emerald-500/10" : ""}`}>
                          <div className="text-xs font-medium text-[#FAFAFA] text-right">{supplierNames[pr.id]}</div>
                          {isAwarded ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full mt-0.5">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Attribué
                            </span>
                          ) : hasAward ? (
                            <span className="inline-flex text-[9px] font-medium text-[#71717A] bg-[#27272A] px-1.5 py-0.5 rounded-full mt-0.5">
                              Non retenu
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmAward({ requestId: pr.id, supplierName: supplierNames[pr.id] })}
                              className="mt-0.5 text-[9px] font-medium text-emerald-400 border border-emerald-500/30 bg-[#18181B] hover:bg-emerald-500/10 px-1.5 py-0.5 rounded-full transition-colors"
                            >
                              Attribuer
                            </button>
                          )}
                        </th>
                      );
                    })}
                    <th className="text-right px-3 py-2 w-20 bg-[#27272A]">Ecart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {groupItems.map((item) => {
                    const prices = groupRequests.map((pr) => {
                      const q = quotes.find((q) => q.request_id === pr.id && q.item_id === item.id);
                      return { requestId: pr.id, price: q?.unit_price_ht ?? null };
                    });
                    const validPrices = prices.filter((p) => p.price !== null).map((p) => p.price!);
                    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
                    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;
                    const gap = minPrice && maxPrice && minPrice > 0 ? Math.round(((maxPrice - minPrice) / minPrice) * 100) : null;

                    return (
                      <tr key={item.id} className="hover:bg-[#1C1C1F] text-sm">
                        <td className="px-3 py-2 sticky left-0 bg-[#18181B] z-10">
                          <div className="text-xs font-mono text-[#71717A]">{item.item_number}</div>
                          <div className="text-sm text-[#FAFAFA] whitespace-normal">{item.description}</div>
                        </td>
                        <td className="px-2 py-2 text-center text-xs text-[#71717A]">{item.unit}</td>
                        <td className="px-2 py-2 text-right text-[#71717A] text-xs">
                          {item.quantity != null ? Number(item.quantity).toLocaleString("fr-CH") : "—"}
                        </td>
                        {prices.map((p) => {
                          const isCheapest = p.price !== null && p.price === minPrice;
                          const isMostExpensive = p.price !== null && p.price === maxPrice && validPrices.length > 1;
                          const prReq = groupRequests.find((r) => r.id === p.requestId);
                          return (
                            <td
                              key={p.requestId}
                              onClick={() => {
                                if (p.price !== null && prReq) {
                                  openEmailModal(p.requestId, supplierNames[p.requestId] || "Fournisseur");
                                }
                              }}
                              className={`px-3 py-2 text-right text-sm ${
                                isCheapest ? "text-green-400 font-bold bg-green-500/10" :
                                isMostExpensive ? "text-red-600" : "text-[#FAFAFA]"
                              } ${p.price !== null ? "cursor-pointer hover:bg-[#27272A]/50 transition-colors" : ""}`}
                              title={p.price !== null ? "Cliquer pour voir l'email du fournisseur" : undefined}
                            >
                              {p.price !== null ? (
                                <span className="inline-flex items-center gap-1">
                                  {p.price.toFixed(2)}
                                  <Mail className="h-3 w-3 text-[#52525B] opacity-0 group-hover:opacity-100" />
                                </span>
                              ) : (
                                <span className="text-xs text-[#71717A]">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right bg-[#27272A]">
                          {gap !== null ? (
                            <span className={`text-xs font-medium ${gap > 15 ? "text-red-600" : gap > 5 ? "text-amber-600" : "text-green-600"}`}>
                              {gap}%
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab 4: Summary ───────────────────────────────────────────
function SummaryTabContent({
  submission,
  items,
  materialGroups,
  priceRequests,
  quotes,
}: {
  submission: SubmissionData;
  items: SubmissionItem[];
  materialGroups: string[];
  priceRequests: PriceRequestData[];
  quotes: QuoteData[];
}) {
  const sentCount = priceRequests.filter((pr) => pr.sent_at).length;
  // Count "responded" = status "responded" OR has associated quotes in DB
  const requestIdsWithQuotes = new Set(quotes.map((q) => q.request_id));
  const respondedCount = priceRequests.filter((pr) => pr.status === "responded" || requestIdsWithQuotes.has(pr.id)).length;
  const quotedItems = items.filter((i) => i.status === "quoted").length;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-[#FAFAFA]">{items.length}</div>
          <div className="text-xs text-[#71717A] mt-1">Postes</div>
        </div>
        <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-[#FAFAFA]">{materialGroups.length}</div>
          <div className="text-xs text-[#71717A] mt-1">Groupes</div>
        </div>
        <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-[#F97316]">{sentCount}</div>
          <div className="text-xs text-[#71717A] mt-1">Demandes envoyées</div>
        </div>
        <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{respondedCount}</div>
          <div className="text-xs text-[#71717A] mt-1">Réponses reçues</div>
        </div>
      </div>

      {/* Progress */}
      {sentCount > 0 && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4">
          <h3 className="text-sm font-medium text-[#FAFAFA] mb-3">Avancement</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-[#71717A] mb-1">
                <span>Postes cotés</span>
                <span>{quotedItems}/{items.length}</span>
              </div>
              <div className="h-2 bg-[#27272A] rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${items.length > 0 ? (quotedItems / items.length) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-[#71717A] mb-1">
                <span>Fournisseurs répondus</span>
                <span>{respondedCount}/{sentCount}</span>
              </div>
              <div className="h-2 bg-[#27272A] rounded-full overflow-hidden">
                <div className="h-full bg-[#F97316]/100 rounded-full" style={{ width: `${sentCount > 0 ? (respondedCount / sentCount) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Project info */}
      {submission.projects && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4">
          <h3 className="text-sm font-medium text-[#FAFAFA] mb-3">Informations</h3>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-[#71717A]">Projet</dt>
              <dd className="text-[#FAFAFA]">{submission.projects.name}</dd>
            </div>
            {submission.projects.client_name && (
              <div>
                <dt className="text-xs text-[#71717A]">Client</dt>
                <dd className="text-[#FAFAFA]">{submission.projects.client_name}</dd>
              </div>
            )}
            {submission.projects.city && (
              <div>
                <dt className="text-xs text-[#71717A]">Ville</dt>
                <dd className="text-[#FAFAFA]">{submission.projects.city}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-[#71717A]">Fichier</dt>
              <dd className="text-[#FAFAFA]">{submission.file_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#71717A]">Date</dt>
              <dd className="text-[#FAFAFA]">{new Date(submission.created_at).toLocaleDateString("fr-CH")}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Material groups breakdown */}
      {materialGroups.length > 0 && (
        <div className="bg-[#18181B] border border-[#27272A] rounded-lg p-4">
          <h3 className="text-sm font-medium text-[#FAFAFA] mb-3">Répartition par groupe</h3>
          <div className="space-y-2">
            {materialGroups.map((group) => {
              const count = items.filter((i) => i.material_group === group).length;
              const pct = items.length > 0 ? (count / items.length) * 100 : 0;
              return (
                <div key={group} className="flex items-center gap-3">
                  <span className="text-xs text-[#FAFAFA] w-40 truncate">{group}</span>
                  <div className="flex-1 h-2 bg-[#27272A] rounded-full overflow-hidden">
                    <div className="h-full bg-[#F97316]/60 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-[#71717A] w-12 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Feedback stats banner ────────────────────────────────────
function FeedbackBanner({ stats, budget }: { stats: FeedbackStats | null; budget: BudgetResult }) {
  // Source distribution percentages from current budget
  const total = budget.estimates.length || 1;
  const sb = budget.source_breakdown ?? { historique_interne: 0, benchmark_cantaia: 0, referentiel_crb: 0, estimation_ia: 0, non_estime: 0 };
  const pctReal = Math.round(((sb.historique_interne ?? 0) / total) * 100);
  const pctMarket = Math.round(((sb.benchmark_cantaia ?? 0) / total) * 100);
  const pctCrb = Math.round(((sb.referentiel_crb ?? 0) / total) * 100);
  const pctAi = Math.round(((sb.estimation_ia ?? 0) / total) * 100);
  const pctOther = Math.max(0, 100 - pctReal - pctMarket - pctCrb - pctAi);

  const accuracyPct = stats?.avg_accuracy != null ? Math.round(stats.avg_accuracy * 100) : null;

  return (
    <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 className="h-4 w-4 text-[#F97316]" />
        <span className="text-sm font-medium text-[#FAFAFA]">Intelligence prix</span>
        <span className="text-xs text-[#71717A] ml-auto">Base de données de votre organisation</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Price count */}
        <div className="flex items-start gap-2 bg-[#27272A] rounded-lg p-3">
          <Database className="h-4 w-4 text-[#F97316] mt-0.5 shrink-0" />
          <div>
            <div className="text-lg font-bold text-[#FAFAFA]">{(stats?.price_count ?? 0).toLocaleString("fr-CH")}</div>
            <div className="text-[11px] text-[#71717A]">Prix fournisseurs enregistrés</div>
          </div>
        </div>

        {/* Accuracy */}
        <div className="flex items-start gap-2 bg-[#27272A] rounded-lg p-3">
          <TrendingUp className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-lg font-bold text-[#FAFAFA]">
              {accuracyPct != null ? `${accuracyPct}%` : "—"}
            </div>
            <div className="text-[11px] text-[#71717A]">
              Précision moyenne
              {stats?.calibration_count ? ` (${stats.calibration_count} calibr.)` : ""}
            </div>
          </div>
        </div>

        {/* Source distribution */}
        <div className="sm:col-span-2 bg-[#27272A] rounded-lg p-3">
          <div className="text-[11px] text-[#71717A] mb-1.5">Répartition des sources — cette estimation</div>
          {/* Stacked bar */}
          <div className="flex h-3 w-full rounded-full overflow-hidden gap-px">
            {pctReal > 0 && (
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${pctReal}%` }}
                title={`Réel fournisseur: ${pctReal}%`}
              />
            )}
            {pctMarket > 0 && (
              <div
                className="bg-purple-500 transition-all"
                style={{ width: `${pctMarket}%` }}
                title={`Benchmark marché: ${pctMarket}%`}
              />
            )}
            {pctCrb > 0 && (
              <div
                className="bg-teal-500 transition-all"
                style={{ width: `${pctCrb}%` }}
                title={`CRB 2025: ${pctCrb}%`}
              />
            )}
            {pctAi > 0 && (
              <div
                className="bg-[#F97316]/60 transition-all"
                style={{ width: `${pctAi}%` }}
                title={`IA: ${pctAi}%`}
              />
            )}
            {pctOther > 0 && (
              <div
                className="bg-[#27272A] transition-all"
                style={{ width: `${pctOther}%` }}
                title={`Non estimé: ${pctOther}%`}
              />
            )}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {pctReal > 0 && <span className="flex items-center gap-1 text-[10px] text-[#71717A]"><span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />Réel {pctReal}%</span>}
            {pctMarket > 0 && <span className="flex items-center gap-1 text-[10px] text-[#71717A]"><span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />Marché {pctMarket}%</span>}
            {pctCrb > 0 && <span className="flex items-center gap-1 text-[10px] text-[#71717A]"><span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />CRB {pctCrb}%</span>}
            {pctAi > 0 && <span className="flex items-center gap-1 text-[10px] text-[#71717A]"><span className="w-2 h-2 rounded-full bg-[#F97316]/60 shrink-0" />IA {pctAi}%</span>}
          </div>
        </div>
      </div>

      {/* Monthly trend sparkline */}
      {stats?.monthly_trend && stats.monthly_trend.length >= 2 && (
        <div className="border-t border-[#27272A] pt-3">
          <div className="text-[11px] text-[#71717A] mb-1.5">Tendance précision des estimations (6 derniers mois)</div>
          <div className="h-12">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.monthly_trend} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="accuracyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{ fontSize: "11px", padding: "4px 8px", border: "1px solid #27272A", borderRadius: "6px", backgroundColor: "#18181B", color: "#FAFAFA" }}
                  formatter={(v: number) => [`${Math.round(v * 100)}%`, "Précision"]}
                  labelFormatter={(label: string) => label}
                />
                <Area
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#F97316"
                  strokeWidth={1.5}
                  fill="url(#accuracyGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 5: Budget IA ────────────────────────────────────────
function BudgetTabContent({
  submissionId,
  items,
  budgetEstimate: initialBudget,
  feedbackStats: initialFeedback,
}: {
  submissionId: string;
  items: SubmissionItem[];
  budgetEstimate: BudgetResult | null;
  feedbackStats?: FeedbackStats | null;
}) {
  const [budget, setBudget] = useState<BudgetResult | null>(initialBudget);
  const [feedback, setFeedback] = useState<FeedbackStats | null>(initialFeedback ?? null);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEstimate() {
    setEstimating(true);
    setError(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/estimate-budget`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setBudget(json);
        if (json.feedback) setFeedback(json.feedback);
      } else {
        setError(json.error || "Erreur lors de l'estimation");
      }
    } catch (err: any) {
      setError(err.message || "Erreur réseau");
    }
    setEstimating(false);
  }

  function formatCHF(n: number) {
    return n.toLocaleString("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <Calculator className="h-12 w-12 text-[#71717A] mx-auto mb-3" />
        <p className="text-sm text-[#71717A]">Analysez d&apos;abord le descriptif</p>
      </div>
    );
  }

  if (!budget) {
    return (
      <div className="text-center py-16">
        <Calculator className="h-12 w-12 text-[#71717A] mx-auto mb-3" />
        <p className="text-sm text-[#71717A] mb-4">Estimez le budget de cette soumission avec l&apos;IA</p>
        <p className="text-xs text-[#71717A] mb-6 max-w-md mx-auto">
          L&apos;estimation utilise vos offres fournisseurs, les prix du marché, le référentiel CRB 2025, et l&apos;IA en dernier recours.
        </p>
        {error && (
          <div className="mb-4 text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 inline-block">
            {error}
          </div>
        )}
        <button
          onClick={handleEstimate}
          disabled={estimating}
          className="px-6 py-2.5 bg-cta text-white rounded-lg text-sm font-medium hover:bg-[#EA580C] disabled:opacity-50 flex items-center gap-2 mx-auto"
        >
          {estimating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
          {estimating ? "Estimation en cours..." : `Estimer le budget (${items.length} postes)`}
        </button>
      </div>
    );
  }

  // Group estimates by material_group
  const estimatesByGroup: Record<string, BudgetEstimate[]> = {};
  for (const est of budget.estimates) {
    const group = est.material_group || "Divers";
    if (!estimatesByGroup[group]) estimatesByGroup[group] = [];
    estimatesByGroup[group].push(est);
  }

  return (
    <div className="space-y-6">
      {/* Total banner */}
      <div className="bg-gradient-to-r from-[#F97316]/5 to-[#18181B] border border-[#F97316]/20 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-[#FAFAFA]">Budget estimé</h3>
          <button
            onClick={handleEstimate}
            disabled={estimating}
            className="text-xs px-3 py-1.5 border border-[#27272A] rounded-lg hover:bg-[#18181B] text-[#71717A] flex items-center gap-1.5"
          >
            {estimating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Recalculer
          </button>
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-xs text-[#71717A] mb-1">Minimum</div>
            <div className="text-xl font-bold text-[#71717A]">CHF {formatCHF(budget.total_min)}</div>
          </div>
          <div>
            <div className="text-xs text-[#71717A] mb-1">Médiane</div>
            <div className="text-2xl font-bold text-[#F97316]">CHF {formatCHF(budget.total_median)}</div>
          </div>
          <div>
            <div className="text-xs text-[#71717A] mb-1">Maximum</div>
            <div className="text-xl font-bold text-[#71717A]">CHF {formatCHF(budget.total_max)}</div>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-[#71717A] flex-wrap">
          {(budget.source_breakdown?.historique_interne ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              {budget.source_breakdown!.historique_interne} prix réels
            </span>
          )}
          {(budget.source_breakdown?.benchmark_cantaia ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              {budget.source_breakdown!.benchmark_cantaia} benchmark marché
            </span>
          )}
          {(budget.source_breakdown?.referentiel_crb ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              {budget.source_breakdown!.referentiel_crb} CRB 2025
            </span>
          )}
          {budget.ai_count > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#F97316]/100"></span>
              {budget.ai_count} estimés IA
            </span>
          )}
          {budget.unestimated_count > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#27272A]"></span>
              {budget.unestimated_count} non estimés
            </span>
          )}
        </div>
      </div>

      {/* Intelligence prix feedback banner */}
      <FeedbackBanner stats={feedback} budget={budget} />

      {/* Monte Carlo simulation */}
      {budget.estimates.length > 0 && (
        <MonteCarloChart items={budget.estimates} />
      )}

      {/* Detail by group */}
      {Object.entries(estimatesByGroup).sort(([a], [b]) => a.localeCompare(b)).map(([group, ests]) => {
        const groupMedian = ests.reduce((s, e) => s + (e.quantity ?? 0) * e.prix_median, 0);

        return (
          <div key={group} className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-[#27272A] border-b border-[#27272A] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[#FAFAFA]">{group}</span>
                <span className="text-xs text-[#71717A]">{ests.length} postes</span>
              </div>
              <span className="text-sm font-semibold text-[#FAFAFA]">CHF {formatCHF(Math.round(groupMedian))}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-[#27272A]/50 text-[11px] font-medium text-[#71717A] uppercase">
                    <th className="text-left px-3 py-2 w-16">N°</th>
                    <th className="text-left px-3 py-2">Description</th>
                    <th className="text-center px-3 py-2 w-14">Unité</th>
                    <th className="text-right px-3 py-2 w-16">Qté</th>
                    <th className="text-right px-3 py-2 w-20">PU min</th>
                    <th className="text-right px-3 py-2 w-20">PU méd.</th>
                    <th className="text-right px-3 py-2 w-20">PU max</th>
                    <th className="text-right px-3 py-2 w-24">Total méd.</th>
                    <th className="text-center px-3 py-2 w-16">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ests.map((est) => {
                    const total = (est.quantity ?? 0) * est.prix_median;
                    return (
                      <tr key={est.item_id} className="text-sm hover:bg-[#1C1C1F]">
                        <td className="px-3 py-2 text-xs font-mono text-[#71717A]">{est.item_number || "—"}</td>
                        <td className="px-3 py-2 text-[#FAFAFA] truncate max-w-[250px]">{est.description}</td>
                        <td className="px-3 py-2 text-center text-xs text-[#71717A]">{est.unit || "—"}</td>
                        <td className="px-3 py-2 text-right text-[#71717A] text-xs">
                          {est.quantity != null ? Number(est.quantity).toLocaleString("fr-CH") : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-[#71717A]">
                          {est.prix_min > 0 ? est.prix_min.toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-medium text-[#FAFAFA]">
                          {est.prix_median > 0 ? est.prix_median.toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-[#71717A]">
                          {est.prix_max > 0 ? est.prix_max.toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-[#FAFAFA]">
                          {total > 0 ? formatCHF(Math.round(total)) : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {est.source === "historique_interne" ? (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-medium" title={est.detail_source || "Prix réels fournisseurs"}>Réel</span>
                          ) : est.source === "benchmark_cantaia" ? (
                            <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded font-medium" title={est.detail_source || "Benchmark marché"}>Marché</span>
                          ) : est.source === "referentiel_crb" ? (
                            <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded font-medium" title={est.detail_source || "Référentiel CRB 2025"}>CRB</span>
                          ) : est.source === "estimation_ia" ? (
                            <span className="text-[10px] bg-[#F97316]/10 text-[#F97316] px-1.5 py-0.5 rounded font-medium">IA</span>
                          ) : (
                            <span className="text-[10px] bg-[#27272A] text-[#71717A] px-1.5 py-0.5 rounded">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
