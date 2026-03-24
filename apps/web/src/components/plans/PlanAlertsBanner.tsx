"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  AlertTriangle,
  Clock,
  Send,
  AlertOctagon,
  ChevronRight,
  FileStack,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import type { PlanAlertType, PlanAlertSeverity } from "@cantaia/database";

export interface PlanAlert {
  id: string;
  plan_id: string;
  plan_number: string;
  plan_title: string;
  alert_type: PlanAlertType;
  severity: PlanAlertSeverity;
  message: string;
  project_name: string;
  created_at: string;
}

// Mock alerts data
export const mockPlanAlerts: PlanAlert[] = [
  {
    id: "alert-001",
    plan_id: "plan-001",
    plan_number: "211-B2-04",
    plan_title: "Coffrage dalle sous-sol B2",
    alert_type: "outdated_reference",
    severity: "critical",
    message: "L'email de Implenia SA référence la version B, mais la version actuelle est C.",
    project_name: "Résidence Les Cèdres",
    created_at: "2026-02-17T14:30:00Z",
  },
  {
    id: "alert-002",
    plan_id: "plan-002",
    plan_number: "ARC-301",
    plan_title: "Façade sud — détail attique",
    alert_type: "approval_pending",
    severity: "warning",
    message: "Version B en attente de validation depuis 4 jours.",
    project_name: "Résidence Les Cèdres",
    created_at: "2026-02-14T10:00:00Z",
  },
  {
    id: "alert-003",
    plan_id: "plan-001",
    plan_number: "211-B2-04",
    plan_title: "Coffrage dalle sous-sol B2",
    alert_type: "missing_distribution",
    severity: "warning",
    message: "Version C non distribuée à Sophie Martin (Weinmann Energies) — dernière distribution en V-B.",
    project_name: "Résidence Les Cèdres",
    created_at: "2026-02-11T15:00:00Z",
  },
  {
    id: "alert-004",
    plan_id: "plan-006",
    plan_number: "ARC-101",
    plan_title: "Plan d'ensemble RDC",
    alert_type: "version_conflict",
    severity: "info",
    message: "Deux versions (D et E) reçues le même jour de deux sources différentes.",
    project_name: "Parking Morges",
    created_at: "2026-02-16T16:00:00Z",
  },
];

const ALERT_TYPE_CONFIG: Record<PlanAlertType, { icon: React.ElementType; labelKey: string }> = {
  outdated_reference: { icon: AlertOctagon, labelKey: "alertOutdatedRef" },
  missing_distribution: { icon: Send, labelKey: "alertMissingDist" },
  approval_pending: { icon: Clock, labelKey: "alertApprovalPending" },
  version_conflict: { icon: AlertTriangle, labelKey: "alertVersionConflict" },
};

const SEVERITY_STYLES: Record<PlanAlertSeverity, { border: string; bg: string; icon: string; text: string }> = {
  critical: { border: "border-red-500/20", bg: "bg-red-500/10", icon: "text-red-600", text: "text-red-700 dark:text-red-400" },
  warning: { border: "border-amber-500/20", bg: "bg-amber-500/10", icon: "text-amber-600", text: "text-amber-700 dark:text-amber-400" },
  info: { border: "border-[#F97316]/20", bg: "bg-[#F97316]/10", icon: "text-[#F97316]", text: "text-[#F97316]" },
};

export interface CrossPlanData {
  project_id: string;
  plans_compares: Array<{ plan_id: string; discipline: string; numero: string }>;
  verifications: Array<{
    element: string;
    cfc_code: string;
    unite: string;
    valeurs_par_plan: Array<{ plan_id: string; discipline: string; quantite: number }>;
    ecart_max_pct: number;
    coherent: boolean;
    note: string;
  }>;
  score_coherence_projet: number;
  alertes: string[];
}

interface PlanAlertsBannerProps {
  alerts?: PlanAlert[];
  maxAlerts?: number;
  compact?: boolean;
  crossPlan?: CrossPlanData;
}

