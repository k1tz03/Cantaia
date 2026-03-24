"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LifeBuoy, Plus } from "lucide-react";
import { TicketStatusBadge } from "@/components/support/TicketStatusBadge";
import { TicketCategoryBadge } from "@/components/support/TicketCategoryBadge";
import { TicketCreateModal } from "@/components/support/TicketCreateModal";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  message_count: number;
  last_admin_reply_at: string | null;
  last_read_at: string | null;
  created_at: string;
  updated_at: string;
}

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-[#52525B]",
  medium: "bg-amber-400",
  high: "bg-red-500",
};

export default function SupportPage() {
  const t = useTranslations("support");
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  async function fetchTickets() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterCategory) params.set("category", filterCategory);
      const res = await fetch(`/api/support/tickets?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (e) {
      console.error("[Support] Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTickets();
  }, [filterStatus, filterCategory]);

  function hasUnread(ticket: Ticket): boolean {
    if (!ticket.last_admin_reply_at) return false;
    if (!ticket.last_read_at) return true;
    return new Date(ticket.last_admin_reply_at) > new Date(ticket.last_read_at);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("fr-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  return (
    <div className="min-h-full bg-[#0F0F11] mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-extrabold text-[#FAFAFA]">{t("title")}</h1>
          <p className="text-sm text-[#71717A]">{t("myTickets")}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#F97316]/90"
        >
          <Plus className="h-4 w-4" />
          {t("newTicket")}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA]"
        >
          <option value="">{t("allTickets")}</option>
          <option value="open">{t("statusOpen")}</option>
          <option value="in_progress">{t("statusInProgress")}</option>
          <option value="resolved">{t("statusResolved")}</option>
          <option value="closed">{t("statusClosed")}</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA]"
        >
          <option value="">{t("category")}</option>
          <option value="bug">{t("categoryBug")}</option>
          <option value="question">{t("categoryQuestion")}</option>
          <option value="feature_request">{t("categoryFeature")}</option>
          <option value="billing">{t("categoryBilling")}</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#71717A]">Chargement...</div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <LifeBuoy className="h-12 w-12 text-[#71717A]/30 mb-4" />
          <p className="text-[#71717A] mb-4">{t("emptyState")}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#F97316]/90"
          >
            <Plus className="h-4 w-4" />
            {t("newTicket")}
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-[#27272A] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A] uppercase">{t("subject")}</th>
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
                  onClick={() => router.push(`/support/${ticket.id}`)}
                  className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-[#FAFAFA]">{ticket.subject}</span>
                    <span className="ml-2 text-xs text-[#71717A]">({ticket.message_count})</span>
                  </td>
                  <td className="px-4 py-3"><TicketCategoryBadge category={ticket.category} /></td>
                  <td className="px-4 py-3">
                    <span className={`inline-block h-2 w-2 rounded-full ${PRIORITY_DOT[ticket.priority] || PRIORITY_DOT.medium}`} />
                  </td>
                  <td className="px-4 py-3"><TicketStatusBadge status={ticket.status} /></td>
                  <td className="px-4 py-3 text-sm text-[#71717A]">{formatDate(ticket.created_at)}</td>
                  <td className="px-4 py-3">
                    {hasUnread(ticket) && (
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#F97316]" title={t("unread")} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TicketCreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchTickets}
      />
    </div>
  );
}
