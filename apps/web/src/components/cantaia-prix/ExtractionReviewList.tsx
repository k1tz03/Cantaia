"use client";

import React from "react";
import {
  Loader2,
  FileText,
  MapPin,
  ChevronRight,
  Upload,
  Mail,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import { formatCHF } from "./types";

interface ExtractionReviewListProps {
  extractionResults: any[];
  selectedExtractions: Set<string>;
  setSelectedExtractions: React.Dispatch<React.SetStateAction<Set<string>>>;
  expandedExtraction: string | null;
  setExpandedExtraction: (id: string | null) => void;
  extractionProjectMap: Record<string, string>;
  setExtractionProjectMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  projects: { id: string; name: string }[];
  importing: boolean;
  handleImport: () => void;
}

export function ExtractionReviewList({
  extractionResults,
  selectedExtractions,
  setSelectedExtractions,
  expandedExtraction,
  setExpandedExtraction,
  extractionProjectMap,
  setExtractionProjectMap,
  projects,
  importing,
  handleImport,
}: ExtractionReviewListProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            {extractionResults.length} offre{extractionResults.length > 1 ? "s" : ""} trouvée{extractionResults.length > 1 ? "s" : ""}
          </h3>
          <p className="text-xs text-slate-400">
            Sélectionnez les offres à importer dans la base de prix
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (selectedExtractions.size === extractionResults.length) {
                setSelectedExtractions(new Set());
              } else {
                setSelectedExtractions(new Set(extractionResults.map((r: any) => r.emailId)));
              }
            }}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            {selectedExtractions.size === extractionResults.length ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || selectedExtractions.size === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Importer {selectedExtractions.size} offre{selectedExtractions.size > 1 ? "s" : ""}
          </button>
        </div>
      </div>

      {/* Results list */}
      <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
        {extractionResults.map((result: any) => (
          <div key={`${result.emailId}-${result.source_type}`} className="transition-colors hover:bg-slate-50/50">
            {/* Row header */}
            <div className="flex items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={selectedExtractions.has(result.emailId)}
                onChange={(e) => {
                  const next = new Set(selectedExtractions);
                  if (e.target.checked) next.add(result.emailId);
                  else next.delete(result.emailId);
                  setSelectedExtractions(next);
                }}
                className="h-4 w-4 rounded border-slate-300 text-brand"
              />
              <button
                type="button"
                onClick={() => setExpandedExtraction(expandedExtraction === result.emailId ? null : result.emailId)}
                className="flex flex-1 items-center gap-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {result.supplier_info?.company_name || "Fournisseur inconnu"}
                    </p>
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      result.source_type === "pdf_attachment"
                        ? "bg-purple-50 text-purple-700"
                        : "bg-blue-50 text-blue-700"
                    )}>
                      {result.source_type === "pdf_attachment" ? (
                        <><FileText className="h-3 w-3" />PDF</>
                      ) : (
                        <><Mail className="h-3 w-3" />Email</>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    {result.fileName && <span className="font-mono">{result.fileName}</span>}
                    {result.fileName && (result.supplier_info?.email || result.supplier_info?.city) ? " — " : ""}
                    {result.supplier_info?.email || ""}{result.supplier_info?.city ? ` — ${result.supplier_info.city}` : ""}
                    {result.project_reference && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        <MapPin className="h-2.5 w-2.5" />{result.project_reference}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-sm font-semibold text-slate-900">
                    {result.line_items?.length || 0} poste{(result.line_items?.length || 0) > 1 ? "s" : ""}
                  </p>
                  {result.offer_summary?.total_amount && (
                    <p className="font-mono text-xs text-slate-500">
                      {formatCHF(result.offer_summary.total_amount)} CHF
                    </p>
                  )}
                </div>
                <ChevronRight className={cn(
                  "h-4 w-4 text-slate-400 transition-transform shrink-0",
                  expandedExtraction === result.emailId && "rotate-90"
                )} />
              </button>
            </div>

            {/* Expanded detail */}
            {expandedExtraction === result.emailId && result.line_items && (
              <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                {/* Project assignment */}
                <div className="mb-3 flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-500 shrink-0">Projet :</span>
                  <select
                    value={extractionProjectMap[result.emailId] || ""}
                    onChange={(e) => {
                      setExtractionProjectMap((prev) => ({
                        ...prev,
                        [result.emailId]: e.target.value,
                      }));
                    }}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30"
                  >
                    <option value="">— Aucun projet —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {result.project_reference && !extractionProjectMap[result.emailId] && (
                    <span className="text-[10px] text-amber-600 italic">
                      Réf. trouvée : &quot;{result.project_reference}&quot; — aucun projet correspondant
                    </span>
                  )}
                  {result.project_reference && extractionProjectMap[result.emailId] && (
                    <span className="text-[10px] text-emerald-600">
                      Associé depuis : &quot;{result.project_reference}&quot;
                    </span>
                  )}
                </div>
                {/* Supplier info */}
                <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-500">
                  {result.supplier_info?.phone && (
                    <span>{result.supplier_info.phone}</span>
                  )}
                  {result.supplier_info?.address && (
                    <span>{result.supplier_info.address}, {result.supplier_info.postal_code} {result.supplier_info.city}</span>
                  )}
                  {result.supplier_info?.website && (
                    <span>{result.supplier_info.website}</span>
                  )}
                </div>
                {/* Line items table */}
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase text-slate-400">
                      <th className="pb-1.5 text-left font-semibold">Description</th>
                      <th className="pb-1.5 text-right font-semibold">Qté</th>
                      <th className="pb-1.5 text-center font-semibold">Unité</th>
                      <th className="pb-1.5 text-right font-semibold">PU (CHF)</th>
                      <th className="pb-1.5 text-right font-semibold">Total (CHF)</th>
                      <th className="pb-1.5 text-center font-semibold">CFC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.line_items.map((li: any, idx: number) => (
                      <tr key={idx}>
                        <td className="py-1.5 pr-2 text-slate-700">{li.description}</td>
                        <td className="py-1.5 text-right font-mono text-slate-600">{li.quantity ?? "—"}</td>
                        <td className="py-1.5 text-center text-slate-500">{li.unit}</td>
                        <td className="py-1.5 text-right font-mono text-slate-700">{formatCHF(li.unit_price)}</td>
                        <td className="py-1.5 text-right font-mono font-medium text-slate-900">
                          {li.total_price ? formatCHF(li.total_price) : "—"}
                        </td>
                        <td className="py-1.5 text-center">
                          {li.cfc_code ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">{li.cfc_code}</span>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Conditions */}
                {result.offer_summary && (
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
                    {result.offer_summary.payment_terms && <span>Paiement: {result.offer_summary.payment_terms}</span>}
                    {result.offer_summary.validity_days && <span>Validité: {result.offer_summary.validity_days}j</span>}
                    {result.offer_summary.vat_rate && <span>TVA: {result.offer_summary.vat_rate}%</span>}
                    {result.offer_summary.delivery_included != null && (
                      <span>Livraison: {result.offer_summary.delivery_included ? "incluse" : "non incluse"}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
