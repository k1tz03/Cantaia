"use client";

import { TrendingUp } from "lucide-react";
import type { PricingAlert, TranslateFn } from "./shared";
import { formatCHF } from "./shared";

interface IntelligenceTabProps {
  alerts: PricingAlert[];
  t: TranslateFn;
  tPricing: TranslateFn;
}

export function IntelligenceTab({ alerts, t, tPricing }: IntelligenceTabProps) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-12">
        <TrendingUp className="h-12 w-12 text-[#71717A] mx-auto mb-3" />
        <p className="text-sm text-[#71717A]">{tPricing("noAlerts")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => {
        const severityColors = {
          critical: "border-red-200 bg-red-500/10",
          warning: "border-amber-200 bg-amber-500/10",
          info: "border-[#F97316]/20 bg-[#F97316]/10",
        };
        const severityIcons = {
          critical: "\uD83D\uDD34",
          warning: "\u26A0\uFE0F",
          info: "\uD83D\uDCA1",
        };
        return (
          <div key={alert.id} className={`border rounded-lg p-4 ${severityColors[alert.severity]}`}>
            <div className="flex items-start gap-3">
              <span className="text-lg">{severityIcons[alert.severity]}</span>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-[#FAFAFA]">{alert.title}</h4>
                <p className="text-sm text-[#71717A] mt-1">{alert.message}</p>
                {alert.financial_impact && (
                  <p className="text-xs font-medium text-[#FAFAFA] mt-2">
                    {t("impact")} : {alert.financial_impact > 0 ? "+" : ""}{formatCHF(alert.financial_impact)}
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  <button className="text-xs px-3 py-1.5 bg-[#0F0F11] border border-[#27272A] rounded-md hover:bg-[#27272A]">
                    {t("renegotiate")}
                  </button>
                  <button className="text-xs px-3 py-1.5 text-[#71717A] hover:text-[#FAFAFA]">
                    {t("dismiss")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
