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
} from "lucide-react";
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

  useEffect(() => {
    loadOrganization();
  }, [orgId]);

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
    const action = org.status === "suspended" ? "unsuspend-organization" : "suspend-organization";
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
        <p className="text-gray-500">Organisation introuvable.</p>
      </div>
    );
  }

  const statusStyle = {
    setup: "bg-yellow-50 text-yellow-700",
    trial: "bg-blue-50 text-blue-700",
    active: "bg-green-50 text-green-700",
    suspended: "bg-red-50 text-red-700",
  }[org.status] || "bg-gray-50 text-gray-700";

  return (
    <div className="p-6">
      {/* Header */}
      <button
        onClick={() => router.push("/super-admin/organizations")}
        className="mb-3 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("organizations")}
      </button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{org.name}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle}`}>
              {t(`status${org.status.charAt(0).toUpperCase() + org.status.slice(1)}`)}
            </span>
          </div>
          {org.subdomain && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
              <Globe className="h-3.5 w-3.5" />
              {org.subdomain}.cantaia.ch
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSuspend}
            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${
              org.status === "suspended"
                ? "bg-green-50 text-green-700 hover:bg-green-100"
                : "bg-red-50 text-red-700 hover:bg-red-100"
            }`}
          >
            {org.status === "suspended" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {org.status === "suspended" ? t("unsuspend") : t("suspend")}
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            <Trash2 className="h-4 w-4" />
            {t("deleteOrg")}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === key
                ? "border-amber-500 text-amber-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
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
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500">{t("tabMembers")}</p>
              <p className="text-2xl font-bold text-gray-900">{members.length}<span className="text-sm font-normal text-gray-400">/{org.max_users}</span></p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500">{t("projects")}</p>
              <p className="text-2xl font-bold text-gray-900">{projectCount}<span className="text-sm font-normal text-gray-400">/{org.max_projects}</span></p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500">{t("plan")}</p>
              <p className="text-2xl font-bold text-gray-900 capitalize">{org.plan}</p>
            </div>
          </div>

          {/* Organization info */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">{t("stepInfo")}</h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-gray-500">{t("orgName")}</dt><dd className="font-medium text-gray-900">{org.name}</dd></div>
              <div><dt className="text-gray-500">{t("orgDisplayName")}</dt><dd className="font-medium text-gray-900">{org.display_name || "—"}</dd></div>
              <div><dt className="text-gray-500">{t("orgCity")}</dt><dd className="font-medium text-gray-900">{org.city || "—"}</dd></div>
              <div><dt className="text-gray-500">{t("orgCountry")}</dt><dd className="font-medium text-gray-900">{org.country}</dd></div>
              <div><dt className="text-gray-500">{t("orgPhone")}</dt><dd className="font-medium text-gray-900">{org.phone || "—"}</dd></div>
              <div><dt className="text-gray-500">{t("orgWebsite")}</dt><dd className="font-medium text-gray-900">{org.website || "—"}</dd></div>
              <div><dt className="text-gray-500">{t("createdAt")}</dt><dd className="font-medium text-gray-900">{formatDate(org.created_at)}</dd></div>
              <div><dt className="text-gray-500">{t("subdomain")}</dt><dd className="font-medium text-gray-900">{org.subdomain || "—"}.cantaia.ch</dd></div>
            </dl>
            {org.notes && (
              <div className="mt-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
                <strong>{t("internalNotes")}</strong>: {org.notes}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "members" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
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
          <div className="rounded-lg border border-gray-200 bg-white">
            {members.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">Aucun membre</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                        {member.first_name[0]}{member.last_name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{member.first_name} {member.last_name}</p>
                        <p className="text-xs text-gray-400">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 capitalize">
                        {member.role}
                      </span>
                      <span className="text-xs text-gray-400">
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
              <h3 className="mt-6 text-sm font-semibold text-gray-700">{t("pendingInvites")}</h3>
              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="divide-y divide-gray-50">
                  {invites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-700">{invite.email}</p>
                          <p className="text-xs text-gray-400">
                            {t("invitedOn")} {formatDate(invite.created_at)} — {t("expiresOn")} {formatDate(invite.expires_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">
                          <RotateCcw className="inline h-3 w-3 mr-1" />{t("resendInvite")}
                        </button>
                        <button
                          onClick={() => handleCancelInvite(invite.id)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
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
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-400">Statistiques détaillées — bientôt disponible</p>
        </div>
      )}

      {activeTab === "billing" && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <CreditCard className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-400">Historique de facturation — bientôt disponible (Stripe)</p>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{t("sendInvitation")}</h3>
              <button onClick={() => setShowInviteModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("firstName")}</label>
                  <input
                    value={inviteForm.first_name}
                    onChange={(e) => setInviteForm(p => ({ ...p, first_name: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("lastName")}</label>
                  <input
                    value={inviteForm.last_name}
                    onChange={(e) => setInviteForm(p => ({ ...p, last_name: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("email")} *</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Rôle</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm(p => ({ ...p, role: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="admin">Admin</option>
                  <option value="member">Membre</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("inviteMessage")}</label>
                <textarea
                  value={inviteForm.message}
                  onChange={(e) => setInviteForm(p => ({ ...p, message: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowInviteModal(false)}
                className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
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
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-red-700">{t("deleteOrg")}</h3>
            <p className="mb-4 text-sm text-gray-600">{t("deleteConfirm")}</p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={org.name}
              className="mb-4 w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); }}
                className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
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
