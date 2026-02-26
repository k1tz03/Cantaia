"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Search, Download, ArrowUpDown } from "lucide-react";
// Mock data removed — will be replaced by real API calls
const mockAdminOrgs: {
  id: string; name: string; city: string; plan: string;
  users_active: number; users_max: number; projects_count: number;
  mrr_chf: number; api_cost_chf: number; margin_percent: number;
  last_activity: string;
}[] = [];

type SortKey = "name" | "plan" | "users_active" | "projects_count" | "mrr_chf" | "api_cost_chf" | "margin_percent" | "last_activity";

const planOrder: Record<string, number> = { trial: 0, starter: 1, pro: 2, enterprise: 3 };

const planBadgeColors: Record<string, string> = {
  trial: "bg-gray-100 text-gray-700",
  starter: "bg-blue-100 text-blue-700",
  pro: "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

function getRelativeActivity(dateStr: string): { label: string; key: string; days: number } {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return { label: "today", key: "today", days: 0 };
  if (days === 1) return { label: "yesterday", key: "yesterday", days: 1 };
  return { label: `${days}d ago`, key: "daysAgo", days };
}

function getMarginColor(margin: number): string {
  if (margin > 80) return "text-green-600";
  if (margin > 50) return "text-amber-600";
  return "text-red-600";
}

function getMarginEmoji(margin: number): string {
  if (margin > 80) return "🟢";
  if (margin > 50) return "🟡";
  return "🔴";
}

export default function AdminOrganizationsPage() {
  const t = useTranslations("admin");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("mrr_chf");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let result = [...mockAdminOrgs];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (o) => o.name.toLowerCase().includes(q) || o.city.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "plan") cmp = (planOrder[a.plan] ?? 0) - (planOrder[b.plan] ?? 0);
      else if (sortKey === "last_activity") cmp = new Date(a.last_activity).getTime() - new Date(b.last_activity).getTime();
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [search, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const exportCSV = () => {
    const headers = ["Organisation", "Plan", "Users actifs", "Users max", "Projets", "MRR CHF", "Coût API CHF", "Marge %", "Dernière activité"];
    const rows = filtered.map((o) => [
      o.name, o.plan, o.users_active, o.users_max, o.projects_count,
      o.mrr_chf, o.api_cost_chf.toFixed(2), o.margin_percent.toFixed(1),
      new Date(o.last_activity).toLocaleDateString("fr-CH"),
    ]);
    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "organizations.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">{t("orgsTitle")}</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("orgsSearch")}
              className="rounded-md border border-gray-300 bg-white py-1.5 pl-9 pr-3 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            {t("orgsExportCSV")}
          </button>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              {[
                { key: "name" as SortKey, label: t("colOrganization") },
                { key: "plan" as SortKey, label: t("colPlan") },
                { key: "users_active" as SortKey, label: t("colUsers") },
                { key: "projects_count" as SortKey, label: t("colProjects") },
                { key: "mrr_chf" as SortKey, label: t("colMRR") },
                { key: "api_cost_chf" as SortKey, label: t("colAPICost") },
                { key: "margin_percent" as SortKey, label: t("colMargin") },
                { key: "last_activity" as SortKey, label: t("colActivity") },
              ].map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="cursor-pointer whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    <ArrowUpDown className="h-3 w-3 opacity-40" />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((org) => {
              const activity = getRelativeActivity(org.last_activity);
              return (
                <tr
                  key={org.id}
                  className="group transition-colors hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/organizations/${org.id}`}
                      className="font-medium text-gray-800 hover:text-blue-600 hover:underline"
                    >
                      {org.name}
                    </Link>
                    <p className="text-xs text-gray-400">{org.city}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        planBadgeColors[org.plan]
                      }`}
                    >
                      {org.plan.charAt(0).toUpperCase() + org.plan.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {org.users_active}/{org.users_max === 999 ? "∞" : org.users_max}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{org.projects_count}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {org.mrr_chf > 0 ? `${org.mrr_chf} CHF` : "0 CHF"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {org.api_cost_chf.toFixed(2)} CHF
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${getMarginColor(org.margin_percent)}`}>
                      {org.margin_percent > -100
                        ? `${org.margin_percent.toFixed(1)}%`
                        : "-∞"}{" "}
                      {getMarginEmoji(org.margin_percent)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {activity.days === 0
                      ? t("today")
                      : activity.days === 1
                        ? t("yesterday")
                        : t("daysAgo", { days: activity.days })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
