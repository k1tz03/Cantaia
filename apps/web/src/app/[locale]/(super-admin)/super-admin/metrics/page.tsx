"use client";

import { useState, useEffect } from "react";
import { BarChart3, Loader2, Mail, FileText, CheckSquare, Map, Truck, MessageSquare } from "lucide-react";

interface PlatformMetrics {
  totalUsers: number;
  totalOrgs: number;
  totalEmails: number;
  totalPlans: number;
  totalPlanUploaded: number;
  totalPlanIngested: number;
  totalPvs: number;
  totalTasks: number;
  totalSuppliers: number;
  totalOffers: number;
}

export default function SuperAdminMetricsPage() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/super-admin?action=platform-metrics")
      .then((r) => r.json())
      .then((d) => setMetrics(d.metrics || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  const cards = [
    { label: "Emails traités", value: metrics?.totalEmails || 0, icon: Mail, color: "blue" },
    { label: `Plans analysés (${metrics?.totalPlanUploaded || 0} UI + ${metrics?.totalPlanIngested || 0} ingérés)`, value: metrics?.totalPlans || 0, icon: Map, color: "emerald" },
    { label: "PVs générés", value: metrics?.totalPvs || 0, icon: FileText, color: "violet" },
    { label: "Tâches créées", value: metrics?.totalTasks || 0, icon: CheckSquare, color: "amber" },
    { label: "Fournisseurs", value: metrics?.totalSuppliers || 0, icon: Truck, color: "rose" },
    { label: "Offres importées", value: metrics?.totalOffers || 0, icon: MessageSquare, color: "cyan" },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    cyan: "bg-cyan-50 text-cyan-600",
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <BarChart3 className="h-6 w-6 text-amber-500" />
          Métriques plateforme
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Données agrégées de toutes les organisations
        </p>
      </div>

      {/* Top-level */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5 text-center">
          <p className="text-3xl font-bold text-gray-900">{metrics?.totalOrgs || 0}</p>
          <p className="text-xs text-gray-500">Organisations</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 text-center">
          <p className="text-3xl font-bold text-gray-900">{metrics?.totalUsers || 0}</p>
          <p className="text-xs text-gray-500">Utilisateurs</p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-lg border border-gray-200 bg-white p-5 text-center">
          <p className="text-3xl font-bold text-gray-900">0 CHF</p>
          <p className="text-xs text-gray-500">MRR (Stripe non configuré)</p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorMap[card.color]}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{card.value.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">{card.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
