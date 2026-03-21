"use client";

import React from "react";
import {
  Loader2,
  Download,
  Database,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import {
  EstimateResult,
  PricingConfig,
  formatCHF,
  exportCSV,
  MARGIN_OPTIONS,
  confidenceColor,
  confidenceLabel,
} from "./types";

interface EstimateResultsSectionProps {
  estimating: boolean;
  estimateError: string | null;
  estimateResult: EstimateResult | null;
  config: PricingConfig;
}

export function EstimateResultsSection({
  estimating,
  estimateError,
  estimateResult,
  config,
}: EstimateResultsSectionProps) {
  return (
    <>
      {/* Error */}
      {estimateError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-500/10 px-4 py-3">
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
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-background py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            Analyse et estimation en cours...
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cela peut prendre 15 à 30 secondes
          </p>
        </div>
      )}

      {/* Results */}
      {estimateResult && !estimating && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] font-medium uppercase text-muted-foreground">
                Sous-total
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {formatCHF(estimateResult.subtotal)}
              </p>
              <p className="text-[10px] text-muted-foreground">CHF</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] font-medium uppercase text-muted-foreground">
                Marge
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {formatCHF(estimateResult.margin_total)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {MARGIN_OPTIONS.find((m) => m.value === config.margin_level)?.label || ""}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] font-medium uppercase text-muted-foreground">
                Transport
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {formatCHF(estimateResult.transport_cost)}
              </p>
              <p className="text-[10px] text-muted-foreground">CHF</p>
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
          <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-background px-4 py-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-foreground">
                Couverture BD :{" "}
                <span className="font-semibold">
                  {estimateResult.db_coverage_percent}%
                </span>
              </span>
              <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/100 transition-all"
                  style={{
                    width: `${Math.min(100, estimateResult.db_coverage_percent)}%`,
                  }}
                />
              </div>
            </div>
            <span className="text-muted-foreground">|</span>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Exporter CSV
            </button>
          </div>

          {/* Results table */}
          <div className="overflow-x-auto rounded-lg border border-border bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Poste
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Qté
                  </th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Unité
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    PU (CHF)
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Total (CHF)
                  </th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Confiance
                  </th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Source
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {estimateResult.line_items.map((item, idx) => (
                  <tr
                    key={idx}
                    className="transition-colors hover:bg-muted/50"
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-foreground">
                        {item.item}
                      </p>
                      {item.cfc_code && (
                        <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {item.cfc_code}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-foreground">
                      {item.quantity}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                      {item.unit}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-foreground">
                      {formatCHF(item.unit_price)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-medium text-foreground">
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
                        <span className="text-xs text-muted-foreground">
                          {confidenceLabel(item.confidence)}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {item.source === "db_historical" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          <Database className="h-3 w-3" />
                          BD
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:text-purple-400">
                          <Sparkles className="h-3 w-3" />
                          IA
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/80">
                  <td
                    colSpan={4}
                    className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-muted-foreground"
                  >
                    Sous-total
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                    {formatCHF(estimateResult.subtotal)}
                  </td>
                  <td colSpan={2} />
                </tr>
                <tr className="bg-muted/80">
                  <td
                    colSpan={4}
                    className="px-3 py-2 text-right text-xs text-muted-foreground"
                  >
                    Marge ({MARGIN_OPTIONS.find((m) => m.value === config.margin_level)?.label})
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-foreground">
                    {formatCHF(estimateResult.margin_total)}
                  </td>
                  <td colSpan={2} />
                </tr>
                <tr className="bg-muted/80">
                  <td
                    colSpan={4}
                    className="px-3 py-2 text-right text-xs text-muted-foreground"
                  >
                    Transport
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-foreground">
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
    </>
  );
}
