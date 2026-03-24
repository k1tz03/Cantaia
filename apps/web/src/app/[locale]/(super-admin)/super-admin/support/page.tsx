"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LifeBuoy, MessageSquare, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { TicketStatusBadge } from "@/components/support/TicketStatusBadge";
import { TicketCategoryBadge } from "@/components/support/TicketCategoryBadge";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  message_count: number;
  user_name: string;
  user_email: string;
  org_name: string;
  last_user_reply_at: string | null;
  last_admin_read_at: string | null;
  created_at: string;
  updated_at: string;
}

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-gray-400",
  medium: "bg-amber-400",
  high: "bg-red-500",
};

export default function SuperAdminSupportPage() {
  const t = useTranslations("support");
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  async function fetchTickets() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterCategory) params.set("category", filterCategory);
      if (filterPriority) params.set("priority", filterPriority);
      const res = await fetch(`/api/support/tickets?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (e) {
      console.error("[Support Admin] Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTickets();
  }, [filterStatus, filterCategory, filterPriority]);

  function hasUnread(ticket: Ticket): boolean {
    if (!ticket.last_user_reply_at) return false;
    if (!ticket.last_admin_read_at) return true;
    return new Date(ticket.last_user_reply_at) > new Date(ticket.last_admin_read_at);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  // KPIs
  const openCount = tickets.filter((t) => t.status === "open").length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;
  const now = new Date();
  const thisMonth = tickets.filter((t) => {
    const d = new Date(t.updated_at);
    return t.status === "resolved" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#FAFAFA] mb-6">{t("title")}</h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-6">
        <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-[#71717A] uppercase">{t("kpiOpen")}</span>
          </div>
          <p className="text-2xl font-bold text-[#FAFAFA]">{openCount}</p>
        </div>
        <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-medium text-[#71717A] uppercase">{t("kpiInProgress")}</span>
          </div>
          <p className="text-2xl font-bold text-[#FAFAFA]">{inProgressCount}</p>
        </div>
        <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-xs font-medium text-[#71717A] uppercase">{t("kpiResolvedMonth")}</span>
          </div>
          <p className="text-2xl font-bold text-[#FAFAFA]">{thisMonth}</p>
        </div>
        <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-4">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-4 w-4 text-purple-500" />
            <span className="text-xs font-medium text-[#71717A] uppercase">Total</span>
          </div>
          <p className="text-2xl font-bold text-[#FAFAFA]">{tickets.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-3">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA]">
          <option value="">{t("allTickets")}</option>
          <option value="open">{t("statusOpen")}</option>
          <option value="in_progress">{t("statusInProgress")}</option>
          <option value="resolved">{t("statusResolved")}</option>
          <option value="closed">{t("statusClosed")}</option>
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA]">
          <option value="">{t("category")}</option>
          <option value="bug">{t("categoryBug")}</option>
          <option value="question">{t("categoryQuestion")}</option>
          <option value="feature_request">{t("categoryFeature")}</option>
          <option value="billing">{t("categoryBilling")}</option>
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA]">
          <option value="">{t("priority")}</option>
          <option value="low">{t("priorityLow")}</option>
          <option value="medium">{t("priorityMedium")}</option>
          <option value="high">{t("priorityHigh")}</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#71717A]">Chargement...</div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <LifeBuoy className="h-12 w-12 text-[#71717A]/30 mb-4" />
          <p className="text-[#71717A]">Aucun ticket</p>
        </div>
      ) : (
        <div className="rounded-lg border border-[#27272A] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A] uppercase">{t("subject")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A] uppercase">Utilisateur</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A] uppercase">Org</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A] uppercase">{t("category")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A] uppercase">{t("priority")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A] uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A] uppercase">Date</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  onClick={() => router.push(`/super-admin/support/${ticket.id}`)}
                  className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-[#FAFAFA]">{ticket.subject}</span>
                    <span className="ml-2 text-xs text-[#71717A]">({ticket.message_count})</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-[#FAFAFA]">{ticket.user_name || "—"}</div>
                    <div className="text-xs text-[#71717A]">{ticket.user_email}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#71717A]">{ticket.org_name || "—"}</td>
                  <td className="px-4 py-3"><TicketCategoryBadge category={ticket.category} /></td>
                  <td className="px-4 py-3">
                    <span className={`inline-block h-2 w-2 rounded-full ${PRIORITY_DOT[ticket.priority] || PRIORITY_DOT.medium}`} />
                  </td>
                  <td className="px-4 py-3"><TicketStatusBadge status={ticket.status} /></td>
                  <td className="px-4 py-3 text-sm text-[#71717A]">{formatDate(ticket.created_at)}</td>
                  <td className="px-4 py-3">
                    {hasUnread(ticket) && (
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" title={t("unread")} />
                    )}
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
