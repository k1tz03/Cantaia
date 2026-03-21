"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, AlertCircle, User, Building2, CreditCard, Calendar } from "lucide-react";
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
  user_name: string;
  user_email: string;
  org_name: string;
  org_plan: string;
  created_at: string;
}

export default function SuperAdminSupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Chargement...</div>;
  }

  if (error || !ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 flex gap-6 h-[calc(100vh-32px)]">
      {/* Main thread */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="mb-4">
          <Link href="/super-admin/support" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
            <ArrowLeft className="h-4 w-4" />
            {t("allTickets")}
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-semibold text-foreground">{ticket.subject}</h1>
              <div className="mt-1.5 flex items-center gap-2">
                <TicketCategoryBadge category={ticket.category} />
                <TicketStatusBadge status={ticket.status} />
              </div>
            </div>
            <select
              value={ticket.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            >
              <option value="open">{t("statusOpen")}</option>
              <option value="in_progress">{t("statusInProgress")}</option>
              <option value="resolved">{t("statusResolved")}</option>
              <option value="closed">{t("statusClosed")}</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-hidden rounded-lg border border-border flex flex-col min-h-0">
          <TicketThread messages={messages} currentUserId={user?.id || ""} />
          <TicketReplyInput ticketId={ticket.id} onSend={handleSend} />
        </div>
      </div>

      {/* User info sidebar */}
      <div className="w-72 shrink-0">
        <div className="rounded-lg border border-border bg-background p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">{t("userInfo")}</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{ticket.user_name || "—"}</p>
                <p className="text-xs text-muted-foreground">{ticket.user_email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-foreground">{ticket.org_name || "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-foreground capitalize">{ticket.org_plan || "trial"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {new Date(ticket.created_at).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
