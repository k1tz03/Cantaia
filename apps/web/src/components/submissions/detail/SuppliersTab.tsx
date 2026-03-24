"use client";

import { Zap, Star, CheckCircle, MapPin, Send } from "lucide-react";
import type { SubmissionLot, PriceRequest, Supplier, TranslateFn } from "./shared";
import type { SupplierMatch } from "@cantaia/core/submissions";

interface SuppliersTabProps {
  lots: SubmissionLot[];
  supplierMatches: Record<string, SupplierMatch[]>;
  suppliers: Supplier[];
  priceRequests: PriceRequest[];
  selectedSuppliers: Set<string>;
  toggleSupplierSelection: (key: string) => void;
  selectAllRecommended: () => void;
  setShowSendModal: (show: boolean) => void;
  t: TranslateFn;
}

function reasonLabel(reason: string, t: TranslateFn): { label: string; color: string } {
  switch (reason) {
    case "specialty_match": return { label: t("reasonSpecialty"), color: "bg-[#F97316]/10 text-[#F97316]" };
    case "cfc_match": return { label: t("reasonCfc"), color: "bg-indigo-100 text-indigo-700" };
    case "high_score": return { label: t("reasonHighScore"), color: "bg-green-500/10 text-green-700 dark:text-green-400" };
    case "reliable_responder": return { label: t("reasonReliable"), color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" };
    case "preferred": return { label: t("reasonPreferred"), color: "bg-amber-500/10 text-amber-700 dark:text-amber-400" };
    case "local": return { label: t("reasonLocal"), color: "bg-purple-500/10 text-purple-700 dark:text-purple-400" };
    default: return { label: reason, color: "bg-[#27272A] text-[#71717A]" };
  }
}

export function SuppliersTab({
  lots,
  supplierMatches,
  suppliers,
  priceRequests,
  selectedSuppliers,
  toggleSupplierSelection,
  selectAllRecommended,
  setShowSendModal,
  t,
}: SuppliersTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium text-[#FAFAFA]">{t("matching")}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={selectAllRecommended}
            className="text-xs px-3 py-1.5 border border-[#27272A] rounded-md hover:bg-[#27272A] text-[#FAFAFA]"
          >
            {t("selectAll")}
          </button>
          {selectedSuppliers.size > 0 && (
            <button
              onClick={() => setShowSendModal(true)}
              className="text-xs px-4 py-1.5 bg-gold text-white rounded-md hover:bg-gold-dark font-medium"
            >
              <Send className="h-3 w-3 inline mr-1" />
              {t("sendRequests")} ({selectedSuppliers.size})
            </button>
          )}
        </div>
      </div>

      {lots.map((lot) => {
        const matches = supplierMatches[lot.id] || [];
        return (
          <div key={lot.id} className="bg-[#0F0F11] border border-[#27272A] rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-[#27272A] border-b border-[#27272A] flex items-center gap-3">
              <span className="text-xs font-mono bg-[#F97316]/10 text-[#F97316] px-2 py-0.5 rounded">
                CFC {lot.cfc_code}
              </span>
              <span className="text-sm font-medium text-[#FAFAFA]">{lot.name}</span>
              <span className="text-xs text-[#71717A] ml-auto">
                {matches.length} {t("tabSuppliers").toLowerCase()}
              </span>
            </div>
            {matches.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-[#71717A]">
                {t("noRecommendations")}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {matches.map((match) => {
                  const supplier = suppliers.find((s) => s.id === match.supplier_id);
                  const selKey = `${lot.id}:${match.supplier_id}`;
                  const isSelected = selectedSuppliers.has(selKey);
                  const alreadyRequested = priceRequests.some(
                    (pr) => pr.supplier_id === match.supplier_id && pr.lot_ids?.includes(lot.id)
                  );
                  return (
                    <div
                      key={match.supplier_id}
                      className={`flex items-center gap-4 px-4 py-3 hover:bg-[#27272A] transition-colors ${isSelected ? "bg-[#F97316]/10/50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected || alreadyRequested}
                        disabled={alreadyRequested}
                        onChange={() => toggleSupplierSelection(selKey)}
                        className="h-4 w-4 rounded border-[#27272A] text-[#FAFAFA] focus:ring-[#F97316]"
                      />
                      <div className="w-14 flex-shrink-0">
                        <div className="flex items-center gap-1">
                          <div
                            className={`text-xs font-bold ${
                              match.relevance_score >= 80 ? "text-green-600" :
                              match.relevance_score >= 60 ? "text-amber-600" : "text-[#71717A]"
                            }`}
                          >
                            {match.relevance_score}%
                          </div>
                        </div>
                        <div className="h-1 bg-[#27272A] rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              match.relevance_score >= 80 ? "bg-green-500" :
                              match.relevance_score >= 60 ? "bg-amber-500" : "bg-[#27272A]-foreground"
                            }`}
                            style={{ width: `${match.relevance_score}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#FAFAFA] truncate">
                            {supplier?.company_name || match.supplier_name}
                          </span>
                          {supplier?.status === "preferred" && (
                            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />
                          )}
                          {alreadyRequested && (
                            <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {match.reasons.map((reason) => {
                            const { label, color } = reasonLabel(reason, t);
                            return (
                              <span key={reason} className={`text-[10px] px-1.5 py-0.5 rounded ${color}`}>
                                {label}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[#71717A] flex-shrink-0">
                        {supplier && (
                          <>
                            <span title={t("matchScore")}>
                              {supplier.overall_score}/100
                            </span>
                            <span>
                              {supplier.response_rate}% {t("responded").toLowerCase()}
                            </span>
                            {supplier.geo_zone && (
                              <span className="flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" />
                                {supplier.geo_zone}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
