"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useProject } from "@/lib/hooks/use-supabase-data";
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
} from "@/lib/mock-data";
import type { ReceptionReserve } from "@cantaia/database";

const severityConfig = {
  minor: { label: "minor", color: "text-amber-600", bg: "bg-amber-100", icon: "🟡" },
  major: { label: "major", color: "text-orange-600", bg: "bg-orange-100", icon: "🔴" },
  blocking: { label: "blocking", color: "text-red-600", bg: "bg-red-100", icon: "🔴" },
};

const statusConfig = {
  open: { color: "text-red-600", bg: "bg-red-50", icon: AlertTriangle },
  in_progress: { color: "text-blue-600", bg: "bg-blue-50", icon: Clock },
  corrected: { color: "text-amber-600", bg: "bg-amber-50", icon: Clock },
  verified: { color: "text-green-600", bg: "bg-green-50", icon: CheckCircle },
  disputed: { color: "text-purple-600", bg: "bg-purple-50", icon: XCircle },
};

export default function ReservesPage() {
  const params = useParams();
  const t = useTranslations("closure");

  const { project, loading: projectLoading } = useProject(params.id as string);
  const reception = null as { id: string; reception_date?: string } | null;
  const reserves: ReceptionReserve[] = [];

  const [selectedReserve, setSelectedReserve] = useState<ReceptionReserve | null>(null);
  const [correctionNotes, setCorrectionNotes] = useState("");

  if (projectLoading) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <p className="text-slate-500">{t("projectNotFound")}</p>
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
    console.log("[Reserves] Mark corrected:", reserveId, correctionNotes);
    setCorrectionNotes("");
    setSelectedReserve(null);
  };

  const handleMarkVerified = (reserveId: string) => {
    console.log("[Reserves] Mark verified:", reserveId);
    setSelectedReserve(null);
  };

  const handleMarkDisputed = (reserveId: string) => {
    console.log("[Reserves] Mark disputed:", reserveId);
    setSelectedReserve(null);
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href={`/projects/${project.id}/closure`}
          className="mt-1 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            {t("reservesTitle")} — {project.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {reception?.reception_date && `PV de réception du ${formatDate(reception.reception_date)}`}
            {" — "}{totalCount} {t("reserves").toLowerCase()}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">{t("progression")}</span>
          <span className="text-slate-500">{verifiedCount}/{totalCount} {t("reserveVerified").toLowerCase()}</span>
        </div>
        <div className="mt-2 h-2.5 w-full rounded-full bg-slate-100">
          <div
            className="h-2.5 rounded-full bg-green-500 transition-all duration-500"
            style={{ width: totalCount > 0 ? `${(verifiedCount / totalCount) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* All verified */}
      {allVerified && (
        <div className="mt-6 rounded-md border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium text-green-800">{t("allReservesLifted")}</p>
              <button
                type="button"
                className="mt-1 text-xs font-medium text-green-700 underline hover:text-green-800"
              >
                {t("generateLiftingPV")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reserves table */}
      <div className="mt-6 overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">{t("reserveRef")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">{t("reserveDescription")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">{t("reserveLot")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">{t("reserveSeverity")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">{t("deadline")}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">{t("reserveStatus")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reserves.map((reserve, index) => {
              const sev = severityConfig[reserve.severity];
              const stat = statusConfig[reserve.status];
              const StatusIcon = stat.icon;
              const overdue = isOverdue(reserve);

              return (
                <tr
                  key={reserve.id}
                  onClick={() => setSelectedReserve(reserve)}
                  className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                    selectedReserve?.id === reserve.id ? "bg-blue-50" : ""
                  } ${overdue ? "bg-red-50/50" : ""}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    R-{String(index + 1).padStart(3, "0")}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 font-medium text-slate-800">
                    {reserve.description}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {reserve.cfc_code && `CFC ${reserve.cfc_code}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${sev.bg} ${sev.color}`}>
                      {sev.icon} {t(sev.label)}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-xs ${overdue ? "font-medium text-red-600" : "text-slate-500"}`}>
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
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h3 className="text-sm font-semibold text-slate-800">
              {selectedReserve.description}
            </h3>
            <button
              type="button"
              onClick={() => setSelectedReserve(null)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-xs font-medium text-slate-500">{t("reserveLocation")}</dt>
                <dd className="mt-0.5 text-slate-800">{selectedReserve.location || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">{t("reserveLot")}</dt>
                <dd className="mt-0.5 text-slate-800">
                  {selectedReserve.cfc_code && `CFC ${selectedReserve.cfc_code} — `}
                  {selectedReserve.lot_name || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">{t("company")}</dt>
                <dd className="mt-0.5 text-slate-800">{selectedReserve.responsible_company || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">{t("deadline")}</dt>
                <dd className={`mt-0.5 ${isOverdue(selectedReserve) ? "font-medium text-red-600" : "text-slate-800"}`}>
                  {selectedReserve.deadline ? formatDate(selectedReserve.deadline) : "—"}
                  {isOverdue(selectedReserve) && ` — ${t("overdue")}`}
                </dd>
              </div>

              {selectedReserve.correction_notes && (
                <div>
                  <dt className="text-xs font-medium text-slate-500">{t("correctionNotes")}</dt>
                  <dd className="mt-0.5 text-slate-800">{selectedReserve.correction_notes}</dd>
                </div>
              )}

              {selectedReserve.corrected_at && (
                <div>
                  <dt className="text-xs font-medium text-slate-500">{t("correctedAt")}</dt>
                  <dd className="mt-0.5 text-slate-800">
                    {formatDate(selectedReserve.corrected_at)} par {selectedReserve.corrected_by}
                  </dd>
                </div>
              )}

              {selectedReserve.verified_at && (
                <div>
                  <dt className="text-xs font-medium text-slate-500">{t("verifiedAt")}</dt>
                  <dd className="mt-0.5 text-slate-800">{formatDate(selectedReserve.verified_at)}</dd>
                </div>
              )}
            </dl>

            {/* Actions */}
            {selectedReserve.status !== "verified" && (
              <div className="mt-6 space-y-3 border-t border-slate-200 pt-4">
                {(selectedReserve.status === "open" || selectedReserve.status === "in_progress") && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-slate-500">{t("correctionNotes")}</label>
                      <textarea
                        value={correctionNotes}
                        onChange={(e) => setCorrectionNotes(e.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        placeholder={t("correctionPlaceholder")}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleMarkCorrected(selectedReserve.id)}
                      className="w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
                    >
                      {t("markCorrected")}
                    </button>
                  </>
                )}

                {selectedReserve.status === "corrected" && (
                  <button
                    type="button"
                    onClick={() => handleMarkVerified(selectedReserve.id)}
                    className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                  >
                    {t("markVerified")}
                  </button>
                )}

                {selectedReserve.status !== "disputed" && (
                  <button
                    type="button"
                    onClick={() => handleMarkDisputed(selectedReserve.id)}
                    className="w-full rounded-md border border-purple-200 px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50"
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
