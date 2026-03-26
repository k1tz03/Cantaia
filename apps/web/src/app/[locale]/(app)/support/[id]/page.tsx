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
      <div className="flex items-center justify-center px-5 py-20 text-[#71717A] text-[13px]">
        Chargement...
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-20">
        <AlertCircle className="w-8 h-8 text-[#EF4444] mb-2" />
        <p className="text-[#71717A] text-sm">{error || "Ticket introuvable"}</p>
        <Link href="/support" className="mt-4 text-[13px] text-[#F97316] no-underline">
          {"\u2190"} Retour
        </Link>
      </div>
    );
  }

  const isResolved = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <div className="flex bg-[#0F0F11]" style={{ height: "calc(100vh - 48px)" }}>
      {/* Thread panel (full width for user view) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Detail header */}
        <div className="px-6 py-3.5 border-b border-[#27272A]">
          <Link
            href="/support"
            className="text-xs text-[#71717A] cursor-pointer flex items-center gap-1 mb-2 no-underline hover:text-[#D4D4D8]"
          >
            {"\u2190"} {t("myTickets")}
          </Link>
          <div className="font-display text-base font-bold text-[#FAFAFA]">
            {ticket.subject}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <TicketCategoryBadge category={ticket.category} />
            <TicketStatusBadge status={ticket.status} />
            <span
              className="w-[7px] h-[7px] rounded-full inline-block"
              style={{ background: PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.medium }}
            />
            <span className="text-[11px] text-[#71717A]">
              {formatDate(ticket.created_at)}
            </span>
          </div>
        </div>

        {/* Resolved banner */}
        {isResolved && (
          <div
            className="flex items-center justify-between px-6 py-2.5 border-b"
            style={{
              background: "rgba(16, 185, 129, 0.06)",
              borderBottomColor: "rgba(16, 185, 129, 0.15)",
            }}
          >
            <div className="text-xs text-[#34D399] font-medium flex items-center gap-1.5">
              {"\u2705"} {ticket.status === "resolved" ? t("resolvedBanner") : t("closedBanner")}
            </div>
            {ticket.status === "resolved" && (
              <button
                onClick={handleReopen}
                className="text-[11px] px-3 py-[5px] rounded-md border border-[#3F3F46] bg-[#18181B] text-[#D4D4D8] cursor-pointer"
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
