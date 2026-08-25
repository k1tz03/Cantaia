"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ShieldCheck, CheckSquare, FileText, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { GuaranteeAlerts } from "@/components/closure/GuaranteeAlerts";
import { ProjectFinancialsSection } from "./ProjectFinancialsSection";

interface ReceptionSummary {
  id: string;
  reception_type?: string;
  reception_date?: string;
  pv_document_url?: string | null;
  pv_signed_url?: string | null;
}

/**
 * Clôture tab.
 *
 * `reception` and `openReservesCount` used to be hardcoded to `null` / `0`, so
 * the PV-de-réception block and the "Voir les réserves" button were unreachable
 * even on a project with a signed reception and open reserves. Both are fetched
 * now — the reception from the same endpoint as the closure workflow page
 * (which knows how to fall back to Storage when migration 010 is missing), the
 * reserve counters from /api/reserves.
 */
export function ProjectClosureTab({
  project,
}: {
  project: any;
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("closure");

  const [reception, setReception] = useState<ReceptionSummary | null>(null);
  const [openReservesCount, setOpenReservesCount] = useState(0);
  const [totalReservesCount, setTotalReservesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    try {
      const [closureRes, reservesRes] = await Promise.all([
        fetch(`/api/projects/${project.id}/closure/data`, { cache: "no-store" }).catch(() => null),
        fetch(`/api/reserves?project_id=${project.id}`, { cache: "no-store" }).catch(() => null),
      ]);

      if (closureRes?.ok) {
        const data = await closureRes.json();
        setReception(data.reception || null);
      }

      if (reservesRes?.ok) {
        const data = await reservesRes.json();
        setOpenReservesCount(data.counts?.open ?? 0);
        setTotalReservesCount(data.counts?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [project?.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <ProjectFinancialsSection projectId={project.id} />

      <div className="rounded-md border border-[#27272A] bg-[#0F0F11] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#FAFAFA]">{t("closureTitle")}</h3>
            <p className="mt-1 text-xs text-[#A1A1AA]">{t("closureDescription")}</p>
          </div>
          {(project.status === "active" || project.status === "on_hold") && (
            <Link
              href={`/projects/${project.id}/closure`}
              className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
            >
              <ShieldCheck className="h-4 w-4" />
              {t("startClosure")}
            </Link>
          )}
          {project.status === "closing" && (
            <Link
              href={`/projects/${project.id}/closure`}
              className="inline-flex items-center gap-2 rounded-md border border-brand px-4 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/5"
            >
              <ShieldCheck className="h-4 w-4" />
              {t("continueClosure")}
            </Link>
          )}
          {project.status === "completed" && (
            <Link
              href={`/projects/${project.id}/closure`}
              className="inline-flex items-center gap-2 rounded-md border border-[#27272A] px-4 py-2 text-sm font-medium text-[#A1A1AA] transition-colors hover:bg-[#27272A]"
            >
              {t("viewClosure")}
            </Link>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center rounded-md border border-[#27272A] bg-[#0F0F11] py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[#A1A1AA]" />
        </div>
      )}

      {!loading && reception && (
        <div className="rounded-md border border-[#27272A] bg-[#0F0F11] p-6">
          <h3 className="text-sm font-semibold text-[#FAFAFA]">{tc("receptionPVTitle")}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-[#A1A1AA]">{tc("receptionType")}</p>
              <p className="mt-0.5 text-sm font-medium text-[#FAFAFA]">
                {reception.reception_type ? tc(reception.reception_type) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#A1A1AA]">{tc("receptionDate")}</p>
              <p className="mt-0.5 text-sm font-medium text-[#FAFAFA]">
                {reception.reception_date ? formatDate(reception.reception_date) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#A1A1AA]">{tc("reserveStatus")}</p>
              <p className={`mt-0.5 text-sm font-medium ${openReservesCount > 0 ? "text-red-400" : "text-green-400"}`}>
                {openReservesCount > 0
                  ? `${openReservesCount} ${tc("reserveOpen").toLowerCase()}`
                  : totalReservesCount > 0
                  ? tc("allReservesLifted")
                  : "—"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href={`/projects/${project.id}/reserves`}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-medium ${
                openReservesCount > 0
                  ? "border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  : "border border-[#27272A] text-[#A1A1AA] hover:bg-[#27272A]"
              }`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {tc("viewReserves")}
              {totalReservesCount > 0 ? ` (${openReservesCount || totalReservesCount})` : ""}
            </Link>
            <Link
              href={`/projects/${project.id}/closure/documents`}
              className="inline-flex items-center gap-2 rounded-md border border-[#27272A] px-4 py-2 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A]"
            >
              <FileText className="h-3.5 w-3.5" />
              {tc("closureDocuments")}
            </Link>
          </div>
        </div>
      )}

      {/* Reserves recorded during the walkthrough, before any PV exists */}
      {!loading && !reception && totalReservesCount > 0 && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-amber-400">
              {openReservesCount} {tc("reserveOpen").toLowerCase()} / {totalReservesCount}
            </p>
            <Link
              href={`/projects/${project.id}/reserves`}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {tc("viewReserves")}
            </Link>
          </div>
        </div>
      )}

      <GuaranteeAlerts projectId={project.id} />
    </div>
  );
}
