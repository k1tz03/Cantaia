"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  Mail,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Send,
  Users,
  ListTodo,
  Archive,
  AlarmClock,
  X,
  Loader2,
  Check,
  MessageSquare,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Forward,
  RotateCcw,
  Sparkles,
  Inbox,
  Plus,
  Settings,
} from "lucide-react";
import DOMPurify from "dompurify";
import { useActiveProject } from "@/lib/contexts/active-project-context";

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

/** Sanitize HTML email body — allows images (data:image/*), styles, links */
function sanitizeEmailHtml(html: string): string {
  if (typeof window === "undefined") return ""; // SSR: don't render unsanitized HTML
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "div", "span", "br", "hr", "a", "b", "i", "u", "em", "strong",
      "table", "thead", "tbody", "tr", "td", "th", "caption", "colgroup", "col",
      "ul", "ol", "li", "blockquote", "pre", "code", "h1", "h2", "h3", "h4", "h5", "h6",
      "img", "figure", "figcaption", "sup", "sub", "small", "s", "del", "ins",
      "font", "center",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "style", "class", "id",
      "src", "alt", "width", "height", "title",
      "border", "cellpadding", "cellspacing", "align", "valign",
      "bgcolor", "color", "size", "face",
      "colspan", "rowspan",
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|data:image\/|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ADD_ATTR: ["target"],
  });
}

/** Check if a string looks like HTML */
function looksLikeHtml(s: string): boolean {
  return /<(?:p|div|br|table|html|body|img|span|a|ul|ol|h[1-6])\b/i.test(s);
}

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */

interface DecisionEmail {
  id: string;
  subject: string;
  sender_email: string;
  sender_name: string;
  body_preview: string;
  body_html?: string | null;
  body_text?: string | null;
  received_at: string;
  updated_at?: string;
  classification: string;
  ai_summary: string | null;
  ai_classification_confidence: number | null;
  project_id: string | null;
  project_name: string | null;
  is_processed: boolean;
  outlook_message_id: string | null;
  price_extracted: boolean;
  email_category: string | null;
  priority: "urgent" | "action" | "info";
  is_quote: boolean;
  price_indicator: {
    extracted_price?: number;
    market_median?: number;
    diff_percent?: number;
  } | null;
}

interface Stats {
  avgResponseTime: number;
  processedToday: number;
  totalUnprocessed: number;
  totalToday: number;
  savingsGenerated: number | null;
  decisionsUrgent: number;
  decisionsThisWeek: number;
  decisionsInfo: number;
}

interface OrgMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface ThreadMessage {
  id: string;
  subject: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  receivedDateTime: string;
  body: { content: string; contentType: string };
  bodyPreview: string;
  isCurrentMessage: boolean;
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function formatTime(email: DecisionEmail): string {
  const d = new Date(email.received_at);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3600000;
  if (diffH < 1) return `${Math.floor(diffMs / 60000)}min`;
  if (diffH < 24) return `${Math.floor(diffH)}h`;
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" });
}

function formatFullDate(dateStr: string, locale?: string): string {
  const d = new Date(dateStr);
  const l = locale === "de" ? "de-CH" : locale === "en" ? "en-CH" : "fr-CH";
  return d.toLocaleDateString(l, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string, isCurrentUser: boolean): string {
  if (isCurrentUser) return "#F97316";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ["#3B82F6", "#7C3AED", "#059669", "#D97706", "#DC2626", "#8B5CF6", "#0891B2"];
  return colors[Math.abs(hash) % colors.length];
}

function formatThreadDate(dateStr: string, locale?: string): string {
  const d = new Date(dateStr);
  const l = locale === "de" ? "de-CH" : locale === "en" ? "en-CH" : "fr-CH";
  return d.toLocaleDateString(l, { day: "2-digit", month: "2-digit" })
    + " " + d.toLocaleTimeString(l, { hour: "2-digit", minute: "2-digit" });
}

/** FIX 5 — Lock body scroll when a popup is open */
function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (locked) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [locked]);
}

function getClassificationLabel(classification: string): string {
  switch (classification) {
    case "urgent": return "Urgent";
    case "action_required": return "Action";
    case "waiting_response": return "Attente";
    case "info_only": return "Info";
    default: return classification;
  }
}

