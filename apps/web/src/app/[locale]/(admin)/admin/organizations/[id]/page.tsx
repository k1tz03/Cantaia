"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, Check, X } from "lucide-react";
// Mock data removed — will be replaced by real API calls
const PLAN_PRICING: Record<string, number> = { trial: 0, starter: 49, pro: 149, enterprise: 499 };
const mockAdminOrgs: {
  id: string; name: string; city: string; plan: string;
  trial_ends_at?: string; branding_enabled: boolean; created_at: string;
  api_cost_chf: number; mrr_chf: number;
}[] = [];
const mockAdminUsers: {
  id: string; name: string; email: string; role: string;
  organization_id: string; last_login: string;
  emails_classified: number; cost_month_chf: number;
}[] = [];
const mockProjects: {
  id: string; name: string; code?: string; color: string;
  status: string; organization_id: string;
}[] = [];

// Simulated cost breakdown per action
const costBreakdown = [
  { action: "Classification emails", cost: 8.4, percent: 34, color: "bg-blue-500" },
  { action: "Réponses IA", cost: 4.2, percent: 17, color: "bg-indigo-500" },
  { action: "Transcription PV", cost: 6.4, percent: 26, color: "bg-green-500" },
  { action: "Génération PV", cost: 3.5, percent: 14, color: "bg-purple-500" },
  { action: "Briefings", cost: 1.2, percent: 5, color: "bg-amber-500" },
  { action: "Extraction tâches", cost: 0.8, percent: 3, color: "bg-cyan-500" },
];

function getRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  return `Il y a ${days}j`;
}

