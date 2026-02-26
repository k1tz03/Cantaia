"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Users,
  Plus,
  Mail,
  X,
  Loader2,
  Send,
  RotateCcw,
  Crown,
  Shield,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
}

interface Invite {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export default function AdminMembersPage() {
  const t = useTranslations("superAdmin");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [maxUsers, setMaxUsers] = useState(20);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "", first_name: "", last_name: "", role: "member", message: "",
  });
  const [sending, setSending] = useState(false);
  const [orgId, setOrgId] = useState("");

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await (supabase.from("users") as any)
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!userData?.organization_id) { setLoading(false); return; }
      const oid = userData.organization_id;
      setOrgId(oid);

      // Get org limits
      const { data: org } = await (supabase.from("organizations") as any)
        .select("max_users")
        .eq("id", oid)
        .maybeSingle();
      if (org) setMaxUsers(org.max_users || 20);

      // Get members
      const { data: membersData } = await (supabase.from("users") as any)
        .select("id, first_name, last_name, email, role, is_active, last_sync_at, created_at")
        .eq("organization_id", oid)
        .order("created_at", { ascending: true });
      setMembers(membersData || []);

      // Get pending invites
      const { data: invitesData } = await (supabase.from("organization_invites") as any)
        .select("*")
        .eq("organization_id", oid)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      setInvites(invitesData || []);
    } catch (err) {
      console.error("Failed to load members:", err);
    } finally {
      setLoading(false);
    }
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
      loadMembers();
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
    loadMembers();
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("fr-CH", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  }

  function getRoleIcon(role: string) {
    if (role === "admin") return <Crown className="h-3.5 w-3.5" />;
    if (role === "director") return <Shield className="h-3.5 w-3.5" />;
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Users className="h-6 w-6 text-blue-600" />
            {t("tabMembers")}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {members.length}/{maxUsers} {t("members")}
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          disabled={members.length >= maxUsers}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {t("sendInvitation")}
        </button>
      </div>

      {/* Members list */}
      <div className="rounded-lg border border-gray-200 bg-white">
        {members.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">Aucun membre</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {members.map((member, i) => (
              <div key={member.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                    {member.first_name[0]}{member.last_name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {member.first_name} {member.last_name}
                      {i === 0 && <span className="ml-1.5 text-xs text-gray-400">(Propriétaire)</span>}
                    </p>
                    <p className="text-xs text-gray-400">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    member.role === "admin" ? "bg-blue-50 text-blue-700" :
                    member.role === "director" ? "bg-purple-50 text-purple-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {getRoleIcon(member.role)}
                    {member.role === "admin" ? "Admin" : member.role === "director" ? "Direction" : "Membre"}
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
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">{t("pendingInvites")}</h3>
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="divide-y divide-gray-50">
              {invites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between px-5 py-3">
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
                    <button className="rounded-md px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">
                      <RotateCcw className="mr-1 inline h-3 w-3" />{t("resendInvite")}
                    </button>
                    <button
                      onClick={() => handleCancelInvite(invite.id)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <X className="mr-1 inline h-3 w-3" />{t("cancelInvite")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
                  placeholder="Bienvenue dans l'espace Cantaia !"
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
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {t("sendInvitation")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
