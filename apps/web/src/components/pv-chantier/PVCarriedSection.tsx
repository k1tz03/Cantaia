"use client";

import { useTranslations } from "next-intl";
import { History, X } from "lucide-react";
import { withFallback } from "./pv-i18n";
import type { CarriedStatus, PVSection } from "./types";

interface PVCarriedSectionProps {
  section: PVSection;
  sectionIdx: number;
  isFinalized: boolean;
  onUpdateCarriedStatus: (
    sectionIndex: number,
    actionIndex: number,
    status: CarriedStatus
  ) => void;
  onRemoveAction: (sectionIndex: number, actionIndex: number) => void;
}

const STATUS_ORDER: CarriedStatus[] = ["open", "in_progress", "done"];

const STATUS_STYLE: Record<CarriedStatus, string> = {
  open: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  in_progress: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  done: "bg-green-500/15 text-green-300 border-green-500/30",
};

/**
 * "Points ouverts (séance précédente)".
 *
 * Rendered apart from the ordinary section editor: these points are inherited,
 * not written today. What the conducteur does here is set their status — that
 * is the whole ritual of the first minutes of a site meeting, and it is what
 * decides whether the point is carried again into the NEXT PV.
 */
export function PVCarriedSection({
  section,
  sectionIdx,
  isFinalized,
  onUpdateCarriedStatus,
  onRemoveAction,
}: PVCarriedSectionProps) {
  const rawT = useTranslations("pv");
  const t = withFallback(rawT);

  const points = section.actions ?? [];
  const statusLabel: Record<CarriedStatus, string> = {
    open: t("carried_status_open"),
    in_progress: t("carried_status_in_progress"),
    done: t("carried_status_done"),
  };

  const stillOpen = points.filter((p) => p.carried_status !== "done").length;

  return (
    <div className="mb-4 rounded-lg border border-[#F97316]/25 bg-[#F97316]/[0.04] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#F97316]/15 text-[#F97316]">
          <History className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[#FAFAFA]">
            {section.number ? `${section.number}. ` : ""}
            {section.title || t("carried_section")}
          </h3>
          <p className="text-[11px] text-[#A1A1AA]">
            {points.length} {t("carried_count")} — {stillOpen}{" "}
            {t("carried_status_open").toLowerCase()}
          </p>
        </div>
      </div>

      {points.length === 0 ? (
        <p className="text-xs text-[#A1A1AA]">{t("carried_none")}</p>
      ) : (
        <div className="space-y-2">
          {points.map((point, i) => {
            const status = (point.carried_status ?? "open") as CarriedStatus;
            return (
              <div
                key={i}
                className="flex flex-wrap items-start gap-2 rounded-md border border-[#27272A] bg-[#0F0F11] p-2.5"
              >
                {point.carried_from && (
                  <span className="shrink-0 rounded bg-[#27272A] px-1.5 py-0.5 font-mono text-[10px] text-[#A1A1AA]">
                    {point.carried_from}
                  </span>
                )}
                <div className="min-w-[160px] flex-1">
                  <p className="text-sm leading-snug text-[#FAFAFA]">
                    {point.description}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#A1A1AA]">
                    {[
                      point.responsible_name,
                      point.responsible_company,
                      point.deadline ? `délai ${point.deadline}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>

                {/* Status is the only editable field: the wording of an
                    inherited point belongs to the PV it came from. */}
                <div className="flex shrink-0 items-center gap-1">
                  {isFinalized ? (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[status]}`}
                    >
                      {statusLabel[status]}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1">
                      {STATUS_ORDER.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            onUpdateCarriedStatus(sectionIdx, i, option)
                          }
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                            status === option
                              ? STATUS_STYLE[option]
                              : "border-[#27272A] text-[#A1A1AA] hover:border-[#3F3F46] hover:text-[#A1A1AA]"
                          }`}
                        >
                          {statusLabel[option]}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => onRemoveAction(sectionIdx, i)}
                        title="Retirer ce point du PV"
                        className="rounded p-1 text-[#52525B] hover:bg-red-500/10 hover:text-red-400"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
