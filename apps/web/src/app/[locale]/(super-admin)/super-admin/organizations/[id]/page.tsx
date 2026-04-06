"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Building2,
  ArrowLeft,
  Users,
  BarChart3,
  CreditCard,
  Globe,
  Pause,
  Play,
  Trash2,
  Mail,
  Plus,
  X,
  Loader2,
  Send,
  RotateCcw,
  Sparkles,
  DollarSign,
  TrendingUp,
  Calculator,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Organization, OrganizationInvite } from "@cantaia/database";

interface OrgMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
}

const TABS = [
  { key: "overview", icon: Building2 },
  { key: "members", icon: Users },
  { key: "stats", icon: BarChart3 },
  { key: "billing", icon: CreditCard },
] as const;

export default function OrganizationDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("superAdmin");

  const orgId = params.id as string;
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "overview");
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrganizationInvite[]>([]);
  const [projectCount, setProjectCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", first_name: "", last_name: "", role: "member", message: "" });
  const [sending, setSending] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState("30d");
  const [statsData, setStatsData] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    loadOrganization();
  }, [orgId]);

  useEffect(() => {
    if (activeTab === "stats") loadStats();
  }, [activeTab, statsPeriod]);

  async function loadStats() {
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/super-admin?action=analytics&scope=org&org_id=${orgId}&period=${statsPeriod}`);
      const data = await res.json();
      setStatsData(data);
    } catch (err) {
      console.error("Failed to load stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }

  async function loadOrganization() {
    try {
      const res = await fetch(`/api/super-admin?action=get-organization&id=${orgId}`);
      const data = await res.json();
      if (data.organization) {
        setOrg(data.organization);
        setMembers(data.members || []);
        setInvites((data.invites || []).filter((i: OrganizationInvite) => i.status === "pending"));
        setProjectCount(data.projectCount || 0);
      }
    } catch (err) {
      console.error("Failed to load org:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSuspend() {
    if (!org) return;
    const action = (org.status || "active") === "suspended" ? "unsuspend-organization" : "suspend-organization";
    await fetch("/api/super-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: orgId }),
    });
    loadOrganization();
  }

  async function handleDelete() {
    if (!org || deleteConfirm !== org.name) return;
    await fetch("/api/super-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-organization", id: orgId, confirm_name: deleteConfirm }),
    });
    router.push("/super-admin/organizations");
  }

  async function handleSendInvite() {
    setSending(true);
    try {
      await fetch("/api/super-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send-invite",
          organization_id: orgId,
          ...inviteForm,
        }),
      });
      setShowInviteModal(false);
      setInviteForm({ email: "", first_name: "", last_name: "", role: "member", message: "" });
      loadOrganization();
    } catch (err) {
      console.error("Failed to send invite:", err);
    } finally {
      setSending(false);
    }
  }

  async function handleCancelInvite(inviteId: string) {
    await fetch("/api/super-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel-invite", invite_id: inviteId }),
    });
    loadOrganization();
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("fr-CH", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="p-6 text-center">
        <p className="text-[#71717A]">Organisation introuvable.</p>
      </div>
    );
  }

  const orgStatus = org.status || "active";
  const orgPlan = org.plan || org.subscription_plan || "trial";

  const statusStyle = {
    setup: "bg-yellow-500/10 text-yellow-400",
    trial: "bg-blue-500/10 text-blue-400",
    active: "bg-green-500/10 text-green-400",
    suspended: "bg-red-500/10 text-red-400",
  }[orgStatus] || "bg-[#1C1C1F] text-[#A1A1AA]";

  return (
    <div className="p-6">
      {/* Header */}
      <button
        onClick={() => router.push("/super-admin/organizations")}
        className="mb-3 flex items-center gap-1.5 text-sm text-[#71717A] hover:text-[#A1A1AA]"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("organizations")}
      </button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#FAFAFA]">{org.name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle}`}>
              {t(`status${orgStatus.charAt(0).toUpperCase() + orgStatus.slice(1)}`)}
            </span>
          </div>
          {org.subdomain && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[#A1A1AA]">
              <Globe className="h-3.5 w-3.5" />
              {org.subdomain}.cantaia.io
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSuspend}
            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${
              orgStatus === "suspended"
                ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                : "bg-red-500/10 text-red-400 hover:bg-red-500/100/20"
            }`}
          >
            {orgStatus === "suspended" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {orgStatus === "suspended" ? t("unsuspend") : t("suspend")}
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/100/20"
          >
            <Trash2 className="h-4 w-4" />
            {t("deleteOrg")}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-[#27272A]">
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === key
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-[#71717A] hover:text-[#A1A1AA]"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t(`tab${key.charAt(0).toUpperCase() + key.slice(1)}`)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
              <p className="text-xs text-[#A1A1AA]">{t("tabMembers")}</p>
              <p className="text-2xl font-bold text-[#FAFAFA]">{members.length}<span className="text-sm font-normal text-[#71717A]">/{org.max_users}</span></p>
            </div>
            <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
              <p className="text-xs text-[#A1A1AA]">{t("projects")}</p>
              <p className="text-2xl font-bold text-[#FAFAFA]">{projectCount}<span className="text-sm font-normal text-[#71717A]">/{org.max_projects}</span></p>
            </div>
            <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
              <p className="text-xs text-[#A1A1AA]">{t("plan")}</p>
              <p className="text-2xl font-bold text-[#FAFAFA] capitalize">{orgPlan}</p>
            </div>
          </div>

          {/* Organization info */}
          <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[#A1A1AA]">{t("stepInfo")}</h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-[#A1A1AA]">{t("orgName")}</dt><dd className="font-medium text-[#FAFAFA]">{org.name}</dd></div>
              <div><dt className="text-[#A1A1AA]">{t("orgDisplayName")}</dt><dd className="font-medium text-[#FAFAFA]">{org.display_name || "—"}</dd></div>
              <div><dt className="text-[#A1A1AA]">{t("orgCity")}</dt><dd className="font-medium text-[#FAFAFA]">{org.city || "—"}</dd></div>
              <div><dt className="text-[#A1A1AA]">{t("orgCountry")}</dt><dd className="font-medium text-[#FAFAFA]">{org.country}</dd></div>
              <div><dt className="text-[#A1A1AA]">{t("orgPhone")}</dt><dd className="font-medium text-[#FAFAFA]">{org.phone || "—"}</dd></div>
              <div><dt className="text-[#A1A1AA]">{t("orgWebsite")}</dt><dd className="font-medium text-[#FAFAFA]">{org.website || "—"}</dd></div>
              <div><dt className="text-[#A1A1AA]">{t("createdAt")}</dt><dd className="font-medium text-[#FAFAFA]">{formatDate(org.created_at)}</dd></div>
              <div><dt className="text-[#A1A1AA]">{t("subdomain")}</dt><dd className="font-medium text-[#FAFAFA]">{org.subdomain || "—"}.cantaia.io</dd></div>
            </dl>
            {org.notes && (
              <div className="mt-4 rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-400">
                <strong>{t("internalNotes")}</strong>: {org.notes}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "members" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#A1A1AA]">
              {t("tabMembers")} ({members.length}/{org.max_users})
            </h3>
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"
            >
              <Plus className="h-4 w-4" />
              {t("sendInvitation")}
            </button>
          </div>

          {/* Members list */}
          <div className="rounded-lg border border-[#27272A] bg-[#18181B]">
            {members.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#71717A]">Aucun membre</div>
            ) : (
              <div className="divide-y divide-[#27272A]">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#27272A] text-xs font-medium text-[#A1A1AA]">
                        {(member.first_name || "?")[0]}{(member.last_name || "?")[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#FAFAFA]">{member.first_name} {member.last_name}</p>
                        <p className="text-xs text-[#71717A]">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-[#27272A] px-2 py-0.5 text-xs font-medium text-[#A1A1AA] capitalize">
                        {member.role}
                      </span>
                      <span className="text-xs text-[#71717A]">
                        {member.last_sync_at ? formatDate(member.last_sync_at) : t("never")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending invites */}
          {invites.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-semibold text-[#A1A1AA]">{t("pendingInvites")}</h3>
              <div className="rounded-lg border border-[#27272A] bg-[#18181B]">
                <div className="divide-y divide-[#27272A]">
                  {invites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-[#71717A]" />
                        <div>
                          <p className="text-sm text-[#A1A1AA]">{invite.email}</p>
                          <p className="text-xs text-[#71717A]">
                            {t("invitedOn")} {formatDate(invite.created_at)} — {t("expiresOn")} {formatDate(invite.expires_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button className="rounded-md px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/10">
                          <RotateCcw className="inline h-3 w-3 mr-1" />{t("resendInvite")}
                        </button>
                        <button
                          onClick={() => handleCancelInvite(invite.id)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10"
                        >
                          <X className="inline h-3 w-3 mr-1" />{t("cancelInvite")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === "stats" && (
        <div className="space-y-6">
          {/* Period selector */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#A1A1AA]">Statistiques IA</h3>
            <div className="flex gap-1 rounded-lg bg-[#27272A] p-0.5">
              {(["7d", "30d", "90d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setStatsPeriod(p)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    statsPeriod === p ? "bg-[#18181B] text-[#FAFAFA] shadow-sm" : "text-[#71717A] hover:text-[#A1A1AA]"
                  }`}
                >
                  {p === "7d" ? "7 jours" : p === "30d" ? "30 jours" : "90 jours"}
                </button>
              ))}
            </div>
          </div>

          {statsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
            </div>
          ) : statsData ? (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                  { icon: DollarSign, label: "Coût IA total", value: `${statsData.overview.total_cost_chf.toFixed(2)} CHF`, color: "bg-blue-500/10 text-blue-400" },
                  { icon: Sparkles, label: "Appels IA", value: statsData.overview.total_calls, color: "bg-amber-500/10 text-amber-400" },
                  { icon: Calculator, label: "Coût moyen/appel", value: `${statsData.overview.avg_cost_per_call.toFixed(4)} CHF`, color: "bg-violet-500/10 text-violet-400" },
                  { icon: TrendingUp, label: "Projection mensuelle", value: `${statsData.overview.projected_monthly.toFixed(2)} CHF`, color: "bg-emerald-500/10 text-emerald-400" },
                ].map((c) => (
                  <div key={c.label} className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.color}`}>
                        <c.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs text-[#A1A1AA]">{c.label}</p>
                        <p className="text-lg font-bold text-[#FAFAFA]">{c.value}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Profitability banner */}
              {(() => {
                const PLAN_PRICES: Record<string, number> = { trial: 0, starter: 149, pro: 349, enterprise: 790 };
                const revenue = PLAN_PRICES[orgPlan] || 0;
                const costMonthly = statsData.overview.projected_monthly;
                const margin = revenue > 0 ? ((revenue - costMonthly) / revenue) * 100 : 0;
                const profitable = revenue >= costMonthly;
                return (
                  <div className={`flex items-center justify-between rounded-lg border p-4 ${
                    profitable ? "border-green-500/20 bg-green-500/10" : "border-red-500/20 bg-red-500/10"
                  }`}>
                    <div>
                      <p className="text-sm font-medium text-[#A1A1AA]">Rentabilité</p>
                      <p className="text-xs text-[#A1A1AA]">Revenu plan ({orgPlan}) vs coût IA projeté</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${profitable ? "text-green-400" : "text-red-400"}`}>
                        {revenue > 0 ? `${margin.toFixed(0)}% marge` : "Pas de revenu"}
                      </p>
                      <p className="text-xs text-[#A1A1AA]">
                        {revenue} CHF revenu — {costMonthly.toFixed(2)} CHF coût
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Cost evolution chart */}
              {statsData.daily_trend.length > 0 && (
                <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-5">
                  <h4 className="mb-4 text-sm font-semibold text-[#A1A1AA]">Évolution des coûts</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={statsData.daily_trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v.toFixed(2)}`} />
                      <Tooltip
                        formatter={(value: number) => [`${value.toFixed(4)} CHF`, "Coût"]}
                        labelFormatter={(l: string) => `Date: ${l}`}
                      />
                      <Area type="monotone" dataKey="cost" stroke="#2563eb" fill="#2563eb20" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Per action table */}
              {statsData.per_action.length > 0 && (
                <div className="rounded-lg border border-[#27272A] bg-[#18181B]">
                  <div className="border-b border-[#27272A] px-5 py-3">
                    <h4 className="text-sm font-semibold text-[#A1A1AA]">Par fonction IA</h4>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-[#1C1C1F] text-left text-xs text-[#A1A1AA]">
                      <tr>
                        <th className="px-5 py-2 font-medium">Action</th>
                        <th className="px-3 py-2 font-medium text-right">Appels</th>
                        <th className="px-3 py-2 font-medium text-right">Coût (CHF)</th>
                        <th className="px-5 py-2 font-medium text-right">% du total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#27272A]">
                      {statsData.per_action.map((a: any) => (
                        <tr key={a.action_type} className="hover:bg-[#27272A]">
                          <td className="px-5 py-2 font-medium text-[#FAFAFA]">{a.action_type.replace(/_/g, " ")}</td>
                          <td className="px-3 py-2 text-right text-[#A1A1AA]">{a.calls}</td>
                          <td className="px-3 py-2 text-right text-[#A1A1AA]">{a.cost.toFixed(4)}</td>
                          <td className="px-5 py-2 text-right text-[#71717A]">
                            {statsData.overview.total_cost_chf > 0 ? ((a.cost / statsData.overview.total_cost_chf) * 100).toFixed(1) : "0"}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Per member table */}
              {statsData.per_user.length > 0 && (
                <div className="rounded-lg border border-[#27272A] bg-[#18181B]">
                  <div className="border-b border-[#27272A] px-5 py-3">
                    <h4 className="text-sm font-semibold text-[#A1A1AA]">Par membre</h4>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-[#1C1C1F] text-left text-xs text-[#A1A1AA]">
                      <tr>
                        <th className="px-5 py-2 font-medium">Membre</th>
                        <th className="px-3 py-2 font-medium text-right">Appels</th>
                        <th className="px-3 py-2 font-medium text-right">Coût (CHF)</th>
                        <th className="px-5 py-2 font-medium text-right">% du total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#27272A]">
                      {statsData.per_user.map((u: any) => (
                        <tr key={u.user_id} className="hover:bg-[#27272A]">
                          <td className="px-5 py-2">
                            <p className="font-medium text-[#FAFAFA]">{u.name}</p>
                            <p className="text-xs text-[#71717A]">{u.email}</p>
                          </td>
                          <td className="px-3 py-2 text-right text-[#A1A1AA]">{u.calls}</td>
                          <td className="px-3 py-2 text-right text-[#A1A1AA]">{u.cost.toFixed(4)}</td>
                          <td className="px-5 py-2 text-right text-[#71717A]">
                            {statsData.overview.total_cost_chf > 0 ? ((u.cost / statsData.overview.total_cost_chf) * 100).toFixed(1) : "0"}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {statsData.overview.total_calls === 0 && (
                <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-8 text-center">
                  <Sparkles className="mx-auto h-10 w-10 text-[#52525B]" />
                  <p className="mt-3 text-sm text-[#71717A]">Aucune activité IA sur cette période</p>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-8 text-center">
              <BarChart3 className="mx-auto h-10 w-10 text-[#52525B]" />
              <p className="mt-3 text-sm text-[#71717A]">Impossible de charger les statistiques</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "billing" && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-8 text-center">
          <CreditCard className="mx-auto h-10 w-10 text-[#52525B]" />
          <p className="mt-3 text-sm text-[#71717A]">Historique de facturation — bientôt disponible (Stripe)</p>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-[#18181B] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#FAFAFA]">{t("sendInvitation")}</h3>
              <button onClick={() => setShowInviteModal(false)} className="text-[#71717A] hover:text-[#A1A1AA]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">{t("firstName")}</label>
                  <input
                    value={inviteForm.first_name}
                    onChange={(e) => setInviteForm(p => ({ ...p, first_name: e.target.value }))}
                    className="w-full rounded-md border border-[#27272A] bg-[#18181B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">{t("lastName")}</label>
                  <input
                    value={inviteForm.last_name}
                    onChange={(e) => setInviteForm(p => ({ ...p, last_name: e.target.value }))}
                    className="w-full rounded-md border border-[#27272A] bg-[#18181B] px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">{t("email")} *</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full rounded-md border border-[#27272A] bg-[#18181B] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">Rôle</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm(p => ({ ...p, role: e.target.value }))}
                  className="w-full rounded-md border border-[#27272A] bg-[#18181B] px-3 py-2 text-sm"
                >
                  <option value="admin">Admin</option>
                  <option value="member">Membre</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">{t("inviteMessage")}</label>
                <textarea
                  value={inviteForm.message}
                  onChange={(e) => setInviteForm(p => ({ ...p, message: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-[#27272A] bg-[#18181B] px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowInviteModal(false)}
                className="rounded-md px-4 py-2 text-sm text-[#A1A1AA] hover:bg-[#27272A]"
              >
                Annuler
              </button>
              <button
                onClick={handleSendInvite}
                disabled={!inviteForm.email || sending}
                className="flex items-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {t("sendInvitation")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-[#18181B] p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-red-400">{t("deleteOrg")}</h3>
            <p className="mb-4 text-sm text-[#A1A1AA]">{t("deleteConfirm")}</p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={org.name}
              className="mb-4 w-full rounded-md border border-red-200 bg-[#18181B] px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); }}
                className="rounded-md px-4 py-2 text-sm text-[#A1A1AA] hover:bg-[#27272A]"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirm !== org.name}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="mr-1.5 inline h-4 w-4" />
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
