"use client";

import React, { useMemo, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Printer,
  Diamond,
  ChevronRight,
  Truck,
  CircleCheck,
  CalendarDays,
} from "lucide-react";
import type { Planning, PlanningTask } from "./planning-types";
import { milestoneColor } from "./planning-types";

interface LookaheadViewProps {
  planning: Planning;
  /** Same signature as the Gantt handler — persists then reschedules. */
  onTaskUpdate?: (taskId: string, updates: Partial<PlanningTask>) => void;
  readOnly?: boolean;
}

const WEEK_COUNT = 3;
const MS_PER_DAY = 86_400_000;

function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfIsoWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function isoWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);
}

function fmtShort(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}.${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}`;
}

type EntryKind = "starts" | "ends" | "ongoing" | "milestone";

interface LookaheadEntry {
  task: PlanningTask;
  kind: EntryKind;
  phaseName: string;
  phaseColor: string;
}

interface LookaheadWeek {
  index: number;
  start: Date;
  end: Date;
  weekNumber: number;
  entries: LookaheadEntry[];
  milestones: LookaheadEntry[];
}

const KIND_ORDER: Record<EntryKind, number> = {
  starts: 0,
  ends: 1,
  ongoing: 2,
  milestone: 3,
};

/**
 * Three-week lookahead — the view a conductor actually runs the site from.
 * A 9-month Gantt answers "when does the building finish"; this answers
 * "who is on site next Tuesday and what must be ordered this week".
 */
export default function LookaheadView({
  planning,
  onTaskUpdate,
  readOnly,
}: LookaheadViewProps) {
  const t = useTranslations("planning");
  const [anchorOffset, setAnchorOffset] = useState(0);

  const anchorWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const planStart = parseDay(planning.start_date);
    // Before kick-off, anchoring on "today" would show three empty weeks.
    const base = planStart && planStart > today ? planStart : today;
    return addDays(startOfIsoWeek(base), anchorOffset * 7);
  }, [planning.start_date, anchorOffset]);

  const phaseMeta = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const phase of planning.phases) {
      map.set(phase.id, { name: phase.name, color: phase.color });
    }
    return map;
  }, [planning.phases]);

  const weeks = useMemo<LookaheadWeek[]>(() => {
    const result: LookaheadWeek[] = [];

    for (let w = 0; w < WEEK_COUNT; w++) {
      const start = addDays(anchorWeek, w * 7);
      const end = addDays(start, 6);
      const entries: LookaheadEntry[] = [];
      const milestones: LookaheadEntry[] = [];

      for (const task of planning.tasks) {
        const taskStart = parseDay(task.start_date);
        const taskEnd = parseDay(task.end_date) ?? taskStart;
        if (!taskStart || !taskEnd) continue;

        const phase = phaseMeta.get(task.phase_id);
        const meta = {
          phaseName: phase?.name ?? "",
          phaseColor: phase?.color ?? "#3B82F6",
        };

        if (task.is_milestone) {
          if (taskStart >= start && taskStart <= end) {
            milestones.push({ task, kind: "milestone", ...meta });
          }
          continue;
        }

        // Any overlap with the week window
        if (taskEnd < start || taskStart > end) continue;

        let kind: EntryKind = "ongoing";
        if (taskStart >= start && taskStart <= end) kind = "starts";
        else if (taskEnd >= start && taskEnd <= end) kind = "ends";

        entries.push({ task, kind, ...meta });
      }

      entries.sort(
        (a, b) =>
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          a.task.start_date.localeCompare(b.task.start_date) ||
          a.task.name.localeCompare(b.task.name),
      );
      milestones.sort((a, b) =>
        a.task.start_date.localeCompare(b.task.start_date),
      );

      result.push({
        index: w,
        start,
        end,
        weekNumber: isoWeekNumber(start),
        entries,
        milestones,
      });
    }

    return result;
  }, [anchorWeek, planning.tasks, phaseMeta]);

  const setProgress = useCallback(
    (task: PlanningTask, value: number) => {
      if (readOnly || !onTaskUpdate) return;
      const next = Math.min(100, Math.max(0, Math.round(value)));
      if (next === task.progress) return;
      onTaskUpdate(task.id, { progress: next });
    },
    [readOnly, onTaskUpdate],
  );

  const kindLabel: Record<EntryKind, string> = {
    starts: t("lookahead.starts"),
    ends: t("lookahead.ends"),
    ongoing: t("lookahead.ongoing"),
    milestone: t("lookahead.milestone"),
  };

  const kindChip: Record<EntryKind, string> = {
    starts: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    ends: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    ongoing: "bg-[#27272A] text-[#A1A1AA] border-[#3F3F46]",
    milestone: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  };

  return (
    <div className="flex flex-col h-full bg-[#0F0F11] rounded-lg border border-[#27272A] overflow-hidden lookahead-print">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body * { visibility: hidden; }
          .lookahead-print, .lookahead-print * { visibility: visible; }
          .lookahead-print {
            position: absolute; inset: 0; width: 100%;
            max-height: none !important; overflow: visible !important;
            border: 0 !important; border-radius: 0 !important;
          }
          .lookahead-print, .lookahead-print * {
            background: #fff !important; color: #111 !important;
            border-color: #bbb !important; box-shadow: none !important;
          }
          .lookahead-print .no-print { display: none !important; }
          .lookahead-print .print-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#27272A] shrink-0">
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <CalendarDays className="h-4 w-4 text-[#F97316] shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#FAFAFA] truncate">
              {t("lookahead.title")}
            </h2>
            <p className="text-xs text-[#A1A1AA]">
              {fmtShort(weeks[0].start)} – {fmtShort(weeks[WEEK_COUNT - 1].end)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 no-print">
          <button
            type="button"
            onClick={() => setAnchorOffset((v) => v - 1)}
            className="px-2.5 py-1 text-xs text-[#A1A1AA] border border-[#27272A] rounded-md hover:bg-[#27272A] transition-colors"
          >
            {t("lookahead.previous")}
          </button>
          <button
            type="button"
            onClick={() => setAnchorOffset(0)}
            disabled={anchorOffset === 0}
            className="px-2.5 py-1 text-xs text-[#A1A1AA] border border-[#27272A] rounded-md hover:bg-[#27272A] disabled:opacity-40 transition-colors"
          >
            {t("lookahead.thisWeek")}
          </button>
          <button
            type="button"
            onClick={() => setAnchorOffset((v) => v + 1)}
            className="px-2.5 py-1 text-xs text-[#A1A1AA] border border-[#27272A] rounded-md hover:bg-[#27272A] transition-colors"
          >
            {t("lookahead.next")}
          </button>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#A1A1AA] border border-[#27272A] rounded-lg hover:bg-[#27272A] transition-colors no-print"
        >
          <Printer className="h-3.5 w-3.5" />
          {t("lookahead.print")}
        </button>
      </div>

      {/* Weeks */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {weeks.map((week) => (
          <section key={week.index} className="print-break">
            <header className="flex items-baseline gap-2 mb-2 pb-1.5 border-b border-[#27272A]">
              <h3 className="text-sm font-semibold text-[#FAFAFA]">
                {week.index === 0
                  ? t("lookahead.weekCurrent", { week: week.weekNumber })
                  : t("lookahead.weekPlus", {
                      week: week.weekNumber,
                      offset: week.index,
                    })}
              </h3>
              <span className="text-xs text-[#A1A1AA]">
                {fmtShort(week.start)} – {fmtShort(week.end)}
              </span>
              <span className="ml-auto text-xs text-[#A1A1AA]">
                {t("lookahead.taskCount", { count: week.entries.length })}
              </span>
            </header>

            {/* Milestones / orders to place */}
            {week.milestones.length > 0 && (
              <ul className="mb-2 space-y-1">
                {week.milestones.map(({ task }) => {
                  const isOrder = task.milestone_type === "procurement";
                  return (
                    <li
                      key={task.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#27272A] bg-[#18181B]"
                    >
                      {isOrder ? (
                        <Truck className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                      ) : (
                        <Diamond
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: milestoneColor(task.milestone_type) }}
                        />
                      )}
                      <span className="text-sm text-[#FAFAFA] truncate">
                        {task.name}
                      </span>
                      <span
                        className={[
                          "px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0",
                          isOrder
                            ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
                            : kindChip.milestone,
                        ].join(" ")}
                      >
                        {isOrder ? t("lookahead.toOrder") : kindLabel.milestone}
                      </span>
                      <span className="ml-auto text-xs text-[#A1A1AA] shrink-0">
                        {fmtShort(parseDay(task.start_date) ?? week.start)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {week.entries.length === 0 && week.milestones.length === 0 ? (
              <p className="text-sm text-[#A1A1AA] italic py-2">
                {t("lookahead.empty")}
              </p>
            ) : (
              <ul className="space-y-1">
                {week.entries.map(({ task, kind, phaseName, phaseColor }) => {
                  const done = task.progress >= 100;
                  return (
                    <li
                      key={`${week.index}-${task.id}`}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#27272A] bg-[#18181B]"
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        disabled={readOnly || !onTaskUpdate}
                        onChange={() => setProgress(task, done ? 0 : 100)}
                        aria-label={t("lookahead.markDone")}
                        className="h-4 w-4 shrink-0 accent-[#F97316] cursor-pointer disabled:cursor-not-allowed"
                      />

                      <span
                        className="h-6 w-1 rounded-full shrink-0"
                        style={{ backgroundColor: phaseColor }}
                      />

                      <div className="min-w-0 flex-1">
                        <p
                          className={[
                            "text-sm truncate",
                            done
                              ? "text-[#A1A1AA] line-through"
                              : "text-[#FAFAFA]",
                          ].join(" ")}
                        >
                          {task.name}
                        </p>
                        <p className="text-[11px] text-[#A1A1AA] truncate">
                          {phaseName}
                          {task.supplier_name && (
                            <>
                              <ChevronRight className="inline h-3 w-3 -mt-0.5" />
                              {task.supplier_name}
                            </>
                          )}
                          {task.cfc_code && <> · CFC {task.cfc_code}</>}
                        </p>
                      </div>

                      <span
                        className={[
                          "px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0",
                          kindChip[kind],
                        ].join(" ")}
                      >
                        {kindLabel[kind]}
                      </span>

                      <span className="text-xs text-[#A1A1AA] whitespace-nowrap shrink-0 w-24 text-right">
                        {fmtShort(parseDay(task.start_date) ?? week.start)} –{" "}
                        {fmtShort(parseDay(task.end_date) ?? week.end)}
                      </span>

                      {/* Quick progress */}
                      <div className="flex items-center gap-1 shrink-0 no-print">
                        {[25, 50, 75].map((value) => (
                          <button
                            key={value}
                            type="button"
                            disabled={readOnly || !onTaskUpdate}
                            onClick={() => setProgress(task, value)}
                            className={[
                              "px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors disabled:opacity-40",
                              task.progress === value
                                ? "bg-[#F97316]/15 text-[#F97316] border-[#F97316]/40"
                                : "border-[#27272A] text-[#A1A1AA] hover:bg-[#27272A]",
                            ].join(" ")}
                          >
                            {value}
                          </button>
                        ))}
                      </div>

                      <span className="w-10 text-right text-xs shrink-0">
                        {done ? (
                          <CircleCheck className="inline h-4 w-4 text-emerald-500" />
                        ) : (
                          <span className="text-[#A1A1AA]">{task.progress}%</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
