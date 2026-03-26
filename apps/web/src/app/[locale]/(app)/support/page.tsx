"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

const PRIORITY_COLORS: Record<string, string> = {
  low: "#71717A",
  medium: "#F59E0B",
  high: "#EF4444",
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
    <div className="px-7 py-6 bg-[#0F0F11] min-h-full">
      {/* Page header */}
      <div className="flex justify-between items-center mb-[18px]">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[#FAFAFA] m-0">
            {t("title")}
          </h1>
          <p className="text-[13px] text-[#71717A] mt-0.5">
            {t("myTickets")}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="text-xs px-4 py-2 rounded-lg border-none bg-gradient-to-br from-[#F97316] to-[#EA580C] text-white cursor-pointer font-medium flex items-center gap-1.5"
        >
          + {t("newTicket")}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3.5">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-[#18181B] border border-[#3F3F46] rounded-lg px-3 py-[7px] text-xs text-[#D4D4D8] outline-none"
        >
          <option value="">Tous les statuts</option>
          <option value="open">{t("statusOpen")}</option>
          <option value="in_progress">{t("statusInProgress")}</option>
          <option value="resolved">{t("statusResolved")}</option>
          <option value="closed">{t("statusClosed")}</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-[#18181B] border border-[#3F3F46] rounded-lg px-3 py-[7px] text-xs text-[#D4D4D8] outline-none"
        >
          <option value="">Toutes cat{"\u00E9"}gories</option>
          <option value="bug">{t("categoryBug")}</option>
          <option value="question">{t("categoryQuestion")}</option>
          <option value="feature_request">{t("categoryFeature")}</option>
          <option value="billing">{t("categoryBilling")}</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center px-5 py-20 text-[#71717A] text-[13px]">
          Chargement...
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-5 py-[60px] text-center">
          <div className="text-[48px] mb-3 opacity-30">🎫</div>
          <div className="text-sm text-[#71717A] mb-4">
            {t("emptyState")}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs px-4 py-2 rounded-lg border-none bg-gradient-to-br from-[#F97316] to-[#EA580C] text-white cursor-pointer font-medium"
          >
            + {t("newTicket")}
          </button>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {["Sujet", "Cat\u00E9gorie", "Priorit\u00E9", "Statut", "Date", ""].map((h, i) => (
                <th
                  key={i}
                  className="text-[10px] uppercase tracking-[0.06em] text-[#52525B] font-semibold px-3.5 py-2 text-left border-b border-[#27272A]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr
                key={ticket.id}
                onClick={() => router.push(`/support/${ticket.id}`)}
                className="cursor-pointer transition-colors hover:bg-[#18181B]"
              >
                <td className="px-3.5 py-3 border-b border-[#1C1C1F] text-xs text-[#D4D4D8] align-middle">
                  <span className="text-[13px] font-medium text-[#FAFAFA]">
                    {ticket.subject}
                  </span>
                  <span className="text-[10px] text-[#71717A] ml-1.5">
                    ({ticket.message_count})
                  </span>
                  {hasUnread(ticket) && (
                    <span className="w-[7px] h-[7px] rounded-full bg-[#3B82F6] inline-block ml-1.5" />
                  )}
                </td>
                <td className="px-3.5 py-3 border-b border-[#1C1C1F] align-middle">
                  <TicketCategoryBadge category={ticket.category} />
                </td>
                <td className="px-3.5 py-3 border-b border-[#1C1C1F] align-middle">
                  <span
                    className="w-[7px] h-[7px] rounded-full inline-block"
                    style={{ background: PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.medium }}
                  />
                </td>
                <td className="px-3.5 py-3 border-b border-[#1C1C1F] align-middle">
                  <TicketStatusBadge status={ticket.status} />
                </td>
                <td className="px-3.5 py-3 border-b border-[#1C1C1F] text-xs text-[#71717A] align-middle">
                  {formatDate(ticket.created_at)}
                </td>
                <td className="px-3.5 py-3 border-b border-[#1C1C1F] align-middle">
                  {hasUnread(ticket) && (
                    <span className="w-[7px] h-[7px] rounded-full bg-[#3B82F6] inline-block" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <TicketCreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchTickets}
      />
    </div>
  );
}
