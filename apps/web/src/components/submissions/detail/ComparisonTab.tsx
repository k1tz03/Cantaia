"use client";

import { BarChart3 } from "lucide-react";
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
  if (offers.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{t("noSubmissions")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {lots.map((lot) => {
        const lotItems = items.filter((i) => i.lot_id === lot.id);
        const lotItemIds = lotItems.map((i) => i.id);
        const lotOffers = offers.filter((o) => {
          const lineItems = offerLineItems.filter((li) => li.offer_id === o.id && lotItemIds.includes(li.submission_item_id));
          return lineItems.length > 0;
        });
        if (lotOffers.length === 0) return null;

        return (
          <div key={lot.id} className="bg-background border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-muted border-b border-border flex items-center gap-3">
              <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">CFC {lot.cfc_code}</span>
              <span className="text-sm font-medium text-foreground">{lot.name}</span>
              <span className="text-xs text-muted-foreground ml-auto">{lotOffers.length} {t("offersReceived", { count: lotOffers.length, total: lotOffers.length }).split("/")[0]}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-border text-[11px] font-medium text-muted-foreground uppercase">
                    <th className="text-left px-3 py-2 sticky left-0 bg-background z-10 w-48">{t("description")}</th>
                    <th className="text-center px-2 py-2 w-12">{t("unit")}</th>
                    <th className="text-right px-2 py-2 w-16">{t("quantity")}</th>
                    {lotOffers.map((offer) => {
                      const supplier = suppliers.find((s) => s.id === offer.supplier_id);
                      const isLowest = lotOffers.every((o) => (o.total_amount || Infinity) >= (offer.total_amount || Infinity));
                      return (
                        <th key={offer.id} className={`text-right px-3 py-2 w-24 ${isLowest ? "bg-green-500/10" : ""}`}>
                          <div className="text-xs font-medium text-foreground">{supplier?.company_name}</div>
                          {offer.status === "awarded" && (
                            <span className="text-[9px] text-emerald-600">({t("awarded")})</span>
                          )}
                        </th>
                      );
                    })}
                    <th className="text-right px-3 py-2 w-20 bg-muted">{t("maxGap")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lotItems.map((item) => {
                    const itemPrices = lotOffers.map((offer) => {
                      const lineItem = offerLineItems.find(
                        (li) => li.offer_id === offer.id && li.submission_item_id === item.id
                      );
                      return { offerId: offer.id, unitPrice: lineItem?.unit_price ?? null, totalPrice: lineItem?.total_price ?? null };
                    });
                    const validPrices = itemPrices.filter((p) => p.unitPrice !== null).map((p) => p.unitPrice!);
                    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
                    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;
                    const gap = minPrice && maxPrice ? Math.round(((maxPrice - minPrice) / minPrice) * 100) : null;

                    return (
                      <tr key={item.id} className="hover:bg-muted text-sm">
                        <td className="px-3 py-2 sticky left-0 bg-background z-10">
                          <div className="text-xs font-mono text-muted-foreground">{item.code}</div>
                          <div className="text-sm text-foreground truncate max-w-[180px]">{item.description}</div>
                        </td>
                        <td className="px-2 py-2 text-center text-xs text-muted-foreground">{item.unit}</td>
                        <td className="px-2 py-2 text-right text-muted-foreground text-xs">{item.quantity?.toLocaleString("fr-CH")}</td>
                        {itemPrices.map((p) => {
                          const isCheapest = p.unitPrice !== null && p.unitPrice === minPrice;
                          const isMostExpensive = p.unitPrice !== null && p.unitPrice === maxPrice && validPrices.length > 1;
                          return (
                            <td
                              key={p.offerId}
                              className={`px-3 py-2 text-right text-sm ${
                                isCheapest ? "text-green-700 dark:text-green-400 font-bold bg-green-500/10/50" :
                                isMostExpensive ? "text-red-600" : "text-foreground"
                              }`}
                            >
                              {p.unitPrice !== null ? p.unitPrice.toFixed(2) : (
                                <span className="text-xs text-muted-foreground">{t("notQuoted")}</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right bg-muted">
                          {gap !== null ? (
                            <span className={`text-xs font-medium ${gap > 15 ? "text-red-600" : gap > 5 ? "text-amber-600" : "text-green-600"}`}>
                              {gap}%
                            </span>
                          ) : "\u2014"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted font-medium">
                    <td className="px-3 py-2 text-sm text-foreground sticky left-0 bg-muted z-10" colSpan={3}>
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
                        <td key={offer.id} className={`px-3 py-2 text-right text-sm ${isCheapest ? "text-green-700 dark:text-green-400 font-bold" : "text-foreground"}`}>
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
