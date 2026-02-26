"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
// Mock data removed — will be replaced by real API calls
type AdminAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  org_name?: string;
  org_id?: string;
  actions: { label: string; type: string }[];
};

type Severity = "all" | "critical" | "warning" | "info";

const severityConfig = {
  critical: {
    icon: AlertCircle,
    bg: "bg-red-50",
    border: "border-red-200",
    iconColor: "text-red-600",
    badge: "bg-red-100 text-red-700",
    label: "alertCritical",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-50",
    border: "border-amber-200",
    iconColor: "text-amber-600",
    badge: "bg-amber-100 text-amber-700",
    label: "alertWarning",
  },
  info: {
    icon: Info,
    bg: "bg-blue-50",
    border: "border-blue-200",
    iconColor: "text-blue-600",
    badge: "bg-blue-100 text-blue-700",
    label: "alertInfo",
  },
};

export default function AdminAlertsPage() {
  const t = useTranslations("admin");
  const [filter, setFilter] = useState<Severity>("all");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Empty alerts — will be replaced by real API calls
  const alerts = useMemo(() => {
    return [] as AdminAlert[];
  }, []);

  const filteredAlerts = useMemo(() => {
    return alerts
      .filter((a) => !dismissedIds.has(a.id))
      .filter((a) => filter === "all" || a.severity === filter);
  }, [alerts, filter, dismissedIds]);

  const counts = useMemo(() => {
    const active = alerts.filter((a) => !dismissedIds.has(a.id));
    return {
      all: active.length,
      critical: active.filter((a) => a.severity === "critical").length,
      warning: active.filter((a) => a.severity === "warning").length,
      info: active.filter((a) => a.severity === "info").length,
    };
  }, [alerts, dismissedIds]);

  function handleDismiss(id: string) {
    setDismissedIds((prev) => new Set([...prev, id]));
  }

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            {t("alertsTitle")}
          </h1>
          <p className="text-sm text-gray-500">
            {counts.all === 0
              ? t("noAlerts")
              : `${counts.all} alerte${counts.all > 1 ? "s" : ""} active${counts.all > 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => setDismissedIds(new Set())}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualiser
        </button>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        {(["all", "critical", "warning", "info"] as const).map((sev) => (
          <button
            key={sev}
            onClick={() => setFilter(sev)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              filter === sev
                ? "border-red-200 bg-red-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center gap-2">
              {sev === "all" ? (
                <AlertTriangle className="h-4 w-4 text-gray-500" />
              ) : (
                (() => {
                  const Ic = severityConfig[sev].icon;
                  return (
                    <Ic
                      className={`h-4 w-4 ${severityConfig[sev].iconColor}`}
                    />
                  );
                })()
              )}
              <span className="text-sm font-medium text-gray-700">
                {sev === "all" ? "Toutes" : t(severityConfig[sev].label)}
              </span>
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-800">
              {counts[sev]}
            </p>
          </button>
        ))}
      </div>

      {/* Alert list */}
      {filteredAlerts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-400" />
          <p className="mt-3 text-sm font-medium text-gray-600">
            {t("noAlerts")}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Tous les systèmes fonctionnent correctement
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              t={t}
              onDismiss={() => handleDismiss(alert.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertCard({
  alert,
  t,
  onDismiss,
}: {
  alert: AdminAlert;
  t: ReturnType<typeof useTranslations>;
  onDismiss: () => void;
}) {
  const config = severityConfig[alert.severity];
  const Icon = config.icon;

  return (
    <div
      className={`rounded-lg border ${config.border} ${config.bg} p-4 transition-opacity`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${config.iconColor}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.badge}`}
            >
              {t(config.label)}
            </span>
            <h3 className="text-sm font-semibold text-gray-800">
              {alert.title}
            </h3>
          </div>
          <p className="mt-1 text-sm text-gray-600">{alert.description}</p>
          {alert.actions.length > 0 && (
            <div className="mt-3 flex gap-2">
              {alert.actions.map((action, i) => (
                <button
                  key={i}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    i === 0
                      ? "bg-white text-gray-700 shadow-sm hover:bg-gray-50"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-white/50 hover:text-gray-600"
          title="Masquer"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

// computeHealthAlerts removed — will be replaced by real API calls
