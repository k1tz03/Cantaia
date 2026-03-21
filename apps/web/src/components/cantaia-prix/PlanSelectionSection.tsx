"use client";

import React from "react";
import {
  Calculator,
  Loader2,
  ChevronDown,
  FileText,
  CheckCircle,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import { PlanOption, AnalysisData } from "./types";

interface PlanSelectionSectionProps {
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
}

export function PlanSelectionSection({
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
}: PlanSelectionSectionProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">
        <FileText className="mr-1.5 inline h-4 w-4" />
        Sélection du plan
      </h2>

      {urlAnalysisId && analysisData ? (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-500/10 px-4 py-3">
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
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement de l'analyse...
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPlanDropdown(!showPlanDropdown)}
            disabled={plansLoading}
            className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground hover:bg-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
          >
            <span className={selectedPlan ? "text-foreground" : "text-muted-foreground"}>
              {plansLoading
                ? "Chargement des plans..."
                : selectedPlan
                  ? `${selectedPlan.plan_number} — ${selectedPlan.plan_title}`
                  : "Sélectionner un plan..."}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>

          {showPlanDropdown && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-background py-1 shadow-lg">
              {plans.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
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
                      "flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted",
                      selectedPlanId === plan.id &&
                        "bg-brand/5 font-medium"
                    )}
                  >
                    <span className="text-sm text-foreground">
                      <span className="font-mono text-xs text-brand">
                        {plan.plan_number}
                      </span>{" "}
                      — {plan.plan_title}
                    </span>
                    {plan.project && (
                      <span className="mt-0.5 text-[11px] text-muted-foreground">
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
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Quantités détectées ({quantitiesPreview.length})
          </p>
          <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted p-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-1 text-left font-medium">Poste</th>
                  <th className="pb-1 text-right font-medium">Qté</th>
                  <th className="pb-1 text-left pl-2 font-medium">Unité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {quantitiesPreview.map((q, idx) => (
                  <tr key={idx}>
                    <td className="py-1 text-foreground">{q.item}</td>
                    <td className="py-1 text-right font-mono text-muted-foreground">
                      {q.quantity}
                    </td>
                    <td className="py-1 pl-2 text-muted-foreground">{q.unit}</td>
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
          <p className="mt-2 text-xs text-muted-foreground">
            Sélectionnez un plan pour lancer l'estimation.
          </p>
        )}
      </div>
    </div>
  );
}
