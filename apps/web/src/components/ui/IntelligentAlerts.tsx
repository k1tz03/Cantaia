"use client";

import { useState } from "react";
import {
  Sparkles,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";

interface Alert {
  severity: "red" | "yellow" | "green";
  category: "budget" | "planning" | "supplier" | "opportunity";
  title: string;
  description: string;
  action: string;
}

interface IntelligentAlertsProps {
  projectId: string;
  estimationData?: any;
  planningData?: any;
}

const SEVERITY_CONFIG: Record<
  string,
  {
    bg: string;
    border: string;
    iconColor: string;
    Icon: typeof AlertTriangle;
  }
> = {
  red: {
    bg: "bg-red-50",
    border: "border-red-200",
    iconColor: "text-red-500",
    Icon: AlertTriangle,
  },
  yellow: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    iconColor: "text-amber-500",
    Icon: AlertCircle,
  },
  green: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    iconColor: "text-emerald-500",
    Icon: CheckCircle,
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  budget: "Budget",
  planning: "Planning",
  supplier: "Fournisseurs",
  opportunity: "Opportunite",
};

const CATEGORY_COLORS: Record<string, string> = {
  budget: "bg-blue-100 text-blue-700",
  planning: "bg-purple-100 text-purple-700",
  supplier: "bg-orange-100 text-orange-700",
  opportunity: "bg-teal-100 text-teal-700",
};

export function IntelligentAlerts({
  projectId,
  estimationData,
  planningData,
}: IntelligentAlertsProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/generate-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          estimation_data: estimationData,
          planning_data: planningData,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || `Erreur ${res.status}`
        );
      }

      const data = await res.json();
      setAlerts(data.alerts || []);
      setGenerated(true);
    } catch (err: any) {
      setError(err.message || "Erreur lors de la generation des alertes");
    } finally {
      setLoading(false);
    }
  }

  if (!generated && !loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <button
          onClick={handleGenerate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] text-white text-sm font-medium rounded-lg hover:bg-[#1D4ED8] transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Generer des alertes IA
        </button>
        {error && (
          <p className="text-sm text-red-600 mt-1">{error}</p>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 p-4 animate-pulse"
          >
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-gray-200 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-2/3" />
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-4/5" />
              </div>
            </div>
          </div>
        ))}
        <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Analyse en cours...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {alerts.length === 0 && !error && (
        <div className="text-center py-6 text-sm text-gray-500">
          Aucune alerte generee pour ce projet.
        </div>
      )}

      {alerts.map((alert, index) => {
        const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.yellow;
        const SeverityIcon = config.Icon;

        return (
          <div
            key={index}
            className={`rounded-lg border ${config.border} ${config.bg} p-3 sm:p-4`}
          >
            <div className="flex items-start gap-3">
              <SeverityIcon
                className={`w-5 h-5 ${config.iconColor} mt-0.5 shrink-0`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-900">
                    {alert.title}
                  </span>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${CATEGORY_COLORS[alert.category] || "bg-gray-100 text-gray-700"}`}
                  >
                    {CATEGORY_LABELS[alert.category] || alert.category}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {alert.description}
                </p>
                {alert.action && (
                  <span className="inline-block mt-2 px-2 py-0.5 rounded bg-white/70 border border-gray-200 text-xs text-gray-700">
                    {alert.action}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {generated && alerts.length > 0 && (
        <div className="flex justify-end pt-1">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors inline-flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            Rafraichir
          </button>
        </div>
      )}
    </div>
  );
}
