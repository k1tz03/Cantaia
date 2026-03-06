"use client";

import React from "react";
import {
  PricingConfig,
  PlanOption,
  AnalysisData,
  EstimateResult,
} from "./types";
import { EstimateConfigSection } from "./EstimateConfigSection";
import { PlanSelectionSection } from "./PlanSelectionSection";
import { EstimateResultsSection } from "./EstimateResultsSection";

interface EstimateTabProps {
  config: PricingConfig;
  setConfig: React.Dispatch<React.SetStateAction<PricingConfig>>;
  scope: "general" | "line_by_line";
  setScope: (scope: "general" | "line_by_line") => void;
  exclusionsText: string;
  setExclusionsText: (text: string) => void;
  context: string;
  setContext: (context: string) => void;
  urlAnalysisId: string | null;
  analysisData: AnalysisData | null;
  analysisLoading: boolean;
  plans: PlanOption[];
  plansLoading: boolean;
  selectedPlanId: string;
  setSelectedPlanId: (id: string) => void;
  showPlanDropdown: boolean;
  setShowPlanDropdown: (show: boolean) => void;
  setAnalysisData: (data: AnalysisData | null) => void;
  canEstimate: boolean;
  estimating: boolean;
  handleEstimate: () => void;
  selectedPlan: PlanOption | undefined;
  quantitiesPreview: Array<{ item: string; quantity: number; unit: string }> | undefined;
  estimateError: string | null;
  estimateResult: EstimateResult | null;
}

export function EstimateTab({
  config,
  setConfig,
  scope,
  setScope,
  exclusionsText,
  setExclusionsText,
  context,
  setContext,
  urlAnalysisId,
  analysisData,
  analysisLoading,
  plans,
  plansLoading,
  selectedPlanId,
  setSelectedPlanId,
  showPlanDropdown,
  setShowPlanDropdown,
  setAnalysisData,
  canEstimate,
  estimating,
  handleEstimate,
  selectedPlan,
  quantitiesPreview,
  estimateError,
  estimateResult,
}: EstimateTabProps) {
  return (
    <div className="space-y-6">
      <EstimateConfigSection
        config={config}
        setConfig={setConfig}
        scope={scope}
        setScope={setScope}
        exclusionsText={exclusionsText}
        setExclusionsText={setExclusionsText}
        context={context}
        setContext={setContext}
      />

      <PlanSelectionSection
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
        canEstimate={canEstimate}
        estimating={estimating}
        handleEstimate={handleEstimate}
        selectedPlan={selectedPlan}
        quantitiesPreview={quantitiesPreview}
      />

      <EstimateResultsSection
        estimating={estimating}
        estimateError={estimateError}
        estimateResult={estimateResult}
        config={config}
      />
    </div>
  );
}
