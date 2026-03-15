"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, Check, X, Loader2, ShieldAlert } from "lucide-react";

const PLAN_PRICING: Record<string, number> = { trial: 0, starter: 149, pro: 349, enterprise: 990 };

const ACTION_COLORS = [
  "bg-blue-500",
  "bg-indigo-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-rose-500",
  "bg-teal-500",
];

interface OrgDetail {
  id: string;
  name: string;
  city: string;
  plan: string;
  trial_ends_at?: string;
  branding_enabled: boolean;
  created_at: string;
  api_cost_chf: number;
  mrr_chf: number;
  member_count: number;
  project_count: number;
}

interface OrgUser {
  id: string;
  name: string;
  email: string;
  role: string;
  organization_id: string;
  last_login: string;
  emails_classified: number;
  cost_month_chf: number;
}

interface CostBreakdownItem {
  action: string;
  cost: number;
  percent: number;
  color: string;
}

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

  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/super-admin?action=get-organization&id=${orgId}`),
      fetch("/api/super-admin?action=all-users"),
      fetch(`/api/super-admin?action=analytics&scope=org&org_id=${orgId}&period=30d`),
    ])
      .then(async ([orgRes, usersRes, analyticsRes]) => {
        if (orgRes.status === 403 || orgRes.status === 401) {
          setAccessDenied(true);
          return;
        }
        const orgData = await orgRes.json();
        const usersData = await usersRes.json().catch(() => ({ users: [] }));
        const analyticsData = await analyticsRes.json().catch(() => ({
          overview: { total_cost_chf: 0 },
          per_user: [],
          per_action: [],
        }));

        // Build org detail
        const foundOrg = orgData.organization;
        if (foundOrg) {
          const plan = (foundOrg.subscription_plan || foundOrg.plan || "trial") as string;
          const apiCost = analyticsData.overview?.total_cost_chf || 0;
          setOrg({
            id: foundOrg.id,
            name: foundOrg.name || "",
            city: foundOrg.city || "\u2014",
            plan,
            trial_ends_at: foundOrg.trial_ends_at || undefined,
            branding_enabled: foundOrg.branding_enabled || false,
            created_at: foundOrg.created_at || new Date().toISOString(),
            api_cost_chf: apiCost,
            mrr_chf: PLAN_PRICING[plan] || 0,
            member_count: orgData.members?.length || 0,
            project_count: orgData.projectCount || 0,
          });
        }

        // Build users list for this org
        const allUsers: Record<string, unknown>[] = usersData.users || [];
        const orgMembers = allUsers.filter(
          (u) => u.organization_id === orgId
        );
        const perUser: { user_id: string; cost: number }[] = analyticsData.per_user || [];
        const userCosts = new Map<string, number>();
        for (const u of perUser) {
          userCosts.set(u.user_id, u.cost || 0);
        }

        setOrgUsers(
          orgMembers.map((u) => ({
            id: u.id as string,
            name: `${(u.first_name as string) || ""} ${(u.last_name as string) || ""}`.trim() || (u.email as string),
            email: (u.email || "") as string,
            role: (u.role || "user") as string,
            organization_id: (u.organization_id || "") as string,
            last_login: (u.last_sync_at || u.created_at || new Date().toISOString()) as string,
            emails_classified: 0,
            cost_month_chf: userCosts.get(u.id as string) || 0,
          }))
        );

        // Build cost breakdown from per_action analytics
        const perAction: { action_type: string; cost: number; calls: number }[] =
          analyticsData.per_action || [];
        const totalCost = analyticsData.overview?.total_cost_chf || 0;

        const ACTION_LABELS: Record<string, string> = {
          email_classify: "Classification emails",
          email_reply: "R\u00e9ponses IA",
          email_summary: "R\u00e9sum\u00e9s emails",
          task_extract: "Extraction t\u00e2ches",
          reclassify: "Reclassification batch",
          plan_analyze: "Analyse plans",
          chat_message: "Chat IA",
          price_extract: "Extraction prix",
          price_estimate: "Estimation prix",
          supplier_enrichment: "Enrichissement fournisseurs",
          supplier_search: "Recherche fournisseurs",
          pv_generate: "G\u00e9n\u00e9ration PV",
          pv_transcribe: "Transcription audio",
          submission_parse: "Analyse soumissions",
        };

        setCostBreakdown(
          perAction.map((a, i) => ({
            action: ACTION_LABELS[a.action_type] || a.action_type.replace(/_/g, " "),
            cost: Math.round(a.cost * 100) / 100,
            percent: totalCost > 0 ? Math.round((a.cost / totalCost) * 100) : 0,
            color: ACTION_COLORS[i % ACTION_COLORS.length],
          }))
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  if (accessDenied) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <ShieldAlert className="h-10 w-10 text-red-400" />
        <p className="text-sm text-gray-500">Acc\u00e8s r\u00e9serv\u00e9 aux super-administrateurs</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-gray-500">Organisation non trouv\u00e9e</p>
      </div>
    );
  }

  const totalCost = org.api_cost_chf;
  const mrr = org.mrr_chf;
  const margin = mrr > 0 ? mrr - totalCost : -totalCost;
  const marginPercent = mrr > 0 ? ((margin / mrr) * 100).toFixed(1) : "-\u221e";

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
              {org.plan.charAt(0).toUpperCase() + org.plan.slice(1)} ({PLAN_PRICING[org.plan] || 0} CHF/mois)
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
                : `\u2014 (${t("orgConverted")})`}
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
        <h2 className="text-sm font-semibold text-gray-800">
          {t("orgUsers")} ({orgUsers.length})
        </h2>
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
            {orgUsers.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-sm text-gray-400">
                  Aucun utilisateur
                </td>
              </tr>
            )}
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

      {/* Summary Section (replaces projects section) */}
      <div className="mt-5 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-800">{t("orgProjects")}</h2>
        <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
          <span className="text-2xl font-bold text-gray-800">{org.project_count}</span>
          <span>projet{org.project_count > 1 ? "s" : ""} actif{org.project_count > 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* API Costs Section */}
      <div className="mt-5 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-800">{t("orgCosts")}</h2>
        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">Co\u00fbt total ce mois</p>
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
        {costBreakdown.length > 0 && (
          <div className="mt-4 space-y-2">
            {costBreakdown.map((item) => (
              <div key={item.action} className="flex items-center gap-3 text-sm">
                <div className="w-[200px] flex-shrink-0">
                  <div className="flex h-4 overflow-hidden rounded-full bg-gray-100">
                    <div className={`${item.color} h-full rounded-full`} style={{ width: `${Math.max(item.percent, 2)}%` }} />
                  </div>
                </div>
                <span className="w-40 text-gray-600">{item.action}</span>
                <span className="font-medium text-gray-800">{item.cost.toFixed(2)} CHF</span>
                <span className="text-xs text-gray-400">({item.percent}%)</span>
              </div>
            ))}
          </div>
        )}
        {costBreakdown.length === 0 && totalCost === 0 && (
          <p className="mt-4 text-sm text-gray-400">Aucun co\u00fbt API enregistr\u00e9 ce mois</p>
        )}

        {/* Per-user cost */}
        {orgUsers.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-semibold text-gray-600">Par utilisateur</h3>
            <table className="mt-2 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500">
                  <th className="pb-2">{t("colUser")}</th>
                  <th className="pb-2">{t("colEmailsClassified")}</th>
                  <th className="pb-2">Co\u00fbt</th>
                  <th className="pb-2">Co\u00fbt/jour</th>
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
          </>
        )}
      </div>
    </div>
  );
}
