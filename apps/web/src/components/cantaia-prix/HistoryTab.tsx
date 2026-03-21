"use client";

import React from "react";
import {
  Calculator,
  Loader2,
  Download,
  Clock,
  ArrowLeft,
  Eye,
  Database,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import {
  formatCHF,
  formatDate,
  exportCSV,
  MARGIN_OPTIONS,
  confidenceColor,
  confidenceLabel,
  Tab,
} from "./types";

interface HistoryTabProps {
  history: any[];
  historyLoading: boolean;
  historyDetail: any | null;
  historyDetailLoading: boolean;
  setHistoryDetail: (detail: any | null) => void;
  openHistoryDetail: (estimateId: string) => void;
  setActiveTab: (tab: Tab) => void;
  onDeleteEstimate?: (estimateId: string) => void;
}

export function HistoryTab({
  history,
  historyLoading,
  historyDetail,
  historyDetailLoading,
  setHistoryDetail,
  openHistoryDetail,
  setActiveTab,
  onDeleteEstimate,
}: HistoryTabProps) {
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);

  return (
    <div>
      {/* Detail view */}
      {historyDetail ? (
        <div className="space-y-4">
          {/* Back button + title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setHistoryDetail(null)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </button>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {historyDetail.plan_title || historyDetail.plan_number || "Estimation"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {historyDetail.created_at ? formatDate(historyDetail.created_at) : ""}
              </p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] font-medium uppercase text-muted-foreground">Sous-total</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {formatCHF(historyDetail.estimate_result?.subtotal ?? historyDetail.subtotal ?? 0)}
              </p>
              <p className="text-[10px] text-muted-foreground">CHF</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] font-medium uppercase text-muted-foreground">Marge</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {formatCHF(historyDetail.estimate_result?.margin_total ?? historyDetail.margin_total ?? 0)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {historyDetail.config?.margin_level
                  ? MARGIN_OPTIONS.find((m) => m.value === historyDetail.config.margin_level)?.label || ""
                  : ""}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] font-medium uppercase text-muted-foreground">Transport</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {formatCHF(historyDetail.estimate_result?.transport_cost ?? historyDetail.transport_cost ?? 0)}
              </p>
              <p className="text-[10px] text-muted-foreground">CHF</p>
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
            <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-background px-4 py-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-foreground">
                  Couverture BD :{" "}
                  <span className="font-semibold">
                    {historyDetail.estimate_result.db_coverage_percent ?? 0}%
                  </span>
                </span>
                <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/100 transition-all"
                    style={{
                      width: `${Math.min(100, historyDetail.estimate_result.db_coverage_percent ?? 0)}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-muted-foreground">|</span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                <Download className="h-4 w-4" />
                Exporter CSV
              </button>
            </div>
          )}

          {/* Line items table */}
          {historyDetail.estimate_result?.line_items && (
            <div className="overflow-x-auto rounded-lg border border-border bg-background">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Poste</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Qté</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Unité</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">PU (CHF)</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total (CHF)</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Confiance</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historyDetail.estimate_result.line_items.map((li: any, idx: number) => (
                    <tr key={idx} className="transition-colors hover:bg-muted/50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-foreground">{li.item}</p>
                        {li.cfc_code && (
                          <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {li.cfc_code}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-foreground">{li.quantity}</td>
                      <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{li.unit}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-foreground">{formatCHF(li.unit_price)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-medium text-foreground">{formatCHF(li.total_price)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn("h-2 w-2 rounded-full", confidenceColor(li.confidence))} />
                          <span className="text-xs text-muted-foreground">{confidenceLabel(li.confidence)}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {li.source === "db_historical" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            <Database className="h-3 w-3" />BD
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:text-purple-400">
                            <Sparkles className="h-3 w-3" />IA
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/80">
                    <td colSpan={4} className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-muted-foreground">Sous-total</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">{formatCHF(historyDetail.estimate_result.subtotal)}</td>
                    <td colSpan={2} />
                  </tr>
                  <tr className="bg-muted/80">
                    <td colSpan={4} className="px-3 py-2 text-right text-xs text-muted-foreground">
                      Marge ({historyDetail.config?.margin_level ? MARGIN_OPTIONS.find((m) => m.value === historyDetail.config.margin_level)?.label : ""})
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">{formatCHF(historyDetail.estimate_result.margin_total)}</td>
                    <td colSpan={2} />
                  </tr>
                  <tr className="bg-muted/80">
                    <td colSpan={4} className="px-3 py-2 text-right text-xs text-muted-foreground">Transport</td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">{formatCHF(historyDetail.estimate_result.transport_cost)}</td>
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
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Chargement de l'estimation…</p>
        </div>
      ) : historyLoading ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Chargement de l'historique…</p>
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background py-16">
          <Clock className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-3 text-sm font-medium text-muted-foreground">
            Aucune estimation réalisée
          </h3>
          <p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">
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
        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Plan
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Date
                </th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Total (CHF)
                </th>
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Postes
                </th>
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Couverture BD
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.filter((item: any) => !item.grand_total || item.grand_total < 500000).map((item: any) => (
                <tr
                  key={item.id}
                  onClick={() => openHistoryDetail(item.id)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                >
                  <td className="px-3 py-2.5 text-sm font-medium text-foreground">
                    {item.plan_title || item.plan_id || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {item.created_at ? formatDate(item.created_at) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-medium text-foreground">
                    {item.grand_total
                      ? formatCHF(item.grand_total)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                    {item.items_count || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {item.db_coverage_percent != null ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/100"
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
                    <div className="flex items-center justify-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      {onDeleteEstimate && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(item.id); }}
                          className="text-muted-foreground hover:text-red-500 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {deleteTarget && onDeleteEstimate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-lg bg-background p-6 shadow-xl">
            <h3 className="text-base font-semibold text-foreground mb-2">Supprimer cette estimation ?</h3>
            <p className="text-sm text-muted-foreground mb-4">Cette action est irréversible.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
              >
                Annuler
              </button>
              <button
                onClick={() => { onDeleteEstimate(deleteTarget); setDeleteTarget(null); }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
