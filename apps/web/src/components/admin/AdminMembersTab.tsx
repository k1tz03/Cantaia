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
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  is_active: boolean;
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

export default function AdminMembersTab() {
  const t = useTranslations("admin");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [maxUsers, setMaxUsers] = useState(20);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    role: "member",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadMembers();
  }, []);

  // Auto-clear toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function loadMembers() {
    try {
      const res = await fetch("/api/admin/clients");
      const data = await res.json();

      if (!data?.organization_id) {
        setLoading(false);
        return;
      }
      setOrgId(data.organization_id);
      setMaxUsers(data.max_users || 20);
      setMembers(data.members || []);

      // Get pending invites
      const supabase = createClient();
      const { data: invitesData } = await (
        supabase.from("organization_invites") as any
      )
        .select("*")
        .eq("organization_id", data.organization_id)
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
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: orgId,
          ...inviteForm,
        }),
      });
      if (res.ok) {
        setShowInviteModal(false);
        setInviteForm({
          email: "",
          first_name: "",
          last_name: "",
          role: "member",
          message: "",
        });
        setToast({ type: "success", text: t("inviteSent") });
        loadMembers();
      }
    } catch (err) {
      console.error("Failed to send invite:", err);
    } finally {
      setSending(false);
    }
  }

  async function handleResendInvite(invite: { id: string; email: string }) {
    try {
      // Cancel old invite
      const supabase = createClient();
      await (supabase.from("organization_invites") as any)
        .update({ status: "cancelled" })
        .eq("id", invite.id);

      // Send new one
      await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: orgId,
          email: invite.email,
          role: "member",
        }),
      });
      setToast({ type: "success", text: t("inviteSent") });
      loadMembers();
    } catch (err) {
      console.error("Failed to resend invite:", err);
    }
  }

  async function handleCancelInvite(inviteId: string) {
    try {
      const supabase = createClient();
      await (supabase.from("organization_invites") as any)
        .update({ status: "cancelled" })
        .eq("id", inviteId);
      loadMembers();
    } catch (err) {
      console.error("Failed to cancel invite:", err);
    }
  }

  async function handleChangeRole(memberId: string, newRole: string) {
    try {
      const supabase = createClient();
      await (supabase.from("users") as any)
        .update({ role: newRole })
        .eq("id", memberId);
      setToast({ type: "success", text: t("roleChanged") });
      loadMembers();
    } catch (err) {
      console.error("Failed to change role:", err);
    }
  }

  async function handleDeleteMember(memberId: string) {
    try {
      // Remove from organization by setting organization_id to null
      const supabase = createClient();
      await (supabase.from("users") as any)
        .update({ organization_id: null })
        .eq("id", memberId);
      setShowDeleteConfirm(null);
      setToast({ type: "success", text: t("memberDeleted") });
      loadMembers();
    } catch (err) {
      console.error("Failed to delete member:", err);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("fr-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            toast.type === "success"
              ? "border border-green-200 bg-green-500/10 text-green-700 dark:text-green-400"
              : "border border-red-200 bg-red-500/10 text-red-700 dark:text-red-400"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[#FAFAFA]">
            <Users className="h-5 w-5 text-[#F97316]" />
            {t("members")}
          </h2>
          <p className="mt-0.5 text-sm text-[#71717A]">
            {t("usersCount", {
              current: members.length,
              max: maxUsers,
            })}
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          disabled={members.length >= maxUsers}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {t("inviteMember")}
        </button>
      </div>

      {/* Members table */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11]">
        {members.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#71717A]">
            {t("noMembers")}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {members.map((member, i) => (
              <div
                key={member.id}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-[#27272A]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F97316]/10 text-xs font-semibold text-[#F97316]">
                    {(member.first_name || "?")[0]}
                    {(member.last_name || "?")[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#FAFAFA]">
                      {member.first_name} {member.last_name}
                      {i === 0 && (
                        <span className="ml-1.5 text-xs text-[#71717A]">
                          (Owner)
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[#71717A]">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Role dropdown */}
                  <select
                    value={member.role}
                    onChange={(e) =>
                      handleChangeRole(member.id, e.target.value)
                    }
                    disabled={i === 0}
                    className={`rounded-md border border-[#27272A] bg-[#0F0F11] px-2.5 py-1 text-xs font-medium ${
                      member.role === "admin"
                        ? "text-[#F97316]"
                        : member.role === "director"
                          ? "text-purple-700"
                          : "text-[#71717A]"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <option value="admin">Admin</option>
                    <option value="director">Direction</option>
                    <option value="project_manager">Chef de projet</option>
                    <option value="member">Membre</option>
                  </select>

                  <span className="text-xs text-[#71717A]">
                    {formatDate(member.created_at)}
                  </span>

                  {/* Delete button (not for first member / owner) */}
                  {i > 0 && (
                    <button
                      onClick={() => setShowDeleteConfirm(member.id)}
                      className="rounded p-1 text-[#71717A] hover:bg-red-500/10 hover:text-red-600"
                      title={t("deleteConfirm")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-[#FAFAFA]">
            Invitations en attente
          </h3>
          <div className="rounded-lg border border-[#27272A] bg-[#0F0F11]">
            <div className="divide-y divide-border">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-[#71717A]" />
                    <div>
                      <p className="text-sm text-[#FAFAFA]">{invite.email}</p>
                      <p className="text-xs text-[#71717A]">
                        {formatDate(invite.created_at)} — expire le{" "}
                        {formatDate(invite.expires_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleResendInvite(invite)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-[#F97316] hover:bg-[#F97316]/10"
                    >
                      <RotateCcw className="mr-1 inline h-3 w-3" />
                      Renvoyer
                    </button>
                    <button
                      onClick={() => handleCancelInvite(invite.id)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10"
                    >
                      <X className="mr-1 inline h-3 w-3" />
                      Annuler
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-[#0F0F11] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#FAFAFA]">
              {t("deleteConfirm")}
            </h3>
            <p className="mt-2 text-sm text-[#71717A]">
              Cette action retirera le membre de votre organisation.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="rounded-md px-4 py-2 text-sm text-[#71717A] hover:bg-[#27272A]"
              >
                Annuler
              </button>
              <button
                onClick={() => handleDeleteMember(showDeleteConfirm)}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-[#0F0F11] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#FAFAFA]">
                {t("inviteMember")}
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-[#71717A] hover:text-[#71717A]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
                    Prenom
                  </label>
                  <input
                    value={inviteForm.first_name}
                    onChange={(e) =>
                      setInviteForm((p) => ({
                        ...p,
                        first_name: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
                    Nom
                  </label>
                  <input
                    value={inviteForm.last_name}
                    onChange={(e) =>
                      setInviteForm((p) => ({
                        ...p,
                        last_name: e.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
                  Email *
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm((p) => ({ ...p, email: e.target.value }))
                  }
                  className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
                  Role
                </label>
                <select
                  value={inviteForm.role}
                  onChange={(e) =>
                    setInviteForm((p) => ({ ...p, role: e.target.value }))
                  }
                  className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm"
                >
                  <option value="admin">Admin</option>
                  <option value="project_manager">Chef de projet</option>
                  <option value="member">Membre</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
                  Message (optionnel)
                </label>
                <textarea
                  value={inviteForm.message}
                  onChange={(e) =>
                    setInviteForm((p) => ({ ...p, message: e.target.value }))
                  }
                  rows={3}
                  className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm"
                  placeholder="Bienvenue dans l'espace Cantaia !"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowInviteModal(false)}
                className="rounded-md px-4 py-2 text-sm text-[#71717A] hover:bg-[#27272A]"
              >
                Annuler
              </button>
              <button
                onClick={handleSendInvite}
                disabled={!inviteForm.email || sending}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t("inviteMember")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
