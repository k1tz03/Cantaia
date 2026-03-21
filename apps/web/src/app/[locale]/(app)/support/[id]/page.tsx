"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, AlertCircle, RotateCcw } from "lucide-react";
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
}

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
}

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-gray-400",
  medium: "bg-amber-400",
  high: "bg-red-500",
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
    } catch (e) {
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
    // Sending a message to a resolved ticket auto-reopens it
    await handleSend("Ticket rouvert par l'utilisateur.", []);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Chargement...</div>;
  }

  if (error || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
        <p className="text-muted-foreground">{error || "Ticket introuvable"}</p>
        <Link href="/support" className="mt-4 text-sm text-primary hover:underline">← Retour</Link>
      </div>
    );
  }

  const isResolved = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="mb-4">
        <Link href="/support" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4" />
          {t("myTickets")}
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{ticket.subject}</h1>
            <div className="mt-1.5 flex items-center gap-2">
              <TicketCategoryBadge category={ticket.category} />
              <TicketStatusBadge status={ticket.status} />
              <span className={`inline-block h-2 w-2 rounded-full ${PRIORITY_DOT[ticket.priority] || PRIORITY_DOT.medium}`} />
              <span className="text-xs text-muted-foreground">
                {new Date(ticket.created_at).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Resolved banner */}
      {isResolved && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-green-500/10 px-4 py-3">
          <p className="text-sm text-green-700 dark:text-green-400">
            {ticket.status === "resolved" ? t("resolvedBanner") : t("closedBanner")}
          </p>
          {ticket.status === "resolved" && (
            <button
              onClick={handleReopen}
              className="inline-flex items-center gap-1.5 rounded-md bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted border border-border"
            >
              <RotateCcw className="h-3 w-3" />
              {t("reopen")}
            </button>
          )}
        </div>
      )}

      {/* Thread */}
      <div className="flex-1 overflow-hidden rounded-lg border border-border flex flex-col min-h-0">
        <TicketThread messages={messages} currentUserId={user?.id || ""} />
        {!isResolved || ticket.status === "resolved" ? (
          <TicketReplyInput
            ticketId={ticket.id}
            onSend={handleSend}
            disabled={ticket.status === "closed"}
          />
        ) : null}
      </div>
    </div>
  );
}
