"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, ChevronDown, ChevronUp, X, Edit3, Send, Sparkles } from "lucide-react";

interface EmailDraft {
  id: string;
  email_record_id: string;
  subject: string;
  draft_body: string;
  draft_tone: string;
  confidence: number;
  status: string;
  created_at: string;
  email?: {
    id: string;
    sender_name: string;
    sender_email: string;
    subject: string;
    received_at: string;
  } | null;
}

interface AIDraftPanelProps {
  /** If provided, only show drafts for this email */
  emailRecordId?: string;
  /** Callback when a draft is accepted (e.g., to open compose with body) */
  onAcceptDraft?: (draft: EmailDraft) => void;
  /** Compact mode — for inline use within email detail */
  compact?: boolean;
}

export function AIDraftPanel({ emailRecordId, onAcceptDraft, compact = false }: AIDraftPanelProps) {
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(!compact);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const fetchDrafts = useCallback(async () => {
    try {
      const url = "/api/agents/drafts?status=pending&limit=20";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      let items: EmailDraft[] = data.drafts || [];

      // Filter by emailRecordId if provided
      if (emailRecordId) {
        items = items.filter((d) => d.email_record_id === emailRecordId);
      }

      setDrafts(items);
    } catch {
      // Silently ignore
    } finally {
      setLoading(false);
    }
  }, [emailRecordId]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const updateDraftStatus = async (draftId: string, status: string, editedBody?: string) => {
    try {
      const body: Record<string, unknown> = { draft_id: draftId, status };
      if (editedBody) body.edited_body = editedBody;

      await fetch("/api/agents/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      setEditingId(null);
    } catch {
      // Silently ignore
    }
  };

  const handleAccept = (draft: EmailDraft) => {
    if (onAcceptDraft) {
      onAcceptDraft(draft);
    }
    updateDraftStatus(draft.id, "accepted");
  };

  const handleDismiss = (draftId: string) => {
    updateDraftStatus(draftId, "dismissed");
  };

  const handleSaveEdit = (draftId: string) => {
    updateDraftStatus(draftId, "edited", editBody);
  };

  if (loading) {
    if (compact) return null;
    return (
      <div className="animate-pulse rounded-xl border border-[#27272A] bg-[#18181B] p-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-[#27272A]" />
          <div className="h-3 w-32 rounded bg-[#27272A]" />
        </div>
      </div>
    );
  }

  // In compact mode (inside email detail), hide when empty
  if (compact && drafts.length === 0) return null;

  return (
    <div className={`rounded-xl border border-[#F97316]/20 bg-[#F97316]/[0.03] ${compact ? "mt-3" : ""}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F97316]/[0.05] transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-5 h-5 rounded-md bg-[#F97316]/15">
            <Bot className="h-3 w-3 text-[#F97316]" />
          </div>
          <span className="text-[13px] font-semibold text-[#F97316]">
            {drafts.length > 0
              ? `${drafts.length} brouillon${drafts.length > 1 ? "s" : ""} IA`
              : "Brouillons IA"}
          </span>
          <span className="text-[11px] text-[#71717A]">Email Drafter</span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-[#71717A]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[#71717A]" />
        )}
      </button>

      {/* Draft list */}
      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {drafts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Sparkles className="h-7 w-7 text-[#27272A] mb-2" />
              <p className="text-[12px] text-[#52525B]">Aucun brouillon en attente</p>
              <p className="text-[11px] text-[#3F3F46] mt-1">
                L&apos;agent Email Drafter analyse chaque nuit vos emails en attente de réponse et prépare des brouillons.
              </p>
            </div>
          )}
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className="rounded-lg border border-[#27272A] bg-[#18181B] overflow-hidden"
            >
              {/* Draft header */}
              <div className="px-3 py-2 border-b border-[#27272A]/60 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="h-3 w-3 text-[#F97316] shrink-0" />
                  <span className="text-[12px] font-medium text-[#D4D4D8] truncate">
                    Re: {draft.email?.subject || draft.subject}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {draft.confidence >= 0.8 && (
                    <span className="text-[9px] font-medium bg-[#10B981]/15 text-[#10B981] px-1.5 py-0.5 rounded">
                      {Math.round(draft.confidence * 100)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Draft body */}
              {editingId === draft.id ? (
                <div className="p-3">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="w-full h-32 bg-[#0F0F11] border border-[#3F3F46] rounded-lg p-3 text-[12px] text-[#D4D4D8] resize-y focus:outline-none focus:border-[#F97316]/50"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-[11px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={() => handleSaveEdit(draft.id)}
                      className="px-3 py-1.5 text-[11px] font-medium bg-[#F97316] text-white rounded-md hover:bg-[#EA580C] transition-colors"
                    >
                      Sauvegarder
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3">
                  <p className="text-[12px] text-[#A1A1AA] whitespace-pre-wrap line-clamp-4 leading-relaxed">
                    {draft.draft_body}
                  </p>
                </div>
              )}

              {/* Draft actions */}
              {editingId !== draft.id && (
                <div className="px-3 py-2 border-t border-[#27272A]/60 flex items-center justify-between">
                  <span className="text-[10px] text-[#52525B]">
                    {draft.email?.sender_name || draft.email?.sender_email || ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDismiss(draft.id)}
                      className="p-1.5 rounded-md hover:bg-[#27272A] transition-colors"
                      title="Ignorer"
                    >
                      <X className="h-3.5 w-3.5 text-[#71717A]" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(draft.id);
                        setEditBody(draft.draft_body);
                      }}
                      className="p-1.5 rounded-md hover:bg-[#27272A] transition-colors"
                      title="Modifier"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-[#71717A]" />
                    </button>
                    <button
                      onClick={() => handleAccept(draft)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F97316]/15 text-[#F97316] text-[11px] font-medium hover:bg-[#F97316]/25 transition-colors"
                      title="Utiliser ce brouillon"
                    >
                      <Send className="h-3 w-3" />
                      Utiliser
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
