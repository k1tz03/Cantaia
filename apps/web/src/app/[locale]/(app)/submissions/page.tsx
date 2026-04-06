"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Link } from "@/i18n/navigation";
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
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
    try {
      await fetch(`/api/submissions/${id}`, { method: "DELETE" });
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("[submissions] delete error:", err);
    }
    setDeleteId(null);
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
    pending: { label: "En attente", className: "bg-[#27272A] text-[#71717A] border border-[#27272A]", dot: "bg-[#71717A]" },
    analyzing: { label: "Analyse...", className: "bg-purple-500/10 text-purple-400 border border-purple-500/20 animate-pulse", dot: "bg-purple-500" },
    done: { label: "Analysé", className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20", dot: "bg-emerald-500" },
    error: { label: "Erreur", className: "bg-red-500/10 text-red-400 border border-red-500/20", dot: "bg-red-500" },
  };

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 overflow-auto h-full bg-[#0F0F11]">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-extrabold text-[#FAFAFA]">
              Soumissions
            </h1>
            <p className="text-[13px] text-[#71717A] mt-0.5">
              {submissions.length} soumission{submissions.length !== 1 ? "s" : ""} · {grouped.length} chantier{grouped.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href="/submissions/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#F97316] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#EA580C] hover:shadow"
          >
            <Plus className="h-4 w-4" />
            Nouvelle soumission
          </Link>
        </div>

        {/* Global KPIs */}
        {submissions.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <Send className="h-3.5 w-3.5 text-[#F97316]" />
                <span className="text-[11px] font-medium text-[#71717A] uppercase">Envoyées</span>
              </div>
              <div className="text-xl font-bold text-[#FAFAFA] tabular-nums">{kpis.totalSent}</div>
            </div>
            <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-[11px] font-medium text-[#71717A] uppercase">Réponses</span>
              </div>
              <div className="text-xl font-bold text-[#FAFAFA] tabular-nums">{kpis.totalResponded}</div>
            </div>
            <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[11px] font-medium text-[#71717A] uppercase">En attente</span>
              </div>
              <div className="text-xl font-bold text-[#FAFAFA] tabular-nums">{kpis.totalPending}</div>
            </div>
            <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-[11px] font-medium text-[#71717A] uppercase">Taux réponse</span>
              </div>
              <div className="text-xl font-bold text-[#FAFAFA] tabular-nums">{kpis.responseRate}%</div>
            </div>
            <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-3.5 w-3.5 text-[#F97316]" />
                <span className="text-[11px] font-medium text-[#71717A] uppercase">Attribuées</span>
              </div>
              <div className="text-xl font-bold text-[#FAFAFA] tabular-nums">{kpis.totalAwarded}</div>
            </div>
          </div>
        )}

        {/* Search */}
        {submissions.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#71717A]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, projet, client, ville..."
              className="w-full pl-10 pr-4 py-2 border border-[#27272A] rounded-xl text-sm bg-[#18181B] text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-[#FAFAFA]">
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
              <FileSpreadsheet className="h-7 w-7 text-[#71717A]" />
            </div>
            <p className="text-sm font-semibold text-[#71717A]">
              {search ? "Aucun résultat" : "Aucune soumission"}
            </p>
            <p className="text-xs text-[#71717A] mt-1">
              {search ? "Essayez un autre terme" : "Importez un descriptif pour commencer"}
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
                      {project?.name || "Sans projet"}
                    </span>
                    {project?.client_name && (
                      <span className="text-xs text-[#71717A]">— {project.client_name}</span>
                    )}
                    {project?.city && (
                      <span className="text-xs text-[#52525B]">{project.city}</span>
                    )}
                    <div className="flex items-center gap-3 ml-auto text-[11px] text-[#71717A]">
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
                      <span className="text-[#52525B]">{subs.length} soumission{subs.length > 1 ? "s" : ""}</span>
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
                              Expiré{hasMissing ? ` · ${missingPct}% sans réponse` : ""}
                            </span>
                          );
                        } else if (daysLeft <= 5 && hasMissing) {
                          deadlineLabel = (
                            <span className={`flex items-center gap-1 text-[11px] ${daysLeft <= 2 ? "text-red-400" : "text-amber-400"}`}>
                              <AlertTriangle className="h-3 w-3" />
                              {daysLeft}j · {missingPct}% sans réponse
                            </span>
                          );
                        } else if (daysLeft <= 3) {
                          deadlineLabel = <span className="text-amber-400 text-[11px]">{daysLeft}j restant{daysLeft > 1 ? "s" : ""}</span>;
                        } else {
                          deadlineLabel = (
                            <span className="text-[#71717A] text-[11px]">
                              {daysLeft}j{hasMissing ? ` · ${missingPct}% en attente` : ""}
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
                                {sub.file_name || "Sans nom"}
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
                                    <span className="text-[#52525B]">·</span>
                                    <span className={responseRate >= 75 ? "text-emerald-400" : responseRate >= 50 ? "text-amber-400" : "text-[#71717A]"}>
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
                                    {pending} en attente
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
                            <p className="text-xs text-[#71717A] shrink-0 tabular-nums">
                              {new Date(sub.created_at).toLocaleDateString("fr-CH")}
                            </p>
                            <ChevronRight className="h-4 w-4 text-[#71717A] group-hover:text-[#F97316] transition-colors shrink-0" />
                          </Link>
                          <button
                            onClick={() => setDeleteId(sub.id)}
                            className="p-1.5 text-[#71717A] hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
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
        title="Supprimer cette soumission ?"
        description="La soumission et toutes les données associées seront supprimées définitivement."
        variant="danger"
      />
    </div>
  );
}
