"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ClipboardCopy,
  Eye,
  Calculator,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import {
  PLAN_TYPE_KEYS,
  CONFIDENCE_CONFIG,
  formatDateTime,
} from "./plan-detail-types";
import type { AnalysisData } from "./plan-detail-types";

export function PlanAnalysisTab({
  analysis,
  analyzing,
  analysisError,
  onAnalyze,
  onAnalysisUpdated,
  onSwitchToEstimation,
  t,
}: {
  analysis: AnalysisData | null;
  analyzing: boolean;
  analysisError: string;
  onAnalyze: (force: boolean) => void;
  onAnalysisUpdated: (analysis: AnalysisData) => void;
  onSwitchToEstimation: () => void;
  t: (key: string, values?: any) => string;
}) {
  const [editMode, setEditMode] = useState(false);
  const [editedQuantities, setEditedQuantities] = useState<Record<string, any>>({});
  const [savingEdits, setSavingEdits] = useState(false);

  const result = analysis?.analysis_result;

  const quantityGroups: Record<string, NonNullable<typeof result>["quantities"]> = {};
  if (result?.quantities) {
    for (const q of result.quantities) {
      if (!quantityGroups[q.category]) quantityGroups[q.category] = [];
      quantityGroups[q.category].push(q);
    }
  }

  const handleCopyTable = () => {
    if (!result?.quantities) return;
    const rows = result.quantities.map(
      (q) => `${q.category}\t${q.item}\t${q.quantity ?? ""}\t${q.unit}\t${q.specification || ""}`
    );
    const header = "Categorie\tPoste\tQuantite\tUnite\tSpecification";
    navigator.clipboard.writeText([header, ...rows].join("\n"));
  };

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
      const updated = analysis.analysis_result.quantities.map((q, globalIdx) => {
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
        onAnalysisUpdated({
          ...analysis!,
          analysis_result: { ...analysis!.analysis_result, quantities: updated },
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

  return (
    <div className="space-y-4">
      {analyzing && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background py-16">
          <Loader2 className="h-10 w-10 animate-spin text-brand mb-4" />
          <p className="text-sm font-medium text-muted-foreground">{t("analyzing")}</p>
          <p className="mt-1 text-xs text-muted-foreground">L&apos;IA analyse le plan comme un metreur professionnel...</p>
        </div>
      )}

      {analysisError && !analyzing && (
        <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-500/20">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {analysisError}
        </div>
      )}

      {!analysis && !analyzing && !analysisError && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background py-16">
          <Sparkles className="h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t("noAnalysisYet")}</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm text-center">{t("noAnalysisDesc")}</p>
          <button
            onClick={() => onAnalyze(false)}
            className="mt-4 flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            {t("analyzeWithAI")}
          </button>
        </div>
      )}

      {result && !analyzing && (
        <>
          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-brand" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t(PLAN_TYPE_KEYS[result.plan_type] || "planTypeOther")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {result.discipline}
                  {analysis!.analysis_duration_ms && ` · ${t("analysisTime", { seconds: (analysis!.analysis_duration_ms / 1000).toFixed(1) })}`}
                  {analysis!.analyzed_at && ` · ${t("analysisCached", { date: formatDateTime(analysis!.analyzed_at) })}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => onAnalyze(true)}
              disabled={analyzing}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("reAnalyze")}
            </button>
          </div>

          {result.title_block && (
            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t("titleBlock")}</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                {result.title_block.plan_number && (
                  <div><p className="text-[10px] text-muted-foreground">N&deg;</p><p className="font-mono font-medium text-foreground">{result.title_block.plan_number}</p></div>
                )}
                {result.title_block.plan_title && (
                  <div className="col-span-2 sm:col-span-3"><p className="text-[10px] text-muted-foreground">Titre</p><p className="text-foreground">{result.title_block.plan_title}</p></div>
                )}
                {result.title_block.scale && (
                  <div><p className="text-[10px] text-muted-foreground">Echelle</p><p className="text-foreground">{result.title_block.scale}</p></div>
                )}
                {result.title_block.date && (
                  <div><p className="text-[10px] text-muted-foreground">Date</p><p className="text-foreground">{result.title_block.date}</p></div>
                )}
                {result.title_block.company && (
                  <div><p className="text-[10px] text-muted-foreground">Bureau</p><p className="text-foreground">{result.title_block.company}</p></div>
                )}
                {result.title_block.revision && (
                  <div><p className="text-[10px] text-muted-foreground">Indice</p><p className="font-mono font-bold text-foreground">{result.title_block.revision}</p></div>
                )}
              </div>
            </div>
          )}

          {result.legend_items.length > 0 && (
            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t("legendLabel")}</h3>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {result.legend_items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {item.color && (
                      <span className="h-3 w-3 rounded-full shrink-0 border border-border" style={{ backgroundColor: item.color }} />
                    )}
                    <span className="text-xs font-medium text-foreground">{item.symbol}</span>
                    <span className="text-xs text-muted-foreground">&mdash; {item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.quantities.length > 0 && (
            <div className="rounded-lg border border-border bg-background overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("quantitiesLabel")}</h3>
                <div className="flex items-center gap-2">
                  {editMode ? (
                    <>
                      <button
                        onClick={() => { setEditMode(false); setEditedQuantities({}); }}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
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
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Corriger
                      </button>
                      <button
                        onClick={handleCopyTable}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
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
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("colItem")}</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("colQuantity")}</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("colUnit")}</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">{t("colSpecification")}</th>
                    <th className="px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("colConfidence")}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(quantityGroups).map(([category, items]) => (
                    <>{/* Category header row */}
                      <tr key={`cat-${category}`} className="bg-muted">
                        <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold text-foreground">{category}</td>
                      </tr>
                      {items.map((q, i) => (
                        <tr key={`${category}-${i}`} className={cn("border-b border-border", editMode ? "bg-primary/5" : "hover:bg-muted/30")}>
                          <td className="px-4 py-2 text-xs text-foreground">
                            {editMode ? (
                              <input
                                type="text"
                                value={getEditedValue(category, i, "item", q.item)}
                                onChange={(e) => setEditedValue(category, i, "item", e.target.value)}
                                className="w-full rounded border border-border px-2 py-1 text-xs focus:border-brand focus:outline-none"
                              />
                            ) : q.item}
                          </td>
                          <td className="px-4 py-2 text-right text-xs font-semibold text-foreground tabular-nums">
                            {editMode ? (
                              <input
                                type="number"
                                value={getEditedValue(category, i, "quantity", q.quantity ?? "")}
                                onChange={(e) => setEditedValue(category, i, "quantity", e.target.value)}
                                className="w-20 rounded border border-border px-2 py-1 text-xs text-right focus:border-brand focus:outline-none"
                              />
                            ) : q.quantity != null ? q.quantity.toLocaleString("fr-CH") : "\u2014"}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {editMode ? (
                              <input
                                type="text"
                                value={getEditedValue(category, i, "unit", q.unit)}
                                onChange={(e) => setEditedValue(category, i, "unit", e.target.value)}
                                className="w-16 rounded border border-border px-2 py-1 text-xs focus:border-brand focus:outline-none"
                              />
                            ) : q.unit}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground hidden sm:table-cell">
                            {editMode ? (
                              <input
                                type="text"
                                value={getEditedValue(category, i, "specification", q.specification || "")}
                                onChange={(e) => setEditedValue(category, i, "specification", e.target.value)}
                                className="w-full rounded border border-border px-2 py-1 text-xs focus:border-brand focus:outline-none"
                              />
                            ) : q.specification || "\u2014"}
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

          {result.observations.length > 0 && (
            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t("observationsLabel")}</h3>
              <ul className="space-y-2">
                {result.observations.map((obs, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <Eye className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                    {obs}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.summary && (
            <div className="rounded-lg border border-border bg-primary/10 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t("summaryLabel")}</h3>
              <p className="text-sm text-foreground leading-relaxed">{result.summary}</p>
            </div>
          )}

          {/* HIDDEN: Budget estimation temporarily disabled — prices unreliable */}
          {false && result.quantities.length > 0 && (
            <div className="rounded-lg border-2 border-dashed border-brand/30 bg-brand/5 p-6 text-center">
              <Calculator className="h-8 w-8 text-brand mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-foreground">Estimation multi-modele</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-md mx-auto">
                Lancez l&apos;estimation V2 avec 3 IA (Claude + GPT-4o + Gemini) et les prix de reference suisses CRB
              </p>
              <button
                onClick={onSwitchToEstimation}
                className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
              >
                <Calculator className="h-4 w-4" />
                Lancer l&apos;estimation V2
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