export default function AdminOrgDetailPage() {
  const params = useParams();
  const t = useTranslations("admin");
  const orgId = params.id as string;

  const org = mockAdminOrgs.find((o) => o.id === orgId);
  if (!org) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-gray-500">Organisation non trouvée</p>
      </div>
    );
  }

  const orgUsers = mockAdminUsers.filter((u) => u.organization_id === orgId);
  const orgProjects = mockProjects.filter((p) => p.organization_id === orgId);
  const orgLogs: { id: string; date: string; user_name: string; action: string; metadata: Record<string, unknown> }[] = [];
  const totalCost = org.api_cost_chf;
  const mrr = org.mrr_chf;
  const margin = mrr > 0 ? mrr - totalCost : -totalCost;
  const marginPercent = mrr > 0 ? ((margin / mrr) * 100).toFixed(1) : "-∞";

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/organizations"
          className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-800">{org.name}</h1>
          <p className="text-sm text-gray-500">{org.city}</p>
        </div>
      </div>

      {/* Info Section */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-800">{t("orgInfo")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-gray-500">{t("orgPlan")}</p>
            <p className="mt-0.5 font-medium text-gray-800">
              {org.plan.charAt(0).toUpperCase() + org.plan.slice(1)} ({PLAN_PRICING[org.plan]} CHF/mois)
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{t("orgRegistered")}</p>
            <p className="mt-0.5 font-medium text-gray-800">
              {new Date(org.created_at).toLocaleDateString("fr-CH")}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{t("orgTrialRemaining")}</p>
            <p className="mt-0.5 font-medium text-gray-800">
              {org.trial_ends_at
                ? `${Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))} jours`
                : `— (${t("orgConverted")})`}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{t("orgBranding")}</p>
            <p className="mt-0.5 flex items-center gap-1 font-medium">
              {org.branding_enabled ? (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="text-green-700">{t("orgEnabled")}</span>
                </>
              ) : (
                <>
                  <X className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500">{t("orgDisabled")}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            {t("changePlan")}
          </button>
          {org.plan === "trial" && (
            <button className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
              {t("extendTrial")}
            </button>
          )}
          <button className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">
            {t("suspendOrg")}
          </button>
        </div>
      </div>

      {/* Users Section */}
      <div className="mt-5 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-800">{t("orgUsers")}</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="pb-2">{t("colUser")}</th>
              <th className="pb-2">Email</th>
              <th className="pb-2">{t("colRole")}</th>
              <th className="pb-2">{t("colLastLogin")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {orgUsers.map((u) => (
              <tr key={u.id}>
                <td className="py-2.5 font-medium text-gray-800">{u.name}</td>
                <td className="py-2.5 text-gray-500">{u.email}</td>
                <td className="py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {u.role === "admin" ? "Admin" : "Membre"}
                  </span>
                </td>
                <td className="py-2.5 text-xs text-gray-500">{getRelativeDate(u.last_login)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Projects Section */}
      <div className="mt-5 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-800">{t("orgProjects")}</h2>
        <div className="mt-3 space-y-2">
          {orgProjects.length > 0 ? orgProjects.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-md border border-gray-100 px-4 py-2.5">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-800">{p.name}</span>
                {p.code && <span className="ml-2 text-xs text-gray-400">({p.code})</span>}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                p.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
              }`}>
                {p.status}
              </span>
            </div>
          )) : (
            <p className="text-sm text-gray-400">Aucun projet</p>
          )}
        </div>
      </div>

      {/* API Costs Section */}
      <div className="mt-5 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-800">{t("orgCosts")}</h2>
        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">Coût total ce mois</p>
            <p className="text-lg font-bold text-gray-800">{totalCost.toFixed(2)} CHF</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Revenu</p>
            <p className="text-lg font-bold text-gray-800">{mrr} CHF</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Marge</p>
            <p className={`text-lg font-bold ${Number(marginPercent) > 80 ? "text-green-600" : Number(marginPercent) > 50 ? "text-amber-600" : "text-red-600"}`}>
              {margin.toFixed(2)} CHF ({marginPercent}%)
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {costBreakdown.map((item) => (
            <div key={item.action} className="flex items-center gap-3 text-sm">
              <div className="w-[200px] flex-shrink-0">
                <div className="flex h-4 overflow-hidden rounded-full bg-gray-100">
                  <div className={`${item.color} h-full rounded-full`} style={{ width: `${item.percent}%` }} />
                </div>
              </div>
              <span className="w-40 text-gray-600">{item.action}</span>
              <span className="font-medium text-gray-800">{item.cost.toFixed(2)} CHF</span>
              <span className="text-xs text-gray-400">({item.percent}%)</span>
            </div>
          ))}
        </div>

        {/* Per-user cost */}
        <h3 className="mt-5 text-xs font-semibold text-gray-600">Par utilisateur</h3>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="pb-2">{t("colUser")}</th>
              <th className="pb-2">{t("colEmailsClassified")}</th>
              <th className="pb-2">Coût</th>
              <th className="pb-2">Coût/jour</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {orgUsers.map((u) => (
              <tr key={u.id}>
                <td className="py-2 font-medium text-gray-800">{u.name}</td>
                <td className="py-2 text-gray-600">{u.emails_classified}</td>
                <td className="py-2 text-gray-600">{u.cost_month_chf.toFixed(2)} CHF</td>
                <td className="py-2 text-gray-500">{(u.cost_month_chf / 17).toFixed(2)} CHF</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Activity Log */}
      <div className="mt-5 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-800">{t("orgActivity")}</h2>
        <div className="mt-3 space-y-1.5">
          {orgLogs.slice(0, 15).map((log) => (
            <div key={log.id} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 text-xs text-gray-400">
                {new Date(log.date).toLocaleString("fr-CH", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="w-32 shrink-0 font-medium text-gray-700">{log.user_name}</span>
              <span className="text-gray-600">
                {log.action}
                {log.metadata.count ? ` (×${log.metadata.count})` : ""}
                {log.metadata.recipients ? ` (${log.metadata.recipients} dest.)` : ""}
              </span>
            </div>
          ))}
          {orgLogs.length === 0 && (
            <p className="text-sm text-gray-400">Aucune activité récente</p>
          )}
        </div>
      </div>
    </div>
  );
}
