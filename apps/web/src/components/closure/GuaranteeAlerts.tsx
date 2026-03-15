"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Calendar, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ProjectReception, ReceptionReserve } from "@cantaia/database";

export interface GuaranteeAlert {
  type: "guarantee_2y" | "guarantee_5y" | "reserve_overdue" | "reserve_unresolved";
  severity: "info" | "warning" | "danger";
  project_id: string;
  project_name?: string;
  message: string;
  date?: string;
  days?: number;
  reserve?: ReceptionReserve;
}

function daysBetween(dateStr: string, now: Date): number {
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeGuaranteeAlerts(
  receptions: ProjectReception[],
  reserves: ReceptionReserve[],
  projectNames?: Record<string, string>
): GuaranteeAlert[] {
  const alerts: GuaranteeAlert[] = [];
  const now = new Date();

  for (const rec of receptions) {
    if (rec.status !== "signed") continue;
    const pName = projectNames?.[rec.project_id] || rec.project_id;

    // Guarantee 2y alerts
    if (rec.guarantee_2y_end) {
      const days = daysBetween(rec.guarantee_2y_end, now);
      if (days <= 0) {
        alerts.push({
          type: "guarantee_2y",
          severity: "danger",
          project_id: rec.project_id,
          project_name: pName,
          message: `${pName} — Garantie 2 ans expirée.`,
          date: rec.guarantee_2y_end,
          days: Math.abs(days),
        });
      } else if (days <= 30) {
        alerts.push({
          type: "guarantee_2y",
          severity: "danger",
          project_id: rec.project_id,
          project_name: pName,
          message: `${pName} — Fin de garantie 2 ans dans ${days} jours.`,
          date: rec.guarantee_2y_end,
          days,
        });
      } else if (days <= 90) {
        alerts.push({
          type: "guarantee_2y",
          severity: "warning",
          project_id: rec.project_id,
          project_name: pName,
          message: `${pName} — Fin de garantie 2 ans le ${rec.guarantee_2y_end}. Planifiez la visite.`,
          date: rec.guarantee_2y_end,
          days,
        });
      }
    }

    // Guarantee 5y alerts
    if (rec.guarantee_5y_end) {
      const days = daysBetween(rec.guarantee_5y_end, now);
      if (days <= 0) {
        alerts.push({
          type: "guarantee_5y",
          severity: "danger",
          project_id: rec.project_id,
          project_name: pName,
          message: `${pName} — Garantie 5 ans expirée.`,
          date: rec.guarantee_5y_end,
          days: Math.abs(days),
        });
      } else if (days <= 30) {
        alerts.push({
          type: "guarantee_5y",
          severity: "danger",
          project_id: rec.project_id,
          project_name: pName,
          message: `${pName} — Fin de garantie 5 ans dans ${days} jours.`,
          date: rec.guarantee_5y_end,
          days,
        });
      } else if (days <= 90) {
        alerts.push({
          type: "guarantee_5y",
          severity: "warning",
          project_id: rec.project_id,
          project_name: pName,
          message: `${pName} — Fin de garantie 5 ans le ${rec.guarantee_5y_end}. Planifiez la visite.`,
          date: rec.guarantee_5y_end,
          days,
        });
      }
    }
  }

  // Reserve alerts
  for (const res of reserves) {
    if (res.status === "verified") continue;
    const pName = projectNames?.[res.project_id] || res.project_id;

    // Overdue reserves
    if (res.deadline) {
      const days = daysBetween(res.deadline, now);
      if (days < 0) {
        alerts.push({
          type: "reserve_overdue",
          severity: "danger",
          project_id: res.project_id,
          project_name: pName,
          message: `Réserve "${res.description}" en retard — deadline dépassée de ${Math.abs(days)} jours`,
          days: Math.abs(days),
          reserve: res,
        });
      }
    }

    // Unresolved > 30 days
    const createdDays = daysBetween(res.created_at, now);
    if (createdDays < -30 && res.status === "open") {
      alerts.push({
        type: "reserve_unresolved",
        severity: "warning",
        project_id: res.project_id,
        project_name: pName,
        message: `Réserve "${res.description}" non traitée depuis ${Math.abs(createdDays)} jours — relancer ${res.responsible_company || "l'entreprise"}`,
        reserve: res,
      });
    }
  }

  // Sort by severity (danger first)
  const severityOrder = { danger: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}

interface GuaranteeAlertsProps {
  compact?: boolean;
  projectId?: string;
}

export function GuaranteeAlerts({ compact = false, projectId }: GuaranteeAlertsProps) {
  const t = useTranslations("closure");
  const [receptions, setReceptions] = useState<ProjectReception[]>([]);
  const [reserves, setReserves] = useState<ReceptionReserve[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient();
        let receptionsQuery = (supabase.from("project_receptions") as any).select("*");
        let reservesQuery = (supabase.from("reception_reserves") as any).select("*");
        if (projectId) {
          receptionsQuery = receptionsQuery.eq("project_id", projectId);
          reservesQuery = reservesQuery.eq("project_id", projectId);
        }
        const [recRes, resRes] = await Promise.all([
          receptionsQuery.catch(() => ({ data: [] })),
          reservesQuery.catch(() => ({ data: [] })),
        ]);
        setReceptions(recRes.data || []);
        setReserves(resRes.data || []);
      } catch {
        // Tables may not exist yet
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [projectId]);

  if (loading) return null;

  const alerts = computeGuaranteeAlerts(receptions, reserves);

  if (alerts.length === 0) return null;

  const severityStyles = {
    danger: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
  };

  const severityIcons = {
    danger: <AlertTriangle className="h-4 w-4 text-red-500" />,
    warning: <Calendar className="h-4 w-4 text-amber-500" />,
    info: <ShieldCheck className="h-4 w-4 text-blue-500" />,
  };

  if (compact) {
    return (
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-500">{t("guaranteeAlerts")}</h4>
        {alerts.slice(0, 3).map((alert, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${severityStyles[alert.severity]}`}
          >
            {severityIcons[alert.severity]}
            <span className="truncate">{alert.message}</span>
          </div>
        ))}
        {alerts.length > 3 && (
          <p className="text-[10px] text-slate-400">{t("moreAlerts", { count: alerts.length - 3 })}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-800">{t("guaranteeAlerts")}</h3>
      {alerts.map((alert, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 rounded-md border p-3 ${severityStyles[alert.severity]}`}
        >
          <div className="flex-shrink-0 pt-0.5">{severityIcons[alert.severity]}</div>
          <div className="flex-1">
            <p className="text-sm">{alert.message}</p>
            {alert.date && (
              <p className="mt-0.5 text-xs opacity-75">
                {alert.days !== undefined && alert.days > 0
                  ? t("daysRemaining", { days: alert.days })
                  : t("daysOverdue", { days: alert.days || 0 })}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
