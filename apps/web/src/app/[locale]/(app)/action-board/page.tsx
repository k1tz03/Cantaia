"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  CheckSquare,
  FileSpreadsheet,
  Map,
  Shield,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Reply,
  Archive,
  Check,
  Clock,
  Eye,
  Bell,
  Zap,
} from "lucide-react";
import { cn } from "@cantaia/ui";

/* ─── Types ─── */

interface ActionButton {
  label: string;
  action: string;
  variant: "primary" | "secondary" | "ghost";
}

interface ActionItem {
  id: string;
  type: "email" | "task" | "submission" | "plan" | "guarantee";
  priority: "critical" | "high" | "medium" | "info";
  title: string;
  subtitle: string;
  projectName: string | null;
  projectColor: string | null;
  entityId: string;
  createdAt: string;
  actions: ActionButton[];
}

interface ActionBoardData {
  stats: {
    urgent: number;
    thisWeek: number;
    overdue: number;
    activeProjects: number;
  };
  items: ActionItem[];
  lastSyncAt: string | null;
  briefingSummary: string | null;
}

/* ─── Constants ─── */

const TYPE_ICONS: Record<ActionItem["type"], React.ElementType> = {
  email: Mail,
  task: CheckSquare,
  submission: FileSpreadsheet,
  plan: Map,
  guarantee: Shield,
};

const TYPE_COLORS: Record<ActionItem["type"], string> = {
  email: "text-blue-600 bg-blue-50",
  task: "text-amber-600 bg-amber-50",
  submission: "text-purple-600 bg-purple-50",
  plan: "text-teal-600 bg-teal-50",
  guarantee: "text-red-600 bg-red-50",
};

const PRIORITY_BORDER: Record<ActionItem["priority"], string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-400",
  medium: "border-l-blue-400",
  info: "border-l-gray-300",
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  reply: Reply,
  archive: Archive,
  mark_done: Check,
  postpone: Clock,
  view: Eye,
  remind: Bell,
};

/* ─── Helper ─── */

function formatRelativeTime(dateStr: string, locale: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return locale === "de" ? "gerade eben" : locale === "en" ? "just now" : "maintenant";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}

