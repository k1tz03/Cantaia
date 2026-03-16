"use client";

import { Sparkles, Loader2, AlertTriangle, RefreshCw, Calculator, ArrowRight } from "lucide-react";
import EstimationResultV2 from "@/components/plans/EstimationResultV2";

export function PlanEstimationTab({
  estimationV2,
  estimatingV2,
  estimationV2Error,
  hasAnalysis,
  onEstimate,
  onGoToAnalysis,
  onCorrectQuantity,
  onCalibratePrice,
}: {
  estimationV2: any;
  estimatingV2: boolean;
  estimationV2Error: string;
  hasAnalysis: boolean;
  onEstimate: () => void;
  onGoToAnalysis: () => void;
  onCorrectQuantity: (poste: any) => void;
  onCalibratePrice: (poste: any) => void;
}) {
  return (
    <div className="space-y-4">
      {!estimationV2 && !estimatingV2 && !estimationV2Error && !hasAnalysis && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-amber-300 bg-amber-50 py-16">
          <AlertTriangle className="h-12 w-12 text-amber-400 mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Analyse IA requise</h3>
          <p className="text-sm text-slate-500 max-w-md text-center mb-6">
            L&apos;estimation V2 necessite une analyse prealable du plan. Lancez d&apos;abord l&apos;analyse IA pour identifier les quantites, puis revenez ici pour l&apos;estimation.
          </p>
          <button
            onClick={onGoToAnalysis}
            className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Lancer l&apos;analyse IA
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {!estimationV2 && !estimatingV2 && !estimationV2Error && hasAnalysis && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-16">
          <Calculator className="h-12 w-12 text-brand/40 mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Estimation multi-modele V2</h3>
          <p className="text-sm text-slate-500 max-w-md text-center mb-6">
            3 IA analysent votre plan en parallele (Claude, GPT-4o, Gemini), puis les quantites sont croisees par consensus et chiffrees avec les prix de reference suisses CRB.
          </p>
          <button
            onClick={onEstimate}
            className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Lancer l&apos;estimation
          </button>
        </div>
      )}

      {estimatingV2 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-16">
          <Loader2 className="h-10 w-10 animate-spin text-brand mb-4" />
          <p className="text-sm font-medium text-slate-600">Estimation en cours...</p>
          <p className="mt-1 text-xs text-slate-400">3 IA analysent votre plan en parallele. Cela peut prendre 30 a 60 secondes.</p>
        </div>
      )}

      {estimationV2Error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-red-700 mb-2">{estimationV2Error}</p>
          <button
            onClick={onEstimate}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Reessayer
          </button>
        </div>
      )}

      {estimationV2 && (
        <EstimationResultV2
          estimation={estimationV2}
          onCorrectQuantity={onCorrectQuantity}
          onCalibratePrice={onCalibratePrice}
          onRelaunch={onEstimate}
        />
      )}
    </div>
  );
}
