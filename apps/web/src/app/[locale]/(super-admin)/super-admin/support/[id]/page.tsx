"use client";

import { useState, useEffect, use } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TicketStatusBadge } from "@/components/support/TicketStatusBadge";
import { TicketCategoryBadge } from "@/components/support/TicketCategoryBadge";
import { TicketThread } from "@/components/support/TicketThread";
import { TicketReplyInput } from "@/components/support/TicketReplyInput";
import { useAuth } from "@/components/providers/AuthProvider";

interface Attachment {
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
}

interface Message {
  id: string;
  sender_id: string;
  sender_role: "user" | "admin";
  content: string;
  attachments: Attachment[];
  created_at: string;
  sender_name?: string;
}

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  user_name: string;
  user_email: string;
  org_name: string;
  org_plan: string;
  created_at: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "#71717A",
  medium: "#F59E0B",
  high: "#EF4444",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "Haute",
  medium: "Moyenne",
  low: "Basse",
};

export default function SuperAdminSupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("support");
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchTicket() {
    try {
      const res = await fetch(`/api/support/tickets/${id}`);
      if (!res.ok) {
        setError("Ticket introuvable");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setTicket(data.ticket);
      setMessages(data.messages || []);
    } catch {
      setError("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTicket();
  }, [id]);

  async function handleSend(content: string, attachments: Attachment[]) {
    const res = await fetch(`/api/support/tickets/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, attachments }),
    });
    if (res.ok) {
      await fetchTicket();
    }
  }

  async function handleStatusChange(newStatus: string) {
    await fetch(`/api/support/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await fetchTicket();
  }

  async function handlePriorityChange(newPriority: string) {
    await fetch(`/api/support/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: newPriority }),
    });
    await fetchTicket();
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("fr-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 20px", color: "#71717A", fontSize: 13 }}>
        Chargement...
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px" }}>
        <AlertCircle style={{ width: 32, height: 32, color: "#EF4444", marginBottom: 8 }} />
        <p style={{ color: "#71717A", fontSize: 14 }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "calc(100vh - 48px)", background: "#0F0F11" }}>
      {/* Thread panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "14px 24px", borderBottom: "1px solid #27272A" }}>
          <Link
            href="/super-admin/support"
            style={{
              fontSize: 12,
              color: "#71717A",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 8,
              textDecoration: "none",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#D4D4D8"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#71717A"; }}
          >
            {"\u2190"} {t("allTickets")}
          </Link>
          <div
            style={{
              fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif",
              fontSize: 16,
              fontWeight: 700,
              color: "#FAFAFA",
            }}
          >
            {ticket.subject}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <TicketCategoryBadge category={ticket.category} />
            <TicketStatusBadge status={ticket.status} />
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                display: "inline-block",
                background: PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.medium,
              }}
            />
            <span style={{ fontSize: 11, color: "#71717A" }}>
              {formatDate(ticket.created_at)}
            </span>
          </div>
        </div>

        {/* Messages */}
        <TicketThread
          messages={messages}
          currentUserId={user?.id || ""}
          userName={ticket.user_name}
        />

        {/* Reply input */}
        <TicketReplyInput ticketId={ticket.id} onSend={handleSend} />
      </div>

      {/* User info sidebar */}
      <div
        style={{
          width: 280,
          borderLeft: "1px solid #27272A",
          padding: 16,
          overflowY: "auto",
          background: "#111113",
          flexShrink: 0,
        }}
      >
        {/* User info section */}
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#52525B",
            fontWeight: 600,
            marginBottom: 10,
          }}
        >
          Informations utilisateur
        </div>

        {/* Name + email */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
          <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>{"\uD83D\uDC64"}</span>
          <div>
            <div style={{ fontSize: 12, color: "#D4D4D8" }}>{ticket.user_name || "\u2014"}</div>
            <div style={{ fontSize: 12, color: "#71717A" }}>{ticket.user_email}</div>
          </div>
        </div>

        {/* Org */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
          <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>{"\uD83C\uDFE2"}</span>
          <span style={{ fontSize: 12, color: "#D4D4D8" }}>{ticket.org_name || "\u2014"}</span>
        </div>

        {/* Plan */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
          <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>{"\uD83D\uDCB3"}</span>
          <span style={{ fontSize: 12, color: "#D4D4D8" }}>Plan {ticket.org_plan || "Trial"}</span>
        </div>

        {/* Member since */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
          <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>{"\uD83D\uDCC5"}</span>
          <span style={{ fontSize: 12, color: "#71717A" }}>Membre depuis {formatDate(ticket.created_at)}</span>
        </div>

        {/* Ticket management section */}
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#52525B",
            fontWeight: 600,
            marginTop: 24,
            marginBottom: 10,
          }}
        >
          Gestion ticket
        </div>

        {/* Status select */}
        <div style={{ fontSize: 10, color: "#71717A", marginBottom: 4 }}>Statut</div>
        <select
          value={ticket.status}
          onChange={(e) => handleStatusChange(e.target.value)}
          style={{
            width: "100%",
            background: "#18181B",
            border: "1px solid #3F3F46",
            borderRadius: 7,
            padding: "7px 10px",
            fontSize: 12,
            color: "#D4D4D8",
            outline: "none",
          }}
        >
          <option value="open">{t("statusOpen")}</option>
          <option value="in_progress">{t("statusInProgress")}</option>
          <option value="resolved">{t("statusResolved")}</option>
          <option value="closed">{t("statusClosed")}</option>
        </select>

        {/* Priority dots */}
        <div style={{ fontSize: 10, color: "#71717A", marginTop: 10, marginBottom: 4 }}>Priorit{"\u00E9"}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {(["high", "medium", "low"] as const).map((p) => (
            <button
              key={p}
              onClick={() => handlePriorityChange(p)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                color: ticket.priority === p ? "#F97316" : "#A1A1AA",
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: 5,
                background: ticket.priority === p ? "rgba(249, 115, 22, 0.07)" : "transparent",
                border: "none",
              }}
              onMouseEnter={(e) => {
                if (ticket.priority !== p) (e.currentTarget as HTMLElement).style.background = "#1C1C1F";
              }}
              onMouseLeave={(e) => {
                if (ticket.priority !== p) (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  display: "inline-block",
                  background: PRIORITY_COLORS[p],
                }}
              />
              {PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
