"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import type { PlanDetail, AnalysisData } from "@/components/plans/plan-detail-types";
import { PlanDetailHeader } from "@/components/plans/PlanDetailHeader";
import { PlanDetailTabs } from "@/components/plans/PlanDetailTabs";
import type { PlanTab } from "@/components/plans/PlanDetailTabs";
import { PlanViewer } from "@/components/plans/PlanViewer";
import { PlanVersionsTab } from "@/components/plans/PlanVersionsTab";
import { PlanInfoTab } from "@/components/plans/PlanInfoTab";
import { PlanAnalysisTab } from "@/components/plans/PlanAnalysisTab";
import { PlanEstimationTab } from "@/components/plans/PlanEstimationTab";
import QuantityCorrectionModal from "@/components/plans/QuantityCorrectionModal";
import PriceCalibrationModal from "@/components/plans/PriceCalibrationModal";
import type { CrossPlanData } from "@/components/plans/PlanAlertsBanner";
import { useActiveProject } from "@/lib/contexts/active-project-context";
import { ProjectBreadcrumb } from "@/components/ui/ProjectBreadcrumb";
import { useAgent } from "@/lib/hooks/use-agent";
import { AgentAnalysisPanel } from "@/components/agents/AgentAnalysisPanel";

const USE_MANAGED_AGENTS = process.env.NEXT_PUBLIC_USE_MANAGED_AGENTS === "true";

