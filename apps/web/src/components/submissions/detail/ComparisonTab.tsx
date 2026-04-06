"use client";

import { useState } from "react";
import { BarChart3, MessageSquare } from "lucide-react";
import type { SubmissionLot, SubmissionItem, Supplier, SupplierOffer, OfferLineItem, TranslateFn } from "./shared";
import { formatCHF } from "./shared";

interface ComparisonTabProps {
  lots: SubmissionLot[];
  items: SubmissionItem[];
  offers: SupplierOffer[];
  offerLineItems: OfferLineItem[];
  suppliers: Supplier[];
  t: TranslateFn;
}

export function ComparisonTab({ lots, items, offers, offerLineItems, suppliers, t }: ComparisonTabProps) {
  const [expandedRemarks, setExpandedRemarks] = useState<Set<string>>(new Set());

  if (offers.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart3 className="h-12 w-12 text-[#71717A] mx-auto mb-3" />
        <p className="text-sm text-[#71717A]">{t("noSubmissions")}</p>
      </div>
    );
  }

  // Check if any offer-level conditions exist
  const offerConditions: Record<string, string> = {};
  for (const offer of offers) {
    if ((offer as any).conditions_text) {
      offerConditions[offer.id] = (offer as any).conditions_text;
    }
  }

  function toggleRemarks(key: string) {
    setExpandedRemarks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Offer-level conditions banner */}
      {Object.keys(offerConditions).length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <h4 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Conditions generales des fournisseurs
          </h4>
          <div className="space-y-2">
            {Object.entries(offerConditions).map(([offerId, text]) => {
              const offer = offers.find(o => o.id === offerId);
              const supplier = offer ? suppliers.find(s => s.id === offer.supplier_id) : null;
              return (
                <div key={offerId} className="text-xs text-[#A1A1AA]">
                  <span className="font-medium text-[#FAFAFA]">{supplier?.company_name} :</span>{" "}
                  {text}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {lots.map((lot) => {
        const lotItems = items.filter((i) => i.lot_id === lot.id);
        const lotItemIds = lotItems.map((i) => i.id);
        const lotOffers = offers.filter((o) => {
          const lineItems = offerLineItems.filter((li) => li.offer_id === o.id && lotItemIds.includes(li.submission_item_id));
          return lineItems.length > 0;
        });
        if (lotOffers.length === 0) return null;

        // Check if any line items in this lot have remarks
        const lotLineItems = offerLineItems.filter(li => lotItemIds.includes(li.submission_item_id));
        const hasAnyRemarks = lotLineItems.some(li => (li as any).supplier_remarks);

        return (
          <div key={lot.id} className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-[#27272A] border-b border-[#27272A] flex items-center gap-3">
              <span className="text-xs font-mono bg-[#F97316]/10 text-[#F97316] px-2 py-0.5 rounded">CFC {lot.cfc_code}</span>
              <span className="text-sm font-medium text-[#FAFAFA]">{lot.name}</span>
              {hasAnyRemarks && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                  <MessageSquare className="h-3 w-3" />
                  Remarques
                </span>
              )}
              <span className="text-xs text-[#71717A] ml-auto">{lotOffers.length} {t("offersReceived", { count: lotOffers.length, total: lotOffers.length }).split("/")[0]}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-[#27272A] text-[11px] font-medium text-[#71717A] uppercase">
                    <th className="text-left px-3 py-2 sticky left-0 bg-[#18181B] z-10 w-48">{t("description")}</th>
                    <th className="text-center px-2 py-2 w-12">{t("unit")}</th>
                    <th className="text-right px-2 py-2 w-16">{t("quantity")}</th>
                    {lotOffers.map((offer) => {
                      const supplier = suppliers.find((s) => s.id === offer.supplier_id);
                      const isLowest = lotOffers.every((o) => (o.total_amount || Infinity) >= (offer.total_amount || Infinity));
                      return (
                        <th key={offer.id} className={`text-right px-3 py-2 w-24 ${isLowest ? "bg-green-500/10" : ""}`}>
                          <div className="text-xs font-medium text-[#FAFAFA]">{supplier?.company_name}</div>
                          {offer.status === "awarded" && (
                            <span className="text-[9px] text-emerald-600">({t("awarded")})</span>
                          )}
                        </th>
                      );
                    })}
                    <th className="text-right px-3 py-2 w-20 bg-[#27272A]">{t("maxGap")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272A]">
                  {lotItems.map((item) => {
                    const itemPrices = lotOffers.map((offer) => {
                      const lineItem = offerLineItems.find(
                        (li) => li.offer_id === offer.id && li.submission_item_id === item.id
                      );
                      return {
                        offerId: offer.id,
                        supplierId: offer.supplier_id,
                        unitPrice: lineItem?.unit_price ?? null,
                        totalPrice: lineItem?.total_price ?? null,
                        remarks: (lineItem as any)?.supplier_remarks as string | null,
                      };
                    });
                    const validPrices = itemPrices.filter((p) => p.unitPrice !== null).map((p) => p.unitPrice!);
                    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
                    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;
                    const gap = minPrice && maxPrice ? Math.round(((maxPrice - minPrice) / minPrice) * 100) : null;

                    const itemRemarks = itemPrices.filter(p => p.remarks);
                    const hasRemarks = itemRemarks.length > 0;
                    const remarksKey = `${lot.id}-${item.id}`;
                    const isRemarksExpanded = expandedRemarks.has(remarksKey);

                    return (
                      <>
                        <tr key={item.id} className="hover:bg-[#1C1C1F] text-sm">
                          <td className="px-3 py-2 sticky left-0 bg-[#18181B] z-10">
                            <div className="flex items-start gap-1.5">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-mono text-[#71717A]">{item.code}</div>
                                <div className="text-sm text-[#FAFAFA] truncate max-w-[180px]">{item.description}</div>
                              </div>
                              {hasRemarks && (
                                <button
                                  onClick={() => toggleRemarks(remarksKey)}
                                  className="shrink-0 mt-0.5 p-0.5 rounded text-amber-400 hover:bg-amber-400/10"
                                  title={`${itemRemarks.length} remarque${itemRemarks.length > 1 ? "s" : ""} fournisseur`}
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center text-xs text-[#71717A]">{item.unit}</td>
                          <td className="px-2 py-2 text-right text-[#71717A] text-xs">{item.quantity?.toLocaleString("fr-CH")}</td>
                          {itemPrices.map((p) => {
                            const isCheapest = p.unitPrice !== null && p.unitPrice === minPrice;
                            const isMostExpensive = p.unitPrice !== null && p.unitPrice === maxPrice && validPrices.length > 1;
                            return (
                              <td
                                key={p.offerId}
                                className={`px-3 py-2 text-right text-sm ${
                                  isCheapest ? "text-green-400 font-bold bg-green-500/10" :
                                  isMostExpensive ? "text-red-600" : "text-[#FAFAFA]"
                                }`}
                              >
                                <div>
                                  {p.unitPrice !== null ? p.unitPrice.toFixed(2) : (
                                    <span className="text-xs text-[#71717A]">{t("notQuoted")}</span>
                                  )}
                                </div>
                                {p.remarks && (
                                  <div className="text-[10px] text-amber-400 truncate max-w-[90px]" title={p.remarks}>
                                    *
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right bg-[#27272A]">
                            {gap !== null ? (
                              <span className={`text-xs font-medium ${gap > 15 ? "text-red-600" : gap > 5 ? "text-amber-600" : "text-green-600"}`}>
                                {gap}%
                              </span>
                            ) : "\u2014"}
                          </td>
                        </tr>
                        {/* Expanded remarks row */}
                        {hasRemarks && isRemarksExpanded && (
                          <tr key={`${item.id}-remarks`} className="bg-amber-500/5">
                            <td colSpan={3 + lotOffers.length + 1} className="px-3 py-2">
                              <div className="space-y-1.5">
                                {itemRemarks.map((p) => {
                                  const supplier = suppliers.find(s => s.id === p.supplierId);
                                  return (
                                    <div key={p.offerId} className="flex items-start gap-2 text-xs">
                                      <span className="font-medium text-[#FAFAFA] shrink-0">{supplier?.company_name} :</span>
                                      <span className="text-[#A1A1AA]">{p.remarks}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#27272A] bg-[#27272A] font-medium">
                    <td className="px-3 py-2 text-sm text-[#FAFAFA] sticky left-0 bg-[#27272A] z-10" colSpan={3}>
                      {t("total")}
                    </td>
                    {lotOffers.map((offer) => {
                      const offerTotal = offerLineItems
                        .filter((li) => li.offer_id === offer.id && lotItemIds.includes(li.submission_item_id))
                        .reduce((sum, li) => sum + (li.total_price || 0), 0);
                      const allTotals = lotOffers.map((o) =>
                        offerLineItems.filter((li) => li.offer_id === o.id && lotItemIds.includes(li.submission_item_id)).reduce((s, li) => s + (li.total_price || 0), 0)
                      );
                      const isCheapest = offerTotal === Math.min(...allTotals);
                      return (
                        <td key={offer.id} className={`px-3 py-2 text-right text-sm ${isCheapest ? "text-green-400 font-bold" : "text-[#FAFAFA]"}`}>
                          {formatCHF(offerTotal)}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
