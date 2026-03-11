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
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */

interface DecisionEmail {
  id: string;
  subject: string;
  sender_email: string;
  sender_name: string;
  body_preview: string;
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

interface ProjectMember {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
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

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function MailTestPage() {
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

  // Drawer state
  const [drawerEmail, setDrawerEmail] = useState<DecisionEmail | null>(null);
  const [drawerMode, setDrawerMode] = useState<"reply" | "delegate" | "negotiate" | null>(null);

  // Email detail modal state
  const [modalEmail, setModalEmail] = useState<DecisionEmail | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/mail-test/decisions");
      if (res.status === 403) {
        router.replace("/dashboard");
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      if (!data.success) {
        router.replace("/dashboard");
        return;
      }
      setAuthorized(true);
      setFirstName(data.firstName);
      setUrgent(data.urgent);
      setThisWeek(data.thisWeek);
      setInfo(data.info);
      setStats(data.stats);
    } catch {
      router.replace("/dashboard");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Dismiss a card (mark processed)
  const dismissCard = useCallback(async (emailId: string, action: string) => {
    setDismissedIds((prev) => new Set(prev).add(emailId));
    setDecisionsToday((d) => d + 1);
    try {
      if (action === "archive") {
        await fetch(`/api/email/${emailId}/archive`, { method: "POST" });
      }
      await fetch("/api/mail-test/decisions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: emailId, action }),
      });
    } catch {
      // Non-blocking
    }
  }, []);

  // Snooze
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
      <div className="flex items-center justify-center h-screen bg-[#F9FAFB]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
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
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Bonjour {firstName} — {formatDate()}
        </h1>
        <p className="text-gray-500 mt-1">
          {filteredUrgent.length} urgente{filteredUrgent.length !== 1 ? "s" : ""}
          {" · "}{filteredThisWeek.length} cette semaine
          {" · "}{filteredInfo.length} info{filteredInfo.length !== 1 ? "s" : ""}
        </p>

        {/* Filter pills */}
        <div className="flex gap-3 mt-4">
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
          />
        ) : isEmpty ? (
          <EmptyState firstName={firstName} onRefresh={fetchData} />
        ) : (
          <div className="space-y-4">
            {visibleCards.map((email) => (
              <DecisionCard
                key={email.id}
                email={email}
                onReply={() => { setDrawerEmail(email); setDrawerMode("reply"); }}
                onView={() => setModalEmail(email)}
                onDelegate={() => { setDrawerEmail(email); setDrawerMode("delegate"); }}
                onCreateTask={() => dismissCard(email.id, "task")}
                onArchive={() => dismissCard(email.id, "archive")}
                onSnooze={() => snoozeCard(email.id)}
                onAccept={() => dismissCard(email.id, "accept")}
                onNegotiate={() => { setDrawerEmail(email); setDrawerMode("negotiate"); }}
                onRefuse={() => dismissCard(email.id, "refuse")}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info section below decisions */}
      {activeFilter !== "info" && filteredInfo.length > 0 && (
        <div className="max-w-[860px] mx-auto px-4 pb-12">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Emails non lus</h2>
          <InfoSection
            emails={filteredInfo.slice(0, 10)}
            onArchive={(id) => dismissCard(id, "archive")}
            onArchiveAll={() => { for (const e of filteredInfo) dismissCard(e.id, "archive"); }}
            onView={(email) => setModalEmail(email)}
            onCreateTask={(id) => dismissCard(id, "task")}
          />
        </div>
      )}

      {/* Email Detail Modal (FIX 1) */}
      {modalEmail && (
        <EmailDetailModal
          email={modalEmail}
          onClose={() => setModalEmail(null)}
          onReply={() => { setModalEmail(null); setDrawerEmail(modalEmail); setDrawerMode("reply"); }}
          onDelegate={() => { setModalEmail(null); setDrawerEmail(modalEmail); setDrawerMode("delegate"); }}
          onCreateTask={() => { setModalEmail(null); dismissCard(modalEmail.id, "task"); }}
          onArchive={() => { setModalEmail(null); dismissCard(modalEmail.id, "archive"); }}
        />
      )}

      {/* Drawer */}
      {drawerEmail && drawerMode && (
        <Drawer
          email={drawerEmail}
          mode={drawerMode}
          onClose={() => { setDrawerEmail(null); setDrawerMode(null); }}
          onDone={(emailId) => {
            setDrawerEmail(null);
            setDrawerMode(null);
            dismissCard(emailId, drawerMode === "reply" ? "replied" : drawerMode === "delegate" ? "delegated" : "negotiated");
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
    red: active ? "bg-red-100 text-red-800 border-red-300" : "bg-white text-red-700 border-gray-200 hover:border-red-200",
    amber: active ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-white text-amber-700 border-gray-200 hover:border-amber-200",
    gray: active ? "bg-gray-200 text-gray-800 border-gray-400" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300",
  };
  const dots = { red: "bg-red-500", amber: "bg-amber-500", gray: "bg-gray-400" };

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all ${colors[color]}`}
    >
      <span className={`w-2 h-2 rounded-full ${dots[color]}`} />
      {count} {label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   STAT CARD
   ═══════════════════════════════════════════════════════════ */

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-gray-400 mb-1">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EMAIL DETAIL MODAL (reusable — dark header, AI summary, styled body)
   ═══════════════════════════════════════════════════════════ */

function EmailDetailModal({ email, onClose, onReply, onDelegate, onCreateTask, onArchive }: {
  email: DecisionEmail;
  onClose: () => void;
  onReply: () => void;
  onDelegate: () => void;
  onCreateTask: () => void;
  onArchive: () => void;
}) {
  const [emailBody, setEmailBody] = useState("");
  const [bodyLoading, setBodyLoading] = useState(true);
  const [isHtml, setIsHtml] = useState(false);

  // Load full body
  useEffect(() => {
    async function loadBody() {
      if (!email.outlook_message_id) {
        setEmailBody(email.body_preview || "");
        setBodyLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/outlook/email-body?message_id=${encodeURIComponent(email.outlook_message_id)}`);
        if (res.ok) {
          const data = await res.json();
          const body = data.body || "";
          if (body.includes("<") && body.includes(">") && (body.includes("<p") || body.includes("<div") || body.includes("<br") || body.includes("<table"))) {
            setIsHtml(true);
            setEmailBody(body);
          } else {
            setEmailBody(body || email.body_preview || "");
          }
        } else {
          setEmailBody(email.body_preview || "");
        }
      } catch {
        setEmailBody(email.body_preview || "");
      }
      setBodyLoading(false);
    }
    loadBody();
  }, [email]);

  // Close on Escape
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
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ width: "70vw", maxWidth: "960px", height: "80vh", maxHeight: "800px" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header — dark Cantaia blue */}
          <div className="flex-shrink-0 px-6 py-4" style={{ background: "#1E3A5F" }}>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-2 mb-1.5">
                  {email.project_name && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-white/15 text-blue-100">{email.project_name}</span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${priorityBadge.cls}`}>{priorityBadge.label}</span>
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

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
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
                  <span className="text-xs uppercase font-medium text-gray-400 tracking-wide">Contenu de l&apos;email</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              </>
            )}

