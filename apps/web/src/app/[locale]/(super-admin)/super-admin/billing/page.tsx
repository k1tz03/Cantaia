"use client";

import { useState, useEffect } from "react";
import { CreditCard, Loader2, Building2, AlertCircle } from "lucide-react";

interface OrgBilling {
  id: string;
  name: string;
  plan: string;
  members: number;
  created_at: string;
}

export default function SuperAdminBillingPage() {
  const [orgs, setOrgs] = useState<OrgBilling[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/super-admin?action=all-orgs")
      .then((r) => r.json())
      .then((d) => setOrgs(d.organizations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <CreditCard className="h-6 w-6 text-amber-500" />
          Facturation
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Suivi des abonnements et facturation par organisation
        </p>
      </div>

      {/* Stripe notice */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
        <div>
          <p className="text-sm font-medium text-amber-800">Stripe non configuré</p>
          <p className="mt-0.5 text-xs text-amber-600">
            L'intégration Stripe sera activée lors du lancement commercial. MRR actuel : 0 CHF.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{orgs.length}</p>
          <p className="text-xs text-gray-500">Organisations</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">
            {orgs.reduce((sum, o) => sum + (o.members || 0), 0)}
          </p>
          <p className="text-xs text-gray-500">Utilisateurs total</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">0 CHF</p>
          <p className="text-xs text-gray-500">MRR</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">Trial</p>
          <p className="text-xs text-gray-500">Plans actifs</p>
        </div>
      </div>

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
                <th className="px-4 py-3">Membres</th>
                <th className="px-4 py-3">Créée le</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.map((org) => (
                <tr key={org.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium text-gray-800">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      {org.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                      {org.plan || "Trial"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{org.members || 1}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {org.created_at ? new Date(org.created_at).toLocaleDateString("fr-CH") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                      Actif
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
