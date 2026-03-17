"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Mail,
  CheckCircle2,
  TrendingDown,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Send,
  Eye,
  Users,
  ListTodo,
  Archive,
  AlarmClock,
  ExternalLink,
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
} from "lucide-react";
import DOMPurify from "dompurify";

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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}

function formatDate(): string {
  const now = new Date();
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string, isCurrentUser: boolean): string {
  if (isCurrentUser) return "#2563EB";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ["#6B7280", "#8B5CF6", "#059669", "#D97706", "#DC2626", "#7C3AED", "#0891B2"];
  return colors[Math.abs(hash) % colors.length];
}

function formatThreadDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })
    + " " + d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
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

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function MailPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [urgent, setUrgent] = useState<DecisionEmail[]>([]);
  const [thisWeek, setThisWeek] = useState<DecisionEmail[]>([]);
  const [info, setInfo] = useState<DecisionEmail[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "urgent" | "thisWeek" | "info">("all");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [decisionsToday, setDecisionsToday] = useState(0);
  const [isAloneInOrg, setIsAloneInOrg] = useState(true);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [generatingSummaries, setGeneratingSummaries] = useState(false);
  const [summaryToast, setSummaryToast] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillToast, setBackfillToast] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // Modal states
  const [modalEmail, setModalEmail] = useState<DecisionEmail | null>(null);
  const [replyEmail, setReplyEmail] = useState<DecisionEmail | null>(null);
  const [delegateEmail, setDelegateEmail] = useState<DecisionEmail | null>(null);
  const [transferEmail, setTransferEmail] = useState<DecisionEmail | null>(null);

  // FIX 5 — Lock body scroll when any popup is open
  const anyPopupOpen = !!(modalEmail || replyEmail || delegateEmail || transferEmail);
  useBodyScrollLock(anyPopupOpen);

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
        setSyncToast(`${synced} email${synced !== 1 ? "s" : ""} synchronisé${synced !== 1 ? "s" : ""}`);
        await fetchData();
      } else {
        setSyncToast(data.error || "Erreur de synchronisation");
      }
    } catch {
      setSyncToast("Erreur de connexion");
    }
    setSyncing(false);
    setTimeout(() => setSyncToast(null), 4000);
  }, [fetchData]);

  const dismissCard = useCallback(async (emailId: string, action: string) => {
    setDismissedIds((prev) => new Set(prev).add(emailId));
    setDecisionsToday((d) => d + 1);
    try {
      if (action === "archive") {
        await fetch(`/api/email/${emailId}/archive`, { method: "POST" });
      }
      await fetch("/api/mail/decisions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: emailId, action }),
      });
    } catch { /* non-blocking */ }
  }, []);

  const snoozeCard = useCallback(async (emailId: string) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    setDismissedIds((prev) => new Set(prev).add(emailId));
    try {
      await fetch(`/api/email/${emailId}/snooze`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ until: tomorrow.toISOString() }),
      });
    } catch { /* non-blocking */ }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB]">
        <div className="max-w-[860px] mx-auto px-4 pt-8 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="h-7 w-72 animate-pulse rounded-lg bg-gray-200" />
              <div className="mt-2 h-4 w-48 animate-pulse rounded-lg bg-gray-100" />
            </div>
            <div className="h-9 w-32 animate-pulse rounded-lg bg-gray-200" />
          </div>
          <div className="flex gap-3 mt-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 w-36 animate-pulse rounded-full bg-gray-100" />
            ))}
          </div>
        </div>
        <div className="max-w-[860px] mx-auto px-4 pb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <div className="h-3 w-24 animate-pulse rounded bg-gray-100 mb-3" />
                <div className="h-6 w-16 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
        <div className="max-w-[860px] mx-auto px-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 border-l-4 border-l-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
              </div>
              <div className="h-4 w-full animate-pulse rounded bg-gray-100 mb-2" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100 mb-4" />
              <div className="flex gap-2">
                <div className="h-8 w-36 animate-pulse rounded-lg bg-blue-100" />
                <div className="h-8 w-28 animate-pulse rounded-lg bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!authorized) return null;

  const filteredUrgent = urgent.filter((e) => !dismissedIds.has(e.id));
  const filteredThisWeek = thisWeek.filter((e) => !dismissedIds.has(e.id));
  const filteredInfo = info.filter((e) => !dismissedIds.has(e.id));

  let visibleCards: DecisionEmail[] = [];
  if (activeFilter === "all") visibleCards = [...filteredUrgent, ...filteredThisWeek];
  else if (activeFilter === "urgent") visibleCards = filteredUrgent;
  else if (activeFilter === "thisWeek") visibleCards = filteredThisWeek;

  const isEmpty = visibleCards.length === 0 && activeFilter !== "info";

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <div className="max-w-[860px] mx-auto px-4 pt-8 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#111827]" style={{ fontFamily: "var(--font-display), 'Plus Jakarta Sans', sans-serif" }}>
              Bonjour {firstName}
            </h1>
            <p className="text-[13px] text-gray-500 mt-1">
              {formatDate()}
              <span className="mx-2 text-gray-300">·</span>
              {filteredUrgent.length + filteredThisWeek.length + filteredInfo.length} emails en attente
            </p>
          </div>
          <button
            onClick={syncEmails}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition-all shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sync..." : "Synchroniser"}
          </button>
        </div>

        {syncToast && (
          <div className="mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
            <Check className="w-4 h-4" />{syncToast}
          </div>
        )}

        {/* Filter pills */}
        <div className="flex gap-2.5 mt-5">
          <FilterPill active={activeFilter === "urgent"} color="red" count={filteredUrgent.length} label="Urgentes" onClick={() => setActiveFilter(activeFilter === "urgent" ? "all" : "urgent")} />
          <FilterPill active={activeFilter === "thisWeek"} color="amber" count={filteredThisWeek.length} label="Cette semaine" onClick={() => setActiveFilter(activeFilter === "thisWeek" ? "all" : "thisWeek")} />
          <FilterPill active={activeFilter === "info"} color="gray" count={filteredInfo.length} label="Infos" onClick={() => setActiveFilter(activeFilter === "info" ? "all" : "info")} />
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="max-w-[860px] mx-auto px-4 pb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Clock className="w-4 h-4" />} label="Temps moyen de réponse" value={`${stats.avgResponseTime}h`} />
            <StatCard icon={<Mail className="w-4 h-4" />} label="Emails traités" value={`${stats.processedToday} / ${stats.totalToday}`} />
            <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Décisions aujourd'hui" value={String(decisionsToday)} />
            <StatCard icon={<TrendingDown className="w-4 h-4" />} label="Économies générées" value={stats.savingsGenerated != null ? `CHF ${stats.savingsGenerated.toLocaleString("fr-CH")}` : "—"} />
          </div>
        </div>
      )}

      {/* Decision cards */}
      <div className="max-w-[860px] mx-auto px-4 pb-8">
        {activeFilter === "info" ? (
          <InfoSection
            emails={filteredInfo}
            onArchive={(id) => dismissCard(id, "archive")}
            onArchiveAll={() => { for (const e of filteredInfo) dismissCard(e.id, "archive"); }}
            onView={(email) => setModalEmail(email)}
            onCreateTask={(id) => dismissCard(id, "task")}
            onReply={(email) => setReplyEmail(email)}
          />
        ) : isEmpty ? (
          <EmptyState firstName={firstName} onRefresh={fetchData} />
        ) : (
          <div className="space-y-4">
            {visibleCards.map((email) => (
              <DecisionCard
                key={email.id}
                email={email}
                isAloneInOrg={isAloneInOrg}
                onReply={() => setReplyEmail(email)}
                onView={() => setModalEmail(email)}
                onDelegate={() => setDelegateEmail(email)}
                onTransfer={() => setTransferEmail(email)}
                onCreateTask={() => dismissCard(email.id, "task")}
                onArchive={() => dismissCard(email.id, "archive")}
                onSnooze={() => snoozeCard(email.id)}
                onAccept={() => dismissCard(email.id, "accept")}
                onNegotiate={() => setReplyEmail(email)}
                onRefuse={() => dismissCard(email.id, "refuse")}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info section below decisions */}
      {activeFilter !== "info" && filteredInfo.length > 0 && (
        <div className="max-w-[860px] mx-auto px-4 pb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#111827]" style={{ fontFamily: "var(--font-display), 'Plus Jakarta Sans', sans-serif" }}>Emails non lus</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setBackfilling(true);
                  setBackfillToast(null);
                  try {
                    const res = await fetch("/api/mail/backfill-bodies", { method: "POST" });
                    const json = await res.json();
                    if (json.success) {
                      setBackfillToast(`${json.updated}/${json.total} corps chargés${json.errors ? ` (${json.errors} erreurs)` : ""}`);
                      if (json.updated > 0) fetchData();
                    } else {
                      setBackfillToast(json.error || "Erreur");
                    }
                  } catch {}
                  setBackfilling(false);
                  setTimeout(() => setBackfillToast(null), 5000);
                }}
                disabled={backfilling}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {backfilling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                Charger les corps
              </button>
              <button
                onClick={async () => {
                  setGeneratingSummaries(true);
                  setSummaryToast(null);
                  try {
                    const res = await fetch("/api/mail/generate-summaries", { method: "POST" });
                    const json = await res.json();
                    if (json.success) {
                      setSummaryToast(`${json.updated} résumé${json.updated !== 1 ? "s" : ""} généré${json.updated !== 1 ? "s" : ""}`);
                      if (json.updated > 0) fetchData();
                    }
                  } catch {}
                  setGeneratingSummaries(false);
                  setTimeout(() => setSummaryToast(null), 4000);
                }}
                disabled={generatingSummaries}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
              >
                {generatingSummaries ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Générer les résumés
              </button>
            </div>
          </div>
          {(summaryToast || backfillToast) && (
            <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
              <Check className="w-4 h-4" />{backfillToast || summaryToast}
            </div>
          )}
          <InfoSection
            emails={filteredInfo.slice(0, 10)}
            onArchive={(id) => dismissCard(id, "archive")}
            onArchiveAll={() => { for (const e of filteredInfo) dismissCard(e.id, "archive"); }}
            onView={(email) => setModalEmail(email)}
            onCreateTask={(id) => dismissCard(id, "task")}
            onReply={(email) => setReplyEmail(email)}
          />
        </div>
      )}

      {/* Email Detail Modal (FIX 2) */}
      {modalEmail && (
        <EmailDetailModal
          email={modalEmail}
          onClose={() => setModalEmail(null)}
          onReply={() => { const e = modalEmail; setModalEmail(null); setReplyEmail(e); }}
          onDelegate={() => { const e = modalEmail; setModalEmail(null); setDelegateEmail(e); }}
          onTransfer={() => { const e = modalEmail; setModalEmail(null); setTransferEmail(e); }}
          onCreateTask={() => { setModalEmail(null); dismissCard(modalEmail.id, "task"); }}
          onArchive={() => { setModalEmail(null); dismissCard(modalEmail.id, "archive"); }}
          isAloneInOrg={isAloneInOrg}
        />
      )}

      {/* Reply Modal (FIX 3 — replaces drawer) */}
      {replyEmail && (
        <ReplyModal
          email={replyEmail}
          onClose={() => setReplyEmail(null)}
          onDone={(emailId) => {
            setReplyEmail(null);
            dismissCard(emailId, "replied");
          }}
        />
      )}

      {/* Delegate Modal (FIX 4) */}
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

      {/* Transfer Modal (FIX 4) */}
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
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   FILTER PILL
   ═══════════════════════════════════════════════════════════ */

function FilterPill({ active, color, count, label, onClick }: {
  active: boolean;
  color: "red" | "amber" | "gray";
  count: number;
  label: string;
  onClick: () => void;
}) {
  const colors = {
    red: active ? "bg-red-50 text-red-800 border-red-200 shadow-sm" : "bg-white text-red-700 border-gray-200 hover:border-red-200 hover:bg-red-50/50",
    amber: active ? "bg-amber-50 text-amber-800 border-amber-200 shadow-sm" : "bg-white text-amber-700 border-gray-200 hover:border-amber-200 hover:bg-amber-50/50",
    gray: active ? "bg-gray-100 text-gray-800 border-gray-300 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50",
  };
  const dots = { red: "bg-red-500", amber: "bg-amber-500", gray: "bg-gray-400" };
  const countBg = {
    red: active ? "bg-red-200 text-red-900" : "bg-red-100 text-red-700",
    amber: active ? "bg-amber-200 text-amber-900" : "bg-amber-100 text-amber-700",
    gray: active ? "bg-gray-300 text-gray-800" : "bg-gray-100 text-gray-600",
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all ${colors[color]}`}
    >
      <span className={`w-2 h-2 rounded-full ${dots[color]}`} />
      {label}
      <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${countBg[color]}`}>
        {count}
      </span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   STAT CARD
   ═══════════════════════════════════════════════════════════ */

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-50 text-gray-400">
          {icon}
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-bold text-[#111827]" style={{ fontFamily: "var(--font-display), 'Plus Jakarta Sans', sans-serif" }}>{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EMAIL DETAIL MODAL (FIX 2 — proper scroll, no truncation)
   ═══════════════════════════════════════════════════════════ */

function EmailDetailModal({ email, onClose, onReply, onDelegate, onTransfer, onCreateTask, onArchive, isAloneInOrg }: {
  email: DecisionEmail;
  onClose: () => void;
  onReply: () => void;
  onDelegate: () => void;
  onTransfer: () => void;
  onCreateTask: () => void;
  onArchive: () => void;
  isAloneInOrg: boolean;
}) {
  const [thread, setThread] = useState<ThreadMessage[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(true);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [fallbackBody, setFallbackBody] = useState<string>("");
  const [fallbackIsHtml, setFallbackIsHtml] = useState(false);

  // Load thread from our API — uses Graph if possible, DB fallback otherwise
  useEffect(() => {
    // Immediate fallback: prefer body_html > body_text > body_preview
    const immediateBody = email.body_html || email.body_text || email.body_preview || "";
    setFallbackBody(immediateBody);
    if (looksLikeHtml(immediateBody)) setFallbackIsHtml(true);

    async function loadThread() {
      try {
        const res = await fetch(`/api/mail/emails/${email.id}/thread`);
        const data = await res.json();
        if (data.thread && data.thread.length > 0) {
          setThread(data.thread);
        } else {
          // No thread from Graph — use fallback from DB (with resolved CID images)
          if (data.fallback) {
            const body = data.fallback.body || email.body_html || email.body_text || email.body_preview || "";
            if (looksLikeHtml(body)) {
              setFallbackIsHtml(true);
            }
            setFallbackBody(body);
          }
          if (data.error) {
            setThreadError("Conversation complète indisponible — affichage du dernier message");
          }
        }
      } catch {
        setThreadError("Conversation complète indisponible — affichage du dernier message");
      }
      setThreadLoading(false);
    }

    loadThread();
  }, [email]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const priorityBadge = email.priority === "urgent"
    ? { label: "URGENT", cls: "bg-red-500/20 text-red-200" }
    : email.priority === "action"
    ? { label: "ACTION", cls: "bg-amber-500/20 text-amber-200" }
    : { label: "INFO", cls: "bg-white/15 text-blue-200" };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60] overflow-hidden" onClick={onClose} />

      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 overflow-hidden">
        <div
          className="bg-white rounded-2xl shadow-2xl flex flex-col"
          style={{ width: "70vw", maxWidth: "960px", height: "80vh", maxHeight: "800px" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0 px-6 py-4" style={{ background: "#1E3A5F" }}>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-2 mb-1.5">
                  {email.project_name && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-white/15 text-blue-100">{email.project_name}</span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${priorityBadge.cls}`}>{priorityBadge.label}</span>
                  {thread && thread.length > 1 && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-white/15 text-blue-100">
                      {thread.length} messages
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-semibold text-white truncate">{email.subject}</h2>
                <div className="flex items-center gap-2 mt-1 text-sm text-[#93C5FD]">
                  <span>De : {email.sender_name || email.sender_email} &lt;{email.sender_email}&gt;</span>
                  <span className="text-blue-300/50">·</span>
                  <span>{formatFullDate(email.received_at)}</span>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div
            className="flex-1 min-h-0 overflow-y-auto px-6 py-6"
            onWheel={(e) => e.stopPropagation()}
          >
            {/* AI Summary block */}
            {email.ai_summary && (
              <>
                <div className="rounded-lg overflow-hidden mb-5" style={{ borderLeft: "3px solid #2563EB", background: "#EFF6FF" }}>
                  <div className="px-4 py-3">
                    <div className="text-xs uppercase font-semibold tracking-wide text-[#2563EB] mb-1.5">Résumé IA</div>
                    <p className="text-sm leading-relaxed" style={{ color: "#1E3A5F" }}>{email.ai_summary}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs uppercase font-medium text-gray-400 tracking-wide">
                    {thread && thread.length > 1 ? "Fil de conversation" : "Contenu de l'email"}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              </>
            )}

            {threadError && !thread && (
              <div className="mb-4 px-3 py-1.5 text-xs text-gray-400 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" />{threadError}
              </div>
            )}

            {/* Thread or single email */}
            {thread && thread.length > 0 ? (
              <ThreadView thread={thread} currentUserEmail={email.sender_email} />
            ) : (
              <div className="bg-[#F9FAFB] rounded-lg p-4">
                {threadLoading && !fallbackBody ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
                    <Loader2 className="w-4 h-4 animate-spin" />Chargement du contenu...
                  </div>
                ) : fallbackIsHtml ? (
                  <div className="prose prose-sm max-w-none text-gray-700 email-content" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(fallbackBody) }} />
                ) : (
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{fallbackBody}</div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-6 py-3 border-t border-gray-100 bg-white flex items-center gap-2">
            <button onClick={onReply} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors">
              <Send className="w-3.5 h-3.5" />Répondre avec IA
            </button>
            {isAloneInOrg ? (
              <button onClick={onTransfer} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors">
                <Forward className="w-3.5 h-3.5" />Transférer
              </button>
            ) : (
              <button onClick={onDelegate} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors">
                <Users className="w-3.5 h-3.5" />Déléguer
              </button>
            )}
            <button onClick={onCreateTask} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors">
              <ListTodo className="w-3.5 h-3.5" />Créer une tâche
            </button>
            <button onClick={onArchive} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-white hover:bg-red-50 border border-red-200 rounded-lg transition-colors">
              <Archive className="w-3.5 h-3.5" />Archiver
            </button>
          </div>
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Last message is always expanded
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
    <div className="space-y-3">
      {thread.map((msg, idx) => {
        const isExpanded = expandedIds.has(msg.id);
        const isLast = idx === thread.length - 1;
        const isCurrentUser = currentUserEmail ? msg.from.email.toLowerCase() === currentUserEmail.toLowerCase() : false;
        const avatarColor = getAvatarColor(msg.from.name || msg.from.email, isCurrentUser);
        const initials = getInitials(msg.from.name || msg.from.email);
        const isHtml = msg.body.contentType?.toLowerCase() === "html";

        return (
          <div key={msg.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            {/* Message header — clickable to expand/collapse */}
            <button
              onClick={() => toggleExpand(msg.id)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
            >
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: avatarColor }}
              >
                {initials}
              </div>

              {/* Sender info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {msg.from.name || msg.from.email}
                  </span>
                  {msg.isCurrentMessage && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">Message principal</span>
                  )}
                </div>
                {!isExpanded && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{msg.bodyPreview}</p>
                )}
              </div>

              {/* Date + chevron */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">{formatThreadDate(msg.receivedDateTime)}</span>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </button>

            {/* Expanded body */}
            {isExpanded && (
              <div className="border-t border-gray-100">
                {/* Recipients line */}
                <div className="px-4 py-2 text-xs text-gray-500 space-y-0.5 bg-gray-50/50">
                  <p>De : {msg.from.name} &lt;{msg.from.email}&gt;</p>
                  {msg.to.length > 0 && (
                    <p>À : {msg.to.map((r) => r.name || r.email).join(", ")}</p>
                  )}
                  {msg.cc.length > 0 && (
                    <p>CC : {msg.cc.map((r) => r.name || r.email).join(", ")}</p>
                  )}
                </div>

                {/* Body content */}
                <div className="px-4 py-4">
                  {isHtml ? (
                    <div
                      className="prose prose-sm max-w-none text-gray-700 email-content"
                      dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(msg.body.content) }}
                    />
                  ) : (
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">{msg.body.content}</div>
                  )}
                </div>
              </div>
            )}

            {/* Separator label between messages */}
            {!isLast && idx < thread.length - 1 && (
              <div className="px-4 pb-1">
                <span className="text-[10px] text-gray-400">
                  Réponse · il y a {timeAgo(thread[idx + 1].receivedDateTime)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DECISION CARD (z-index + overflow + upward dropdown)
   ═══════════════════════════════════════════════════════════ */

function DecisionCard({ email, isAloneInOrg, onReply, onView, onDelegate, onTransfer, onCreateTask, onArchive, onSnooze, onAccept, onNegotiate, onRefuse }: {
  email: DecisionEmail;
  isAloneInOrg: boolean;
  onReply: () => void;
  onView: () => void;
  onDelegate: () => void;
  onTransfer: () => void;
  onCreateTask: () => void;
  onArchive: () => void;
  onSnooze: () => void;
  onAccept: () => void;
  onNegotiate: () => void;
  onRefuse: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const toggleMenu = useCallback(() => {
    if (!menuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpward(spaceBelow < 220);
    }
    setMenuOpen(!menuOpen);
  }, [menuOpen]);

  const borderColor = email.priority === "urgent" ? "border-l-red-600" : email.priority === "action" ? "border-l-amber-500" : "border-l-gray-400";
  const badge = email.is_quote
    ? { label: "DEVIS RECU", color: "bg-amber-100 text-amber-800" }
    : email.priority === "urgent"
    ? { label: "URGENT", color: "bg-red-100 text-red-800" }
    : { label: "ACTION REQUISE", color: "bg-amber-100 text-amber-800" };

  const handleAction = (action: () => void) => {
    setExiting(true);
    setTimeout(action, 350);
  };

  if (email.is_quote) {
    return (
      <div
        className={`bg-white rounded-xl border border-gray-100 border-l-4 ${borderColor} shadow-sm overflow-visible transition-all duration-300 ${exiting ? "opacity-0 -translate-x-8" : "opacity-100 translate-x-0"}`}
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        <div className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${badge.color}`}>{badge.label}</span>
            {email.project_name && <span className="text-xs text-gray-500 font-medium">{email.project_name}</span>}
          </div>
          <p className="text-gray-800 font-medium mb-1">
            {email.sender_name || email.sender_email} a répondu à ta demande de prix
          </p>
          {email.ai_summary && (
            <p className="text-sm text-gray-500 mb-3 line-clamp-2">{email.ai_summary}</p>
          )}
          {email.price_indicator?.extracted_price != null && (
            <div className="flex items-center gap-3 mb-3 p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">
                Prix extrait : CHF {email.price_indicator.extracted_price.toLocaleString("fr-CH")}
              </span>
              {email.price_indicator.diff_percent != null ? (
                email.price_indicator.diff_percent > 5 ? (
                  <span className="text-sm text-amber-600 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />+{email.price_indicator.diff_percent.toFixed(0)}% vs marché
                  </span>
                ) : (
                  <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />Dans la norme
                  </span>
                )
              ) : (
                <span className="text-xs text-gray-400">Pas de référence marché</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => handleAction(onAccept)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">
              <ThumbsUp className="w-3.5 h-3.5" />Accepter
            </button>
            <button onClick={onNegotiate} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors">
              <MessageSquare className="w-3.5 h-3.5" />Négocier
            </button>
            <button onClick={() => handleAction(onRefuse)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors">
              <ThumbsDown className="w-3.5 h-3.5" />Refuser
            </button>
            <button onClick={onView} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors">
              <Eye className="w-3.5 h-3.5" />Voir détail
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl border border-gray-100 border-l-4 ${borderColor} shadow-sm hover:shadow-md overflow-visible relative transition-all duration-300 ${exiting ? "opacity-0 -translate-x-8" : "opacity-100 translate-x-0"}`}
      style={{ fontFamily: "var(--font-display), 'Plus Jakarta Sans', sans-serif", zIndex: menuOpen ? 10 : 1 }}
    >
      <div className="p-5">
        {/* Top row: badge + project + time */}
        <div className="flex items-center gap-2 mb-2.5">
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${badge.color}`}>{badge.label}</span>
          {email.project_name && (
            <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 shrink-0" />
              {email.project_name}
            </span>
          )}
          <span className="text-[11px] text-gray-400 ml-auto shrink-0">il y a {timeAgo(email.received_at)}</span>
        </div>

        {/* Summary / preview */}
        <p className="text-[13px] leading-relaxed text-gray-700 mb-2 line-clamp-2">
          {email.ai_summary || email.body_preview || email.subject}
        </p>

        {/* Sender + urgency */}
        <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
          <span className="truncate">De : {email.sender_name || email.sender_email}</span>
          {email.priority === "urgent" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 shrink-0">
              <Clock className="w-3 h-3" />Répondre sous 24h
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onReply} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-all shadow-sm hover:shadow">
            <Send className="w-3.5 h-3.5" />Répondre avec IA
          </button>
          <button onClick={onView} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-lg transition-all">
            <Eye className="w-3.5 h-3.5" />Voir l&apos;email
          </button>
          {isAloneInOrg ? (
            <button onClick={onTransfer} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-lg transition-all">
              <Forward className="w-3.5 h-3.5" />Transférer
            </button>
          ) : (
            <button onClick={onDelegate} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-lg transition-all">
              <Users className="w-3.5 h-3.5" />Déléguer
            </button>
          )}

          {/* More menu */}
          <div className="relative ml-auto" ref={menuRef}>
            <button ref={buttonRef} onClick={toggleMenu} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronDown className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div
                className={`absolute right-0 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 ${openUpward ? "bottom-full mb-1" : "top-full mt-1"}`}
              >
                {!isAloneInOrg && (
                  <button onClick={() => { setMenuOpen(false); onTransfer(); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <Forward className="w-4 h-4 text-gray-400" />Transférer
                  </button>
                )}
                <button onClick={() => { setMenuOpen(false); handleAction(onCreateTask); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <ListTodo className="w-4 h-4 text-gray-400" />Créer une tâche
                </button>
                <button onClick={() => { setMenuOpen(false); handleAction(onArchive); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <Archive className="w-4 h-4 text-gray-400" />Archiver
                </button>
                <button onClick={() => { setMenuOpen(false); handleAction(onSnooze); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <AlarmClock className="w-4 h-4 text-gray-400" />Reporter à demain
                </button>
                <button onClick={() => { setMenuOpen(false); onView(); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <ExternalLink className="w-4 h-4 text-gray-400" />Voir dans Mail
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   INFO SECTION (cards grouped by project)
   ═══════════════════════════════════════════════════════════ */

function InfoSection({ emails, onArchive, onArchiveAll, onView, onCreateTask, onReply }: {
  emails: DecisionEmail[];
  onArchive: (id: string) => void;
  onArchiveAll: () => void;
  onView: (email: DecisionEmail) => void;
  onCreateTask: (id: string) => void;
  onReply: (email: DecisionEmail) => void;
}) {
  const [confirmArchiveAll, setConfirmArchiveAll] = useState(false);
  const [dismissedLocal, setDismissedLocal] = useState<Set<string>>(new Set());

  if (emails.length === 0) return null;

  const visible = emails.filter((e) => !dismissedLocal.has(e.id));

  const groups: Record<string, DecisionEmail[]> = {};
  for (const email of visible) {
    const key = email.project_name || "Sans projet";
    if (!groups[key]) groups[key] = [];
    groups[key].push(email);
  }
  const groupEntries = Object.entries(groups).sort(([a], [b]) => {
    if (a === "Sans projet") return 1;
    if (b === "Sans projet") return -1;
    return a.localeCompare(b);
  });

  const handleArchive = (id: string) => {
    setDismissedLocal((prev) => new Set(prev).add(id));
    onArchive(id);
  };

  const handleArchiveAll = () => {
    if (!confirmArchiveAll) {
      setConfirmArchiveAll(true);
      return;
    }
    onArchiveAll();
    setConfirmArchiveAll(false);
  };

  return (
    <div className="space-y-4">
      {groupEntries.map(([projectName, groupEmails]) => (
        <div key={projectName}>
          {groupEntries.length > 1 && (
            <div className="text-sm font-semibold text-gray-500 mb-2 pl-1">
              {projectName} ({groupEmails.length} email{groupEmails.length !== 1 ? "s" : ""})
            </div>
          )}
          <div className={`space-y-2 ${groupEntries.length > 1 ? "pl-2" : ""}`}>
            {groupEmails.map((email) => (
              <InfoCard
                key={email.id}
                email={email}
                onView={() => onView(email)}
                onCreateTask={() => { setDismissedLocal((p) => new Set(p).add(email.id)); onCreateTask(email.id); }}
                onArchive={() => handleArchive(email.id)}
                onReply={() => onReply(email)}
              />
            ))}
          </div>
        </div>
      ))}

      {visible.length > 1 && (
        <div className="pt-2">
          <button
            onClick={handleArchiveAll}
            className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${confirmArchiveAll ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100" : "text-gray-500 hover:text-gray-700 bg-white border border-gray-200 hover:bg-gray-50"}`}
          >
            {confirmArchiveAll ? `Archiver ${visible.length} emails info ?` : "Tout archiver"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   INFO CARD (FIX 1 — AI summary + reply button)
   ═══════════════════════════════════════════════════════════ */

function InfoCard({ email, onView, onCreateTask, onArchive, onReply }: {
  email: DecisionEmail;
  onView: () => void;
  onCreateTask: () => void;
  onArchive: () => void;
  onReply: () => void;
}) {
  const [exiting, setExiting] = useState(false);

  const handleAction = (action: () => void) => {
    setExiting(true);
    setTimeout(action, 300);
  };

  return (
    <div
      className={`bg-white rounded-xl border border-gray-100 border-l-[3px] border-l-gray-300 shadow-sm transition-all duration-300 ${exiting ? "opacity-0 -translate-x-6" : "opacity-100 translate-x-0"}`}
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-1">
          {email.project_name && <span className="text-xs font-medium text-gray-500">{email.project_name}</span>}
          <span className="text-xs text-gray-400">il y a {timeAgo(email.received_at)}</span>
        </div>

        {/* Subject */}
        <p className="text-sm font-medium text-gray-800 truncate mb-0.5">
          {email.subject.length > 80 ? email.subject.slice(0, 80) + "..." : email.subject}
        </p>

        {/* Sender */}
        <p className="text-xs text-gray-400 mb-2">De : {email.sender_name || email.sender_email}</p>

        {/* Summary / preview block */}
        {email.ai_summary ? (
          <div className="rounded-lg overflow-hidden mb-3" style={{ borderLeft: "3px solid #2563EB", background: "#EFF6FF" }}>
            <div className="px-3 py-2.5">
              <div className="text-[10px] uppercase font-semibold tracking-wide text-[#2563EB] mb-1">✦ RÉSUMÉ IA</div>
              <p className="text-xs leading-relaxed text-gray-700">{email.ai_summary}</p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden mb-3" style={{ borderLeft: "3px solid #9CA3AF", background: "#F3F4F6" }}>
            <div className="px-3 py-2.5">
              <div className="text-[10px] uppercase font-semibold tracking-wide text-gray-400 mb-1">APERÇU</div>
              <p className="text-xs leading-relaxed text-gray-500">
                {email.body_preview ? (email.body_preview.length > 150 ? email.body_preview.slice(0, 150) + "..." : email.body_preview) : ""}
              </p>
            </div>
          </div>
        )}

        {/* Actions — FIX 1: added reply button */}
        <div className="flex items-center gap-2">
          <button onClick={onReply} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-[#2563EB] hover:bg-blue-700 rounded-md transition-colors">
            <Send className="w-3 h-3" />Répondre avec IA
          </button>
          <button onClick={onView} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-md transition-colors">
            <Eye className="w-3 h-3" />Lire l&apos;email
          </button>
          <button onClick={() => handleAction(onCreateTask)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-md transition-colors">
            <ListTodo className="w-3 h-3" />Créer une tâche
          </button>
          <button onClick={() => handleAction(onArchive)} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-md transition-colors">
            <Archive className="w-3 h-3" />Archiver
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════════ */

function EmptyState({ firstName, onRefresh }: { firstName: string; onRefresh: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-5 shadow-sm border border-emerald-100">
        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
      </div>
      <h2 className="text-xl font-bold text-[#111827] mb-1" style={{ fontFamily: "var(--font-display), 'Plus Jakarta Sans', sans-serif" }}>
        Tout est traité. Beau travail, {firstName}.
      </h2>
      <p className="text-gray-500 text-sm mb-5">Dernière mise à jour il y a quelques instants</p>
      <button onClick={onRefresh} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
        <RefreshCw className="w-4 h-4" />Actualiser
      </button>
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
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const threadContextRef = useRef<string>("");

  // Load thread from our API — uses Graph if possible, DB fallback otherwise
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
          // Build thread context for AI
          threadContextRef.current = data.thread.map((msg: ThreadMessage) =>
            `[${msg.receivedDateTime}] De: ${msg.from.name} <${msg.from.email}>\nObjet: ${msg.subject}\n${msg.bodyPreview || ""}`
          ).join("\n\n---\n\n");
        } else if (data.fallback) {
          // No thread from Graph — use fallback from DB (with resolved CID images)
          const body = data.fallback.body || email.body_html || email.body_text || email.body_preview || "";
          if (looksLikeHtml(body)) {
            setFallbackIsHtml(true);
          }
          setFallbackBody(body);
        }
      } catch {}
      setThreadLoading(false);
    }

    loadThread();
  }, [email]);

  // Generate AI reply — includes thread context
  const generateReply = useCallback(async () => {
    setReplyLoading(true);
    try {
      const payload: Record<string, unknown> = { email_id: email.id };
      if (threadContextRef.current) {
        payload.thread_context = threadContextRef.current;
      }
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
  }, [email.id]);

  // Wait for thread to load before generating reply (for context)
  useEffect(() => {
    if (!threadLoading) {
      generateReply();
    }
  }, [threadLoading, generateReply]);

  // Auto-expand textarea
  useEffect(() => {
    if (replyRef.current) {
      replyRef.current.style.height = "auto";
      replyRef.current.style.height = Math.max(200, replyRef.current.scrollHeight) + "px";
    }
  }, [replyText]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
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
        subject: `Re: ${email.subject}`,
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
        const data = await res.json().catch(() => ({ error: "Erreur serveur" }));
        setSendError(data.error || `Erreur ${res.status}`);
        setSending(false);
        return;
      }
      onDone(email.id);
    } catch {
      setSendError("Erreur de connexion — vérifiez votre réseau");
    }
    setSending(false);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60] overflow-hidden" onClick={onClose} />

      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 overflow-hidden">
        <div
          className="bg-white rounded-2xl shadow-2xl flex flex-col"
          style={{ width: "75vw", maxWidth: "1100px", height: "85vh", maxHeight: "900px" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between" style={{ background: "#1E3A5F" }}>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Répondre à {email.sender_name || email.sender_email}
              </h2>
              <p className="text-sm text-[#93C5FD] truncate mt-0.5">{email.subject}</p>
            </div>
            <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body — 2 columns */}
          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            {/* Left: conversation thread (40%) */}
            <div className="md:w-[40%] border-r border-gray-200 flex flex-col min-h-0">
              <div className="px-4 py-2 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wide text-gray-400">
                  {thread && thread.length > 1 ? `Conversation (${thread.length})` : "Email original"}
                </span>
              </div>
              <div
                className="flex-1 min-h-0 overflow-y-auto p-4"
                style={{ background: "#F9FAFB" }}
                onWheel={(e) => e.stopPropagation()}
              >
                {thread && thread.length > 0 ? (
                  <ThreadView thread={thread} currentUserEmail={email.sender_email} />
                ) : (
                  <>
                    <div className="text-sm font-medium text-gray-800 mb-1">{email.subject}</div>
                    <div className="text-xs text-gray-500 mb-3">De : {email.sender_name || email.sender_email}</div>
                    {threadLoading && !fallbackBody ? (
                      <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                        <Loader2 className="w-4 h-4 animate-spin" />Chargement...
                      </div>
                    ) : fallbackIsHtml ? (
                      <div className="prose prose-sm max-w-none text-gray-600" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(fallbackBody) }} />
                    ) : (
                      <div className="text-sm text-gray-600 whitespace-pre-wrap">{fallbackBody}</div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right: reply (60%) */}
            <div className="md:w-[60%] flex flex-col min-h-0">
              {/* Recipients */}
              <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-[#F9FAFB] space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-8 text-right">À :</span>
                  <span className="text-gray-900 font-medium">{email.sender_email}</span>
                </div>
                {showCcBcc ? (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500 w-8 text-right">CC :</span>
                      <input
                        type="text"
                        value={cc}
                        onChange={(e) => setCc(e.target.value)}
                        placeholder="email1@ex.com, email2@ex.com"
                        className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500 w-8 text-right">CCI :</span>
                      <input
                        type="text"
                        value={bcc}
                        onChange={(e) => setBcc(e.target.value)}
                        placeholder="email@ex.com"
                        className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => setShowCcBcc(true)}
                    className="text-xs text-blue-600 hover:underline ml-10"
                  >
                    + Ajouter CC/CCI
                  </button>
                )}
              </div>

              {/* AI reply */}
              <div
                className="flex-1 min-h-0 overflow-y-auto p-4"
                onWheel={(e) => e.stopPropagation()}
              >
                <div className="rounded-lg overflow-hidden" style={{ borderLeft: "3px solid #2563EB", background: "#EFF6FF" }}>
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs uppercase font-semibold tracking-wide text-[#2563EB]">Réponse IA suggérée</span>
                      {!replyLoading && (
                        <button
                          onClick={generateReply}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />Régénérer
                        </button>
                      )}
                    </div>
                    {replyLoading ? (
                      <div className="flex items-center gap-2 text-blue-400 text-sm py-8">
                        <Loader2 className="w-4 h-4 animate-spin" />Génération en cours...
                      </div>
                    ) : (
                      <textarea
                        ref={replyRef}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="w-full p-3 text-sm rounded-lg resize-none border border-blue-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        style={{ minHeight: "200px" }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-6 py-3 border-t border-gray-100 bg-white">
            {sendError && (
              <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />{sendError}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSend}
                disabled={sending || replyLoading || !replyText.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Envoyer
              </button>
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors ml-auto">
                Annuler
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
  const [selectedMember, setSelectedMember] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [emailBody, setEmailBody] = useState("");

  useEffect(() => {
    async function loadBody() {
      if (!email.outlook_message_id) {
        setEmailBody(email.body_preview || "");
        return;
      }
      try {
        const res = await fetch(`/api/outlook/email-body?message_id=${encodeURIComponent(email.outlook_message_id)}`);
        if (res.ok) {
          const data = await res.json();
          setEmailBody(data.body || email.body_preview || "");
        }
      } catch {
        setEmailBody(email.body_preview || "");
      }
    }
    loadBody();
  }, [email]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleDelegate = async () => {
    if (!selectedMember) return;
    setSending(true);
    try {
      const member = orgMembers.find((m) => m.id === selectedMember);
      if (member) {
        // Forward email
        await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [member.email],
            subject: `Fwd: ${email.subject}`,
            body: `${message ? `<p>${message}</p><hr>` : ""}${emailBody}`,
            forward_id: email.outlook_message_id,
          }),
        });

        // Create task assigned to this member
        try {
          await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: `Délégué: ${email.subject}`,
              description: message || `Email transféré de ${email.sender_name || email.sender_email}`,
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
      setDelegateError("Erreur lors de la délégation — vérifiez votre connexion");
    }
    setSending(false);
  };

  const [delegateError, setDelegateError] = useState<string | null>(null);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60] overflow-hidden" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 overflow-hidden">
        <div
          className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between" style={{ background: "#1E3A5F" }}>
            <h2 className="text-lg font-semibold text-white">Déléguer à un collègue</h2>
            <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="font-medium text-gray-800 truncate">{email.subject}</p>
              <p className="text-xs text-gray-500 mt-1">De : {email.sender_name || email.sender_email}</p>
            </div>

            <div>
              <label className="block text-xs text-gray-500 uppercase font-medium mb-2">Déléguer à</label>
              {orgMembers.length > 0 ? (
                <select
                  value={selectedMember}
                  onChange={(e) => setSelectedMember(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Choisir un membre...</option>
                  {orgMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.email})</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-500">Aucun autre membre dans votre organisation.</p>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-500 uppercase font-medium mb-2">Message (optionnel)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ajouter un message au transfert..."
                className="w-full h-24 p-3 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100">
            {delegateError && (
              <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />{delegateError}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={handleDelegate}
                disabled={sending || !selectedMember}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                Déléguer
              </button>
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors ml-auto">
                Annuler
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
  const [toEmail, setToEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [emailBody, setEmailBody] = useState("");

  useEffect(() => {
    async function loadBody() {
      if (!email.outlook_message_id) {
        setEmailBody(email.body_preview || "");
        return;
      }
      try {
        const res = await fetch(`/api/outlook/email-body?message_id=${encodeURIComponent(email.outlook_message_id)}`);
        if (res.ok) {
          const data = await res.json();
          setEmailBody(data.body || email.body_preview || "");
        }
      } catch {
        setEmailBody(email.body_preview || "");
      }
    }
    loadBody();
  }, [email]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
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
          subject: `Fwd: ${email.subject}`,
          body: `${message ? `<p>${message}</p><hr>` : ""}${emailBody}`,
          forward_id: email.outlook_message_id,
        }),
      });
      onDone(email.id);
    } catch {
      setTransferError("Erreur lors du transfert — vérifiez votre connexion");
    }
    setSending(false);
  };

  const [transferError, setTransferError] = useState<string | null>(null);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60] overflow-hidden" onClick={onClose} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 overflow-hidden">
        <div
          className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between" style={{ background: "#1E3A5F" }}>
            <h2 className="text-lg font-semibold text-white">Transférer l&apos;email</h2>
            <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="font-medium text-gray-800 truncate">{email.subject}</p>
              <p className="text-xs text-gray-500 mt-1">De : {email.sender_name || email.sender_email}</p>
            </div>

            <div>
              <label className="block text-xs text-gray-500 uppercase font-medium mb-2">Transférer à</label>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="destinataire@example.com"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 uppercase font-medium mb-2">Message (optionnel)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ajouter un message au transfert..."
                className="w-full h-24 p-3 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100">
            {transferError && (
              <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />{transferError}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={handleTransfer}
                disabled={sending || !toEmail.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Forward className="w-4 h-4" />}
                Transférer
              </button>
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors ml-auto">
                Annuler
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
