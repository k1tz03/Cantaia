"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Check, X, Bot, Shield, TrendingDown, Lightbulb, Info } from "lucide-react";

interface SupplierAlert {
  id: string;
  supplier_id: string;
  alert_type: "critical" | "warning" | "info" | "opportunity";
  category: string;
  title: string;
  description: string;
  recommended_action: string | null;
  status: string;
  created_at: string;
  supplier?: {
    id: string;
    company_name: string;
    overall_score: number | null;
    response_rate: number | null;
  } | null;
}

const ALERT_STYLES: Record<string, { icon: typeof AlertTriangle; color: string; bg: string; border: string }> = {
  critical: { icon: AlertTriangle, color: "text-[#EF4444]", bg: "bg-[#EF4444]/10", border: "border-[#EF4444]/25" },
  warning: { icon: TrendingDown, color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10", border: "border-[#F59E0B]/25" },
  info: { icon: Info, color: "text-[#3B82F6]", bg: "bg-[#3B82F6]/10", border: "border-[#3B82F6]/25" },
  opportunity: { icon: Lightbulb, color: "text-[#10B981]", bg: "bg-[#10B981]/10", border: "border-[#10B981]/25" },
};

export function SupplierAlertsBanner() {
  const [alerts, setAlerts] = useState<SupplierAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    fetch("/api/agents/supplier-alerts?status=active&limit=10")
      .then((r) => r.json())
      .then((data) => setAlerts(data.alerts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAcknowledge = async (alertId: string) => {
    try {
      await fetch("/api/agents/supplier-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_id: alertId, status: "acknowledged" }),
      });
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch {
      // Silently ignore
    }
  };

  const handleDismiss = async (alertId: string) => {
    try {
      await fetch("/api/agents/supplier-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_id: alertId, status: "dismissed" }),
      });
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch {
      // Silently ignore
    }
  };

  if (loading || alerts.length === 0) return null;

  const criticalCount = alerts.filter((a) => a.alert_type === "critical").length;
  const warningCount = alerts.filter((a) => a.alert_type === "warning").length;

  return (
    <div className="mb-4 rounded-xl border border-[#27272A] bg-[#18181B] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1C1C1F] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#F59E0B]/10">
            <Bot className="h-3.5 w-3.5 text-[#F59E0B]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#FAFAFA]">
              {alerts.length} alerte{alerts.length > 1 ? "s" : ""} fournisseur
            </span>
            <span className="text-[11px] text-[#71717A]">Supplier Monitor</span>
          </div>
          {/* Severity pills */}
          <div className="flex items-center gap-1.5 ml-2">
            {criticalCount > 0 && (
              <span className="text-[10px] font-semibold bg-[#EF4444]/15 text-[#EF4444] px-1.5 py-0.5 rounded">
                {criticalCount} critique{criticalCount > 1 ? "s" : ""}
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-[10px] font-semibold bg-[#F59E0B]/15 text-[#F59E0B] px-1.5 py-0.5 rounded">
                {warningCount} warning{warningCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-[#71717A]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[#71717A]" />
        )}
      </button>

      {/* Alert list */}
      {expanded && (
        <div className="border-t border-[#27272A]">
          {alerts.map((alert) => {
            const style = ALERT_STYLES[alert.alert_type] || ALERT_STYLES.info;
            const Icon = style.icon;

            return (
              <div
                key={alert.id}
                className={`flex gap-3 px-4 py-3 border-b border-[#27272A]/50 last:border-b-0 hover:bg-[#1C1C1F]/50 transition-colors`}
              >
                {/* Icon */}
                <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${style.bg} shrink-0 mt-0.5`}>
                  <Icon className={`h-3.5 w-3.5 ${style.color}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-medium text-[#FAFAFA]">{alert.title}</p>
                      {alert.supplier?.company_name && (
                        <p className="text-[11px] text-[#71717A] mt-0.5">{alert.supplier.company_name}</p>
                      )}
                    </div>
                    <span className={`text-[9px] font-semibold ${style.color} ${style.bg} px-1.5 py-0.5 rounded shrink-0`}>
                      {alert.alert_type}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#A1A1AA] mt-1 line-clamp-2">{alert.description}</p>
                  {alert.recommended_action && (
                    <p className="text-[11px] text-[#F97316] mt-1.5 flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      {alert.recommended_action}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-start gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    className="p-1.5 rounded-md hover:bg-[#27272A] transition-colors"
                    title="Ignorer"
                  >
                    <X className="h-3.5 w-3.5 text-[#52525B]" />
                  </button>
                  <button
                    onClick={() => handleAcknowledge(alert.id)}
                    className="p-1.5 rounded-md hover:bg-[#27272A] transition-colors"
                    title="Vu"
                  >
                    <Check className="h-3.5 w-3.5 text-[#52525B]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
