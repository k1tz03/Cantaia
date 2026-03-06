"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@cantaia/ui";
import { DollarSign, TrendingUp } from "lucide-react";

export function ProjectPrixTab({
  benchmark,
}: {
  benchmark: any[];
}) {
  const t = useTranslations("projects");

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{t("prixTitle")}</h3>
            <p className="mt-1 text-xs text-slate-500">{t("prixDescription")}</p>
          </div>
          <Link
            href="/cantaia-prix"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            {t("viewCantaiaPrix")}
          </Link>
        </div>
        {benchmark.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50">
            <div className="text-center">
              <DollarSign className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-500">{t("noPricesYet")}</p>
              <p className="mt-1 text-xs text-slate-400">{t("pricesWillAppear")}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {benchmark.map((group: any, idx: number) => {
              const prices = group.suppliers || [];
              const minPrice = prices.length > 0 ? Math.min(...prices.map((s: any) => s.unit_price)) : 0;
              const maxPrice = prices.length > 0 ? Math.max(...prices.map((s: any) => s.unit_price)) : 0;
              return (
                <div key={idx} className="rounded-md border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-slate-800">{group.display_description || group.description}</h4>
                    <span className="text-xs text-slate-500">{group.unit_normalized || group.unit} — {prices.length} {t("suppliers")}</span>
                  </div>
                  {prices.length > 0 && (
                    <div className="space-y-1.5">
                      {prices
                        .sort((a: any, b: any) => a.unit_price - b.unit_price)
                        .map((supplier: any, sIdx: number) => {
                          const pct = maxPrice > 0 ? (supplier.unit_price / maxPrice) * 100 : 0;
                          const isBest = supplier.unit_price === minPrice;
                          const overPercent = minPrice > 0 ? Math.round(((supplier.unit_price - minPrice) / minPrice) * 100) : 0;
                          return (
                            <div key={sIdx} className="flex items-center gap-3 text-xs">
                              <span className="w-32 truncate text-slate-600">{supplier.supplier_name}</span>
                              <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full", isBest ? "bg-green-500" : "bg-amber-400")}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="w-24 text-right font-medium text-slate-700">
                                {supplier.unit_price.toFixed(2)} CHF
                              </span>
                              {isBest ? (
                                <span className="w-20 text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full text-center">
                                  {t("bestPrice")}
                                </span>
                              ) : (
                                <span className="w-20 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full text-center">
                                  +{overPercent}%
                                </span>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
