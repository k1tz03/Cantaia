"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Trash2,
  Copy,
  Diamond,
  Plus,
  AlertTriangle,
} from "lucide-react";
import type {
  PlanningTask,
  PlanningPhase,
  PlanningDependency,
} from "./planning-types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GanttSidePanelProps {
  task: PlanningTask | null; // null = closed
  phases: PlanningPhase[];
  dependencies: PlanningDependency[];
  allTasks: PlanningTask[];
  suppliers: Array<{ id: string; company_name: string }>;
  onUpdate: (taskId: string, updates: Partial<PlanningTask>) => void;
  onAddDependency: (
    predecessorId: string,
    successorId: string,
    type: string,
    lag: number,
  ) => void;
  onRemoveDependency: (depId: string) => void;
  onDelete: (taskId: string) => void;
  onClose: () => void;
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toDateInputValue(dateStr: string): string {
  // Expects "YYYY-MM-DD" — pass through
  return dateStr?.slice(0, 10) ?? "";
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Dependency type labels
// ---------------------------------------------------------------------------

const DEP_TYPES = ["FS", "SS", "FF", "SF"] as const;

/** Maps dependency type codes to labels. Used by context menus in the dependency section. */
export function _depTypeLabel(type: string): string {
  switch (type) {
    case "FS":
      return "Fin-Debut";
    case "SS":
      return "Debut-Debut";
    case "FF":
      return "Fin-Fin";
    case "SF":
      return "Debut-Fin";
    default:
      return type;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GanttSidePanel({
  task,
  phases,
  dependencies,
  allTasks,
  suppliers,
  onUpdate,
  onAddDependency,
  onRemoveDependency,
  onDelete,
  onClose,
  readOnly,
}: GanttSidePanelProps) {
  const t = useTranslations("planning");

  // ── Local editable state ──────────────────────────────────────────────
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [duration, setDuration] = useState(1);
  const [phaseId, setPhaseId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [teamSize, setTeamSize] = useState(1);
  const [cfcCode, setCfcCode] = useState("");
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState("");

  // Dependency form
  const [showDepForm, setShowDepForm] = useState(false);
  const [depTaskId, setDepTaskId] = useState("");
  const [depType, setDepType] = useState<string>("FS");
  const [depLag, setDepLag] = useState(0);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync local state from prop
  useEffect(() => {
    if (!task) return;
    setName(task.name);
    setStartDate(toDateInputValue(task.start_date));
    setEndDate(toDateInputValue(task.end_date));
    setDuration(task.duration_days);
    setPhaseId(task.phase_id);
    setSupplierName(task.supplier_name ?? "");
    setTeamSize(task.team_size);
    setCfcCode(task.cfc_code ?? "");
    setProgress(task.progress);
    setNotes(""); // placeholder — tasks don't have a notes field in DB currently
    setConfirmDelete(false);
    setShowDepForm(false);
  }, [task]);

  // ── Change handlers (immediate push to parent) ─────────────────────────

  const commitName = useCallback(() => {
    if (!task || readOnly) return;
    if (name.trim() && name !== task.name) {
      onUpdate(task.id, { name: name.trim() });
    }
  }, [task, name, readOnly, onUpdate]);

  const handleStartChange = useCallback(
    (val: string) => {
      if (!task || readOnly) return;
      setStartDate(val);
      const newEnd = addDaysToDate(val, duration);
      setEndDate(newEnd);
      onUpdate(task.id, {
        start_date: val,
        end_date: newEnd,
        duration_days: duration,
      });
    },
    [task, duration, readOnly, onUpdate],
  );

  const handleEndChange = useCallback(
    (val: string) => {
      if (!task || readOnly) return;
      setEndDate(val);
      const newDur = Math.max(1, daysBetween(startDate, val));
      setDuration(newDur);
      onUpdate(task.id, {
        end_date: val,
        duration_days: newDur,
      });
    },
    [task, startDate, readOnly, onUpdate],
  );

  const handleDurationChange = useCallback(
    (val: number) => {
      if (!task || readOnly) return;
      const d = Math.max(1, val);
      setDuration(d);
      const newEnd = addDaysToDate(startDate, d);
      setEndDate(newEnd);
      onUpdate(task.id, {
        duration_days: d,
        end_date: newEnd,
      });
    },
    [task, startDate, readOnly, onUpdate],
  );

  const handlePhaseChange = useCallback(
    (val: string) => {
      if (!task || readOnly) return;
      setPhaseId(val);
      onUpdate(task.id, { phase_id: val } as any);
    },
    [task, readOnly, onUpdate],
  );

  const handleTeamSizeChange = useCallback(
    (val: number) => {
      if (!task || readOnly) return;
      const v = Math.max(1, val);
      setTeamSize(v);
      onUpdate(task.id, { team_size: v });
    },
    [task, readOnly, onUpdate],
  );

  const handleProgressChange = useCallback(
    (val: number) => {
      if (!task || readOnly) return;
      const v = Math.min(100, Math.max(0, val));
      setProgress(v);
      onUpdate(task.id, { progress: v });
    },
    [task, readOnly, onUpdate],
  );

  // ── Dependencies ──────────────────────────────────────────────────────

  const predecessorDeps = task
    ? dependencies.filter((d) => d.successor_id === task.id)
    : [];

  const availableTasksForDep = task
    ? allTasks.filter((t) => {
        if (t.id === task.id) return false;
        // Exclude tasks that are already predecessors
        return !predecessorDeps.some((d) => d.predecessor_id === t.id);
      })
    : [];

  const handleAddDep = useCallback(() => {
    if (!task || !depTaskId) return;
    onAddDependency(depTaskId, task.id, depType, depLag);
    setShowDepForm(false);
    setDepTaskId("");
    setDepType("FS");
    setDepLag(0);
  }, [task, depTaskId, depType, depLag, onAddDependency]);

  // ── Delete ─────────────────────────────────────────────────────────────

  const handleDelete = useCallback(() => {
    if (!task) return;
    onDelete(task.id);
    onClose();
  }, [task, onDelete, onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Click outside ref
  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <AnimatePresence>
      {task && (
        <>
          {/* Backdrop */}
          <motion.div
            key="sidepanel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            key="sidepanel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="fixed right-0 top-0 bottom-0 w-[400px] max-w-[90vw] bg-[#0F0F11] border-l border-[#27272A] shadow-2xl z-50 flex flex-col"
          >
            {/* ─── Header ────────────────────────────────── */}
            <div className="flex items-start gap-3 px-5 pt-5 pb-3 border-b border-[#27272A]">
              <div className="flex-1 min-w-0">
                {readOnly ? (
                  <h2 className="text-lg font-semibold text-[#FAFAFA] truncate">
                    {task.name}
                  </h2>
                ) : (
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="w-full text-lg font-semibold text-[#FAFAFA] bg-transparent border-none focus:outline-none focus:ring-0 p-0 truncate"
                  />
                )}
                {task.cfc_code && (
                  <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-xs font-medium bg-[#27272A] text-[#71717A]">
                    CFC {task.cfc_code}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[#27272A] text-[#71717A] hover:text-[#71717A] transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ─── Scrollable content ───────────────────── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* Section: Dates & Duration */}
              <Section title={t("sidePanel.dates")}>
                <div className="grid grid-cols-2 gap-3">
                  <FieldLabel label={t("task.startDate")}>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => handleStartChange(e.target.value)}
                      disabled={readOnly}
                      className="w-full rounded-lg border border-[#27272A] px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                    />
                  </FieldLabel>
                  <FieldLabel label={t("task.endDate")}>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => handleEndChange(e.target.value)}
                      disabled={readOnly}
                      className="w-full rounded-lg border border-[#27272A] px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                    />
                  </FieldLabel>
                </div>
                <FieldLabel label={t("task.duration")}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={duration}
                      onChange={(e) =>
                        handleDurationChange(parseInt(e.target.value, 10) || 1)
                      }
                      disabled={readOnly}
                      className="w-24 rounded-lg border border-[#27272A] px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                    />
                    <span className="text-sm text-[#71717A]">
                      {t("taskList.daysShort")}
                    </span>
                  </div>
                </FieldLabel>
              </Section>

              {/* Section: Details */}
              <Section title={t("sidePanel.details")}>
                <FieldLabel label={t("sidePanel.phase")}>
                  <select
                    value={phaseId}
                    onChange={(e) => handlePhaseChange(e.target.value)}
                    disabled={readOnly}
                    className="w-full rounded-lg border border-[#27272A] px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {phases.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </FieldLabel>

                <FieldLabel label={t("sidePanel.supplier")}>
                  <select
                    value={supplierName}
                    onChange={(e) => {
                      setSupplierName(e.target.value);
                      // The parent can look up the supplier id if needed
                    }}
                    disabled={readOnly}
                    className="w-full rounded-lg border border-[#27272A] px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="">{t("sidePanel.noSupplier")}</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.company_name}>
                        {s.company_name}
                      </option>
                    ))}
                  </select>
                </FieldLabel>

                <div className="grid grid-cols-2 gap-3">
                  <FieldLabel label={t("sidePanel.team")}>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={teamSize}
                        onChange={(e) =>
                          handleTeamSizeChange(
                            parseInt(e.target.value, 10) || 1,
                          )
                        }
                        disabled={readOnly}
                        className="w-20 rounded-lg border border-[#27272A] px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      />
                      <span className="text-xs text-[#71717A]">
                        {t("sidePanel.teamSize")}
                      </span>
                    </div>
                  </FieldLabel>
                  <FieldLabel label={t("sidePanel.cfcCode")}>
                    <input
                      type="text"
                      value={cfcCode}
                      onChange={(e) => setCfcCode(e.target.value)}
                      onBlur={() => {
                        if (!task || readOnly) return;
                        if (cfcCode !== (task.cfc_code ?? "")) {
                          onUpdate(task.id, {
                            cfc_code: cfcCode || null,
                          } as any);
                        }
                      }}
                      disabled={readOnly}
                      placeholder="211.1"
                      className="w-full rounded-lg border border-[#27272A] px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </FieldLabel>
                </div>
              </Section>

              {/* Section: Progress */}
              <Section title={t("sidePanel.progress")}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={progress}
                      onChange={(e) =>
                        handleProgressChange(parseInt(e.target.value, 10))
                      }
                      disabled={readOnly}
                      className="flex-1 h-2 accent-blue-600"
                    />
                    <span className="ml-3 text-sm font-medium text-[#FAFAFA] w-12 text-right">
                      {progress}%
                    </span>
                  </div>
                  {/* Preview bar */}
                  <div className="h-3 rounded-full bg-[#27272A] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#F97316]/100 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </Section>

              {/* Section: Dependencies */}
              <Section title={t("sidePanel.dependencies")}>
                {predecessorDeps.length === 0 && !showDepForm && (
                  <p className="text-sm text-[#71717A] italic mb-2">
                    {t("sidePanel.noDependencies")}
                  </p>
                )}

                {predecessorDeps.map((dep) => {
                  const predTask = allTasks.find(
                    (t) => t.id === dep.predecessor_id,
                  );
                  return (
                    <div
                      key={dep.id}
                      className="flex items-center gap-2 py-1.5 border-b border-[#27272A] last:border-0"
                    >
                      <span className="text-sm text-[#FAFAFA] truncate flex-1">
                        {predTask?.name ?? dep.predecessor_id}
                      </span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#F97316]/10 text-[#F97316]">
                        {dep.dependency_type}
                      </span>
                      {dep.lag_days !== 0 && (
                        <span className="text-xs text-[#71717A]">
                          {dep.lag_days > 0 ? "+" : ""}
                          {dep.lag_days}
                          {t("sidePanel.lagDays")}
                        </span>
                      )}
                      {!readOnly && (
                        <button
                          onClick={() => onRemoveDependency(dep.id)}
                          className="p-0.5 rounded hover:bg-red-50 text-[#71717A] hover:text-red-500 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Add dependency form */}
                {showDepForm && (
                  <div className="mt-2 p-3 border border-[#27272A] rounded-lg bg-[#27272A] space-y-2">
                    <select
                      value={depTaskId}
                      onChange={(e) => setDepTaskId(e.target.value)}
                      className="w-full rounded-lg border border-[#27272A] px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">
                        {t("sidePanel.selectTask")}
                      </option>
                      {availableTasksForDep.map((tk) => (
                        <option key={tk.id} value={tk.id}>
                          {tk.name}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#71717A] shrink-0">
                        {t("sidePanel.depType")}:
                      </span>
                      <div className="flex gap-1">
                        {DEP_TYPES.map((dt) => (
                          <button
                            key={dt}
                            onClick={() => setDepType(dt)}
                            className={[
                              "px-2 py-0.5 text-[10px] font-bold uppercase rounded transition-colors",
                              depType === dt
                                ? "bg-blue-600 text-white"
                                : "bg-[#27272A] text-[#71717A] hover:bg-[#27272A]",
                            ].join(" ")}
                          >
                            {dt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#71717A] shrink-0">
                        {t("sidePanel.lag")}:
                      </span>
                      <input
                        type="number"
                        value={depLag}
                        onChange={(e) =>
                          setDepLag(parseInt(e.target.value, 10) || 0)
                        }
                        className="w-16 rounded border border-[#27272A] px-2 py-1 text-sm"
                      />
                      <span className="text-xs text-[#71717A]">
                        {t("sidePanel.lagDays")}
                      </span>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleAddDep}
                        disabled={!depTaskId}
                        className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {t("sidePanel.confirm")}
                      </button>
                      <button
                        onClick={() => setShowDepForm(false)}
                        className="px-3 py-1 text-xs text-[#71717A] hover:text-[#FAFAFA]"
                      >
                        {t("config.cancel")}
                      </button>
                    </div>
                  </div>
                )}

                {!readOnly && !showDepForm && (
                  <button
                    onClick={() => setShowDepForm(true)}
                    className="flex items-center gap-1.5 mt-2 text-xs font-medium text-[#F97316] hover:text-[#F97316]/80 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("sidePanel.addPredecessor")}
                  </button>
                )}
              </Section>

              {/* Section: Notes */}
              <Section title={t("sidePanel.notes")}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={readOnly}
                  rows={3}
                  placeholder="..."
                  className="w-full rounded-lg border border-[#27272A] px-3 py-2 text-sm resize-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                />
              </Section>

              {/* Section: Actions */}
              {!readOnly && (
                <div className="space-y-2 pb-4">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#71717A] border border-[#27272A] rounded-lg hover:bg-[#27272A] transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {t("contextMenu.duplicate")}
                    </button>
                    {!task.is_milestone && (
                      <button
                        type="button"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#71717A] border border-[#27272A] rounded-lg hover:bg-[#27272A] transition-colors"
                      >
                        <Diamond className="h-3.5 w-3.5" />
                        {t("sidePanel.convertToMilestone")}
                      </button>
                    )}
                  </div>

                  {confirmDelete ? (
                    <div className="p-3 border border-red-200 rounded-lg bg-red-50 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-red-700">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{t("sidePanel.deleteConfirmDesc")}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDelete}
                          className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                          {t("contextMenu.delete")}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="px-3 py-1 text-xs text-[#71717A] hover:text-[#FAFAFA]"
                        >
                          {t("config.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("sidePanel.deleteConfirm")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-[#71717A] uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-[#71717A] mb-1">{label}</label>
      {children}
    </div>
  );
}