function getClassificationColor(classification: string): string {
  switch (classification) {
    case "urgent": return "bg-[#EF4444]/10 text-[#F87171]";
    case "action_required": return "bg-[#F59E0B]/10 text-[#FBBF24]";
    case "waiting_response": return "bg-[#8B5CF6]/10 text-[#A78BFA]";
    case "info_only": return "bg-[#71717A]/10 text-[#A1A1AA]";
    default: return "bg-[#71717A]/10 text-[#A1A1AA]";
  }
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function MailPage() {
  const router = useRouter();
  const t = useTranslations("mail.decisions");
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [urgent, setUrgent] = useState<DecisionEmail[]>([]);
  const [thisWeek, setThisWeek] = useState<DecisionEmail[]>([]);
  const [info, setInfo] = useState<DecisionEmail[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [decisionsToday, setDecisionsToday] = useState(0);
  const [isAloneInOrg, setIsAloneInOrg] = useState(true);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [generatingSummaries, setGeneratingSummaries] = useState(false);
  const [summaryToast, setSummaryToast] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"decisions" | "inbox">("decisions");
  const [hasEmailConnection, setHasEmailConnection] = useState(true); // assume true until proven false

  // 2-panel: selected email
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  // Modal states
  const [replyEmail, setReplyEmail] = useState<DecisionEmail | null>(null);
  const [delegateEmail, setDelegateEmail] = useState<DecisionEmail | null>(null);
  const [transferEmail, setTransferEmail] = useState<DecisionEmail | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  // FIX 5 — Lock body scroll when any popup is open
  const anyPopupOpen = !!(replyEmail || delegateEmail || transferEmail || composeOpen);
  useBodyScrollLock(anyPopupOpen);

  const { setActiveProject } = useActiveProject();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/mail/decisions");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      if (!data.success) {
        router.replace("/login");
        return;
      }
      setAuthorized(true);
      setFirstName(data.firstName);
      setUrgent(data.urgent);
      setThisWeek(data.thisWeek);
      setInfo(data.info);
      setStats(data.stats);
      setDecisionsToday(data.stats?.decisionsToday || data.stats?.processedToday || 0);
      setIsAloneInOrg(data.isAloneInOrg ?? true);
      setOrgMembers(data.orgMembers || []);
      if (data.hasEmailConnection !== undefined) setHasEmailConnection(data.hasEmailConnection);
    } catch {
      router.replace("/dashboard");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const syncEmails = useCallback(async () => {
    setSyncing(true);
    setSyncToast(null);
    try {
      const res = await fetch("/api/outlook/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success !== false) {
        const synced = data.emails_synced ?? data.newEmails ?? 0;
        setSyncToast(t("syncSuccess", { count: synced }));
        await fetchData();
      } else {
        setSyncToast(data.error || t("syncError"));
      }
    } catch {
      setSyncToast(t("connectionError"));
    }
    setSyncing(false);
    setTimeout(() => setSyncToast(null), 4000);
  }, [fetchData, t]);

  const dismissCard = useCallback(async (emailId: string, action: string, email?: DecisionEmail) => {
    setDismissedIds((prev) => new Set(prev).add(emailId));
    setDecisionsToday((d) => d + 1);
    // If the dismissed email is selected, clear selection
    setSelectedEmailId((prev) => prev === emailId ? null : prev);
    try {
      if (action === "archive") {
        await fetch(`/api/email/${emailId}/archive`, { method: "POST" });
      }
      await fetch("/api/mail/decisions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: emailId, action }),
      });

      // Fire-and-forget: notify learning engine for positive confirmation actions
      if ((action === "replied" || action === "accept") && email?.project_id) {
        fetch("/api/email/learn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email_id: emailId,
            feedback_type: "confirm",
            correct_project_id: email.project_id,
          }),
        }).catch(() => {});
      }
    } catch { /* non-blocking */ }
  }, []);

  const snoozeCard = useCallback(async (emailId: string) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    setDismissedIds((prev) => new Set(prev).add(emailId));
    setSelectedEmailId((prev) => prev === emailId ? null : prev);
    try {
      await fetch(`/api/email/${emailId}/snooze`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ until: tomorrow.toISOString() }),
      });
    } catch { /* non-blocking */ }
  }, []);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="h-full min-h-screen bg-[#0F0F11] flex flex-col">
        {/* Toolbar skeleton */}
        <div className="flex-shrink-0 h-14 border-b border-[#1C1C1F] flex items-center px-5 gap-4">
          <div className="h-5 w-24 animate-pulse rounded bg-[#27272A]" />
          <div className="h-4 w-48 animate-pulse rounded bg-[#1C1C1F]" />
          <div className="ml-auto flex gap-2">
            <div className="h-8 w-24 animate-pulse rounded-lg bg-[#1C1C1F]" />
            <div className="h-8 w-20 animate-pulse rounded-lg bg-[#1C1C1F]" />
          </div>
        </div>
        {/* KPI skeleton */}
        <div className="flex-shrink-0 h-[60px] border-b border-[#1C1C1F] flex">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1 px-5 py-3 border-r border-[#1C1C1F] last:border-r-0">
              <div className="h-3 w-20 animate-pulse rounded bg-[#1C1C1F] mb-2" />
              <div className="h-5 w-12 animate-pulse rounded bg-[#27272A]" />
            </div>
          ))}
        </div>
        {/* Panels skeleton */}
        <div className="flex-1 flex min-h-0">
          <div className="w-[420px] border-r border-[#1C1C1F]">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="px-4 py-3 border-b border-[#1C1C1F]">
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-lg animate-pulse bg-[#1C1C1F]" />
                  <div className="flex-1">
                    <div className="h-3.5 w-32 animate-pulse rounded bg-[#27272A] mb-2" />
                    <div className="h-3 w-48 animate-pulse rounded bg-[#1C1C1F] mb-1.5" />
                    <div className="h-2.5 w-40 animate-pulse rounded bg-[#1C1C1F]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="h-5 w-56 animate-pulse rounded bg-[#1C1C1F]" />
          </div>
        </div>
      </div>
    );
  }

  if (!authorized) return null;

  const filteredUrgent = urgent.filter((e) => !dismissedIds.has(e.id));
  const filteredThisWeek = thisWeek.filter((e) => !dismissedIds.has(e.id));
  const filteredInfo = info.filter((e) => !dismissedIds.has(e.id));

  const totalUnprocessed = filteredUrgent.length + filteredThisWeek.length;
  const totalWaiting = filteredInfo.length;

  // Find the selected email across all buckets
  const allEmails = [...filteredUrgent, ...filteredThisWeek, ...filteredInfo];
  const selectedEmail = allEmails.find((e) => e.id === selectedEmailId) || null;

  // Auto-select first email if none selected
  if (!selectedEmailId && allEmails.length > 0) {
    // Use a microtask to avoid setting state during render
    queueMicrotask(() => {
      setSelectedEmailId(allEmails[0].id);
      if (allEmails[0].project_id) setActiveProject(allEmails[0].project_id);
    });
  }

  const handleSelectEmail = (email: DecisionEmail) => {
    setSelectedEmailId(email.id);
    if (email.project_id) setActiveProject(email.project_id);
  };

  return (
    <div className="h-full min-h-screen bg-[#0F0F11] flex flex-col">
      {/* ═══ TOP TOOLBAR ═══ */}
      <div className="flex-shrink-0 h-14 border-b border-[#1C1C1F] flex items-center px-5 gap-4">
        {/* Left: title + counts */}
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-bold text-[#FAFAFA]" style={{ fontFamily: "var(--font-display), 'Plus Jakarta Sans', sans-serif" }}>
            Mail
          </h1>
          <span className="text-[12px] text-[#52525B]">
            {totalUnprocessed} non trait{totalUnprocessed !== 1 ? "s" : ""} &middot; {totalWaiting} en attente
          </span>
        </div>

        {/* Center spacer */}
        <div className="flex-1" />

        {/* Right: compose + toggle + sync + summaries */}
        <div className="flex items-center gap-2">
          {/* Compose new email button */}
          <button
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-[#F97316] hover:bg-[#EA580C] rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nouveau
          </button>

          {/* Decisions / Inbox toggle */}
          <div className="flex items-center bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("decisions")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors ${viewMode === "decisions" ? "bg-[#27272A] text-[#FAFAFA]" : "text-[#71717A] hover:text-[#A1A1AA]"}`}
            >
              <ListTodo className="w-3.5 h-3.5" />
              {"D\u00e9cisions"}
            </button>
            <button
              onClick={() => setViewMode("inbox")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors ${viewMode === "inbox" ? "bg-[#27272A] text-[#FAFAFA]" : "text-[#71717A] hover:text-[#A1A1AA]"}`}
            >
              <Inbox className="w-3.5 h-3.5" />
              Inbox
            </button>
          </div>

          {/* Sync button */}
          <button
            onClick={syncEmails}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#A1A1AA] bg-[#18181B] border border-[#27272A] rounded-lg hover:bg-[#27272A] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? t("syncing") : t("sync")}
          </button>

          {/* AI Summaries button */}
          <button
            onClick={async () => {
              setGeneratingSummaries(true);
              setSummaryToast(null);
              try {
                const res = await fetch("/api/mail/generate-summaries", { method: "POST" });
                const json = await res.json();
                if (json.success) {
                  setSummaryToast(t("summariesGenerated", { count: json.updated }));
                  if (json.updated > 0) fetchData();
                }
              } catch {}
              setGeneratingSummaries(false);
              setTimeout(() => setSummaryToast(null), 4000);
            }}
            disabled={generatingSummaries}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#F97316] bg-[#F97316]/10 border border-[#F97316]/20 rounded-lg hover:bg-[#F97316]/15 disabled:opacity-50 transition-colors"
          >
            {generatingSummaries ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {t("generateSummaries")}
          </button>
        </div>
      </div>

      {/* Toast messages */}
      {(syncToast || summaryToast) && (
        <div className="flex-shrink-0 px-5 py-2 bg-[#0F0F11] border-b border-[#1C1C1F]">
          <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[12px] text-emerald-400 flex items-center gap-2">
            <Check className="w-3.5 h-3.5" />{syncToast || summaryToast}
          </div>
        </div>
      )}

      {/* ═══ CONNECT EMAIL BANNER ═══ */}
      {!hasEmailConnection && authorized && (
        <div className="flex-shrink-0 px-5 py-3 bg-[#F97316]/5 border-b border-[#F97316]/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#F97316]/10 flex items-center justify-center">
                <Mail className="w-4 h-4 text-[#F97316]" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-[#FAFAFA]">Connectez votre email pour commencer</p>
                <p className="text-[11px] text-[#71717A]">Cantaia classera automatiquement vos emails par chantier et extraira les tâches</p>
              </div>
            </div>
            <a
              href={`/${locale}/settings?tab=outlook`}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold text-white bg-[#F97316] rounded-lg hover:bg-[#EA580C] transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Connecter Microsoft 365 / Gmail
            </a>
          </div>
        </div>
      )}

      {/* ═══ KPI STRIP ═══ */}
      {stats && (
        <div className="flex-shrink-0 border-b border-[#1C1C1F] flex">
          <KpiCell label={t("stats.responseTime")} value={`${stats.avgResponseTime}h`} sub="moyenne" />
          <KpiCell label={t("stats.emailsProcessed")} value={`${stats.processedToday}/${stats.totalToday}`} sub="aujourd'hui" />
          <KpiCell label={t("stats.decisionsToday")} value={String(decisionsToday)} sub="ce jour" />
          <KpiCell label={t("stats.savingsGenerated")} value={stats.savingsGenerated != null ? `CHF ${stats.savingsGenerated.toLocaleString("fr-CH")}` : "\u2014"} sub="estim." last />
        </div>
      )}

      {/* ═══ 2-PANEL MAIN CONTENT ═══ */}
      <div className="flex-1 flex min-h-0">
        {/* ── LEFT PANEL: Email list ── */}
        <div className="w-[420px] flex-shrink-0 border-r border-[#1C1C1F] flex flex-col min-h-0 bg-[#0F0F11]">
          <div className="flex-1 overflow-y-auto">
            {/* Urgent bucket */}
            {filteredUrgent.length > 0 && (
              <EmailBucket
                color="#EF4444"
                label="Urgentes"
                count={filteredUrgent.length}
                emails={filteredUrgent}
                selectedEmailId={selectedEmailId}
                onSelect={handleSelectEmail}
              />
            )}

            {/* This week bucket */}
            {filteredThisWeek.length > 0 && (
              <EmailBucket
                color="#F59E0B"
                label="Cette semaine"
                count={filteredThisWeek.length}
                emails={filteredThisWeek}
                selectedEmailId={selectedEmailId}
                onSelect={handleSelectEmail}
              />
            )}

            {/* Info bucket */}
            {filteredInfo.length > 0 && (
              <EmailBucket
                color="#71717A"
                label="Infos"
                count={filteredInfo.length}
                emails={filteredInfo}
                selectedEmailId={selectedEmailId}
                onSelect={handleSelectEmail}
              />
            )}

            {/* Empty list */}
            {allEmails.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-4 border border-emerald-500/20">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                </div>
                <p className="text-[13px] font-semibold text-[#FAFAFA] mb-1">{t("empty.title", { firstName })}</p>
                <p className="text-[11px] text-[#71717A] mb-4">{t("empty.subtitle")}</p>
                <button onClick={fetchData} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#A1A1AA] bg-[#18181B] border border-[#27272A] rounded-lg hover:bg-[#27272A] transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" />{t("actions.refresh")}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: Email detail ── */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#0F0F11]">
          {selectedEmail ? (
            <EmailDetailPanel
              email={selectedEmail}
              isAloneInOrg={isAloneInOrg}
              locale={locale}
              onReply={() => setReplyEmail(selectedEmail)}
              onDelegate={() => setDelegateEmail(selectedEmail)}
              onTransfer={() => setTransferEmail(selectedEmail)}
              onCreateTask={() => dismissCard(selectedEmail.id, "task")}
              onArchive={() => dismissCard(selectedEmail.id, "archive")}
              onSnooze={() => snoozeCard(selectedEmail.id)}
              onAccept={() => dismissCard(selectedEmail.id, "accept", selectedEmail)}
              onNegotiate={() => setReplyEmail(selectedEmail)}
              onRefuse={() => dismissCard(selectedEmail.id, "refuse")}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Mail className="w-10 h-10 text-[#27272A] mx-auto mb-3" />
                <p className="text-[13px] text-[#52525B]">Selectionnez un email pour voir son contenu</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MODALS ═══ */}

      {/* Reply Modal */}
      {replyEmail && (
        <ReplyModal
          email={replyEmail}
          onClose={() => setReplyEmail(null)}
          onDone={(emailId) => {
            const sentEmail = replyEmail;
            setReplyEmail(null);
            dismissCard(emailId, "replied", sentEmail);
          }}
        />
      )}

      {/* Delegate Modal */}
      {delegateEmail && (
        <DelegateModal
          email={delegateEmail}
          orgMembers={orgMembers}
          onClose={() => setDelegateEmail(null)}
          onDone={(emailId) => {
            setDelegateEmail(null);
            dismissCard(emailId, "delegated");
          }}
        />
      )}

      {/* Transfer Modal */}
      {transferEmail && (
        <TransferModal
          email={transferEmail}
          onClose={() => setTransferEmail(null)}
          onDone={(emailId) => {
            setTransferEmail(null);
            dismissCard(emailId, "delegated");
          }}
        />
      )}

      {/* Compose Modal */}
      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onSent={() => { setComposeOpen(false); fetchData(); }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   KPI CELL
   ═══════════════════════════════════════════════════════════ */

function KpiCell({ label, value, sub, last }: { label: string; value: string; sub?: string; last?: boolean }) {
  return (
    <div className={`flex-1 px-5 py-2.5 ${last ? "" : "border-r border-[#1C1C1F]"}`}>
      <div className="text-[9px] uppercase tracking-wider text-[#52525B] font-semibold">{label}</div>
      <div className="font-extrabold text-lg text-[#FAFAFA] mt-0.5 leading-tight" style={{ fontFamily: "var(--font-display), 'Plus Jakarta Sans', sans-serif" }}>{value}</div>
      {sub && <div className="text-[10px] text-[#3F3F46] mt-0.5">{sub}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EMAIL BUCKET (left panel section)
   ═══════════════════════════════════════════════════════════ */

function EmailBucket({ color, label, count, emails, selectedEmailId, onSelect }: {
  color: string;
  label: string;
  count: number;
  emails: DecisionEmail[];
  selectedEmailId: string | null;
  onSelect: (email: DecisionEmail) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div>
      {/* Bucket header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-2 bg-[#18181B] border-b border-[#1C1C1F] hover:bg-[#1C1C1F] transition-colors"
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">{label}</span>
        <span className="text-[11px] font-bold text-[#52525B]">{count}</span>
        <div className="flex-1" />
        {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-[#52525B]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#52525B]" />}
      </button>

      {/* Email rows */}
      {!collapsed && emails.map((email) => (
        <EmailRow
          key={email.id}
          email={email}
          isSelected={selectedEmailId === email.id}
          onSelect={() => onSelect(email)}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EMAIL ROW (left panel item)
   ═══════════════════════════════════════════════════════════ */

function EmailRow({ email, isSelected, onSelect }: {
  email: DecisionEmail;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const avatarColor = getAvatarColor(email.sender_name || email.sender_email, false);

  return (
    <div
      className={`flex gap-3 px-4 py-3 border-b border-[#1C1C1F] cursor-pointer transition-colors ${
        isSelected
          ? "bg-[#1C1209] border-l-[3px] border-l-[#F97316]"
          : "hover:bg-[#18181B] border-l-[3px] border-l-transparent"
      }`}
      onClick={onSelect}
    >
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] text-white font-semibold shrink-0"
        style={{ backgroundColor: avatarColor }}
      >
        {getInitials(email.sender_name || email.sender_email)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline">
          <span className="text-[13px] font-semibold text-[#FAFAFA] truncate">{email.sender_name || email.sender_email}</span>
          <span className="text-[10px] text-[#52525B] shrink-0 ml-2">{formatTime(email)}</span>
        </div>
        <div className="text-[12px] text-[#D4D4D8] truncate mt-0.5">{email.subject}</div>
        <div className="text-[11px] text-[#71717A] truncate mt-0.5">{email.ai_summary || email.body_preview}</div>
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {email.project_name && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#3B82F6]/10 text-[#60A5FA] font-medium">{email.project_name}</span>
          )}
          {email.classification && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${getClassificationColor(email.classification)}`}>
              {getClassificationLabel(email.classification)}
            </span>
          )}
          {email.is_quote && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#F59E0B]/10 text-[#FBBF24] font-medium">Devis</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EMAIL DETAIL PANEL (right panel)
   ═══════════════════════════════════════════════════════════ */

function EmailDetailPanel({ email, isAloneInOrg, locale, onReply, onDelegate, onTransfer, onCreateTask, onArchive, onSnooze, onAccept, onNegotiate, onRefuse }: {
  email: DecisionEmail;
  isAloneInOrg: boolean;
  locale: string;
  onReply: () => void;
  onDelegate: () => void;
  onTransfer: () => void;
  onCreateTask: () => void;
  onArchive: () => void;
  onSnooze: () => void;
  onAccept: () => void;
  onNegotiate: () => void;
  onRefuse: () => void;
}) {
  const t = useTranslations("mail.decisions");
  const [thread, setThread] = useState<ThreadMessage[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(true);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [fallbackBody, setFallbackBody] = useState<string>("");
  const [fallbackIsHtml, setFallbackIsHtml] = useState(false);

  // Reset on email change
  useEffect(() => {
    setThread(null);
    setThreadLoading(true);
    setThreadError(null);

    const immediateBody = email.body_html || email.body_text || email.body_preview || "";
    setFallbackBody(immediateBody);
    setFallbackIsHtml(looksLikeHtml(immediateBody));

    async function loadThread() {
      try {
        const res = await fetch(`/api/mail/emails/${email.id}/thread`);
        const data = await res.json();
        if (data.thread && data.thread.length > 0) {
          setThread(data.thread);
        } else {
          if (data.fallback) {
            const body = data.fallback.body || email.body_html || email.body_text || email.body_preview || "";
            setFallbackIsHtml(looksLikeHtml(body));
            setFallbackBody(body);
          }
          if (data.error) {
            setThreadError(t("email.threadUnavailable"));
          }
        }
      } catch {
        setThreadError(t("email.threadUnavailable"));
      }
      setThreadLoading(false);
    }
    loadThread();
  }, [email.id]);

  return (
    <>
      {/* ── Subject + Meta (non-scrollable) ── */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3">
        <h2 className="text-[18px] font-bold text-[#FAFAFA] leading-snug" style={{ fontFamily: "var(--font-display), 'Plus Jakarta Sans', sans-serif" }}>
          {email.subject}
        </h2>
        <div className="flex items-center gap-2 mt-2 text-[12px] text-[#71717A] flex-wrap">
          <span>De: <strong className="text-[#D4D4D8]">{email.sender_name || email.sender_email}</strong></span>
          <span className="text-[#3F3F46]">&middot;</span>
          <span>{formatFullDate(email.received_at, locale)}</span>
          {email.project_name && (
            <>
              <span className="text-[#3F3F46]">&middot;</span>
              <span className="px-1.5 py-0.5 rounded bg-[#3B82F6]/10 text-[#60A5FA] text-[10px] font-medium">{email.project_name}</span>
            </>
          )}
        </div>
      </div>

      {/* ── ACTION BAR (top) ── */}
      <div className="flex-shrink-0 px-5 py-2 border-b border-[#27272A] bg-[#18181B]/80 backdrop-blur-sm flex items-center gap-2">
        {/* Primary CTA */}
        {email.is_quote ? (
          <>
            <button onClick={onAccept} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">
              <ThumbsUp className="w-3.5 h-3.5" />{t("actions.accept")}
            </button>
            <button onClick={onNegotiate} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 rounded-lg transition-colors">
              <MessageSquare className="w-3.5 h-3.5" />{t("actions.negotiate")}
            </button>
            <button onClick={onRefuse} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 rounded-lg transition-colors">
              <ThumbsDown className="w-3.5 h-3.5" />{t("actions.refuse")}
            </button>
          </>
        ) : (
          <button onClick={onReply} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium text-white bg-[#F97316] hover:bg-[#EA580C] rounded-lg transition-colors">
            <Send className="w-3.5 h-3.5" />{t("actions.replyWithAI")}
          </button>
        )}

        {/* Secondary actions */}
        {!email.is_quote && (
          <button onClick={onReply} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#A1A1AA] bg-[#27272A] hover:bg-[#3F3F46] border border-[#3F3F46] rounded-lg transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />{"R\u00e9pondre"}
          </button>
        )}
        <button onClick={onTransfer} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#A1A1AA] bg-[#27272A] hover:bg-[#3F3F46] border border-[#3F3F46] rounded-lg transition-colors">
          <Forward className="w-3.5 h-3.5" />{t("actions.transfer")}
        </button>
        <button onClick={onCreateTask} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#A1A1AA] bg-[#27272A] hover:bg-[#3F3F46] border border-[#3F3F46] rounded-lg transition-colors">
          <ListTodo className="w-3.5 h-3.5" />{t("actions.createTask")}
        </button>
        {!isAloneInOrg && (
          <button onClick={onDelegate} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#A1A1AA] bg-[#27272A] hover:bg-[#3F3F46] border border-[#3F3F46] rounded-lg transition-colors">
            <Users className="w-3.5 h-3.5" />{t("actions.delegate")}
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right-side actions */}
        <button onClick={onSnooze} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#71717A] hover:text-[#A1A1AA] bg-[#18181B] hover:bg-[#27272A] border border-[#27272A] rounded-lg transition-colors">
          <AlarmClock className="w-3.5 h-3.5" />
        </button>
        <button onClick={onArchive} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#71717A] hover:text-red-400 bg-[#18181B] hover:bg-red-500/10 border border-[#27272A] rounded-lg transition-colors">
          <Archive className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* ── AI Summary card ── */}
        {email.ai_summary && (
          <div className="px-6 py-4">
            <div className="rounded-xl overflow-hidden border border-[#F97316]/15 bg-gradient-to-br from-[#1C1209] to-[#18130A]">
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3 h-3 text-[#F97316]" />
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#F97316]">{t("badges.aiSummary")}</span>
                </div>
                <p className="text-[13px] leading-relaxed text-[#D4D4D8]">{email.ai_summary}</p>

                {/* Detail chips */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  {email.price_indicator?.extracted_price != null && (
                    <span className="text-[10px] px-2 py-1 rounded-md bg-[#27272A] text-[#A1A1AA] border border-[#3F3F46]">
                      Montant: CHF {email.price_indicator.extracted_price.toLocaleString("fr-CH")}
                    </span>
                  )}
                  {email.is_quote && (
                    <span className="text-[10px] px-2 py-1 rounded-md bg-[#F59E0B]/10 text-[#FBBF24] border border-[#F59E0B]/20">
                      Devis
                    </span>
                  )}
                  {email.classification === "urgent" && (
                    <span className="text-[10px] px-2 py-1 rounded-md bg-[#EF4444]/10 text-[#F87171] border border-[#EF4444]/20">
                      Urgent
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Email body ── */}
        <div className="px-6 pb-4">
          {threadError && !thread && (
            <div className="mb-3 px-3 py-1.5 text-[11px] text-[#52525B] flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" />{threadError}
            </div>
          )}

          {thread && thread.length > 0 ? (
            <div>
              {/* Main message (last in thread) */}
              {(() => {
                const mainMsg = thread[thread.length - 1];
                const isHtml = mainMsg.body.contentType?.toLowerCase() === "html";
                return (
                  <div className="bg-[#18181B] rounded-xl border border-[#27272A] p-5">
                    {isHtml ? (
                      <div className="prose prose-sm max-w-none rounded-lg p-4 email-content email-content-dark" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(mainMsg.body.content) }} />
                    ) : (
                      <div className="text-[13px] text-[#D4D4D8] whitespace-pre-wrap leading-relaxed">{mainMsg.body.content}</div>
                    )}
                  </div>
                );
              })()}

              {/* Thread: previous messages */}
              {thread.length > 1 && (
                <div className="mt-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-px bg-[#27272A]" />
                    <span className="text-[10px] uppercase font-semibold text-[#52525B] tracking-wide">
                      {t("email.thread")} &middot; {thread.length - 1} message{thread.length - 1 > 1 ? "s" : ""} pr{thread.length - 1 > 1 ? "\u00e9c\u00e9dents" : "\u00e9c\u00e9dent"}
                    </span>
                    <div className="flex-1 h-px bg-[#27272A]" />
                  </div>
                  <ThreadView thread={thread.slice(0, -1)} currentUserEmail={email.sender_email} />
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#18181B] rounded-xl border border-[#27272A] p-5">
              {threadLoading && !fallbackBody ? (
                <div className="flex items-center gap-2 text-[#52525B] text-[13px] py-8 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />{t("email.loadingContent")}
                </div>
              ) : fallbackIsHtml ? (
                <div className="prose prose-sm max-w-none rounded-lg p-4 email-content email-content-dark" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(fallbackBody) }} />
              ) : (
                <div className="text-[13px] text-[#D4D4D8] whitespace-pre-wrap leading-relaxed">{fallbackBody}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   THREAD VIEW (reusable conversation thread component)
   ═══════════════════════════════════════════════════════════ */

function ThreadView({ thread, currentUserEmail }: {
  thread: ThreadMessage[];
  currentUserEmail?: string;
}) {
  const t = useTranslations("mail.decisions");
  const locale = useLocale();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    if (thread.length === 0) return new Set<string>();
    return new Set([thread[thread.length - 1].id]);
  });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {thread.map((msg) => {
        const isExpanded = expandedIds.has(msg.id);
        const isCurrentUser = currentUserEmail ? msg.from.email.toLowerCase() === currentUserEmail.toLowerCase() : false;
        const avatarColor = getAvatarColor(msg.from.name || msg.from.email, isCurrentUser);
        const initials = getInitials(msg.from.name || msg.from.email);
        const isHtml = msg.body.contentType?.toLowerCase() === "html";

        return (
          <div key={msg.id} className="rounded-lg border border-[#27272A] bg-[#18181B] overflow-hidden">
            <button
              onClick={() => toggleExpand(msg.id)}
              className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[#1C1C1F] transition-colors text-left"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{ background: avatarColor }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-[#FAFAFA] truncate">
                    {msg.from.name || msg.from.email}
                  </span>
                  {msg.isCurrentMessage && (
                    <span className="px-1.5 py-0.5 text-[9px] font-medium bg-[#F97316]/10 text-[#F97316] rounded">{t("email.mainMessage")}</span>
                  )}
                </div>
                {!isExpanded && (
                  <p className="text-[11px] text-[#52525B] truncate mt-0.5">{msg.bodyPreview}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-[#52525B]">{formatThreadDate(msg.receivedDateTime, locale)}</span>
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[#52525B]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#52525B]" />}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-[#27272A]">
                <div className="px-4 py-2 text-[11px] text-[#52525B] space-y-0.5 bg-[#0F0F11]/50">
                  <p>{t("email.from")} : {msg.from.name} &lt;{msg.from.email}&gt;</p>
                  {msg.to.length > 0 && (
                    <p>{t("email.to")} : {msg.to.map((r) => r.name || r.email).join(", ")}</p>
                  )}
                  {msg.cc.length > 0 && (
                    <p>{t("email.cc")} : {msg.cc.map((r) => r.name || r.email).join(", ")}</p>
                  )}
                </div>
                <div className="px-4 py-4">
                  {isHtml ? (
                    <div className="prose prose-sm max-w-none rounded-lg p-4 email-content email-content-dark" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(msg.body.content) }} />
                  ) : (
                    <div className="text-[13px] text-[#D4D4D8] whitespace-pre-wrap">{msg.body.content}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   REPLY MODAL (FIX 3 — centered popup, 2 columns, CC/CCI)
   ═══════════════════════════════════════════════════════════ */

function ReplyModal({ email, onClose, onDone }: {
  email: DecisionEmail;
  onClose: () => void;
  onDone: (emailId: string) => void;
}) {
  const t = useTranslations("mail.decisions");
  const [replyText, setReplyText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [thread, setThread] = useState<ThreadMessage[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(true);
  const [fallbackBody, setFallbackBody] = useState("");
  const [fallbackIsHtml, setFallbackIsHtml] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [instructions, setInstructions] = useState("");
  const [tone, setTone] = useState<string>("formal");
  const [replyLength, setReplyLength] = useState<string>("moyen");
  const [hasGenerated, setHasGenerated] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const threadContextRef = useRef<string>("");

  useEffect(() => {
    const immediateBody = email.body_html || email.body_text || email.body_preview || "";
    setFallbackBody(immediateBody);
    if (looksLikeHtml(immediateBody)) setFallbackIsHtml(true);

    async function loadThread() {
      try {
        const res = await fetch(`/api/mail/emails/${email.id}/thread`);
        const data = await res.json();
        if (data.thread && data.thread.length > 0) {
          setThread(data.thread);
          threadContextRef.current = data.thread.map((msg: ThreadMessage) =>
            `[${msg.receivedDateTime}] De: ${msg.from.name} <${msg.from.email}>\nObjet: ${msg.subject}\n${msg.bodyPreview || ""}`
          ).join("\n\n---\n\n");
        } else if (data.fallback) {
          const body = data.fallback.body || email.body_html || email.body_text || email.body_preview || "";
          if (looksLikeHtml(body)) setFallbackIsHtml(true);
          setFallbackBody(body);
        }
      } catch {}
      setThreadLoading(false);
    }
    loadThread();
  }, [email]);

  const generateReply = useCallback(async () => {
    setReplyLoading(true);
    setHasGenerated(true);
    try {
      const payload: Record<string, unknown> = { email_id: email.id };
      if (threadContextRef.current) payload.thread_context = threadContextRef.current;
      if (instructions.trim()) payload.instructions = instructions.trim();
      payload.tone = tone;
      payload.length = replyLength;
      const res = await fetch("/api/ai/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setReplyText(data.reply_text || "");
      }
    } catch { /* ignore */ }
    setReplyLoading(false);
  }, [email.id, instructions, tone, replyLength]);

  useEffect(() => {
    if (replyRef.current) {
      replyRef.current.style.height = "auto";
      replyRef.current.style.height = Math.max(200, replyRef.current.scrollHeight) + "px";
    }
  }, [replyText]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const [sendError, setSendError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const payload: Record<string, any> = {
        to: [email.sender_email],
        subject: t("email.rePrefix", { subject: email.subject }),
        body: replyText.replace(/\n/g, "<br>"),
        reply_to_id: email.outlook_message_id,
      };
      if (cc.trim()) payload.cc = cc.split(",").map((s: string) => s.trim()).filter(Boolean);
      if (bcc.trim()) payload.bcc = bcc.split(",").map((s: string) => s.trim()).filter(Boolean);

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: t("serverError") }));
        setSendError(data.error || `${t("replyModal.sendError")} (${res.status})`);
        setSending(false);
        return;
      }
      onDone(email.id);
    } catch {
      setSendError(t("connectionErrorNetwork"));
    }
    setSending(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60] overflow-hidden" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 overflow-hidden">
        <div
          className="bg-[#18181B] rounded-2xl shadow-2xl flex flex-col border border-[#27272A]"
          style={{ width: "75vw", maxWidth: "1100px", height: "85vh", maxHeight: "900px" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between bg-[#0F0F11] border-b border-[#27272A] rounded-t-2xl">
            <div>
              <h2 className="text-lg font-semibold text-[#FAFAFA]">
                {t("replyModal.title", { sender: email.sender_name || email.sender_email })}
              </h2>
              <p className="text-sm text-[#71717A] truncate mt-0.5">{email.subject}</p>
            </div>
            <button onClick={onClose} className="p-1.5 text-[#71717A] hover:text-[#FAFAFA] rounded-lg hover:bg-[#27272A] transition-colors flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body — 2 columns */}
          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            {/* Left: conversation thread */}
            <div className="md:w-[40%] border-r border-[#27272A] flex flex-col min-h-0">
              <div className="px-4 py-2 border-b border-[#27272A] flex-shrink-0">
                <span className="text-xs uppercase font-semibold tracking-wide text-[#52525B]">
                  {thread && thread.length > 1 ? t("email.conversation", { count: thread.length }) : t("email.originalEmail")}
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-[#0F0F11]" onWheel={(e) => e.stopPropagation()}>
                {thread && thread.length > 0 ? (
                  <ThreadView thread={thread} currentUserEmail={email.sender_email} />
                ) : (
                  <>
                    <div className="text-sm font-medium text-[#FAFAFA] mb-1">{email.subject}</div>
                    <div className="text-xs text-[#71717A] mb-3">{t("email.from")} : {email.sender_name || email.sender_email}</div>
                    {threadLoading && !fallbackBody ? (
                      <div className="flex items-center gap-2 text-[#71717A] text-sm py-4">
                        <Loader2 className="w-4 h-4 animate-spin" />{t("email.loading")}
                      </div>
                    ) : fallbackIsHtml ? (
                      <div className="prose prose-sm max-w-none rounded-lg p-4 email-content email-content-dark" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(fallbackBody) }} />
                    ) : (
                      <div className="text-sm text-[#A1A1AA] whitespace-pre-wrap">{fallbackBody}</div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right: reply */}
            <div className="md:w-[60%] flex flex-col min-h-0">
              <div className="flex-shrink-0 px-4 py-3 border-b border-[#27272A] bg-[#0F0F11] space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[#71717A] w-8 text-right">{t("email.to")} :</span>
                  <span className="text-[#FAFAFA] font-medium">{email.sender_email}</span>
                </div>
                {showCcBcc ? (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-[#71717A] w-8 text-right">{t("email.cc")} :</span>
                      <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} placeholder={t("replyModal.ccPlaceholder")} className="flex-1 px-2 py-1 border border-[#3F3F46] rounded text-sm bg-[#18181B] text-[#FAFAFA] focus:outline-none focus:ring-1 focus:ring-[#F97316]" />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-[#71717A] w-8 text-right">{t("email.bcc")} :</span>
                      <input type="text" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder={t("replyModal.bccPlaceholder")} className="flex-1 px-2 py-1 border border-[#3F3F46] rounded text-sm bg-[#18181B] text-[#FAFAFA] focus:outline-none focus:ring-1 focus:ring-[#F97316]" />
                    </div>
                  </>
                ) : (
                  <button onClick={() => setShowCcBcc(true)} className="text-xs text-[#F97316] hover:underline ml-10">
                    {t("replyModal.addCcBcc")}
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4" onWheel={(e) => e.stopPropagation()}>
                {/* AI Instructions panel */}
                {!hasGenerated && (
                  <div className="mb-4 p-4 rounded-xl border border-[#27272A] bg-[#0F0F11]">
                    <div className="mb-3">
                      <label className="text-[10px] uppercase font-semibold tracking-wider text-[#52525B] mb-2 block">Ton</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {[
                          { key: "formal", label: "Formel" },
                          { key: "casual", label: "Décontracté" },
                          { key: "urgent", label: "Urgent" },
                          { key: "empathique", label: "Empathique" },
                        ].map((opt) => (
                          <button key={opt.key} onClick={() => setTone(opt.key)} className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors ${tone === opt.key ? "bg-[#F97316]/10 text-[#F97316] border-[#F97316]/30" : "text-[#71717A] border-[#27272A] hover:border-[#3F3F46]"}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="text-[10px] uppercase font-semibold tracking-wider text-[#52525B] mb-2 block">Longueur</label>
                      <div className="flex gap-1.5">
                        {[
                          { key: "court", label: "Court" },
                          { key: "moyen", label: "Moyen" },
                          { key: "detaille", label: "Détaillé" },
                        ].map((opt) => (
                          <button key={opt.key} onClick={() => setReplyLength(opt.key)} className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors ${replyLength === opt.key ? "bg-[#F97316]/10 text-[#F97316] border-[#F97316]/30" : "text-[#71717A] border-[#27272A] hover:border-[#3F3F46]"}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="text-[10px] uppercase font-semibold tracking-wider text-[#52525B] mb-2 block">Instructions (optionnel)</label>
                      <textarea
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder={"Sur quel ton ? Que voulez-vous dire ? Ex: Dis-lui que le délai est repoussé à vendredi, ton amical"}
                        className="w-full h-20 p-2.5 text-[12px] border border-[#3F3F46] rounded-lg resize-none text-[#FAFAFA] bg-[#18181B] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={generateReply}
                        disabled={replyLoading}
                        className="flex-1 py-2 text-[12px] font-medium text-white bg-[#F97316] hover:bg-[#EA580C] rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {replyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {instructions.trim() ? "Générer avec instructions" : "Générer automatiquement"}
                      </button>
                    </div>
                  </div>
                )}

                {/* AI Suggestion card */}
                {hasGenerated && (
                <div className="rounded-lg overflow-hidden border-l-[3px] border-l-[#F97316] bg-gradient-to-br from-[#1C1209] to-[#18130A] border border-[#F9731625]">
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs uppercase font-semibold tracking-wide text-[#F97316]">{t("replyModal.aiSuggestion")}</span>
                      {!replyLoading && (
                        <button onClick={() => setHasGenerated(false)} className="inline-flex items-center gap-1 text-xs text-[#F97316] hover:text-[#FB923C] transition-colors">
                          <RotateCcw className="w-3 h-3" />{t("replyModal.regenerate")}
                        </button>
                      )}
                    </div>
                    {replyLoading ? (
                      <div className="flex items-center gap-2 text-[#F97316] text-sm py-8">
                        <Loader2 className="w-4 h-4 animate-spin" />{t("replyModal.generating")}
                      </div>
                    ) : (
                      <textarea
                        ref={replyRef}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="w-full p-3 text-sm rounded-lg resize-none border border-[#3F3F46] bg-[#18181B] text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                        style={{ minHeight: "200px" }}
                      />
                    )}
                  </div>
                </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-6 py-3 border-t border-[#27272A] bg-[#18181B] rounded-b-2xl">
            {sendError && (
              <div className="mb-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />{sendError}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSend}
                disabled={sending || replyLoading || !replyText.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[#F97316] hover:bg-[#EA580C] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t("replyModal.send")}
              </button>
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#71717A] hover:text-[#D4D4D8] transition-colors ml-auto">
                {t("replyModal.cancel")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   DELEGATE MODAL (FIX 4 — org members + task creation)
   ═══════════════════════════════════════════════════════════ */

function DelegateModal({ email, orgMembers, onClose, onDone }: {
  email: DecisionEmail;
  orgMembers: OrgMember[];
  onClose: () => void;
  onDone: (emailId: string) => void;
}) {
  const t = useTranslations("mail.decisions");
  const [selectedMember, setSelectedMember] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [emailBody, setEmailBody] = useState("");
  const [delegateError, setDelegateError] = useState<string | null>(null);

  useEffect(() => {
    async function loadBody() {
      if (!email.outlook_message_id) { setEmailBody(email.body_preview || ""); return; }
      try {
        const res = await fetch(`/api/outlook/email-body?message_id=${encodeURIComponent(email.outlook_message_id)}`);
        if (res.ok) { const data = await res.json(); setEmailBody(data.body || email.body_preview || ""); }
      } catch { setEmailBody(email.body_preview || ""); }
    }
    loadBody();
  }, [email]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleDelegate = async () => {
    if (!selectedMember) return;
    setSending(true);
    try {
      const member = orgMembers.find((m) => m.id === selectedMember);
      if (member) {
        await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [member.email],
            subject: t("email.fwdPrefix", { subject: email.subject }),
            body: `${message ? `<p>${message}</p><hr>` : ""}${emailBody}`,
            forward_id: email.outlook_message_id,
          }),
        });
        try {
          await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: t("delegateModal.taskTitle", { subject: email.subject }),
              description: message || t("delegateModal.taskDescription", { sender: email.sender_name || email.sender_email }),
              assigned_to: member.id,
              project_id: email.project_id,
              source: "email",
              priority: email.priority === "urgent" ? "high" : "medium",
            }),
          });
        } catch { /* non-blocking */ }
      }
      onDone(email.id);
    } catch {
      setDelegateError(t("delegateModal.error"));
    }
    setSending(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60] overflow-hidden" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 overflow-hidden">
        <div className="bg-[#18181B] rounded-2xl shadow-2xl flex flex-col w-full max-w-lg border border-[#27272A]" onClick={(e) => e.stopPropagation()}>
          <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between bg-[#0F0F11] border-b border-[#27272A] rounded-t-2xl">
            <h2 className="text-lg font-semibold text-[#FAFAFA]">{t("delegateModal.title")}</h2>
            <button onClick={onClose} className="p-1.5 text-[#71717A] hover:text-[#FAFAFA] rounded-lg hover:bg-[#27272A] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="text-sm text-[#A1A1AA] bg-[#27272A] rounded-lg p-3 border border-[#3F3F46]">
              <p className="font-medium text-[#FAFAFA] truncate">{email.subject}</p>
              <p className="text-xs text-[#71717A] mt-1">{t("email.from")} : {email.sender_name || email.sender_email}</p>
            </div>
            <div>
              <label className="block text-xs text-[#71717A] uppercase font-medium mb-2">{t("delegateModal.delegateTo")}</label>
              {orgMembers.length > 0 ? (
                <select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)} className="w-full p-2.5 border border-[#3F3F46] rounded-lg text-sm text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#F97316] bg-[#27272A]">
                  <option value="">{t("delegateModal.selectMember")}</option>
                  {orgMembers.map((m) => (<option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.email})</option>))}
                </select>
              ) : (
                <p className="text-sm text-[#71717A]">{t("delegateModal.noMembers")}</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-[#71717A] uppercase font-medium mb-2">{t("delegateModal.message")}</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("delegateModal.messagePlaceholder")} className="w-full h-24 p-3 text-sm border border-[#3F3F46] rounded-lg resize-none text-[#FAFAFA] bg-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#F97316]" />
            </div>
          </div>
          <div className="flex-shrink-0 px-6 py-4 border-t border-[#27272A]">
            {delegateError && (
              <div className="mb-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />{delegateError}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={handleDelegate} disabled={sending || !selectedMember} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[#F97316] hover:bg-[#EA580C] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                {t("delegateModal.confirm")}
              </button>
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#71717A] hover:text-[#D4D4D8] transition-colors ml-auto">
                {t("delegateModal.cancel")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   TRANSFER MODAL (FIX 4 — free email input, no task)
   ═══════════════════════════════════════════════════════════ */

function TransferModal({ email, onClose, onDone }: {
  email: DecisionEmail;
  onClose: () => void;
  onDone: (emailId: string) => void;
}) {
  const t = useTranslations("mail.decisions");
  const [toEmail, setToEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [emailBody, setEmailBody] = useState("");
  const [transferError, setTransferError] = useState<string | null>(null);

  useEffect(() => {
    async function loadBody() {
      if (!email.outlook_message_id) { setEmailBody(email.body_preview || ""); return; }
      try {
        const res = await fetch(`/api/outlook/email-body?message_id=${encodeURIComponent(email.outlook_message_id)}`);
        if (res.ok) { const data = await res.json(); setEmailBody(data.body || email.body_preview || ""); }
      } catch { setEmailBody(email.body_preview || ""); }
    }
    loadBody();
  }, [email]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleTransfer = async () => {
    if (!toEmail.trim()) return;
    setSending(true);
    try {
      await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [toEmail.trim()],
          subject: t("email.fwdPrefix", { subject: email.subject }),
          body: `${message ? `<p>${message}</p><hr>` : ""}${emailBody}`,
          forward_id: email.outlook_message_id,
        }),
      });
      onDone(email.id);
    } catch {
      setTransferError(t("transferModal.error"));
    }
    setSending(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60] overflow-hidden" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 overflow-hidden">
        <div className="bg-[#18181B] rounded-2xl shadow-2xl flex flex-col w-full max-w-lg border border-[#27272A]" onClick={(e) => e.stopPropagation()}>
          <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between bg-[#0F0F11] border-b border-[#27272A] rounded-t-2xl">
            <h2 className="text-lg font-semibold text-[#FAFAFA]">{t("transferModal.title")}</h2>
            <button onClick={onClose} className="p-1.5 text-[#71717A] hover:text-[#FAFAFA] rounded-lg hover:bg-[#27272A] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="text-sm text-[#A1A1AA] bg-[#27272A] rounded-lg p-3 border border-[#3F3F46]">
              <p className="font-medium text-[#FAFAFA] truncate">{email.subject}</p>
              <p className="text-xs text-[#71717A] mt-1">{t("email.from")} : {email.sender_name || email.sender_email}</p>
            </div>
            <div>
              <label className="block text-xs text-[#71717A] uppercase font-medium mb-2">{t("transferModal.transferTo")}</label>
              <input type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder={t("transferModal.recipientPlaceholder")} className="w-full px-3 py-2.5 border border-[#3F3F46] rounded-lg text-sm text-[#FAFAFA] bg-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#F97316]" />
            </div>
            <div>
              <label className="block text-xs text-[#71717A] uppercase font-medium mb-2">{t("transferModal.message")}</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("transferModal.messagePlaceholder")} className="w-full h-24 p-3 text-sm border border-[#3F3F46] rounded-lg resize-none text-[#FAFAFA] bg-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#F97316]" />
            </div>
          </div>
          <div className="flex-shrink-0 px-6 py-4 border-t border-[#27272A]">
            {transferError && (
              <div className="mb-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />{transferError}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={handleTransfer} disabled={sending || !toEmail.trim()} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[#F97316] hover:bg-[#EA580C] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Forward className="w-4 h-4" />}
                {t("transferModal.confirm")}
              </button>
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#71717A] hover:text-[#D4D4D8] transition-colors ml-auto">
                {t("transferModal.cancel")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   COMPOSE MODAL — New email with AI assist + project suggestion
   ═══════════════════════════════════════════════════════════ */

interface ContactSuggestion {
  email: string;
  name: string;
  source: string;
}

function ComposeModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [toEmails, setToEmails] = useState<string[]>([]);
  const [toInput, setToInput] = useState("");
  const [ccInput, setCcInput] = useState("");
  const [bccInput, setBccInput] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [contacts, setContacts] = useState<ContactSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // AI assist
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiTone, setAiTone] = useState("formal");
  const [aiLength, setAiLength] = useState("moyen");
  const [generating, setGenerating] = useState(false);

  // Project suggestion
  const [suggestedProject, setSuggestedProject] = useState<{ id: string; name: string } | null>(null);
  const [confirmedProject, setConfirmedProject] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Contact autocomplete
  useEffect(() => {
    if (toInput.length < 2) { setContacts([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/email/contacts?q=${encodeURIComponent(toInput)}`);
        if (res.ok) {
          const data = await res.json();
          setContacts(data.contacts || []);
          setShowSuggestions(true);
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [toInput]);

  // Project suggestion (when subject or recipients change)
  useEffect(() => {
    if (!subject && toEmails.length === 0) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/ai/suggest-project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipients: toEmails, subject, body_preview: body.slice(0, 200) }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.project_id) setSuggestedProject({ id: data.project_id, name: data.project_name });
        }
      } catch { /* ignore */ }
    }, 1000);
    return () => clearTimeout(timer);
  }, [subject, toEmails, body]);

  const addEmail = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (trimmed && !toEmails.includes(trimmed)) {
      setToEmails([...toEmails, trimmed]);
    }
    setToInput("");
    setShowSuggestions(false);
  };

  const removeEmail = (email: string) => {
    setToEmails(toEmails.filter((e) => e !== email));
  };

  const handleToKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === "," || e.key === "Tab") && toInput.trim()) {
      e.preventDefault();
      addEmail(toInput);
    }
    if (e.key === "Backspace" && !toInput && toEmails.length > 0) {
      setToEmails(toEmails.slice(0, -1));
    }
  };

  const handleGenerateAI = async () => {
    if (!aiInstructions.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/compose-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: aiInstructions,
          tone: aiTone,
          length: aiLength,
          recipients: toEmails,
          subject_hint: subject || undefined,
          project_id: confirmedProject || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.subject && !subject) setSubject(data.subject);
        if (data.body) setBody(data.body);
        setShowAiAssist(false);
      }
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const handleSend = async () => {
    if (!toEmails.length || !subject.trim() || !body.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const payload: Record<string, unknown> = {
        to: toEmails,
        subject,
        body: body.replace(/\n/g, "<br>"),
      };
      if (ccInput.trim()) payload.cc = ccInput.split(",").map((s: string) => s.trim()).filter(Boolean);
      if (bccInput.trim()) payload.bcc = bccInput.split(",").map((s: string) => s.trim()).filter(Boolean);

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSendError(data.error || "Erreur lors de l'envoi");
        setSending(false);
        return;
      }
      onSent();
    } catch {
      setSendError("Erreur réseau");
    }
    setSending(false);
  };

  const sourceLabel: Record<string, string> = { team: "Équipe", supplier: "Fournisseur", recent: "Récent", outlook: "Outlook" };
  const sourceColor: Record<string, string> = { team: "text-[#3B82F6]", supplier: "text-[#10B981]", recent: "text-[#71717A]", outlook: "text-[#F97316]" };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div
          className="bg-[#18181B] rounded-2xl shadow-2xl flex flex-col border border-[#27272A]"
          style={{ width: "700px", maxWidth: "90vw", height: "85vh", maxHeight: "800px" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between bg-[#0F0F11] border-b border-[#27272A] rounded-t-2xl">
            <h2 className="text-lg font-semibold text-[#FAFAFA]">Nouveau message</h2>
            <button onClick={onClose} className="p-1.5 text-[#71717A] hover:text-[#FAFAFA] rounded-lg hover:bg-[#27272A] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Recipients */}
          <div className="flex-shrink-0 px-6 py-3 border-b border-[#27272A] space-y-2 bg-[#0F0F11]">
            {/* To field */}
            <div className="flex items-start gap-2 relative">
              <span className="text-[12px] text-[#71717A] w-8 text-right pt-1.5">À :</span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-1 p-1.5 border border-[#3F3F46] rounded-lg bg-[#18181B] min-h-[36px]">
                  {toEmails.map((email) => (
                    <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-[#F97316]/10 text-[#F97316] rounded-md border border-[#F97316]/20">
                      {email}
                      <button onClick={() => removeEmail(email)} className="hover:text-white">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={toInput}
                    onChange={(e) => setToInput(e.target.value)}
                    onKeyDown={handleToKeyDown}
                    onBlur={() => { if (toInput.trim()) addEmail(toInput); setTimeout(() => setShowSuggestions(false), 200); }}
                    placeholder={toEmails.length ? "" : "Ajouter un destinataire..."}
                    className="flex-1 min-w-[120px] bg-transparent text-[12px] text-[#FAFAFA] outline-none placeholder:text-[#52525B] py-0.5"
                  />
                </div>
                {/* Autocomplete dropdown */}
                {showSuggestions && contacts.length > 0 && (
                  <div className="absolute left-10 right-0 top-full mt-1 bg-[#18181B] border border-[#27272A] rounded-lg shadow-xl z-10 max-h-40 overflow-y-auto">
                    {contacts.map((c) => (
                      <button
                        key={c.email}
                        onClick={() => addEmail(c.email)}
                        className="w-full px-3 py-2 text-left hover:bg-[#27272A] transition-colors flex items-center gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] text-[#FAFAFA] truncate">{c.name}</div>
                          <div className="text-[10px] text-[#52525B] truncate">{c.email}</div>
                        </div>
                        <span className={`text-[9px] font-medium ${sourceColor[c.source] || "text-[#52525B]"}`}>{sourceLabel[c.source] || c.source}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* CC/BCC toggle */}
            {showCcBcc ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#71717A] w-8 text-right">CC :</span>
                  <input type="text" value={ccInput} onChange={(e) => setCcInput(e.target.value)} placeholder="CC..." className="flex-1 px-2 py-1.5 border border-[#3F3F46] rounded-lg text-[12px] bg-[#18181B] text-[#FAFAFA] focus:outline-none focus:ring-1 focus:ring-[#F97316]" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#71717A] w-8 text-right">CCI :</span>
                  <input type="text" value={bccInput} onChange={(e) => setBccInput(e.target.value)} placeholder="CCI..." className="flex-1 px-2 py-1.5 border border-[#3F3F46] rounded-lg text-[12px] bg-[#18181B] text-[#FAFAFA] focus:outline-none focus:ring-1 focus:ring-[#F97316]" />
                </div>
              </>
            ) : (
              <button onClick={() => setShowCcBcc(true)} className="text-[11px] text-[#F97316] hover:underline ml-10">
                Ajouter CC / CCI
              </button>
            )}

            {/* Subject */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#71717A] w-8 text-right">Objet :</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Objet de l'email..."
                className="flex-1 px-2 py-1.5 border border-[#3F3F46] rounded-lg text-[12px] bg-[#18181B] text-[#FAFAFA] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
              />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Rédigez votre message..."
              className="w-full h-full min-h-[200px] p-3 text-[13px] border border-[#3F3F46] rounded-lg resize-none text-[#FAFAFA] bg-[#0F0F11] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#F97316] leading-relaxed"
            />
          </div>

          {/* AI Assist panel */}
          <div className="flex-shrink-0 border-t border-[#27272A]">
            <button
              onClick={() => setShowAiAssist(!showAiAssist)}
              className="w-full px-6 py-2.5 flex items-center gap-2 text-[12px] font-medium text-[#F97316] hover:bg-[#27272A]/30 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Assistance IA
              <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${showAiAssist ? "rotate-180" : ""}`} />
            </button>
            {showAiAssist && (
              <div className="px-6 pb-4 space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-semibold tracking-wider text-[#52525B] mb-1.5 block">Ton</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {[{ key: "formal", label: "Formel" }, { key: "casual", label: "Décontracté" }, { key: "urgent", label: "Urgent" }, { key: "empathique", label: "Empathique" }].map((opt) => (
                        <button key={opt.key} onClick={() => setAiTone(opt.key)} className={`px-2 py-1 text-[10px] rounded-lg border transition-colors ${aiTone === opt.key ? "bg-[#F97316]/10 text-[#F97316] border-[#F97316]/30" : "text-[#71717A] border-[#27272A] hover:border-[#3F3F46]"}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-semibold tracking-wider text-[#52525B] mb-1.5 block">Longueur</label>
                    <div className="flex gap-1.5">
                      {[{ key: "court", label: "Court" }, { key: "moyen", label: "Moyen" }, { key: "detaille", label: "Détaillé" }].map((opt) => (
                        <button key={opt.key} onClick={() => setAiLength(opt.key)} className={`px-2 py-1 text-[10px] rounded-lg border transition-colors ${aiLength === opt.key ? "bg-[#F97316]/10 text-[#F97316] border-[#F97316]/30" : "text-[#71717A] border-[#27272A] hover:border-[#3F3F46]"}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <textarea
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                  placeholder="Décrivez l'email que vous voulez écrire... Ex: Demande de confirmation du planning pour la semaine prochaine, ton amical"
                  className="w-full h-16 p-2.5 text-[11px] border border-[#3F3F46] rounded-lg resize-none text-[#FAFAFA] bg-[#18181B] placeholder:text-[#52525B] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                />
                <button
                  onClick={handleGenerateAI}
                  disabled={generating || !aiInstructions.trim()}
                  className="w-full py-2 text-[12px] font-medium text-white bg-[#F97316] hover:bg-[#EA580C] rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {generating ? "Génération..." : "Générer avec IA"}
                </button>
              </div>
            )}
          </div>

          {/* Project suggestion */}
          {suggestedProject && !confirmedProject && (
            <div className="flex-shrink-0 px-6 py-2.5 border-t border-[#27272A] bg-[#3B82F6]/5 flex items-center gap-3">
              <span className="text-[11px] text-[#60A5FA]">
                Cet email semble concerner <strong>{suggestedProject.name}</strong>
              </span>
              <button onClick={() => setConfirmedProject(suggestedProject.id)} className="text-[10px] px-2 py-0.5 bg-[#3B82F6]/10 text-[#60A5FA] border border-[#3B82F6]/20 rounded hover:bg-[#3B82F6]/20 transition-colors">
                Confirmer
              </button>
              <button onClick={() => setSuggestedProject(null)} className="text-[10px] text-[#52525B] hover:text-[#71717A]">
                Ignorer
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="flex-shrink-0 px-6 py-3 border-t border-[#27272A] bg-[#18181B] rounded-b-2xl">
            {sendError && (
              <div className="mb-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[12px] text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />{sendError}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSend}
                disabled={sending || !toEmails.length || !subject.trim() || !body.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 text-[13px] font-medium text-white bg-[#F97316] hover:bg-[#EA580C] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Envoyer
              </button>
              <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-[#71717A] hover:text-[#D4D4D8] transition-colors ml-auto">
                Annuler
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