            {/* Email body */}
            {bodyLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
                <Loader2 className="w-4 h-4 animate-spin" />Chargement du contenu...
              </div>
            ) : (
              <div className="bg-[#F9FAFB] rounded-lg p-4">
                {isHtml ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-700 email-content"
                    dangerouslySetInnerHTML={{ __html: emailBody }}
                  />
                ) : (
                  <div className="text-sm text-gray-700 whitespace-pre-wrap" style={{ fontSize: "14px" }}>{emailBody}</div>
                )}
              </div>
            )}
          </div>

          {/* Footer — actions */}
          <div className="flex-shrink-0 px-6 py-3 border-t border-gray-100 bg-white flex items-center gap-2">
            <button onClick={onReply} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors">
              <Send className="w-3.5 h-3.5" />Répondre avec IA
            </button>
            <button onClick={onDelegate} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors">
              <Users className="w-3.5 h-3.5" />Déléguer
            </button>
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
   DECISION CARD (FIX 2 — z-index + overflow + upward dropdown)
   ═══════════════════════════════════════════════════════════ */

function DecisionCard({ email, onReply, onView, onDelegate, onCreateTask, onArchive, onSnooze, onAccept, onNegotiate, onRefuse }: {
  email: DecisionEmail;
  onReply: () => void;
  onView: () => void;
  onDelegate: () => void;
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

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Detect if dropdown should open upward
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
      className={`bg-white rounded-xl border border-gray-100 border-l-4 ${borderColor} shadow-sm overflow-visible relative transition-all duration-300 ${exiting ? "opacity-0 -translate-x-8" : "opacity-100 translate-x-0"}`}
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", zIndex: menuOpen ? 10 : 1 }}
    >
      <div className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${badge.color}`}>{badge.label}</span>
          {email.project_name && <span className="text-xs text-gray-500 font-medium">{email.project_name}</span>}
          <span className="text-xs text-gray-400 ml-auto">il y a {timeAgo(email.received_at)}</span>
        </div>
        <p className="text-sm text-gray-700 mb-2 line-clamp-2">
          {email.ai_summary || email.body_preview || email.subject}
        </p>
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
          <span>De : {email.sender_name || email.sender_email}</span>
          {email.priority === "urgent" && (
            <span className="text-red-500 font-medium">Répondre sous 24h</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onReply} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors">
            <Send className="w-3.5 h-3.5" />Répondre avec IA
          </button>
          <button onClick={onView} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors">
            <Eye className="w-3.5 h-3.5" />Voir l&apos;email
          </button>
          <button onClick={onDelegate} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors">
            <Users className="w-3.5 h-3.5" />Déléguer
          </button>

          {/* More menu (FIX 2) */}
          <div className="relative ml-auto" ref={menuRef}>
            <button ref={buttonRef} onClick={toggleMenu} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
              <ChevronDown className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div
                className={`absolute right-0 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 ${openUpward ? "bottom-full mb-1" : "top-full mt-1"}`}
              >
                <button onClick={() => { setMenuOpen(false); handleAction(onCreateTask); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <ListTodo className="w-4 h-4" />Créer une tâche
                </button>
                <button onClick={() => { setMenuOpen(false); handleAction(onArchive); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <Archive className="w-4 h-4" />Archiver
                </button>
                <button onClick={() => { setMenuOpen(false); handleAction(onSnooze); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <AlarmClock className="w-4 h-4" />Reporter à demain
                </button>
                <button onClick={() => { setMenuOpen(false); onView(); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <ExternalLink className="w-4 h-4" />Voir dans Mail
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
   INFO SECTION (FIX 4 — interactive cards grouped by project)
   ═══════════════════════════════════════════════════════════ */

function InfoSection({ emails, onArchive, onArchiveAll, onView, onCreateTask }: {
  emails: DecisionEmail[];
  onArchive: (id: string) => void;
  onArchiveAll: () => void;
  onView: (email: DecisionEmail) => void;
  onCreateTask: (id: string) => void;
}) {
  const [confirmArchiveAll, setConfirmArchiveAll] = useState(false);
  const [dismissedLocal, setDismissedLocal] = useState<Set<string>>(new Set());

  if (emails.length === 0) return null;

  const visible = emails.filter((e) => !dismissedLocal.has(e.id));

  // Group by project_name
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

function InfoCard({ email, onView, onCreateTask, onArchive }: {
  email: DecisionEmail;
  onView: () => void;
  onCreateTask: () => void;
  onArchive: () => void;
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
        <p className="text-xs text-gray-400 mb-1.5">De : {email.sender_name || email.sender_email}</p>

        {/* Summary */}
        <p className="text-sm text-gray-500 line-clamp-2 mb-3">
          {email.ai_summary || (email.body_preview ? (email.body_preview.length > 120 ? email.body_preview.slice(0, 120) + "..." : email.body_preview) : "")}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2">
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
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Tout est traité. Beau travail, {firstName}.</h2>
      <p className="text-gray-500 text-sm mb-4">Dernière mise à jour il y a quelques instants</p>
      <button onClick={onRefresh} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
        <RefreshCw className="w-4 h-4" />Actualiser
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   DRAWER — Reply / Delegate / Negotiate (FIX 3)
   ═══════════════════════════════════════════════════════════ */

function Drawer({ email, mode, onClose, onDone }: {
  email: DecisionEmail;
  mode: "reply" | "delegate" | "negotiate";
  onClose: () => void;
  onDone: (emailId: string) => void;
}) {
  const [replyText, setReplyText] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [emailBody, setEmailBody] = useState("");
  const [bodyLoading, setBodyLoading] = useState(true);
  const [isHtml, setIsHtml] = useState(false);
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [selectedMember, setSelectedMember] = useState("");
  const [delegateMessage, setDelegateMessage] = useState("");
  const [editable, setEditable] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // Load email body (full HTML)
  useEffect(() => {
    async function loadBody() {
      if (!email.outlook_message_id) {
        setEmailBody(email.body_preview || "");
        setBodyLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/outlook/email-body?message_id=${encodeURIComponent(email.outlook_message_id)}`);
        if (res.ok) {
          const data = await res.json();
          const body = data.body || "";
          if (body.includes("<") && body.includes(">") && (body.includes("<p") || body.includes("<div") || body.includes("<br") || body.includes("<table"))) {
            setIsHtml(true);
          }
          setEmailBody(body || email.body_preview || "");
        } else {
          setEmailBody(email.body_preview || "");
        }
      } catch {
        setEmailBody(email.body_preview || "");
      }
      setBodyLoading(false);
    }
    loadBody();
  }, [email]);

  // Generate AI reply
  useEffect(() => {
    if (mode !== "reply" && mode !== "negotiate") return;
    async function generateReply() {
      setReplyLoading(true);
      try {
        const res = await fetch("/api/ai/generate-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email_id: email.id }),
        });
        if (res.ok) {
          const data = await res.json();
          setReplyText(data.reply_text || "");
        }
      } catch { /* ignore */ }
      setReplyLoading(false);
    }
    generateReply();
  }, [email.id, mode]);

  // Load project members for delegate
  useEffect(() => {
    if (mode !== "delegate" || !email.project_id) return;
    async function loadMembers() {
      try {
        const res = await fetch(`/api/projects/${email.project_id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.project?.members) setMembers(data.project.members);
        }
      } catch { /* ignore */ }
    }
    loadMembers();
  }, [email.project_id, mode]);

  // Auto-expand reply textarea
  useEffect(() => {
    if (replyRef.current) {
      replyRef.current.style.height = "auto";
      replyRef.current.style.height = Math.max(200, replyRef.current.scrollHeight) + "px";
    }
  }, [replyText]);

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      if (email.outlook_message_id) {
        await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [email.sender_email],
            subject: `Re: ${email.subject}`,
            body: replyText.replace(/\n/g, "<br>"),
            reply_to_id: email.outlook_message_id,
          }),
        });
      }
      onDone(email.id);
    } catch {
      alert("Erreur lors de l'envoi");
    }
    setSending(false);
  };

  const handleDelegate = async () => {
    if (!selectedMember) return;
    setSending(true);
    try {
      const member = members.find((m) => m.user_id === selectedMember);
      if (member) {
        await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [member.email],
            subject: `Fwd: ${email.subject}`,
            body: `${delegateMessage ? `<p>${delegateMessage}</p><hr>` : ""}${emailBody}`,
            forward_id: email.outlook_message_id,
          }),
        });
      }
      onDone(email.id);
    } catch {
      alert("Erreur lors du transfert");
    }
    setSending(false);
  };

  const title = mode === "reply" ? "Réponse suggérée" : mode === "negotiate" ? "Contre-proposition" : "Déléguer";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header — fixed */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* Original email block (FIX 3a+3b) */}
          <div className="mx-6 mt-4 mb-4 rounded-lg overflow-hidden border border-gray-200" style={{ borderLeftWidth: "3px", borderLeftColor: "#9CA3AF" }}>
            <div className="bg-[#F3F4F6] px-4 py-3">
              <div className="text-xs uppercase font-semibold tracking-wide text-[#6B7280] mb-2">Email original</div>
              <div className="text-sm font-medium text-gray-800 mb-0.5">{email.subject}</div>
              <div className="text-xs text-gray-500 mb-2">De : {email.sender_name || email.sender_email}</div>
              <div className="overflow-y-auto" style={{ maxHeight: "35vh" }}>
                {bodyLoading ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />Chargement...
                  </div>
                ) : isHtml ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-600"
                    dangerouslySetInnerHTML={{ __html: emailBody }}
                  />
                ) : (
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">{emailBody}</div>
                )}
              </div>
            </div>
          </div>

          {/* Reply / Negotiate block (FIX 3b) */}
          {(mode === "reply" || mode === "negotiate") && (
            <div className="mx-6 mb-4 rounded-lg overflow-hidden border border-blue-200" style={{ borderLeftWidth: "3px", borderLeftColor: "#2563EB" }}>
              <div className="bg-[#EFF6FF] px-4 py-3">
                <div className="text-xs uppercase font-semibold tracking-wide text-[#2563EB] mb-2">
                  {mode === "negotiate" ? "Contre-proposition IA suggérée" : "Réponse IA suggérée"}
                </div>
                {replyLoading ? (
                  <div className="flex items-center gap-2 text-blue-400 text-sm py-8">
                    <Loader2 className="w-4 h-4 animate-spin" />Génération en cours...
                  </div>
                ) : (
                  <textarea
                    ref={replyRef}
                    value={replyText}
                    onChange={(e) => { setReplyText(e.target.value); setEditable(true); }}
                    readOnly={!editable}
                    onClick={() => { if (!editable) setEditable(true); }}
                    className={`w-full p-3 text-sm rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 ${editable ? "border border-blue-300 bg-white" : "border border-transparent bg-white/80 cursor-pointer"}`}
                    style={{ minHeight: "200px" }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Delegate */}
          {mode === "delegate" && (
            <div className="px-6 pb-4 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 uppercase font-medium mb-2">Transférer à</label>
                {members.length > 0 ? (
                  <select
                    value={selectedMember}
                    onChange={(e) => setSelectedMember(e.target.value)}
                    className="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choisir un membre...</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.first_name} {m.last_name} ({m.email})</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-500">Aucun membre trouvé pour ce projet.</p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase font-medium mb-2">Message (optionnel)</label>
                <textarea
                  value={delegateMessage}
                  onChange={(e) => setDelegateMessage(e.target.value)}
                  placeholder="Ajouter un message au transfert..."
                  className="w-full h-24 p-3 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer — fixed */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 flex items-center gap-3">
          {(mode === "reply" || mode === "negotiate") && (
            <>
              <button
                onClick={handleSendReply}
                disabled={sending || replyLoading || !replyText.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Envoyer
              </button>
              {!editable && (
                <button
                  onClick={() => setEditable(true)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Modifier puis envoyer
                </button>
              )}
            </>
          )}
          {mode === "delegate" && (
            <button
              onClick={handleDelegate}
              disabled={sending || !selectedMember}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#2563EB] hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              Transférer
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors ml-auto">
            Annuler
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.25s ease-out;
        }
      `}</style>
    </>
  );
}
