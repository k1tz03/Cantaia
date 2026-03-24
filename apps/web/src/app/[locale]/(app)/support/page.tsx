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
    <div style={{ padding: "24px 28px", background: "#0F0F11", minHeight: "100%" }}>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1
            style={{
              fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif",
              fontSize: 24,
              fontWeight: 800,
              color: "#FAFAFA",
              margin: 0,
            }}
          >
            {t("title")}
          </h1>
          <p style={{ fontSize: 13, color: "#71717A", marginTop: 2 }}>
            {t("myTickets")}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            fontSize: 12,
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: "linear-gradient(135deg, #F97316, #EA580C)",
            color: "white",
            cursor: "pointer",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          + {t("newTicket")}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            background: "#18181B",
            border: "1px solid #3F3F46",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 12,
            color: "#D4D4D8",
            outline: "none",
          }}
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
          style={{
            background: "#18181B",
            border: "1px solid #3F3F46",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 12,
            color: "#D4D4D8",
            outline: "none",
          }}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 20px", color: "#71717A", fontSize: 13 }}>
          Chargement...
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🎫</div>
          <div style={{ fontSize: 14, color: "#71717A", marginBottom: 16 }}>
            {t("emptyState")}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              fontSize: 12,
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(135deg, #F97316, #EA580C)",
              color: "white",
              cursor: "pointer",
              fontWeight: 500,
            }}
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
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#52525B",
                    fontWeight: 600,
                    padding: "8px 14px",
                    textAlign: "left",
                    borderBottom: "1px solid #27272A",
                  }}
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
                style={{ cursor: "pointer", transition: "background 0.1s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#18181B"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", fontSize: 12, color: "#D4D4D8", verticalAlign: "middle" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#FAFAFA" }}>
                    {ticket.subject}
                  </span>
                  <span style={{ fontSize: 10, color: "#71717A", marginLeft: 6 }}>
                    ({ticket.message_count})
                  </span>
                  {hasUnread(ticket) && (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#3B82F6",
                        display: "inline-block",
                        marginLeft: 6,
                      }}
                    />
                  )}
                </td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", verticalAlign: "middle" }}>
                  <TicketCategoryBadge category={ticket.category} />
                </td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", verticalAlign: "middle" }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      display: "inline-block",
                      background: PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.medium,
                    }}
                  />
                </td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", verticalAlign: "middle" }}>
                  <TicketStatusBadge status={ticket.status} />
                </td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", fontSize: 12, color: "#71717A", verticalAlign: "middle" }}>
                  {formatDate(ticket.created_at)}
                </td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", verticalAlign: "middle" }}>
                  {hasUnread(ticket) && (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#3B82F6",
                        display: "inline-block",
                      }}
                    />
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
