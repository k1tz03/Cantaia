"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  Download,
  Plus,
  ArrowLeft,
  FileDown,
  Save,
  Check,
} from "lucide-react";
import { PositionsTable } from "./PositionsTable";
import type { SavedSubmission, ExtractedPosition, ExtractionMetadata } from "./types";
import {
  ensureIds,
  createEmptyPosition,
  loadSubmissionsFromStorage,
  saveSubmissionsToStorage,
  formatTime,
} from "./types";

// ---------------------------------------------------------------------------
// SubmissionEditor -- Editable table with DnD, save, autosave
// ---------------------------------------------------------------------------

export function SubmissionEditor({
  initialSubmission,
  onBack,
}: {
  initialSubmission: SavedSubmission;
  onBack: () => void;
}) {
  const t = useTranslations("products.submissions");
  const tCommon = useTranslations("common");

  const [submission, setSubmission] =
    useState<SavedSubmission>(initialSubmission);
  const [positions, setPositions] = useState<ExtractedPosition[]>(() =>
    ensureIds(initialSubmission.positions || [])
  );
  const [metadata] = useState<ExtractionMetadata | null>(
    initialSubmission.metadata
  );
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: string;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(
    initialSubmission.updated_at
      ? new Date(initialSubmission.updated_at)
      : null
  );

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Track changes
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setHasUnsavedChanges(true);
    setSaveError(null); // Clear previous save error on new edits
  }, [positions]);

  // Auto-save every 30s
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const timer = setTimeout(() => {
      handleSave(false);
    }, 30_000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsavedChanges, positions]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ---- Save to DB ----
  async function saveToDb(items: ExtractedPosition[]): Promise<boolean> {
    const res = await fetch(`/api/submissions/${submission.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((p) => ({
          item_number: p.position_number,
          description: p.description,
          unit: p.unit,
          quantity: p.quantity,
          cfc_code: p.can_code,
          material_group: p.material_group,
          product_name: p.product_name,
        })),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(data.error || `Save failed (${res.status})`);
    }
    return true;
  }

  // ---- Save ----
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleSave(_showFeedback = true) {
    setSaving(true);
    setSaveError(null);
    try {
      const updatedSub: SavedSubmission = {
        ...submission,
        positions,
        total_positions: positions.length,
        flagged_positions: positions.filter((p) => p.flags.length > 0).length,
        updated_at: new Date().toISOString(),
      };

      // Always update localStorage as cache/fallback
      const all = loadSubmissionsFromStorage();
      const idx = all.findIndex((s) => s.id === updatedSub.id);
      if (idx >= 0) {
        all[idx] = updatedSub;
      } else {
        all.unshift(updatedSub);
      }
      saveSubmissionsToStorage(all);

      // Persist to database — await the result
      await saveToDb(positions);

      setSubmission(updatedSub);
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
    } catch (err) {
      console.error("[SubmissionEditor] Save error:", err);
      setSaveError(
        err instanceof Error ? err.message : "Erreur de sauvegarde"
      );
      // Keep hasUnsavedChanges true so the user knows data is not persisted
    } finally {
      setSaving(false);
    }
  }

  // ---- DnD ----
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPositions((prev) => {
        const oldIndex = prev.findIndex((p) => p.id === active.id);
        const newIndex = prev.findIndex((p) => p.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  // ---- Insert at index ----
  function handleInsertAt(atIndex: number) {
    const newPos = createEmptyPosition();
    setPositions((prev) => {
      const updated = [...prev];
      updated.splice(atIndex, 0, newPos);
      return updated;
    });
    // Focus after render
    setTimeout(() => {
      const row = document.querySelector(
        `[data-position-id="${newPos.id}"] input`
      );
      if (row instanceof HTMLElement) row.focus();
    }, 100);
  }

  // ---- Cell edit ----
  const handleCellEdit = useCallback(
    (posId: string, col: string, value: string) => {
      setPositions((prev) => {
        const updated = prev.map((pos) => {
          if (pos.id !== posId) return pos;
          const p = { ...pos };
          if (col === "quantity" || col === "unit_price" || col === "total") {
            const num =
              value === "" ? null : parseFloat(value.replace(",", "."));
            (p as any)[col] = isNaN(num as number) ? null : num;
          } else {
            (p as any)[col] = value;
          }
          if (
            (col === "quantity" || col === "unit_price") &&
            p.quantity != null &&
            p.unit_price != null
          ) {
            p.total = Math.round(p.quantity * p.unit_price * 100) / 100;
          }
          return p;
        });
        return updated;
      });
      setEditingCell(null);
    },
    []
  );

  // ---- Delete row ----
  const handleDeleteRow = useCallback((posId: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== posId));
  }, []);

  // ---- Export ----
  const handleExport = useCallback(
    async (format: "xlsx" | "csv" | "sia451") => {
      setExporting(true);
      setExportSuccess(null);

      try {
        const res = await fetch("/api/submissions/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            positions: positions.map((p) => ({
              position_number: p.position_number,
              can_code: p.can_code,
              description: p.description,
              quantity: p.quantity,
              unit: p.unit,
              unit_price: p.unit_price,
              total: p.total,
            })),
            format,
            metadata: metadata
              ? {
                  document_title: metadata.document_title,
                  project_name: metadata.project_suggestion,
                  cfc_chapter: metadata.cfc_chapter,
                }
              : undefined,
          }),
        });

        if (!res.ok) throw new Error("Export failed");

        const blob = await res.blob();
        const extensions: Record<string, string> = {
          xlsx: "xlsx",
          csv: "csv",
          sia451: "01s",
        };
        const filename = `soumission_${Date.now()}.${extensions[format]}`;
        const { saveFileWithDialog } = await import("@/lib/tauri");
        await saveFileWithDialog(filename, blob);

        // Mark as exported
        const updatedSub: SavedSubmission = {
          ...submission,
          positions,
          status: "exported",
          exported_at: new Date().toISOString(),
          export_format: format,
          updated_at: new Date().toISOString(),
          total_positions: positions.length,
          flagged_positions: positions.filter((p) => p.flags.length > 0).length,
        };
        const all = loadSubmissionsFromStorage();
        const idx = all.findIndex((s) => s.id === updatedSub.id);
        if (idx >= 0) all[idx] = updatedSub;
        else all.unshift(updatedSub);
        saveSubmissionsToStorage(all);
        setSubmission(updatedSub);
        setHasUnsavedChanges(false);
        setLastSaved(new Date());

        setExportSuccess(t("export_success"));
        setTimeout(() => setExportSuccess(null), 3000);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Export error");
      } finally {
        setExporting(false);
      }
    },
    [positions, metadata, t, submission]
  );

  const flaggedCount = positions.filter((p) => p.flags.length > 0).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[#27272A] px-4 md:px-6 py-3 bg-[#0F0F11] sticky top-0 z-20 shrink-0">
        {/* Left: back + title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={async () => {
              if (hasUnsavedChanges) await handleSave(false);
              onBack();
            }}
            className="p-1.5 hover:bg-[#27272A] rounded-lg transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4 text-[#71717A]" />
          </button>

          <input
            value={submission.name}
            onChange={(e) => {
              setSubmission((prev) => ({ ...prev, name: e.target.value }));
              setHasUnsavedChanges(true);
            }}
            className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-0 min-w-0 max-w-xs md:max-w-md truncate"
            placeholder={t("untitled")}
          />
        </div>

        {/* Right: save indicator + actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Save indicator */}
          <div className="flex items-center gap-1.5 text-xs text-[#71717A]">
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="hidden sm:inline">{t("saving")}</span>
              </>
            ) : saveError ? (
              <>
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span className="hidden sm:inline text-red-600" title={saveError}>
                  {t("save_error")}
                </span>
              </>
            ) : hasUnsavedChanges ? (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="hidden sm:inline">
                  {t("unsaved_changes")}
                </span>
              </>
            ) : lastSaved ? (
              <>
                <Check className="h-3 w-3 text-green-500" />
                <span className="hidden sm:inline">
                  {t("saved_at", { time: formatTime(lastSaved) })}
                </span>
              </>
            ) : null}
          </div>

          {/* Save button */}
          <button
            onClick={() => handleSave(true)}
            disabled={saving || (!hasUnsavedChanges && !saveError)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#27272A] rounded-lg text-sm text-[#FAFAFA] hover:bg-[#27272A] disabled:opacity-40 transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("save")}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="space-y-4">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-200 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-500 hover:text-red-700 dark:text-red-400"
              >
                {tCommon("close")}
              </button>
            </div>
          )}

          {/* Success */}
          {exportSuccess && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-200 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm">
              <CheckCircle className="h-4 w-4 shrink-0" />
              {exportSuccess}
            </div>
          )}

          {/* Stats bar */}
          <div className="flex flex-wrap items-center gap-3 bg-[#F97316]/10 border border-[#F97316]/20 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-[#F97316]" />
              <span className="text-sm font-medium text-blue-900">
                {t("positions_extracted", { count: positions.length })}
              </span>
            </div>
            {flaggedCount > 0 && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-700 dark:text-amber-400">
                  {t("positions_flagged", { count: flaggedCount })}
                </span>
              </div>
            )}
            {metadata?.extraction_time_ms && (
              <span className="text-xs text-blue-500 ml-auto">
                {(metadata.extraction_time_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>

          {metadata?.project_suggestion && (
            <div className="text-sm text-[#71717A] bg-[#27272A] rounded-lg px-4 py-2">
              {t("project_detected", { name: metadata.project_suggestion })}
            </div>
          )}

          {/* Editable table with DnD */}
          <PositionsTable
            positions={positions}
            sensors={sensors}
            editingCell={editingCell}
            onDragEnd={handleDragEnd}
            onInsertAt={handleInsertAt}
            onStartEdit={(row, col) => setEditingCell({ row, col })}
            onCellEdit={handleCellEdit}
            onDeleteRow={handleDeleteRow}
          />

          {/* Bottom bar: add row + drag hint + export buttons */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleInsertAt(positions.length)}
                className="flex items-center gap-2 px-3 py-2 border border-dashed border-[#27272A] rounded-lg text-sm text-[#71717A] hover:border-[#27272A] hover:text-[#FAFAFA] transition-colors"
              >
                <Plus className="h-4 w-4" />
                {t("add_line_bottom")}
              </button>
              <p className="text-xs text-[#71717A] hidden md:block">
                {t("drag_hint")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleExport("xlsx")}
                disabled={exporting || positions.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50 transition-colors"
              >
                <FileDown className="h-4 w-4" />
                {t("export_excel")}
              </button>
              <button
                onClick={() => handleExport("csv")}
                disabled={exporting || positions.length === 0}
                className="flex items-center gap-2 px-4 py-2 border border-[#27272A] rounded-lg text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A] disabled:opacity-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                {t("export_csv")}
              </button>
              <button
                onClick={() => handleExport("sia451")}
                disabled={exporting || positions.length === 0}
                className="flex items-center gap-2 px-4 py-2 border border-[#27272A] rounded-lg text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A] disabled:opacity-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                {t("export_sia451")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
