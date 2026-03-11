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

    // Mark is_processed = true + classification if archiving
    try {
      if (action === "archive") {
        await fetch(`/api/email/${emailId}/archive`, { method: "POST" });
      }
      // Update email_records
      await fetch(`/api/mail-test/decisions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: emailId, action }),
      });
    } catch {
      // Non-blocking — card already visually dismissed
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
      {/* ── Header ── */}
      <div className="max-w-[860px] mx-auto px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Bonjour {firstName} — {formatDate()}
        </h1>
        <p className="text-gray-500 mt-1">
          {filteredUrgent.length} urgente{filteredUrgent.length !== 1 ? "s" : ""}
          {" · "}{filteredThisWeek.length} cette semaine
          {" · "}{filteredInfo.length} info{filteredInfo.length !== 1 ? "s" : ""}
        </p>

        {/* ── Filter pills ── */}
        <div className="flex gap-3 mt-4">
          <FilterPill
            active={activeFilter === "urgent"}
            color="red"
            count={filteredUrgent.length}
            label="Urgentes"
            onClick={() => setActiveFilter(activeFilter === "urgent" ? "all" : "urgent")}
          />
          <FilterPill
            active={activeFilter === "thisWeek"}
            color="amber"
            count={filteredThisWeek.length}
            label="Cette semaine"
            onClick={() => setActiveFilter(activeFilter === "thisWeek" ? "all" : "thisWeek")}
          />
          <FilterPill
            active={activeFilter === "info"}
            color="gray"
            count={filteredInfo.length}
            label="Infos"
            onClick={() => setActiveFilter(activeFilter === "info" ? "all" : "info")}
          />
        </div>
      </div>

      {/* ── Stats bar ── */}
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

      {/* ── Decision cards ── */}
      <div className="max-w-[860px] mx-auto px-4 pb-8">
        {activeFilter === "info" ? (
          <InfoSection
            emails={filteredInfo}
            onArchive={(id) => dismissCard(id, "archive")}
            onArchiveAll={() => {
              for (const e of filteredInfo) dismissCard(e.id, "archive");
            }}
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
                onView={() => window.open(`/fr/mail?email=${email.id}`, "_blank")}
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

      {/* ── Info section below decisions ── */}
      {activeFilter !== "info" && filteredInfo.length > 0 && (
        <div className="max-w-[860px] mx-auto px-4 pb-12">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Infos du jour</h2>
          <InfoSection
            emails={filteredInfo.slice(0, 10)}
            onArchive={(id) => dismissCard(id, "archive")}
            onArchiveAll={() => {
              for (const e of filteredInfo) dismissCard(e.id, "archive");
            }}
          />
        </div>
      )}

      {/* ── Drawer ── */}
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
   DECISION CARD
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
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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
        className={`bg-white rounded-xl border border-gray-100 border-l-4 ${borderColor} shadow-sm transition-all duration-350 ${exiting ? "opacity-0 -translate-x-8" : "opacity-100 translate-x-0"}`}
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${badge.color}`}>{badge.label}</span>
            {email.project_name && <span className="text-xs text-gray-500 font-medium">{email.project_name}</span>}
          </div>

          {/* Content */}
          <p className="text-gray-800 font-medium mb-1">
            {email.sender_name || email.sender_email} a répondu à ta demande de prix
          </p>
          {email.ai_summary && (
            <p className="text-sm text-gray-500 mb-3 line-clamp-2">{email.ai_summary}</p>
          )}

          {/* Price indicator */}
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

          {/* Quote actions */}
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
      className={`bg-white rounded-xl border border-gray-100 border-l-4 ${borderColor} shadow-sm transition-all duration-350 ${exiting ? "opacity-0 -translate-x-8" : "opacity-100 translate-x-0"}`}
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${badge.color}`}>{badge.label}</span>
          {email.project_name && <span className="text-xs text-gray-500 font-medium">{email.project_name}</span>}
          <span className="text-xs text-gray-400 ml-auto">il y a {timeAgo(email.received_at)}</span>
        </div>

        {/* Summary */}
        <p className="text-sm text-gray-700 mb-2 line-clamp-2">
          {email.ai_summary || email.body_preview || email.subject}
        </p>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
          <span>De : {email.sender_name || email.sender_email}</span>
          {email.priority === "urgent" && (
            <span className="text-red-500 font-medium">Répondre sous 24h</span>
          )}
        </div>

        {/* Actions */}
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

          {/* More menu */}
          <div className="relative ml-auto" ref={menuRef}>
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
              <ChevronDown className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <button onClick={() => { setMenuOpen(false); handleAction(onCreateTask); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <ListTodo className="w-4 h-4" />Créer une tâche
                </button>
                <button onClick={() => { setMenuOpen(false); handleAction(onArchive); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <Archive className="w-4 h-4" />Archiver
                </button>
                <button onClick={() => { setMenuOpen(false); handleAction(handleSnooze); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
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

  function handleSnooze() {
    onSnooze();
  }
}

/* ═══════════════════════════════════════════════════════════
   INFO SECTION
   ═══════════════════════════════════════════════════════════ */

function InfoSection({ emails, onArchive, onArchiveAll }: {
  emails: DecisionEmail[];
  onArchive: (id: string) => void;
  onArchiveAll: () => void;
}) {
  if (emails.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {emails.map((email, i) => (
        <div key={email.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-gray-50" : ""} hover:bg-gray-50 transition-colors`}>
          <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700 truncate w-36 flex-shrink-0">{email.sender_name || email.sender_email}</span>
          <span className="text-sm text-gray-500 truncate flex-1">{email.subject}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">il y a {timeAgo(email.received_at)}</span>
          <button onClick={() => onArchive(email.id)} className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0 px-2 py-1 hover:bg-gray-100 rounded transition-colors">
            Archiver
          </button>
        </div>
      ))}
      {emails.length > 1 && (
        <div className="border-t border-gray-100 px-4 py-2.5">
          <button onClick={onArchiveAll} className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
            Tout archiver
          </button>
        </div>
      )}
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
   DRAWER — Reply / Delegate / Negotiate
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
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [selectedMember, setSelectedMember] = useState("");
  const [delegateMessage, setDelegateMessage] = useState("");
  const [editable, setEditable] = useState(false);

  // Load email body
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
          setEmailBody(data.body || email.body_preview || "");
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
          // project_members are not directly returned, but we can use the project data
          // For now, use a simple approach
          if (data.project?.members) setMembers(data.project.members);
        }
      } catch { /* ignore */ }
    }
    loadMembers();
  }, [email.project_id, mode]);

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      // Send via email
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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Original email */}
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <div className="text-xs text-gray-400 mb-1 uppercase font-medium">Email original</div>
            <div className="text-sm font-medium text-gray-800 mb-1">{email.subject}</div>
            <div className="text-xs text-gray-500 mb-2">De : {email.sender_name || email.sender_email}</div>
            {bodyLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" />Chargement...
              </div>
            ) : (
              <div className="text-sm text-gray-600 max-h-40 overflow-y-auto whitespace-pre-wrap">{emailBody.replace(/<[^>]+>/g, "").slice(0, 1000)}</div>
            )}
          </div>

          {/* Reply / Negotiate */}
          {(mode === "reply" || mode === "negotiate") && (
            <div className="px-6 py-4">
              <div className="text-xs text-gray-400 mb-2 uppercase font-medium">
                {mode === "negotiate" ? "Contre-proposition IA" : "Réponse IA"}
              </div>
              {replyLoading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
                  <Loader2 className="w-4 h-4 animate-spin" />Génération en cours...
                </div>
              ) : (
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  readOnly={!editable}
                  className={`w-full h-48 p-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${editable ? "border-blue-300 bg-white" : "border-gray-200 bg-gray-50"}`}
                />
              )}
            </div>
          )}

          {/* Delegate */}
          {mode === "delegate" && (
            <div className="px-6 py-4 space-y-4">
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
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
