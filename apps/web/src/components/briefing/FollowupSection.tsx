"use client";

import { useState, useEffect } from "react";
import { Bot, AlertTriangle, Clock, FileX, Calendar, ChevronDown, ChevronUp, Check, X, Timer, Send } from "lucide-react";

interface FollowupItem {
  id: string;
  followup_type: string;
  source_type: string;
  title: string;
  description: string | null;
  urgency: "low" | "medium" | "high" | "critical";
  suggested_action: string | null;
  draft_email_subject: string | null;
  draft_email_body: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  days_overdue: number | null;
  status: string;
  created_at: string;
}

const URGENCY_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: "text-[#EF4444]", bg: "bg-[#EF4444]/10", label: "Critique" },
  high: { color: "text-[#F97316]", bg: "bg-[#F97316]/10", label: "Haute" },
  medium: { color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10", label: "Moyenne" },
  low: { color: "text-[#3B82F6]", bg: "bg-[#3B82F6]/10", label: "Basse" },
};

const TYPE_ICONS: Record<string, { icon: typeof AlertTriangle; label: string }> = {
  price_request_no_response: { icon: Clock, label: "Demande de prix sans reponse" },
  overdue_task: { icon: AlertTriangle, label: "Tache en retard" },
  missing_document: { icon: FileX, label: "Document manquant" },
  reserve_no_deadline: { icon: Calendar, label: "Reserve sans echeance" },
  submission_deadline: { icon: Calendar, label: "Echeance soumission" },
};

