"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Building2,
  Plus,
  Globe,
  Users,
  FolderKanban,
  Pencil,
  BarChart3,
  Pause,
  Play,
} from "lucide-react";
import type { Organization } from "@cantaia/database";

interface EnrichedOrg extends Organization {
  member_count: number;
  project_count: number;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  setup: { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-400" },
  trial: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-400" },
  active: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-400" },
  suspended: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-400" },
};

const PLAN_LABELS: Record<string, string> = {
  trial: "Trial",
  starter: "Starter (49 CHF/mois)",
  pro: "Pro (149 CHF/mois)",
  enterprise: "Enterprise",
};

export default function SuperAdminOrganizationsPage() {
  const t = useTranslations("superAdmin");
  const [organizations, setOrganizations] = useState<EnrichedOrg[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrganizations();
  }, []);

  async function loadOrganizations() {
    try {
      const res = await fetch("/api/super-admin?action=list-organizations");
      const data = await res.json();
      if (data.organizations) setOrganizations(data.organizations);
    } catch (err) {
      console.error("Failed to load organizations:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSuspend(orgId: string) {
    const org = organizations.find(o => o.id === orgId);
    if (!org) return;

    const action = org.status === "suspended" ? "unsuspend-organization" : "suspend-organization";
    try {
      await fetch("/api/super-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: orgId }),
      });
      loadOrganizations();
    } catch (err) {
      console.error("Failed to toggle suspend:", err);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("fr-CH", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("organizations")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {organizations.length} {t("organizations").toLowerCase()}
          </p>
        </div>
        <Link
          href="/super-admin/organizations/create"
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-amber-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("createOrganization")}
        </Link>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
        </div>
      ) : organizations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-20">
          <Building2 className="h-12 w-12 text-gray-300" />
          <p className="mt-3 text-lg font-medium text-gray-500">{t("noOrganizations")}</p>
          <p className="mt-1 text-sm text-gray-400">{t("noOrganizationsDesc")}</p>
          <Link
            href="/super-admin/organizations/create"
            className="mt-4 flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
          >
            <Plus className="h-4 w-4" />
            {t("createOrganization")}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {organizations.map((org) => {
            const orgStatus = org.status || "active";
            const statusStyle = STATUS_COLORS[orgStatus] || STATUS_COLORS.active;
            return (
              <div
                key={org.id}
                className="rounded-lg border border-gray-200 bg-white p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                      <Building2 className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900">{org.name}</h3>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                          {t(`status${orgStatus.charAt(0).toUpperCase() + orgStatus.slice(1)}`)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                        {org.subdomain && (
                          <span className="flex items-center gap-1">
                            <Globe className="h-3.5 w-3.5" />
                            {org.subdomain}.cantaia.ch
                          </span>
                        )}
                        <span>Plan : {PLAN_LABELS[org.plan] || org.plan}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {org.member_count} {t("members")}
                        </span>
                        <span className="flex items-center gap-1">
                          <FolderKanban className="h-3.5 w-3.5" />
                          {org.project_count} {t("projects")}
                        </span>
                        <span>{t("createdAt")} {formatDate(org.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/super-admin/organizations/${org.id}`}
                      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t("modify")}
                    </Link>
                    <Link
                      href={`/super-admin/organizations/${org.id}?tab=members`}
                      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      <Users className="h-3.5 w-3.5" />
                      {t("tabMembers")}
                    </Link>
                    <Link
                      href={`/super-admin/organizations/${org.id}?tab=stats`}
                      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      {t("stats")}
                    </Link>
                    <button
                      onClick={() => handleSuspend(org.id)}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                        orgStatus === "suspended"
                          ? "text-green-600 hover:bg-green-50"
                          : "text-red-600 hover:bg-red-50"
                      }`}
                    >
                      {orgStatus === "suspended" ? (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          {t("unsuspend")}
                        </>
                      ) : (
                        <>
                          <Pause className="h-3.5 w-3.5" />
                          {t("suspend")}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
