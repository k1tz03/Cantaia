"use client";

import { useState, useEffect, useMemo } from "react";
import { CreditCard, Loader2, Building2, DollarSign, TrendingUp, Users } from "lucide-react";

const PLAN_PRICING: Record<string, number> = {
  trial: 0,
  starter: 149,
  pro: 349,
  enterprise: 990,
};

const planBadgeColors: Record<string, string> = {
  trial: "bg-gray-100 text-gray-700",
  starter: "bg-blue-100 text-blue-700",
  pro: "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

interface OrgBilling {
  id: string;
  name: string;
  plan: string;
  member_count: number;
  project_count: number;
  created_at: string;
  status?: string;
  stripe_customer_id?: string;
  trial_ends_at?: string;
}

export default function SuperAdminBillingPage() {
  const [orgs, setOrgs] = useState<OrgBilling[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/super-admin?action=list-organizations")
      .then((r) => r.json())
      .then((d) => {
        const orgList = (d.organizations || []).map((o: any) => ({
          ...o,
          plan: o.subscription_plan || o.plan || "trial",
          member_count: o.member_count || 0,
          project_count: o.project_count || 0,
        }));
        setOrgs(orgList);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const mrr = useMemo(() => {
    return orgs.reduce((sum, o) => sum + (PLAN_PRICING[o.plan] || 0), 0);
  }, [orgs]);

  const arr = mrr * 12;

  const totalMembers = useMemo(() => {
    return orgs.reduce((sum, o) => sum + (o.member_count || 0), 0);
  }, [orgs]);

  const planDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    for (const o of orgs) {
      dist[o.plan] = (dist[o.plan] || 0) + 1;
    }
    return Object.entries(dist)
      .sort((a, b) => (PLAN_PRICING[b[0]] || 0) - (PLAN_PRICING[a[0]] || 0));
  }, [orgs]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <CreditCard className="h-6 w-6 text-amber-500" />
          Facturation & Revenue
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Suivi des abonnements et facturation par organisation
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <DollarSign className="h-3.5 w-3.5" />
            MRR
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {loading ? "—" : `${mrr} CHF`}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <TrendingUp className="h-3.5 w-3.5" />
            ARR
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {loading ? "—" : `${arr.toLocaleString("fr-CH")} CHF`}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Building2 className="h-3.5 w-3.5" />
            Organisations
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {loading ? "—" : orgs.length}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Users className="h-3.5 w-3.5" />
            Utilisateurs
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {loading ? "—" : totalMembers}
          </p>
        </div>
      </div>

      {/* Plan distribution */}
      {!loading && planDistribution.length > 0 && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Distribution des plans</h2>
          <div className="flex gap-4">
            {planDistribution.map(([plan, count]) => (
              <div key={plan} className="flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${planBadgeColors[plan] || "bg-gray-100 text-gray-700"}`}>
                  {plan.charAt(0).toUpperCase() + plan.slice(1)}
                </span>
                <span className="text-sm font-medium text-gray-700">{count}</span>
                <span className="text-xs text-gray-400">({PLAN_PRICING[plan] || 0} CHF/mois)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr>
                <th className="px-4 py-3">Organisation</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3 text-right">MRR</th>
                <th className="px-4 py-3 text-center">Membres</th>
                <th className="px-4 py-3 text-center">Projets</th>
                <th className="px-4 py-3">Créée le</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.map((org) => {
                const orgMrr = PLAN_PRICING[org.plan] || 0;
                const orgStatus = org.status || "active";
                const isTrial = org.plan === "trial";
                const trialDays = org.trial_ends_at
                  ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))
                  : null;

                return (
                  <tr key={org.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-medium text-gray-800">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        {org.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${planBadgeColors[org.plan] || "bg-gray-100 text-gray-700"}`}>
                        {org.plan.charAt(0).toUpperCase() + org.plan.slice(1)}
                      </span>
                      {isTrial && trialDays !== null && (
                        <span className="ml-1.5 text-[10px] text-gray-400">
                          {trialDays}j restants
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">
                      {orgMrr > 0 ? `${orgMrr} CHF` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {org.member_count || 1}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {org.project_count || 0}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {org.created_at
                        ? new Date(org.created_at).toLocaleDateString("fr-CH")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          orgStatus === "active" || orgStatus === "trial"
                            ? "bg-green-50 text-green-700"
                            : orgStatus === "suspended"
                              ? "bg-red-50 text-red-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {orgStatus === "active"
                          ? "Actif"
                          : orgStatus === "trial"
                            ? "Trial"
                            : orgStatus === "suspended"
                              ? "Suspendu"
                              : orgStatus.charAt(0).toUpperCase() + orgStatus.slice(1)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
