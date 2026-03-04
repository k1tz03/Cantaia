"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Mail,
  FileText,
  CheckSquare,
  Map,
  RefreshCw,
  CalendarDays,
  Timer,
  TrendingUp,
} from "lucide-react";

// --- Time savings rates ---
const RATES = {
  email: { minutesPerItem: 2, label: "Emails classifies par IA", icon: Mail, color: "blue" },
  pv: { minutesPerItem: 45, label: "PV de chantier generes", icon: FileText, color: "purple" },
  task: { minutesPerItem: 5, label: "Taches extraites", icon: CheckSquare, color: "amber" },
  plan: { minutesPerItem: 15, label: "Plans analyses", icon: Map, color: "green" },
} as const;

type CategoryKey = keyof typeof RATES;

interface CategoryData {
  count: number;
  minutesSaved: number;
}

function formatHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}min`;
}

function formatBigNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("fr-CH");
}

export default function TimeSavingsPage() {
  const [data, setData] = useState<Record<CategoryKey, CategoryData> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all counts in parallel
      const [emailsRes, pvRes, tasksRes, plansRes] = await Promise.all([
        fetch("/api/emails/inbox"),
        fetch("/api/pv"),
        fetch("/api/tasks"),
        fetch("/api/plans"),
      ]);

      const [emailsData, pvData, tasksData, plansData] = await Promise.all([
        emailsRes.ok ? emailsRes.json() : { emails: [] },
        pvRes.ok ? pvRes.json() : { meetings: [] },
        tasksRes.ok ? tasksRes.json() : { tasks: [] },
        plansRes.ok ? plansRes.json() : { plans: [] },
      ]);

      const emailCount = (emailsData.emails || []).length;
      const pvCount = (pvData.meetings || []).length;
      const taskCount = (tasksData.tasks || []).length;
      const planCount = (plansData.plans || []).length;

      setData({
        email: {
          count: emailCount,
          minutesSaved: emailCount * RATES.email.minutesPerItem,
        },
        pv: {
          count: pvCount,
          minutesSaved: pvCount * RATES.pv.minutesPerItem,
        },
        task: {
          count: taskCount,
          minutesSaved: taskCount * RATES.task.minutesPerItem,
        },
        plan: {
          count: planCount,
          minutesSaved: planCount * RATES.plan.minutesPerItem,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
          <span className="text-sm text-gray-500">Chargement des statistiques...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">Erreur : {error}</p>
          <button
            onClick={fetchData}
            className="mt-2 text-sm font-medium text-red-600 hover:text-red-800"
          >
            Reessayer
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const totalMinutes = Object.values(data).reduce((sum, d) => sum + d.minutesSaved, 0);
  const totalHours = totalMinutes / 60;
  const totalDays = totalHours / 8;

  const colorMap: Record<string, { bg: string; icon: string; ring: string; bar: string }> = {
    blue: { bg: "bg-blue-50", icon: "text-blue-600", ring: "ring-blue-100", bar: "bg-blue-500" },
    purple: { bg: "bg-purple-50", icon: "text-purple-600", ring: "ring-purple-100", bar: "bg-purple-500" },
    amber: { bg: "bg-amber-50", icon: "text-amber-600", ring: "ring-amber-100", bar: "bg-amber-500" },
    green: { bg: "bg-green-50", icon: "text-green-600", ring: "ring-green-100", bar: "bg-green-500" },
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Temps economise</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Estimation du temps economise grace aux fonctionnalites IA de Cantaia
          </p>
        </div>
        <button
          onClick={fetchData}
          className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50"
          title="Actualiser"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Hero Stats */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Total hours saved — large card */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-6 lg:col-span-1">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10">
            <Clock className="h-7 w-7 text-brand" />
          </div>
          <p className="mt-4 text-4xl font-extrabold tabular-nums text-gray-900">
            {totalHours.toFixed(1)}h
          </p>
          <p className="mt-1 text-sm font-medium text-gray-500">Total heures economisees</p>
        </div>

        {/* Working days + breakdown */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-emerald-50 p-1.5">
                  <CalendarDays className="h-4 w-4 text-emerald-600" />
                </div>
                <span className="text-xs font-medium text-gray-500">Jours de travail</span>
              </div>
              <div className="mt-2 text-lg font-bold text-gray-900">
                {totalDays.toFixed(1)} jours
              </div>
              <div className="mt-0.5 text-xs text-gray-400">Base 8h / jour</div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-cyan-50 p-1.5">
                  <Timer className="h-4 w-4 text-cyan-600" />
                </div>
                <span className="text-xs font-medium text-gray-500">Total minutes</span>
              </div>
              <div className="mt-2 text-lg font-bold text-gray-900">
                {totalMinutes.toLocaleString("fr-CH")} min
              </div>
              <div className="mt-0.5 text-xs text-gray-400">
                {formatBigNumber(Object.values(data).reduce((s, d) => s + d.count, 0))} actions IA
              </div>
            </div>
          </div>

          {/* Progress bar showing proportion of each category */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-500">Repartition par categorie</span>
            </div>
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
              {(Object.keys(RATES) as CategoryKey[]).map((key) => {
                const pct = totalMinutes > 0 ? (data[key].minutesSaved / totalMinutes) * 100 : 0;
                if (pct === 0) return null;
                const colors = colorMap[RATES[key].color];
                return (
                  <div
                    key={key}
                    className={`h-full ${colors.bar} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${RATES[key].label}: ${pct.toFixed(1)}%`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {(Object.keys(RATES) as CategoryKey[]).map((key) => {
                const pct = totalMinutes > 0 ? (data[key].minutesSaved / totalMinutes) * 100 : 0;
                const colors = colorMap[RATES[key].color];
                return (
                  <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className={`h-2 w-2 rounded-full ${colors.bar}`} />
                    <span>{RATES[key].label} ({pct.toFixed(0)}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Category Breakdown Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(RATES) as CategoryKey[]).map((key) => {
          const rate = RATES[key];
          const cat = data[key];
          const Icon = rate.icon;
          const colors = colorMap[rate.color];

          return (
            <div
              key={key}
              className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.bg}`}>
                  <Icon className={`h-5 w-5 ${colors.icon}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
                    {rate.label}
                  </p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatBigNumber(cat.count)}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Temps par item</span>
                  <span className="font-medium text-gray-700">{rate.minutesPerItem} min</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Total economise</span>
                  <span className="font-bold text-gray-900">{formatHours(cat.minutesSaved)}</span>
                </div>
              </div>

              {/* Mini bar */}
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${colors.bar} transition-all`}
                  style={{
                    width: `${totalMinutes > 0 ? (cat.minutesSaved / totalMinutes) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Methodology note */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700">Methodologie de calcul</h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Les estimations sont basees sur le temps moyen qu&apos;un chef de projet consacrerait
          manuellement a chaque tache sans l&apos;assistance de Cantaia. Les taux utilises sont :
          classification d&apos;email (2 min), generation de PV de chantier (45 min),
          extraction de tache (5 min), analyse de plan (15 min).
          Le nombre de jours ouvrables est calcule sur une base de 8 heures par jour.
        </p>
      </div>
    </div>
  );
}
