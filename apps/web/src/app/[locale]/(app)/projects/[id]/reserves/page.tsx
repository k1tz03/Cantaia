"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useProject } from "@/lib/hooks/use-supabase-data";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  X,
  Loader2,
} from "lucide-react";
import {
  formatDate,
} from "@/lib/format";
import type { ReceptionReserve } from "@cantaia/database";

const severityConfig = {
  minor: { label: "minor", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", icon: "🟡" },
  major: { label: "major", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10", icon: "🔴" },
  blocking: { label: "blocking", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", icon: "🔴" },
};

const statusConfig = {
  open: { color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", icon: AlertTriangle },
  in_progress: { color: "text-[#F97316]", bg: "bg-[#F97316]/10", icon: Clock },
  corrected: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", icon: Clock },
  verified: { color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", icon: CheckCircle },
  disputed: { color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10", icon: XCircle },
};

export default function ReservesPage() {
  const params = useParams();
  const t = useTranslations("closure");
  const tCommon = useTranslations("common");
  const projectId = params.id as string;

  const { project, loading: projectLoading } = useProject(projectId);

  const [reception, setReception] = useState<{ id: string; reception_date?: string } | null>(null);
  const [reserves, setReserves] = useState<ReceptionReserve[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedReserve, setSelectedReserve] = useState<ReceptionReserve | null>(null);
  const [correctionNotes, setCorrectionNotes] = useState("");

  // ── Load receptions + reserves (RLS-scoped to the user's org) ──
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    (async () => {
      setDataLoading(true);
      setLoadError(null);
      try {
        const supabase = createClient();
        const [recRes, resRes] = await Promise.all([
          (supabase.from("project_receptions") as any)
            .select("id, reception_date")
            .eq("project_id", projectId)
            .order("reception_date", { ascending: false })
            .limit(1),
          (supabase.from("reception_reserves") as any)
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: true }),
        ]);

        if (cancelled) return;
        if (recRes.error || resRes.error) {
          // Tables may not exist yet (migration 010 not applied)
          setLoadError(recRes.error?.message || resRes.error?.message || null);
        }
        setReception(recRes.data?.[0] || null);
        setReserves(resRes.data || []);
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || "Erreur de chargement");
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  /** Persists a status change on one reserve, then syncs local state. */
  const updateReserve = useCallback(
    async (reserveId: string, updates: Record<string, unknown>) => {
      setSaving(true);
      try {
        const supabase = createClient();
        const { data, error } = await (supabase.from("reception_reserves") as any)
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", reserveId)
          .select("*")
          .single();

        if (error) {
          console.error("[Reserves] Update error:", error.message);
          setLoadError(error.message);
          return;
        }

        setReserves((prev) => prev.map((r) => (r.id === reserveId ? data : r)));
        setSelectedReserve(null);
        setCorrectionNotes("");
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  if (projectLoading || dataLoading) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
        <span className="sr-only">{tCommon("loading")}</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <p className="text-[#71717A]">{t("projectNotFound")}</p>
      </div>
    );
  }

  const verifiedCount = reserves.filter((r) => r.status === "verified").length;
  const totalCount = reserves.length;
  const allVerified = totalCount > 0 && verifiedCount === totalCount;

  const isOverdue = (reserve: ReceptionReserve) => {
    if (!reserve.deadline) return false;
    return reserve.deadline < new Date().toISOString().split("T")[0] && reserve.status !== "verified";
  };

  const handleMarkCorrected = (reserveId: string) => {
    updateReserve(reserveId, {
      status: "corrected",
      correction_notes: correctionNotes.trim() || null,
      corrected_at: new Date().toISOString(),
    });
  };

  const handleMarkVerified = (reserveId: string) => {
    updateReserve(reserveId, {
      status: "verified",
      verified_at: new Date().toISOString(),
    });
  };

  const handleMarkDisputed = (reserveId: string) => {
    updateReserve(reserveId, { status: "disputed" });
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href={`/projects/${project.id}/closure`}
          className="mt-1 rounded-md p-2 text-[#71717A] hover:bg-[#27272A] hover:text-[#71717A]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[#FAFAFA]">
            {t("reservesTitle")} — {project.name}
          </h1>
          <p className="mt-1 text-sm text-[#71717A]">
            {reception?.reception_date && `PV de réception du ${formatDate(reception.reception_date)}`}
            {" — "}{totalCount} {t("reserves").toLowerCase()}
          </p>
        </div>
      </div>

      {loadError && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Progress */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-[#FAFAFA]">{t("progression")}</span>
          <span className="text-[#71717A]">{verifiedCount}/{totalCount} {t("reserveVerified").toLowerCase()}</span>
        </div>
        <div className="mt-2 h-2.5 w-full rounded-full bg-[#27272A]">
          <div
            className="h-2.5 rounded-full bg-green-500 transition-all duration-500"
            style={{ width: totalCount > 0 ? `${(verifiedCount / totalCount) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* All verified */}
      {allVerified && (
        <div className="mt-6 rounded-md border border-green-200 bg-green-500/10 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-400">{t("allReservesLifted")}</p>
              <button
                type="button"
                className="mt-1 text-xs font-medium text-green-700 dark:text-green-400 underline hover:text-green-800 dark:text-green-400"
              >
                {t("generateLiftingPV")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reserves table */}
      <div className="mt-6 overflow-x-auto rounded-md border border-[#27272A] bg-[#0F0F11]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#27272A] bg-[#27272A]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A]">{t("reserveRef")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A]">{t("reserveDescription")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A]">{t("reserveLot")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A]">{t("reserveSeverity")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A]">{t("deadline")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A]">{t("reserveStatus")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {reserves.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#71717A]">
                  0 {t("reserves").toLowerCase()}
                </td>
              </tr>
            )}
            {reserves.map((reserve, index) => {
              const sev = severityConfig[reserve.severity] ?? severityConfig.minor;
              const stat = statusConfig[reserve.status] ?? statusConfig.open;
              const StatusIcon = stat.icon;
              const overdue = isOverdue(reserve);

              return (
                <tr
                  key={reserve.id}
                  onClick={() => setSelectedReserve(reserve)}
                  className={`cursor-pointer transition-colors hover:bg-[#27272A] ${
                    selectedReserve?.id === reserve.id ? "bg-[#F97316]/10" : ""
                  } ${overdue ? "bg-red-500/10" : ""}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-[#71717A]">
                    R-{String(index + 1).padStart(3, "0")}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 font-medium text-[#FAFAFA]">
                    {reserve.description}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#71717A]">
                    {reserve.cfc_code && `CFC ${reserve.cfc_code}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${sev.bg} ${sev.color}`}>
                      {sev.icon} {t(sev.label)}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-xs ${overdue ? "font-medium text-red-600 dark:text-red-400" : "text-[#71717A]"}`}>
                    {reserve.deadline ? formatDate(reserve.deadline) : "—"}
                    {overdue && <span className="ml-1">⚠️</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${stat.bg} ${stat.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {t(`reserve${reserve.status.charAt(0).toUpperCase() + reserve.status.slice(1).replace("_", "")}`)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selectedReserve && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[#27272A] bg-[#0F0F11] shadow-xl">
          <div className="flex items-center justify-between border-b border-[#27272A] px-5 py-4">
            <h3 className="text-sm font-semibold text-[#FAFAFA]">
              {selectedReserve.description}
            </h3>
            <button
              type="button"
              onClick={() => setSelectedReserve(null)}
              className="rounded-md p-1 text-[#71717A] hover:bg-[#27272A]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-xs font-medium text-[#71717A]">{t("reserveLocation")}</dt>
                <dd className="mt-0.5 text-[#FAFAFA]">{selectedReserve.location || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#71717A]">{t("reserveLot")}</dt>
                <dd className="mt-0.5 text-[#FAFAFA]">
                  {selectedReserve.cfc_code && `CFC ${selectedReserve.cfc_code} — `}
                  {selectedReserve.lot_name || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#71717A]">{t("company")}</dt>
                <dd className="mt-0.5 text-[#FAFAFA]">{selectedReserve.responsible_company || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#71717A]">{t("deadline")}</dt>
                <dd className={`mt-0.5 ${isOverdue(selectedReserve) ? "font-medium text-red-600 dark:text-red-400" : "text-[#FAFAFA]"}`}>
                  {selectedReserve.deadline ? formatDate(selectedReserve.deadline) : "—"}
                  {isOverdue(selectedReserve) && ` — ${t("overdue")}`}
                </dd>
              </div>

              {selectedReserve.correction_notes && (
                <div>
                  <dt className="text-xs font-medium text-[#71717A]">{t("correctionNotes")}</dt>
                  <dd className="mt-0.5 text-[#FAFAFA]">{selectedReserve.correction_notes}</dd>
                </div>
              )}

              {selectedReserve.corrected_at && (
                <div>
                  <dt className="text-xs font-medium text-[#71717A]">{t("correctedAt")}</dt>
                  <dd className="mt-0.5 text-[#FAFAFA]">
                    {formatDate(selectedReserve.corrected_at)} par {selectedReserve.corrected_by}
                  </dd>
                </div>
              )}

              {selectedReserve.verified_at && (
                <div>
                  <dt className="text-xs font-medium text-[#71717A]">{t("verifiedAt")}</dt>
                  <dd className="mt-0.5 text-[#FAFAFA]">{formatDate(selectedReserve.verified_at)}</dd>
                </div>
              )}
            </dl>

            {/* Actions */}
            {selectedReserve.status !== "verified" && (
              <div className="mt-6 space-y-3 border-t border-[#27272A] pt-4">
                {(selectedReserve.status === "open" || selectedReserve.status === "in_progress") && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-[#71717A]">{t("correctionNotes")}</label>
                      <textarea
                        value={correctionNotes}
                        onChange={(e) => setCorrectionNotes(e.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        placeholder={t("correctionPlaceholder")}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleMarkCorrected(selectedReserve.id)}
                      disabled={saving}
                      className="w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60"
                    >
                      {t("markCorrected")}
                    </button>
                  </>
                )}

                {selectedReserve.status === "corrected" && (
                  <button
                    type="button"
                    onClick={() => handleMarkVerified(selectedReserve.id)}
                    disabled={saving}
                    className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    {t("markVerified")}
                  </button>
                )}

                {selectedReserve.status !== "disputed" && (
                  <button
                    type="button"
                    onClick={() => handleMarkDisputed(selectedReserve.id)}
                    disabled={saving}
                    className="w-full rounded-md border border-purple-200 px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 disabled:opacity-60"
                  >
                    {t("markDisputed")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