export function PlanAlertsBanner({ alerts = mockPlanAlerts, maxAlerts = 3, compact = false, crossPlan }: PlanAlertsBannerProps) {
  const t = useTranslations("plans");

  const criticals = alerts.filter((a) => a.severity === "critical");
  const others = alerts.filter((a) => a.severity !== "critical");
  const sorted = [...criticals, ...others];
  const displayed = sorted.slice(0, maxAlerts);
  const remaining = sorted.length - displayed.length;

  const hasCrossPlanAlerts = crossPlan && crossPlan.alertes.length > 0;
  const crossPlanGood = crossPlan && crossPlan.score_coherence_projet >= 90;

  if (alerts.length === 0 && !crossPlan) return null;

  if (compact) {
    const hasCritical = criticals.length > 0;
    return (
      <Link
        href="/plans"
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2 transition-colors hover:shadow-sm",
          hasCritical ? "border-red-500/20 bg-red-500/10" : "border-amber-500/20 bg-amber-500/10"
        )}
      >
        <FileStack className={cn("h-4 w-4 shrink-0", hasCritical ? "text-red-600" : "text-amber-600")} />
        <span className={cn("text-xs font-medium flex-1", hasCritical ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400")}>
          {t("planAlertsCompact", { count: alerts.length })}
        </span>
        <ChevronRight className={cn("h-3.5 w-3.5", hasCritical ? "text-red-400" : "text-amber-400")} />
      </Link>
    );
  }

  return (
    <div className="space-y-2">
      {displayed.map((alert) => {
        const typeCfg = ALERT_TYPE_CONFIG[alert.alert_type];
        const sevStyle = SEVERITY_STYLES[alert.severity];
        const Icon = typeCfg.icon;
        return (
          <Link
            key={alert.id}
            href={`/plans/${alert.plan_id}`}
            className={cn(
              "flex items-start gap-2.5 rounded-md border p-3 transition-colors hover:shadow-sm",
              sevStyle.border, sevStyle.bg
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", sevStyle.icon)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={cn("text-xs font-semibold", sevStyle.text)}>
                  {alert.plan_number}
                </span>
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
                  sevStyle.bg, sevStyle.text
                )}>
                  {t(typeCfg.labelKey)}
                </span>
              </div>
              <p className={cn("text-[11px]", sevStyle.text)}>{alert.message}</p>
              <p className="text-[10px] text-[#71717A] mt-0.5">{alert.project_name}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[#71717A] shrink-0 mt-0.5" />
          </Link>
        );
      })}
      {remaining > 0 && (
        <Link
          href="/plans"
          className="flex items-center justify-center gap-1 py-1.5 text-xs text-[#71717A] hover:text-brand transition-colors"
        >
          {t("moreAlertsPlan", { count: remaining })}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}

      {/* ─── Section vérification inter-plans ─── */}
      {crossPlan && (crossPlan.verifications.length > 0 || crossPlan.alertes.length > 0) && (
        <div className={cn(
          "rounded-md border p-3 space-y-2",
          hasCrossPlanAlerts ? "border-amber-500/20 bg-amber-500/10" : "border-green-500/20 bg-green-500/10"
        )}>
          {/* En-tête */}
          <div className="flex items-center gap-2">
            <Layers className={cn("h-4 w-4 shrink-0", hasCrossPlanAlerts ? "text-amber-600" : "text-green-600")} />
            <span className={cn("text-xs font-semibold", hasCrossPlanAlerts ? "text-amber-800 dark:text-amber-300" : "text-green-800 dark:text-green-300")}>
              Vérification inter-plans ({crossPlan.verifications.length} comparaison{crossPlan.verifications.length !== 1 ? "s" : ""})
            </span>
            {crossPlanGood && (
              <div className="ml-auto flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                <span className="text-[10px] font-medium text-green-700 dark:text-green-400">{crossPlan.score_coherence_projet}% cohérent</span>
              </div>
            )}
            {!crossPlanGood && crossPlan && (
              <span className={cn(
                "ml-auto text-[10px] font-semibold",
                crossPlan.score_coherence_projet >= 70 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400"
              )}>
                Score : {crossPlan.score_coherence_projet}%
              </span>
            )}
          </div>

          {/* Alertes d'incohérence */}
          {crossPlan.alertes.map((alerte, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 dark:text-amber-300">{alerte}</p>
            </div>
          ))}

          {/* Disciplines comparées */}
          {crossPlan.plans_compares.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1 border-t border-amber-500/20/60">
              {crossPlan.plans_compares.map((p) => (
                <span key={p.plan_id} className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-[#0F0F11]/70 text-[#71717A] border border-[#27272A]">
                  {p.discipline} {p.numero && `· ${p.numero}`}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Message si pas assez de plans pour la vérification croisée */}
      {crossPlan && crossPlan.verifications.length === 0 && crossPlan.alertes.length === 1 && crossPlan.plans_compares.length === 0 && (
        <div className="flex items-center gap-2 rounded-md border border-[#27272A] bg-[#27272A] px-3 py-2">
          <Layers className="h-3.5 w-3.5 text-[#71717A]" />
          <span className="text-[11px] text-[#71717A]">{crossPlan.alertes[0]}</span>
        </div>
      )}
    </div>
  );
}