export function FollowupSection() {
  const [followups, setFollowups] = useState<FollowupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [showDraftId, setShowDraftId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/agents/followups?status=pending&limit=20")
      .then((r) => r.json())
      .then((data) => setFollowups(data.followups || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (id: string, status: string, snoozedUntil?: string) => {
    try {
      const body: Record<string, unknown> = { followup_id: id, status };
      if (snoozedUntil) body.snoozed_until = snoozedUntil;

      await fetch("/api/agents/followups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setFollowups((prev) => prev.filter((f) => f.id !== id));
    } catch {
      // Silently ignore
    }
  };

  const handleSnooze = (id: string) => {
    // Snooze for 3 days
    const snoozeDate = new Date();
    snoozeDate.setDate(snoozeDate.getDate() + 3);
    updateStatus(id, "snoozed", snoozeDate.toISOString());
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-[#27272A] animate-pulse" />
          <div className="h-4 w-40 rounded bg-[#27272A] animate-pulse" />
        </div>
      </div>
    );
  }

  const criticalCount = followups.filter((f) => f.urgency === "critical").length;
  const highCount = followups.filter((f) => f.urgency === "high").length;

  return (
    <div className="rounded-xl border border-[#27272A] bg-[#18181B] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1C1C1F] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#F59E0B]/10">
            <Bot className="h-3.5 w-3.5 text-[#F59E0B]" />
          </div>
          <div>
            <span className="text-[13px] font-semibold text-[#FAFAFA]">
              {followups.length > 0
                ? `${followups.length} relance${followups.length > 1 ? "s" : ""} en attente`
                : "Relances automatiques"}
            </span>
            <span className="text-[11px] text-[#71717A] ml-2">Followup Engine</span>
          </div>
          {/* Urgency pills */}
          <div className="flex items-center gap-1.5 ml-2">
            {criticalCount > 0 && (
              <span className="text-[10px] font-semibold bg-[#EF4444]/15 text-[#EF4444] px-1.5 py-0.5 rounded">
                {criticalCount} critique{criticalCount > 1 ? "s" : ""}
              </span>
            )}
            {highCount > 0 && (
              <span className="text-[10px] font-semibold bg-[#F97316]/15 text-[#F97316] px-1.5 py-0.5 rounded">
                {highCount} haute{highCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-[#71717A]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[#71717A]" />
        )}
      </button>

      {/* Followup list */}
      {expanded && (
        <div className="border-t border-[#27272A]">
          {followups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center px-6">
              <Clock className="h-8 w-8 text-[#27272A] mb-3" />
              <p className="text-[13px] text-[#52525B]">Aucune relance en attente</p>
              <p className="text-[11px] text-[#3F3F46] mt-1">
                L&apos;agent Followup Engine analyse chaque jour vos demandes de prix, tâches et réserves pour détecter les retards.
              </p>
            </div>
          )}
          {followups.map((item) => {
            const urgencyStyle = URGENCY_STYLES[item.urgency] || URGENCY_STYLES.medium;
            const typeInfo = TYPE_ICONS[item.followup_type] || TYPE_ICONS.overdue_task;
            const TypeIcon = typeInfo.icon;
            const hasDraft = item.draft_email_subject && item.draft_email_body;

            return (
              <div key={item.id} className="border-b border-[#27272A]/50 last:border-b-0">
                <div className="flex gap-3 px-4 py-3 hover:bg-[#1C1C1F]/50 transition-colors">
                  {/* Urgency indicator */}
                  <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${urgencyStyle.bg} shrink-0 mt-0.5`}>
                    <TypeIcon className={`h-3.5 w-3.5 ${urgencyStyle.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium text-[#FAFAFA]">{item.title}</p>
                      <span className={`text-[9px] font-semibold ${urgencyStyle.color} ${urgencyStyle.bg} px-1.5 py-0.5 rounded shrink-0`}>
                        {urgencyStyle.label}
                      </span>
                    </div>

                    {item.description && (
                      <p className="text-[12px] text-[#A1A1AA] mt-1 line-clamp-2">{item.description}</p>
                    )}

                    {item.days_overdue && item.days_overdue > 0 && (
                      <p className="text-[11px] text-[#EF4444] mt-1">
                        {item.days_overdue} jour{item.days_overdue > 1 ? "s" : ""} de retard
                      </p>
                    )}

                    {item.suggested_action && (
                      <p className="text-[11px] text-[#F97316] mt-1">
                        {item.suggested_action}
                      </p>
                    )}

                    {/* Recipient */}
                    {item.recipient_name && (
                      <p className="text-[10px] text-[#52525B] mt-1">
                        {item.recipient_name} {item.recipient_email ? `<${item.recipient_email}>` : ""}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-start gap-1 shrink-0 ml-2">
                    <button
                      onClick={() => updateStatus(item.id, "dismissed")}
                      className="p-1.5 rounded-md hover:bg-[#27272A] transition-colors"
                      title="Ignorer"
                    >
                      <X className="h-3.5 w-3.5 text-[#52525B]" />
                    </button>
                    <button
                      onClick={() => handleSnooze(item.id)}
                      className="p-1.5 rounded-md hover:bg-[#27272A] transition-colors"
                      title="Reporter (3 jours)"
                    >
                      <Timer className="h-3.5 w-3.5 text-[#52525B]" />
                    </button>
                    {hasDraft && (
                      <button
                        onClick={() => setShowDraftId(showDraftId === item.id ? null : item.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#F97316]/15 text-[#F97316] text-[11px] font-medium hover:bg-[#F97316]/25 transition-colors"
                        title="Voir le brouillon d'email"
                      >
                        <Send className="h-3 w-3" />
                        Email
                      </button>
                    )}
                    <button
                      onClick={() => updateStatus(item.id, "approved")}
                      className="p-1.5 rounded-md hover:bg-[#10B981]/15 transition-colors"
                      title="Valider"
                    >
                      <Check className="h-3.5 w-3.5 text-[#10B981]" />
                    </button>
                  </div>
                </div>

                {/* Draft email preview */}
                {showDraftId === item.id && hasDraft && (
                  <div className="mx-4 mb-3 rounded-lg border border-[#27272A] bg-[#0F0F11] p-3">
                    <p className="text-[11px] font-medium text-[#D4D4D8] mb-1">
                      Objet : {item.draft_email_subject}
                    </p>
                    <p className="text-[11px] text-[#A1A1AA] whitespace-pre-wrap leading-relaxed">
                      {item.draft_email_body}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
