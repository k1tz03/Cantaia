"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Shield,
  BarChart3,
  Sparkles,
  Play,
  Database,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────

interface PipelineData {
  pending_count: number;
  processed_count: number;
  last_hourly_cron: string | null;
  last_weekly_cron: string | null;
  health: "healthy" | "warning" | "error" | "empty";
  queue_breakdown: Record<string, number>;
}

interface ConsentModule {
  module: string;
  opted_in: number;
  total_orgs: number;
}

interface ConsentData {
  modules: ConsentModule[];
  total_opt_in_rate: number;
  total_orgs: number;
}

interface C2TableCount {
  table: string;
  label: string;
  count: number;
  error?: boolean;
}

interface C2Data {
  tables: C2TableCount[];
  cfc_coverage: number;
  total_c2_records: number;
}

interface MetricEntry {
  metric_type: string;
  current_value: number;
  current_period: string;
  previous_value: number | null;
  trend: number | null;
}

interface C3Data {
  metrics_by_module: Record<string, MetricEntry[]>;
  patterns_by_module: Record<string, { count: number; avg_confidence: number }>;
  recent_optimizations: any[];
  total_metrics: number;
  total_patterns: number;
}

// ─── Constants ─────────────────────────────────────────────────

type TabKey = "pipeline" | "consent" | "c2" | "c3" | "actions";

const TABS: { key: TabKey; label: string; icon: typeof Activity }[] = [
  { key: "pipeline", label: "Pipeline", icon: Activity },
  { key: "consent", label: "Consentements", icon: Shield },
  { key: "c2", label: "Benchmarks C2", icon: BarChart3 },
  { key: "c3", label: "Qualité IA (C3)", icon: Sparkles },
  { key: "actions", label: "Actions", icon: Play },
];

const MODULE_LABELS: Record<string, string> = {
  prix: "Prix & Soumissions",
  fournisseurs: "Fournisseurs",
  plans: "Plans",
  pv: "PV de chantier",
  visites: "Visites client",
  chat: "Chat IA",
  mail: "Messagerie",
  taches: "Tâches",
  briefing: "Briefing",
};

const HEALTH_CONFIG = {
  healthy: {
    color: "bg-emerald-900/30 text-emerald-400",
    dot: "bg-emerald-500",
    label: "Pipeline actif",
  },
  warning: {
    color: "bg-yellow-900/30 text-yellow-400",
    dot: "bg-yellow-500",
    label: "Pipeline non configuré — Configurez CRON_SECRET pour activer le traitement automatique",
  },
  error: {
    color: "bg-red-900/30 text-red-400",
    dot: "bg-red-500",
    label: "Pipeline en erreur",
  },
  empty: {
    color: "bg-[#1C1C1F] text-[#A1A1AA]",
    dot: "bg-[#71717A]",
    label: "En attente de données",
  },
};

// ─── Helpers ───────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "Jamais";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

// ─── Main Component ────────────────────────────────────────────

export default function DataIntelligencePage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("pipeline");
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [consentData, setConsentData] = useState<ConsentData | null>(null);
  const [c2Data, setC2Data] = useState<C2Data | null>(null);
  const [c3Data, setC3Data] = useState<C3Data | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pipeline, consent, c2, c3] = await Promise.all([
        fetch("/api/super-admin/data-intelligence?action=pipeline-status").then((r) => r.json()),
        fetch("/api/super-admin/data-intelligence?action=consent-overview").then((r) => r.json()),
        fetch("/api/super-admin/data-intelligence?action=c2-coverage").then((r) => r.json()),
        fetch("/api/super-admin/data-intelligence?action=c3-quality").then((r) => r.json()),
      ]);
      setPipelineData(pipeline);
      setConsentData(consent);
      setC2Data(c2);
      setC3Data(c3);
    } catch (err) {
      console.error("Failed to load data intelligence:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#FAFAFA]">Data Intelligence</h1>
          <p className="mt-1 text-sm text-[#A1A1AA]">
            Monitoring du pipeline d&apos;intelligence collective — 3 couches (C1 → C2 → C3)
          </p>
        </div>
        <button
          onClick={loadAll}
          className="flex items-center gap-2 rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2 text-sm text-[#A1A1AA] hover:bg-[#27272A]"
        >
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-[#27272A]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-amber-400 text-amber-600"
                : "border-transparent text-[#A1A1AA] hover:border-[#3F3F46] hover:text-[#FAFAFA]"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "pipeline" && <PipelineSection data={pipelineData} />}
      {activeTab === "consent" && <ConsentSection data={consentData} />}
      {activeTab === "c2" && <C2CoverageSection data={c2Data} />}
      {activeTab === "c3" && <C3QualitySection data={c3Data} />}
      {activeTab === "actions" && <ActionsSection onRefresh={loadAll} />}
    </div>
  );
}

