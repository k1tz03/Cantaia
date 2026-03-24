"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
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
  created_at: string;
  user_name?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "#71717A",
  medium: "#F59E0B",
  high: "#EF4444",
};

export default function SupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("support");
  const router = useRouter();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchTicket() {
    try {
      const res = await fetch(`/api/support/tickets/${id}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 403 || res.status === 404) {
        setError("Ticket introuvable");
        setLoading(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
        setMessages(data.messages || []);
      }
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

  async function handleReopen() {
    await handleSend("Ticket rouvert par l'utilisateur.", []);
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
        <p style={{ color: "#71717A", fontSize: 14 }}>{error || "Ticket introuvable"}</p>
        <Link href="/support" style={{ marginTop: 16, fontSize: 13, color: "#F97316", textDecoration: "none" }}>
          {"\u2190"} Retour
        </Link>
      </div>
    );
  }

  const isResolved = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <div style={{ display: "flex", height: "calc(100vh - 48px)", background: "#0F0F11" }}>
      {/* Thread panel (full width for user view) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Detail header */}
        <div style={{ padding: "14px 24px", borderBottom: "1px solid #27272A" }}>
          <Link
            href="/support"
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
            {"\u2190"} {t("myTickets")}
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

        {/* Resolved banner */}
        {isResolved && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 24px",
              background: "rgba(16, 185, 129, 0.06)",
              borderBottom: "1px solid rgba(16, 185, 129, 0.15)",
            }}
          >
            <div style={{ fontSize: 12, color: "#34D399", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
              {"\u2705"} {ticket.status === "resolved" ? t("resolvedBanner") : t("closedBanner")}
            </div>
            {ticket.status === "resolved" && (
              <button
                onClick={handleReopen}
                style={{
                  fontSize: 11,
                  padding: "5px 12px",
                  borderRadius: 6,
                  border: "1px solid #3F3F46",
                  background: "#18181B",
                  color: "#D4D4D8",
                  cursor: "pointer",
                }}
              >
                {t("reopen")}
              </button>
            )}
          </div>
        )}

        {/* Messages */}
        <TicketThread
          messages={messages}
          currentUserId={user?.id || ""}
          userName={ticket.user_name}
        />

        {/* Reply input */}
        {(!isResolved || ticket.status === "resolved") && (
          <TicketReplyInput
            ticketId={ticket.id}
            onSend={handleSend}
            disabled={ticket.status === "closed"}
          />
        )}
      </div>
    </div>
  );
}
