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
        <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">{tPricing("noAlerts")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => {
        const severityColors = {
          critical: "border-red-200 bg-red-50",
          warning: "border-amber-200 bg-amber-50",
          info: "border-blue-200 bg-blue-50",
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
                <h4 className="text-sm font-medium text-gray-900">{alert.title}</h4>
                <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                {alert.financial_impact && (
                  <p className="text-xs font-medium text-gray-700 mt-2">
                    {t("impact")} : {alert.financial_impact > 0 ? "+" : ""}{formatCHF(alert.financial_impact)}
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  <button className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                    {t("renegotiate")}
                  </button>
                  <button className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700">
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