function formatFullDate(locale: string): string {
  const now = new Date();
  const localeMap: Record<string, string> = {
    fr: "fr-CH",
    en: "en-CH",
    de: "de-CH",
  };
  return now.toLocaleDateString(localeMap[locale] || "fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ─── Component ─── */

export default function ActionBoardPage() {
  const t = useTranslations("actionBoard");
  const locale = useLocale();
  const router = useRouter();
  const { user } = useAuth();

  const [data, setData] = useState<ActionBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [aiExpanded, setAiExpanded] = useState(false);
  const [generatingBriefing, setGeneratingBriefing] = useState(false);

  const firstName =
    user?.user_metadata?.first_name ||
    user?.user_metadata?.full_name?.split(" ")[0] ||
    "";

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/action-board");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync emails
  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/outlook/sync", { method: "POST" });
      await fetchData();
    } catch {
      // silent
    } finally {
      setSyncing(false);
    }
  }, [fetchData]);

  // Remove card with animation
  const removeCard = useCallback(
    (itemId: string) => {
      setRemovingIds((prev) => new Set(prev).add(itemId));
      // After animation, update data
      setTimeout(() => {
        setData((prev) => {
          if (!prev) return prev;
          const newItems = prev.items.filter((i) => i.id !== itemId);
          const urgent = newItems.filter(
            (i) => i.priority === "critical" || i.priority === "high"
          ).length;
          const thisWeek = newItems.filter(
            (i) => i.priority === "medium"
          ).length;
          const overdue = newItems.filter(
            (i) => i.type === "task" && i.priority === "critical"
          ).length;
          return {
            ...prev,
            items: newItems,
            stats: {
              ...prev.stats,
              urgent,
              thisWeek,
              overdue,
            },
          };
        });
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }, 300);
    },
    []
  );

  // Action handlers
  const handleAction = useCallback(
    async (item: ActionItem, action: string) => {
      switch (action) {
        case "reply":
          router.push(`/mail?emailId=${item.entityId}`);
          break;

        case "archive":
          try {
            await fetch(`/api/email/${item.entityId}/archive`, {
              method: "POST",
            });
            removeCard(item.id);
          } catch {
            // silent
          }
          break;

        case "mark_done":
          try {
            await fetch(`/api/tasks/${item.entityId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "done" }),
            });
            removeCard(item.id);
          } catch {
            // silent
          }
          break;

        case "postpone":
          try {
            const newDate = new Date();
            newDate.setDate(newDate.getDate() + 7);
            await fetch(`/api/tasks/${item.entityId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                due_date: newDate.toISOString().split("T")[0],
              }),
            });
            removeCard(item.id);
          } catch {
            // silent
          }
          break;

        case "view":
          if (item.type === "email") router.push(`/mail?emailId=${item.entityId}`);
          else if (item.type === "task") router.push("/tasks");
          else if (item.type === "submission")
            router.push(`/submissions/${item.entityId}`);
          else if (item.type === "plan")
            router.push(`/plans/${item.entityId}`);
          else if (item.type === "guarantee") router.push("/projects");
          break;

        case "remind":
          try {
            await fetch(`/api/submissions/${item.entityId}/relance`, {
              method: "POST",
            });
          } catch {
            // silent
          }
          break;
      }
    },
    [router, removeCard]
  );

  // Generate briefing
  const handleGenerateBriefing = useCallback(async () => {
    setGeneratingBriefing(true);
    try {
      const res = await fetch("/api/briefing/generate", { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        setData((prev) =>
          prev
            ? { ...prev, briefingSummary: json.briefing?.summary || null }
            : prev
        );
      }
    } catch {
      // silent
    } finally {
      setGeneratingBriefing(false);
    }
  }, []);

  // Last sync relative time
  const lastSyncText = data?.lastSyncAt
    ? formatRelativeTime(data.lastSyncAt, locale)
    : null;

  /* ─── Render ─── */

  if (loading) {
    return (
      <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto w-full">
        {/* Header skeleton */}
        <div className="mb-6">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="h-5 w-64 bg-gray-100 rounded animate-pulse" />
        </div>
        {/* Card skeletons */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 bg-gray-50 rounded-xl border border-gray-100 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{t("errorLoading")}</p>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              fetchData();
            }}
            className="px-4 py-2 bg-[#2563EB] text-white rounded-lg text-sm font-medium hover:bg-[#1D4ED8] transition-colors"
          >
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  const stats = data?.stats || {
    urgent: 0,
    thisWeek: 0,
    overdue: 0,
    activeProjects: 0,
  };
  const items = data?.items || [];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ─── Zone 1: Header ─── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4">
          {/* Top row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-bold text-gray-900">
                {t("greeting", { name: firstName })}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5 capitalize">
                {formatFullDate(locale)}
              </p>
            </div>

            {/* KPI pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
                  stats.urgent > 0
                    ? "bg-red-50 text-red-700"
                    : "bg-gray-100 text-gray-500"
                )}
              >
                {stats.urgent} {t("statUrgent")}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
                  stats.thisWeek > 0
                    ? "bg-orange-50 text-orange-700"
                    : "bg-gray-100 text-gray-500"
                )}
              >
                {stats.thisWeek} {t("statThisWeek")}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
                  stats.overdue > 0
                    ? "bg-red-50 text-red-700"
                    : "bg-gray-100 text-gray-500"
                )}
              >
                {stats.overdue} {t("statOverdue")}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                {stats.activeProjects} {t("statProjects")}
              </span>
            </div>
          </div>

          {/* Sync row */}
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {t("sync")}
            </button>
            {lastSyncText && (
              <span className="text-xs text-gray-400">
                {t("lastSync", { time: lastSyncText })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Zone 2: Decision Feed ─── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 mb-4">
                <Zap className="h-8 w-8 text-green-500" />
              </div>
              <p className="text-lg font-medium text-gray-900">
                {t("emptyTitle")}
              </p>
              <p className="text-sm text-gray-500 mt-1">{t("emptySubtitle")}</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {items
                .filter((item) => !removingIds.has(item.id))
                .map((item) => {
                  const Icon = TYPE_ICONS[item.type];
                  const colorClass = TYPE_COLORS[item.type];
                  const borderClass = PRIORITY_BORDER[item.priority];

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -80, height: 0, marginBottom: 0 }}
                      transition={{
                        opacity: { duration: 0.2 },
                        y: { duration: 0.2 },
                        x: { duration: 0.25 },
                        height: { duration: 0.25, delay: 0.1 },
                        layout: { duration: 0.25 },
                      }}
                      className={cn(
                        "mb-2 rounded-xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow border-l-[3px]",
                        borderClass
                      )}
                    >
                      <div className="flex items-start gap-3 p-3 sm:p-4">
                        {/* Icon */}
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            colorClass
                          )}
                        >
                          <Icon className="h-4.5 w-4.5" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {item.title}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5 truncate">
                                {item.subtitle}
                              </p>
                            </div>
                            <span className="text-[11px] text-gray-400 shrink-0 mt-0.5">
                              {formatRelativeTime(item.createdAt, locale)}
                            </span>
                          </div>

                          {/* Project badge + actions */}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2">
                            {/* Project badge */}
                            {item.projectName && (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="h-2 w-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor:
                                      item.projectColor || "#6B7280",
                                  }}
                                />
                                <span className="text-xs text-gray-500 truncate max-w-[200px]">
                                  {item.projectName}
                                </span>
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                              {item.actions.map((btn) => {
                                const BtnIcon = ACTION_ICONS[btn.action] || Eye;
                                return (
                                  <button
                                    key={btn.action}
                                    onClick={() =>
                                      handleAction(item, btn.action)
                                    }
                                    className={cn(
                                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                                      btn.variant === "primary" &&
                                        "bg-[#2563EB] text-white hover:bg-[#1D4ED8]",
                                      btn.variant === "secondary" &&
                                        "bg-gray-100 text-gray-700 hover:bg-gray-200",
                                      btn.variant === "ghost" &&
                                        "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                                    )}
                                  >
                                    <BtnIcon className="h-3 w-3" />
                                    <span className="hidden sm:inline">
                                      {t(`action_${btn.label}`)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
            </AnimatePresence>
          )}
        </div>

        {/* ─── Zone 3: AI Summary ─── */}
        <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-6">
          <div className="rounded-xl border border-gray-200 bg-gray-50/50">
            <button
              onClick={() => setAiExpanded(!aiExpanded)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors rounded-xl"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span>{t("aiSummaryTitle")}</span>
              </div>
              {aiExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>

            <AnimatePresence>
              {aiExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 border-t border-gray-200 pt-3">
                    {data?.briefingSummary ? (
                      <div>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                          {data.briefingSummary}
                        </p>
                        <div className="flex items-center justify-between mt-3">
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                            <Sparkles className="h-3 w-3" />
                            {t("aiGenerated")}
                          </span>
                          <button
                            onClick={handleGenerateBriefing}
                            disabled={generatingBriefing}
                            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
                          >
                            {generatingBriefing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            {t("aiRefresh")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-sm text-gray-500 mb-3">
                          {t("aiNoSummary")}
                        </p>
                        <button
                          onClick={handleGenerateBriefing}
                          disabled={generatingBriefing}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white rounded-lg text-sm font-medium hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
                        >
                          {generatingBriefing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          {t("aiGenerate")}
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
