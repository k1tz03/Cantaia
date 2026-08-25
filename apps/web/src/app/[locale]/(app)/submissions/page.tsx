"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import {
  FileSpreadsheet,
  FileText,
  Plus,
  Trash2,
  ChevronRight,
  Search,
  Send,
  CheckCircle2,
  Clock,
  BarChart3,
  Trophy,
  AlertTriangle,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FollowupSection } from "@/components/briefing/FollowupSection";

interface PriceStats {
  sent: number;
  responded: number;
  pending: number;
}

interface AwardedInfo {
  request_id: string;
  supplier_name: string;
}

interface SubmissionRow {
  id: string;
  project_id: string;
  file_name: string | null;
  file_type: string | null;
  analysis_status: string;
  created_at: string;
  deadline?: string | null;
  budget_estimate?: { total_median?: number; awarded_request_id?: string } | null;
  price_stats: PriceStats;
  quotes_count: number;
  awarded: AwardedInfo | null;
  projects?: {
    id: string;
    name: string;
    code: string | null;
    color: string | null;
    client_name: string | null;
    city: string | null;
  };
}

export default function SubmissionsPage() {
  const t = useTranslations("submissions");
  const locale = useLocale();
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  async function fetchSubmissions() {
    try {
      const res = await fetch("/api/submissions");
      const json = await res.json();
      if (json.success) setSubmissions(json.submissions || []);
    } catch (err) {
      console.error("[submissions] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    // The row is only removed once the server confirmed the deletion — the old
    // code removed it unconditionally, showing a false success on any failure.
    setDeleteError(null);
    try {
      const res = await fetch(`/api/submissions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setDeleteError(json?.error || t("list.deleteFailed"));
        return;
      }
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("[submissions] delete error:", err);
      setDeleteError(t("list.deleteFailed"));
    } finally {
      setDeleteId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!search) return submissions;
    const q = search.toLowerCase();
    return submissions.filter(
      (s) =>
        (s.file_name || "").toLowerCase().includes(q) ||
        (s.projects?.name || "").toLowerCase().includes(q) ||
        (s.projects?.client_name || "").toLowerCase().includes(q) ||
        (s.projects?.city || "").toLowerCase().includes(q)
    );
  }, [submissions, search]);

  // Group by project
  const grouped = useMemo(() => {
    const map = new Map<string, { project: SubmissionRow["projects"]; subs: SubmissionRow[] }>();
    for (const sub of filtered) {
      const pid = sub.project_id || "no-project";
      if (!map.has(pid)) {
        map.set(pid, { project: sub.projects, subs: [] });
      }
      map.get(pid)!.subs.push(sub);
    }
    return Array.from(map.values());
  }, [filtered]);

  // Global KPIs
  const kpis = useMemo(() => {
    let totalSent = 0;
    let totalResponded = 0;
    let totalPending = 0;
    let totalAwarded = 0;
    for (const sub of submissions) {
      totalSent += sub.price_stats.sent;
      totalResponded += sub.price_stats.responded;
      totalPending += sub.price_stats.pending;
      if (sub.awarded) totalAwarded++;
    }
    const responseRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0;
    return { totalSent, totalResponded, totalPending, totalAwarded, responseRate };
  }, [submissions]);

  const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
    pending: { label: t("list.statusPending"), className: "bg-[#27272A] text-[#A1A1AA] border border-[#27272A]", dot: "bg-[#71717A]" },
    analyzing: { label: t("list.statusAnalyzing"), className: "bg-purple-500/10 text-purple-400 border border-purple-500/20 animate-pulse", dot: "bg-purple-500" },
    done: { label: t("list.statusDone"), className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20", dot: "bg-emerald-500" },
    error: { label: t("list.statusError"), className: "bg-red-500/10 text-red-400 border border-red-500/20", dot: "bg-red-500" },
  };

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 overflow-auto h-full bg-[#0F0F11]">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-extrabold text-[#FAFAFA]">
              {t("title")}
            </h1>
            <p className="text-[13px] text-[#A1A1AA] mt-0.5">
              {t("list.countSummary", { submissions: submissions.length, sites: grouped.length })}
            </p>
          </div>
          <Link
            href="/submissions/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#F97316] px-4 py-2 text-sm font-medium text-[#0F0F11] shadow-sm transition-all hover:bg-[#EA580C] hover:shadow"
          >
            <Plus className="h-4 w-4" />
            {t("newSubmission")}
          </Link>
        </div>

        {/* Delete failure banner — never a silent false success */}
        {deleteError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-400 flex-1">{deleteError}</p>
            <button
              onClick={() => setDeleteError(null)}
              className="text-red-400 hover:text-red-300"
              aria-label={t("list.deleteFailed")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Global KPIs */}
        {submissions.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <Send className="h-3.5 w-3.5 text-[#F97316]" />
                <span className="text-[11px] font-medium text-[#A1A1AA] uppercase">{t("list.kpiSent")}</span>
              </div>
              <div className="text-xl font-bold text-[#FAFAFA] tabular-nums">{kpis.totalSent}</div>
            </div>
            <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-[11px] font-medium text-[#A1A1AA] uppercase">{t("list.kpiResponses")}</span>
              </div>
              <div className="text-xl font-bold text-[#FAFAFA] tabular-nums">{kpis.totalResponded}</div>
            </div>
            <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[11px] font-medium text-[#A1A1AA] uppercase">{t("list.kpiPending")}</span>
              </div>
              <div className="text-xl font-bold text-[#FAFAFA] tabular-nums">{kpis.totalPending}</div>
            </div>
            <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-[11px] font-medium text-[#A1A1AA] uppercase">{t("list.kpiResponseRate")}</span>
              </div>
              <div className="text-xl font-bold text-[#FAFAFA] tabular-nums">{kpis.responseRate}%</div>
            </div>
            <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-3.5 w-3.5 text-[#F97316]" />
                <span className="text-[11px] font-medium text-[#A1A1AA] uppercase">{t("list.kpiAwarded")}</span>
              </div>
              <div className="text-xl font-bold text-[#FAFAFA] tabular-nums">{kpis.totalAwarded}</div>
            </div>
          </div>
        )}

        {/* Followup Engine — relances en attente */}
        <FollowupSection />

        {/* Search */}
        {submissions.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A1A1AA]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              className="w-full pl-10 pr-4 py-2 border border-[#27272A] rounded-xl text-sm bg-[#18181B] text-[#FAFAFA] placeholder:text-[#71717A] focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#FAFAFA]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* List grouped by project */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-[#18181B] border border-[#27272A] rounded-xl p-4 space-y-3">
                <div className="h-5 w-48 animate-pulse rounded bg-[#27272A]" />
                <div className="h-16 animate-pulse rounded bg-[#27272A]" />
                <div className="h-16 animate-pulse rounded bg-[#27272A]" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#27272A] border border-[#27272A] flex items-center justify-center mb-4 shadow-sm">
              <FileSpreadsheet className="h-7 w-7 text-[#A1A1AA]" />
            </div>
            <p className="text-sm font-semibold text-[#A1A1AA]">
              {search ? t("list.noResults") : t("noSubmissions")}
            </p>
            <p className="text-xs text-[#A1A1AA] mt-1">
              {search ? t("list.noResultsHint") : t("noSubmissionsDesc")}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(({ project, subs }) => {
              // Aggregate stats for this project
              const projSent = subs.reduce((s, sub) => s + sub.price_stats.sent, 0);
              const projResponded = subs.reduce((s, sub) => s + sub.price_stats.responded, 0);
              const projPending = subs.reduce((s, sub) => s + sub.price_stats.pending, 0);
              const projAwarded = subs.filter((s) => s.awarded).length;

              return (
                <div key={project?.id || "no-project"} className="bg-[#18181B] border border-[#27272A] rounded-xl overflow-hidden">
                  {/* Project header */}
                  <div className="px-4 py-3 bg-[#1C1C1F] border-b border-[#27272A] flex items-center gap-3 flex-wrap">
                    {project?.color && (
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                    )}
                    <span className="text-sm font-semibold text-[#FAFAFA]">
                      {project?.name || t("list.noProject")}
                    </span>
                    {project?.client_name && (
                      <span className="text-xs text-[#A1A1AA]">— {project.client_name}</span>
                    )}
                    {project?.city && (
                      <span className="text-xs text-[#A1A1AA]">{project.city}</span>
                    )}
                    <div className="flex items-center gap-3 ml-auto text-[11px] text-[#A1A1AA]">
                      {projSent > 0 && (
                        <>
                          <span className="flex items-center gap-1">
                            <Send className="h-3 w-3 text-[#F97316]" />{projSent}
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />{projResponded}
                          </span>
                          {projPending > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-amber-500" />{projPending}
                            </span>
                          )}
                        </>
                      )}
                      {projAwarded > 0 && (
                        <span className="flex items-center gap-1 text-[#F97316]">
                          <Trophy className="h-3 w-3" />{projAwarded}
                        </span>
                      )}
                      <span className="text-[#A1A1AA]">{t("list.submissionCount", { count: subs.length })}</span>
                    </div>
                  </div>

                  {/* Submission rows */}
                  <div className="divide-y divide-[#27272A]">
                    {subs.map((sub) => {
                      const sc = statusConfig[sub.analysis_status] || statusConfig.pending;
                      const { sent, responded, pending } = sub.price_stats;
                      const responseRate = sent > 0 ? Math.round((responded / sent) * 100) : 0;

                      // Deadline + response rate combined alert
                      let deadlineLabel: React.ReactNode = null;
                      if (sub.deadline) {
                        const daysLeft = Math.ceil((new Date(sub.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        const missingPct = sent > 0 ? Math.round(((sent - responded) / sent) * 100) : 0;
                        const hasMissing = sent > 0 && responded < sent;

                        if (daysLeft < 0) {
                          deadlineLabel = (
                            <span className="text-red-400 flex items-center gap-1 text-[11px]">
                              <AlertTriangle className="h-3 w-3" />
                              {hasMissing
                                ? t("list.deadlineExpiredMissing", { pct: missingPct })
                                : t("expired")}
                            </span>
                          );
                        } else if (daysLeft <= 5 && hasMissing) {
                          deadlineLabel = (
                            <span className={`flex items-center gap-1 text-[11px] ${daysLeft <= 2 ? "text-red-400" : "text-amber-400"}`}>
                              <AlertTriangle className="h-3 w-3" />
                              {t("list.deadlineSoonMissing", { days: daysLeft, pct: missingPct })}
                            </span>
                          );
                        } else if (daysLeft <= 3) {
                          deadlineLabel = (
                            <span className="text-amber-400 text-[11px]">
                              {t("list.deadlineRemaining", { days: daysLeft })}
                            </span>
                          );
                        } else {
                          deadlineLabel = (
                            <span className="text-[#A1A1AA] text-[11px]">
                              {hasMissing
                                ? t("list.deadlinePendingPct", { days: daysLeft, pct: missingPct })
                                : t("list.deadlineDays", { days: daysLeft })}
                            </span>
                          );
                        }
                      }

                      return (
                        <div
                          key={sub.id}
                          className="flex items-center gap-4 px-4 py-3 hover:bg-[#27272A]/30 transition-colors group"
                        >
                          <Link
                            href={`/submissions/${sub.id}`}
                            className="flex items-center gap-4 flex-1 min-w-0"
                          >
                            {/* File icon */}
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${sub.file_type === "pdf" ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
                              {sub.file_type === "pdf" ? (
                                <FileText className="h-4 w-4 text-red-500" />
                              ) : (
                                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                              )}
                            </div>

                            {/* Name + status */}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-[13px] text-[#FAFAFA] truncate group-hover:text-[#F97316] transition-colors">
                                {sub.file_name || t("list.untitled")}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${sc.className}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                  {sc.label}
                                </span>
                                {sub.awarded && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                    <Trophy className="h-2.5 w-2.5" />
                                    {sub.awarded.supplier_name}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Price request stats */}
                            {sent > 0 && (
                              <div className="hidden sm:flex items-center gap-3 shrink-0">
                                {/* Mini progress bar */}
                                <div className="flex flex-col items-end gap-0.5">
                                  <div className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA] tabular-nums">
                                    <span>{responded}/{sent}</span>
                                    <span className="text-[#A1A1AA]">·</span>
                                    <span className={responseRate >= 75 ? "text-emerald-400" : responseRate >= 50 ? "text-amber-400" : "text-[#A1A1AA]"}>
                                      {responseRate}%
                                    </span>
                                  </div>
                                  <div className="w-20 h-1.5 bg-[#27272A] rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        responseRate >= 75 ? "bg-emerald-500" : responseRate >= 50 ? "bg-amber-500" : "bg-[#F97316]"
                                      }`}
                                      style={{ width: `${responseRate}%` }}
                                    />
                                  </div>
                                </div>
                                {pending > 0 && (
                                  <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                                    {t("list.pendingCount", { count: pending })}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Deadline */}
                            {deadlineLabel && (
                              <div className="hidden md:block text-[11px] shrink-0">
                                {deadlineLabel}
                              </div>
                            )}

                            {/* Date */}
                            <p className="text-xs text-[#A1A1AA] shrink-0 tabular-nums">
                              {formatDate(sub.created_at, locale)}
                            </p>
                            <ChevronRight className="h-4 w-4 text-[#A1A1AA] group-hover:text-[#F97316] transition-colors shrink-0" />
                          </Link>
                          <button
                            onClick={() => setDeleteId(sub.id)}
                            className="p-1.5 text-[#A1A1AA] hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) handleDelete(deleteId); }}
        title={t("list.deleteTitle")}
        description={t("list.deleteDescription")}
        variant="danger"
      />
    </div>
  );
}
