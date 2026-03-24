"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

const PRIORITY_COLORS: Record<string, string> = {
  low: "#71717A",
  medium: "#F59E0B",
  high: "#EF4444",
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
  const resolvedThisMonth = tickets.filter((t) => {
    const d = new Date(t.updated_at);
    return t.status === "resolved" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const kpis = [
    { label: t("kpiOpen"), value: openCount, color: "#3B82F6" },
    { label: t("kpiInProgress"), value: inProgressCount, color: "#F59E0B" },
    { label: t("kpiResolvedMonth"), value: resolvedThisMonth, color: "#10B981" },
    { label: "Total", value: tickets.length, color: "#8B5CF6" },
  ];

  return (
    <div style={{ padding: "24px 28px", background: "#0F0F11", minHeight: "100%" }}>
      {/* Page header */}
      <div style={{ marginBottom: 18 }}>
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
          Tous les tickets de support
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        {kpis.map((kpi, i) => (
          <div
            key={i}
            style={{
              background: "#18181B",
              border: "1px solid #27272A",
              borderRadius: 8,
              padding: "12px 16px",
            }}
          >
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#52525B", fontWeight: 600, marginBottom: 4 }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#FAFAFA" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ background: "#18181B", border: "1px solid #3F3F46", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "#D4D4D8", outline: "none" }}
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
          style={{ background: "#18181B", border: "1px solid #3F3F46", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "#D4D4D8", outline: "none" }}
        >
          <option value="">Toutes cat{"\u00E9"}gories</option>
          <option value="bug">{t("categoryBug")}</option>
          <option value="question">{t("categoryQuestion")}</option>
          <option value="feature_request">{t("categoryFeature")}</option>
          <option value="billing">{t("categoryBilling")}</option>
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          style={{ background: "#18181B", border: "1px solid #3F3F46", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "#D4D4D8", outline: "none" }}
        >
          <option value="">Toutes priorit{"\u00E9"}s</option>
          <option value="low">{t("priorityLow")}</option>
          <option value="medium">{t("priorityMedium")}</option>
          <option value="high">{t("priorityHigh")}</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 20px", color: "#71717A", fontSize: 13 }}>
          Chargement...
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🎫</div>
          <div style={{ fontSize: 14, color: "#71717A" }}>Aucun ticket</div>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {["Sujet", "Utilisateur", "Org", "Cat\u00E9gorie", "Priorit\u00E9", "Statut", "Date", ""].map((h, i) => (
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
                onClick={() => router.push(`/super-admin/support/${ticket.id}`)}
                style={{ cursor: "pointer", transition: "background 0.1s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#18181B"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", fontSize: 12, color: "#D4D4D8", verticalAlign: "middle" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#FAFAFA" }}>{ticket.subject}</span>
                  <span style={{ fontSize: 10, color: "#71717A", marginLeft: 6 }}>({ticket.message_count})</span>
                  {hasUnread(ticket) && (
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3B82F6", display: "inline-block", marginLeft: 6 }} />
                  )}
                </td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", verticalAlign: "middle" }}>
                  <div style={{ fontSize: 12, color: "#FAFAFA" }}>{ticket.user_name || "\u2014"}</div>
                  <div style={{ fontSize: 10, color: "#71717A" }}>{ticket.user_email}</div>
                </td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", fontSize: 12, color: "#71717A", verticalAlign: "middle" }}>
                  {ticket.org_name || "\u2014"}
                </td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", verticalAlign: "middle" }}>
                  <TicketCategoryBadge category={ticket.category} />
                </td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", verticalAlign: "middle" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.medium }} />
                </td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", verticalAlign: "middle" }}>
                  <TicketStatusBadge status={ticket.status} />
                </td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", fontSize: 12, color: "#71717A", verticalAlign: "middle" }}>
                  {formatDate(ticket.created_at)}
                </td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #1C1C1F", verticalAlign: "middle" }}>
                  {hasUnread(ticket) && (
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3B82F6", display: "inline-block" }} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
