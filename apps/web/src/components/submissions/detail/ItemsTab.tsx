"use client";

import { ChevronDown, ChevronRight, Gavel } from "lucide-react";
import type { SubmissionLot, SubmissionItem, Supplier, TranslateFn } from "./shared";
import { formatCHF } from "./shared";

interface ItemsTabProps {
  lots: SubmissionLot[];
  items: SubmissionItem[];
  expandedLots: Set<string>;
  toggleLot: (lotId: string) => void;
  suppliers: Supplier[];
  t: TranslateFn;
  tPricing: TranslateFn;
}

export function ItemsTab({ lots, items, expandedLots, toggleLot, suppliers, t, tPricing }: ItemsTabProps) {
  return (
    <div className="space-y-4">
      {lots.map((lot) => {
        const lotItems = items.filter((i) => i.lot_id === lot.id);
        const hasAnyCodes = lotItems.some((item) => item.code && item.code !== "\u2014" && item.code !== "—");
        const expanded = expandedLots.has(lot.id);
        const awardedSupplier = lot.awarded_supplier_id
          ? suppliers.find((s) => s.id === lot.awarded_supplier_id)
          : null;
        return (
          <div key={lot.id} className="bg-[#0F0F11] border border-[#27272A] rounded-lg overflow-hidden">
            <button
              onClick={() => toggleLot(lot.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#27272A]"
            >
              <div className="flex items-center gap-3">
                {expanded ? (
                  <ChevronDown className="h-4 w-4 text-[#71717A]" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[#71717A]" />
                )}
                <span className="text-xs font-mono bg-[#F97316]/10 text-[#F97316] px-2 py-0.5 rounded">
                  CFC {lot.cfc_code}
                </span>
                <span className="text-sm font-medium text-[#FAFAFA]">{lot.name}</span>
                <span className="text-xs text-[#71717A]">{lotItems.length} {t("items")}</span>
              </div>
              <div className="flex items-center gap-3">
                {awardedSupplier && (
                  <span className="text-xs text-emerald-600 flex items-center gap-1">
                    <Gavel className="h-3 w-3" />
                    {awardedSupplier.company_name}
                  </span>
                )}
              </div>
            </button>
            {expanded && lotItems.length > 0 && (
              <div className="border-t border-[#27272A]">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#27272A] text-[11px] font-medium text-[#71717A] uppercase">
                      {hasAnyCodes && <th className="text-left px-4 py-2 w-16">N°</th>}
                      <th className="text-left px-4 py-2">{t("description")}</th>
                      <th className="text-center px-4 py-2 w-16">{t("unit")}</th>
                      <th className="text-right px-4 py-2 w-20">{t("quantity")}</th>
                      <th className="text-right px-4 py-2 w-24">{tPricing("estimatedPrice")}</th>
                      <th className="text-right px-4 py-2 w-24">{t("unitPrice")}</th>
                      <th className="text-right px-4 py-2 w-28">{t("totalPrice")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lotItems.map((item) => {
                      const confidenceColor = (item.estimated_confidence || 0) >= 0.8
                        ? "text-green-600"
                        : (item.estimated_confidence || 0) >= 0.6
                          ? "text-amber-600"
                          : "text-red-500";
                      return (
                        <tr key={item.id} className="hover:bg-[#27272A] text-sm">
                          {hasAnyCodes && <td className="px-4 py-2 text-xs font-mono text-[#71717A]">{item.code}</td>}
                          <td className="px-4 py-2 text-[#FAFAFA] max-w-[500px]">
                            <span className="block truncate" title={item.description}>
                              {item.description}
                            </span>
                            {item.remarks && (
                              <span className="block truncate text-xs text-[#71717A]" title={item.remarks}>({item.remarks})</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center text-[#71717A] text-xs">{item.unit}</td>
                          <td className="px-4 py-2 text-right text-[#71717A]">
                            {item.quantity?.toLocaleString("fr-CH")}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {item.estimated_unit_price && (
                              <span className={`text-xs ${confidenceColor}`}>
                                {item.estimated_unit_price.toFixed(2)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-[#FAFAFA]">
                            {item.awarded_unit_price?.toFixed(2) || item.best_unit_price?.toFixed(2) || "\u2014"}
                          </td>
                          <td className="px-4 py-2 text-right font-medium text-[#FAFAFA]">
                            {(item.awarded_unit_price || item.best_unit_price) && item.quantity
                              ? formatCHF((item.awarded_unit_price || item.best_unit_price || 0) * item.quantity)
                              : "\u2014"}
                          </td>
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