// ─── Pipeline Section ──────────────────────────────────────────

function PipelineSection({ data }: { data: PipelineData | null }) {
  if (!data) return <ErrorCard />;

  const healthCfg = HEALTH_CONFIG[data.health];
  const breakdownEntries = Object.entries(data.queue_breakdown);

  const cards = [
    {
      label: "En attente",
      value: data.pending_count,
      icon: Clock,
      color: "bg-amber-900/30 text-amber-400",
    },
    {
      label: "Traités",
      value: data.processed_count,
      icon: CheckCircle,
      color: "bg-emerald-900/30 text-emerald-400",
    },
    {
      label: "Dernier CRON horaire",
      value: formatDate(data.last_hourly_cron),
      icon: RefreshCw,
      color: "bg-blue-900/30 text-blue-400",
    },
    {
      label: "Dernier CRON hebdo",
      value: formatDate(data.last_weekly_cron),
      icon: Sparkles,
      color: "bg-violet-900/30 text-violet-400",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Health badge */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${healthCfg.color}`}
        >
          <span className={`h-2 w-2 rounded-full ${healthCfg.dot}`} />
          {healthCfg.label}
        </span>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-[#27272A] bg-[#18181B] p-4"
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}
              >
                <card.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-[#A1A1AA]">{card.label}</p>
                <p className="text-xl font-bold text-[#FAFAFA]">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Queue breakdown */}
      {breakdownEntries.length > 0 && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[#FAFAFA]">
            File d&apos;attente par source
          </h3>
          <div className="space-y-2">
            {breakdownEntries.map(([table, count]) => (
              <div
                key={table}
                className="flex items-center justify-between rounded-md bg-[#1C1C1F] px-3 py-2"
              >
                <span className="text-sm text-[#A1A1AA]">{table}</span>
                <span className="text-sm font-medium text-[#FAFAFA]">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.health === "empty" && (
        <div className="rounded-lg border-2 border-dashed border-[#27272A] bg-[#1C1C1F] p-8 text-center">
          <Database className="mx-auto h-10 w-10 text-[#71717A]" />
          <p className="mt-3 text-sm font-medium text-[#A1A1AA]">
            Aucun événement dans la file d&apos;attente
          </p>
          <p className="mt-1 text-xs text-[#71717A]">
            Les triggers insèreront des événements lors de l&apos;utilisation de
            la plateforme (corrections, feedbacks, nouvelles offres...).
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Consent Section ───────────────────────────────────────────

function ConsentSection({ data }: { data: ConsentData | null }) {
  if (!data) return <ErrorCard />;

  return (
    <div className="space-y-6">
      {/* Global rate */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[#A1A1AA]">Taux global d&apos;opt-in</p>
            <p className="text-3xl font-bold text-[#FAFAFA]">
              {data.total_opt_in_rate}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-[#A1A1AA]">Organisations</p>
            <p className="text-2xl font-bold text-[#FAFAFA]">
              {data.total_orgs}
            </p>
          </div>
        </div>
      </div>

      {/* Per module */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-5">
        <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
          Consentement par module
        </h3>
        <div className="space-y-3">
          {data.modules.map((mod) => {
            const pct =
              mod.total_orgs > 0
                ? Math.round((mod.opted_in / mod.total_orgs) * 100)
                : 0;
            return (
              <div key={mod.module}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-[#A1A1AA]">
                    {MODULE_LABELS[mod.module] || mod.module}
                  </span>
                  <span className="text-xs text-[#71717A]">
                    {mod.opted_in} / {mod.total_orgs} orgs
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#27272A]">
                  <div
                    className="h-2 rounded-full bg-amber-400 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {data.total_orgs === 0 && (
        <p className="text-center text-sm text-[#71717A]">
          Aucune organisation inscrite. Les organisations peuvent activer le
          partage dans Paramètres → Partage de données.
        </p>
      )}
    </div>
  );
}

// ─── C2 Coverage Section ───────────────────────────────────────

function C2CoverageSection({ data }: { data: C2Data | null }) {
  if (!data) return <ErrorCard />;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <p className="text-xs text-[#A1A1AA]">Total entrées C2</p>
          <p className="text-2xl font-bold text-[#FAFAFA]">
            {data.total_c2_records}
          </p>
        </div>
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <p className="text-xs text-[#A1A1AA]">Codes CFC couverts</p>
          <p className="text-2xl font-bold text-[#FAFAFA]">
            {data.cfc_coverage}
          </p>
        </div>
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <p className="text-xs text-[#A1A1AA]">Règles normalisation</p>
          <p className="text-2xl font-bold text-[#FAFAFA]">
            {data.tables.find((t) => t.table === "normalization_rules")
              ?.count ?? 0}
          </p>
        </div>
      </div>

      {/* Table counts */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-5">
        <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
          Tables C2 — Couverture
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.tables.map((t) => (
            <div
              key={t.table}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                t.count > 0
                  ? "border-emerald-700 bg-emerald-900/30"
                  : "border-[#27272A] bg-[#1C1C1F]"
              }`}
            >
              <span className="text-sm text-[#A1A1AA]">{t.label}</span>
              <span
                className={`text-sm font-bold ${
                  t.count > 0 ? "text-emerald-400" : "text-[#71717A]"
                }`}
              >
                {t.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {data.total_c2_records === 0 && (
        <div className="rounded-lg border-2 border-dashed border-[#27272A] bg-[#1C1C1F] p-8 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-[#71717A]" />
          <p className="mt-3 text-sm font-medium text-[#A1A1AA]">
            Aucune donnée C2 encore agrégée
          </p>
          <p className="mt-1 text-xs text-[#71717A]">
            Les benchmarks seront générés quand ≥3 organisations contribueront
            au même module et que le CRON horaire s&apos;exécutera.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── C3 Quality Section ────────────────────────────────────────

function C3QualitySection({ data }: { data: C3Data | null }) {
  if (!data) return <ErrorCard />;

  const hasMetrics = data.total_metrics > 0;
  const hasPatterns = data.total_patterns > 0;
  const moduleKeys = Object.keys(data.metrics_by_module);
  const patternKeys = Object.keys(data.patterns_by_module);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <p className="text-xs text-[#A1A1AA]">Métriques IA</p>
          <p className="text-2xl font-bold text-[#FAFAFA]">
            {data.total_metrics}
          </p>
        </div>
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <p className="text-xs text-[#A1A1AA]">Patterns appris</p>
          <p className="text-2xl font-bold text-[#FAFAFA]">
            {data.total_patterns}
          </p>
        </div>
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <p className="text-xs text-[#A1A1AA]">Modules avec métriques</p>
          <p className="text-2xl font-bold text-[#FAFAFA]">
            {moduleKeys.length}
          </p>
        </div>
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <p className="text-xs text-[#A1A1AA]">Optimisations prompts</p>
          <p className="text-2xl font-bold text-[#FAFAFA]">
            {data.recent_optimizations.length}
          </p>
        </div>
      </div>

      {/* Metrics by module */}
      {hasMetrics && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            Métriques qualité par module
          </h3>
          <div className="space-y-4">
            {moduleKeys.map((mod) => (
              <div key={mod}>
                <h4 className="mb-2 text-sm font-medium capitalize text-[#A1A1AA]">
                  {MODULE_LABELS[mod] || mod}
                </h4>
                <div className="overflow-hidden rounded-lg border border-[#27272A]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#1C1C1F]">
                        <th className="px-3 py-2 text-left text-xs font-medium text-[#A1A1AA]">
                          Métrique
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-[#A1A1AA]">
                          Valeur
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-[#A1A1AA]">
                          Précédent
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-[#A1A1AA]">
                          Trend
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-[#A1A1AA]">
                          Période
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.metrics_by_module[mod].map((m) => (
                        <tr
                          key={m.metric_type}
                          className="border-t border-[#27272A]"
                        >
                          <td className="px-3 py-2 text-[#A1A1AA]">
                            {m.metric_type}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-[#FAFAFA]">
                            {typeof m.current_value === "number"
                              ? m.current_value.toFixed(3)
                              : m.current_value}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[#71717A]">
                            {m.previous_value !== null
                              ? m.previous_value.toFixed(3)
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <TrendBadge value={m.trend} />
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-[#71717A]">
                            {m.current_period}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pattern library */}
      {hasPatterns && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            Bibliothèque de patterns
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {patternKeys.map((mod) => {
              const p = data.patterns_by_module[mod];
              return (
                <div
                  key={mod}
                  className="rounded-lg border border-violet-200 bg-violet-50 p-3"
                >
                  <p className="text-xs font-medium text-violet-700">
                    {MODULE_LABELS[mod] || mod}
                  </p>
                  <p className="mt-1 text-lg font-bold text-violet-900">
                    {p.count} patterns
                  </p>
                  <p className="text-xs text-violet-600">
                    Confiance moy. {(p.avg_confidence * 100).toFixed(0)}%
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent prompt optimizations */}
      {data.recent_optimizations.length > 0 && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            Optimisations de prompts récentes
          </h3>
          <div className="space-y-2">
            {data.recent_optimizations.map((opt: any) => (
              <div
                key={opt.id}
                className="flex items-center justify-between rounded-md bg-[#1C1C1F] px-3 py-2"
              >
                <div>
                  <span className="text-sm font-medium text-[#A1A1AA]">
                    {opt.module}
                  </span>
                  <span className="ml-2 text-xs text-[#71717A]">
                    v{opt.prompt_version}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {opt.improvement_pct != null && (
                    <TrendBadge value={opt.improvement_pct} />
                  )}
                  <span className="text-xs text-[#71717A]">
                    {formatDate(opt.deployed_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasMetrics && !hasPatterns && (
        <div className="rounded-lg border-2 border-dashed border-[#27272A] bg-[#1C1C1F] p-8 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-[#71717A]" />
          <p className="mt-3 text-sm font-medium text-[#A1A1AA]">
            Aucune métrique IA encore calculée
          </p>
          <p className="mt-1 text-xs text-[#71717A]">
            Le CRON hebdomadaire génèrera les premières métriques dimanche à 3h
            du matin, à partir des corrections et feedbacks utilisateurs.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Actions Section ───────────────────────────────────────────

function ActionsSection({ onRefresh }: { onRefresh: () => void }) {
  const [triggering, setTriggering] = useState<string | null>(null);
  const [result, setResult] = useState<{
    action: string;
    data: any;
    success: boolean;
  } | null>(null);

  async function triggerCron(action: string) {
    setTriggering(action);
    setResult(null);
    try {
      const res = await fetch("/api/super-admin/data-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setResult({ action, data, success: res.ok });
      onRefresh();
    } catch (err: unknown) {
      setResult({
        action,
        data: { error: err instanceof Error ? err.message : "Unknown error" },
        success: false,
      });
    } finally {
      setTriggering(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Warning */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-medium text-amber-800">
            Actions manuelles
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Ces actions s&apos;exécutent normalement automatiquement via Vercel
            CRON. Utilisez-les uniquement pour les tests ou le débogage.
          </p>
        </div>
      </div>

      {/* Buttons */}
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => triggerCron("trigger-aggregate")}
          disabled={triggering !== null}
          className="flex items-center justify-center gap-2 rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-3 text-sm font-medium text-[#A1A1AA] hover:bg-[#27272A] disabled:opacity-50"
        >
          {triggering === "trigger-aggregate" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Lancer l&apos;agrégation C2 (CRON horaire)
        </button>
        <button
          onClick={() => triggerCron("trigger-patterns")}
          disabled={triggering !== null}
          className="flex items-center justify-center gap-2 rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-3 text-sm font-medium text-[#A1A1AA] hover:bg-[#27272A] disabled:opacity-50"
        >
          {triggering === "trigger-patterns" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Lancer l&apos;extraction C3 (CRON hebdo)
        </button>
      </div>

      {/* Result */}
      {result && (
        <div
          className={`rounded-lg border p-4 ${
            result.success
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <p className="mb-2 text-sm font-medium text-[#A1A1AA]">
            Résultat — {result.action}
          </p>
          <pre className="overflow-x-auto rounded bg-[#0F0F11]/80 p-3 text-xs text-[#FAFAFA]">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Shared Components ─────────────────────────────────────────

function TrendBadge({ value }: { value: number | null }) {
  if (value === null)
    return <Minus className="inline h-4 w-4 text-[#52525B]" />;
  if (value > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600">
        <TrendingUp className="h-3 w-3" />+{value}%
      </span>
    );
  if (value < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600">
        <TrendingDown className="h-3 w-3" />
        {value}%
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-[#71717A]">
      <Minus className="h-3 w-3" />
      0%
    </span>
  );
}

function ErrorCard() {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
      <p className="mt-2 text-sm text-red-700">
        Erreur de chargement. Les tables data intelligence sont peut-être pas
        encore appliquées sur Supabase.
      </p>
    </div>
  );
}