export default function PlanDetailPage() {
  const params = useParams();
  const planId = params.id as string;
  const t = useTranslations("plans");

  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PlanTab>("viewer");

  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [, setAnalysisCached] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  const [estimationV2, setEstimationV2] = useState<any>(null);
  const [estimatingV2, setEstimatingV2] = useState(false);
  const [estimationV2Error, setEstimationV2Error] = useState("");
  const [crossPlan, setCrossPlan] = useState<CrossPlanData | null>(null);

  const [correctionPoste, setCorrectionPoste] = useState<any>(null);
  const [calibrationPoste, setCalibrationPoste] = useState<any>(null);

  // ── Managed Agent integration (feature-flagged) ──────────
  const estimatorAgent = useAgent("plan-estimator");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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

  const { setActiveProject } = useActiveProject();

  useEffect(() => {
    if (plan?.project_id) {
      setActiveProject(plan.project_id);
    }
  }, [plan?.project_id, setActiveProject]);

  // ── Agent completion effect ──────────────────────────────
  const fetchSavedEstimation = useCallback(async (retries = 3) => {
    if (!planId) return;
    for (let attempt = 0; attempt < retries; attempt++) {
      // FIX: Abort retry loop if component unmounted (prevents setState on unmounted component)
      if (!mountedRef.current) return;
      try {
        const res = await fetch(`/api/plans/estimate-v2?plan_id=${planId}`);
        if (res.ok) {
          const json = await res.json();
          if (json.estimation && mountedRef.current) {
            setEstimationV2(json.estimation);
            return; // Success — stop retrying
          }
        }
        // 404 or no estimation — wait before retrying (DB write may still be in-flight)
        if (attempt < retries - 1) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch {
        if (attempt < retries - 1) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
  }, [planId]);

  useEffect(() => {
    if (!USE_MANAGED_AGENTS) return;
    if (estimatorAgent.status === "completed") {
      setEstimatingV2(false);
      // Agent's save_estimation stored the result in DB — fetch with retry
      // (the DB write may still be committing when the stream signals completion)
      fetchSavedEstimation(3);
    } else if (estimatorAgent.status === "failed") {
      setEstimatingV2(false);
      setEstimationV2Error(estimatorAgent.error || "L'agent d'estimation a échoué");
    } else if (estimatorAgent.status === "cancelled") {
      setEstimatingV2(false);
    }
  }, [estimatorAgent.status, estimatorAgent.error, fetchSavedEstimation]);

  // ── Agent-powered estimation handler ─────────────────────
  const handleAgentEstimate = useCallback(async () => {
    if (!plan || estimatorAgent.isRunning) return;
    setEstimatingV2(true);
    setEstimationV2Error("");
    setEstimationV2(null);
    await estimatorAgent.start(
      { plan_id: plan.id },
      `Analyse le plan "${plan.plan_title || plan.id}" et produis une estimation chiffrée complète. ` +
        `Appelle fetch_plan_image avec plan_id="${plan.id}" pour télécharger l'image, ` +
        `analyse visuellement le plan (identification + métré par CFC), ` +
        `puis appelle query_reference_prices avec les postes extraits, ` +
        `et enfin appelle save_estimation avec plan_id="${plan.id}" et le résultat JSON complet.`,
      `Estimation plan ${plan.plan_title || plan.id}`
    );
  }, [plan, estimatorAgent]);

  const autoFillPlanInfo = async (result: any) => {
    if (!plan) return;
    const tb = result.title_block;
    const updates: Record<string, any> = {};

    if (!plan.scale && tb?.scale) updates.scale = tb.scale;
    if (!plan.author_name && tb?.author) updates.author_name = tb.author;
    if (!plan.author_company && tb?.company) updates.author_company = tb.company;
    if (!plan.discipline && result.discipline) {
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
      fetchPlan();
    } catch {
      // Silent
    }
  };

  const handleAnalyze = async (force = false) => {
    if (!plan) return;
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min
      const res = await fetch("/api/ai/analyze-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: plan.id, force }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.success) {
        setAnalysis(data.analysis);
        setAnalysisCached(!!data.cached);
        if (!data.cached && data.analysis?.analysis_result?.title_block) {
          autoFillPlanInfo(data.analysis.analysis_result);
        }
      } else {
        setAnalysisError(data.error || "Erreur lors de l'analyse");
      }
    } catch (err: any) {
      console.error("[analyze] Error:", err);
      if (err?.name === "AbortError") {
        setAnalysisError("L'analyse a pris trop de temps. Réessayez.");
      } else {
        setAnalysisError("Erreur réseau");
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleEstimateV2 = async () => {
    if (!plan) return;
    setEstimatingV2(true);
    setEstimationV2Error("");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000);
      const res = await fetch("/api/plans/estimate-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: plan.id,
          project_id: plan.project_id,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (res.ok && data.estimation) {
        setEstimationV2(data.estimation);
        if (data.cross_plan) {
          setCrossPlan(data.cross_plan);
        }
      } else {
        setEstimationV2Error(data.error || "Erreur lors de l'estimation");
      }
    } catch (err: any) {
      console.error("[estimate-v2] Error:", err);
      if (err?.name === "AbortError") {
        setEstimationV2Error("L'estimation a pris trop de temps. Réessayez.");
      } else {
        setEstimationV2Error("Erreur réseau");
      }
    } finally {
      setEstimatingV2(false);
    }
  };

  const handleSaveCorrection = async (data: { quantite_corrigee: number; raison: string; commentaire?: string }) => {
    if (!correctionPoste || !estimationV2) return;
    await fetch("/api/plans/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estimation_id: estimationV2.plan_id,
        cfc_code: correctionPoste.cfc_code,
        quantite_estimee: correctionPoste.quantite,
        quantite_corrigee: data.quantite_corrigee,
        raison: data.raison,
        commentaire: data.commentaire,
      }),
    });
    setCorrectionPoste(null);
  };

  const handleSaveCalibration = async (data: { prix_reel: number; source: string; fournisseur_nom?: string }) => {
    if (!calibrationPoste || !estimationV2) return;
    await fetch("/api/plans/calibration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estimation_id: estimationV2.plan_id,
        cfc_code: calibrationPoste.cfc_code,
        prix_reel: data.prix_reel,
        source: data.source,
        fournisseur_nom: data.fournisseur_nom,
      }),
    });
    setCalibrationPoste(null);
  };

  // Switch estimation handler based on feature flag
  const handleEstimate = USE_MANAGED_AGENTS ? handleAgentEstimate : handleEstimateV2;

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
      <div className="flex-1 overflow-y-auto min-h-full bg-[#0F0F11]">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <Link href="/plans" className="flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#FAFAFA] mb-4">
            <ArrowLeft className="h-4 w-4" />
            {t("title")}
          </Link>
          <div className="flex flex-col items-center justify-center py-20">
            <FileText className="h-12 w-12 text-[#71717A] mb-3" />
            <p className="text-sm font-medium text-[#71717A]">{t("planNotFound")}</p>
          </div>
        </div>
      </div>
    );
  }

  const versions = plan.plan_versions || [];
  const currentVersion = versions.find((v) => v.is_current) || versions[0];

  return (
    <div className="flex-1 overflow-y-auto min-h-full bg-[#0F0F11]">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Link href="/plans" className="flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#FAFAFA] mb-4">
          <ArrowLeft className="h-4 w-4" />
          {t("title")}
        </Link>

        <ProjectBreadcrumb section="plans" />

        <PlanDetailHeader plan={plan} currentVersion={currentVersion} t={t} />

        <PlanDetailTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          versionsCount={versions.length}
          estimationScore={estimationV2?.passe4?.analyse_fiabilite?.score_global != null
            ? `${Math.round(Math.min(estimationV2.passe4.analyse_fiabilite.score_global, 1) * 100)}%`
            : null}
          showEstimationTab={USE_MANAGED_AGENTS}
          t={t}
        />

        {/* Agent activity panel — shown when agent is active */}
        {USE_MANAGED_AGENTS && estimatorAgent.status !== "idle" && (
          <div className="mb-4">
            <AgentAnalysisPanel
              status={estimatorAgent.status}
              events={estimatorAgent.events}
              lastMessage={estimatorAgent.lastMessage}
              result={estimatorAgent.result}
              error={estimatorAgent.error}
              isRunning={estimatorAgent.isRunning}
              onCancel={estimatorAgent.cancel}
              agentType="plan-estimator"
            />
          </div>
        )}

        {activeTab === "viewer" && (
          <PlanViewer version={currentVersion} t={t} />
        )}

        {activeTab === "versions" && (
          <PlanVersionsTab versions={versions} t={t} />
        )}

        {activeTab === "info" && (
          <PlanInfoTab plan={plan} t={t} />
        )}

        {activeTab === "analysis" && (
          <PlanAnalysisTab
            analysis={analysis}
            analyzing={analyzing}
            analysisError={analysisError}
            onAnalyze={handleAnalyze}
            onAnalysisUpdated={setAnalysis}
            onSwitchToEstimation={USE_MANAGED_AGENTS ? () => {
              setActiveTab("estimation");
              if (!estimationV2 && !estimatingV2) handleEstimate();
            } : () => { /* Feature disabled — estimation hidden */ }}
            t={t}
          />
        )}

        {/* Estimation tab: shown when managed agents are enabled, otherwise hidden (prices unreliable in legacy pipeline) */}
        {(USE_MANAGED_AGENTS ? activeTab === "estimation" : false && activeTab === "estimation") && (
          <PlanEstimationTab
            estimationV2={estimationV2}
            estimatingV2={estimatingV2 || estimatorAgent.isRunning}
            estimationV2Error={estimationV2Error}
            hasAnalysis={!!analysis}
            onEstimate={handleEstimate}
            onGoToAnalysis={() => {
              setActiveTab("analysis");
              if (!analysis && !analyzing) handleAnalyze(false);
            }}
            onCorrectQuantity={(poste) => setCorrectionPoste(poste)}
            onCalibratePrice={(poste) => setCalibrationPoste(poste)}
            crossPlan={crossPlan ?? undefined}
          />
        )}

        {correctionPoste && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[#0F0F11] rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
              <QuantityCorrectionModal
                poste={correctionPoste}
                onSave={handleSaveCorrection}
                onClose={() => setCorrectionPoste(null)}
              />
            </div>
          </div>
        )}

        {calibrationPoste && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[#0F0F11] rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
              <PriceCalibrationModal
                poste={calibrationPoste}
                onSave={handleSaveCalibration}
                onClose={() => setCalibrationPoste(null)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
