"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FileSpreadsheet,
  FileText,
  Upload,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Download,
  Plus,
  Trash2,
  ArrowLeft,
  FileDown,
  Pencil,
  GripVertical,
  Save,
  Check,
  ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractedPosition {
  id: string;
  position_number: string;
  can_code: string | null;
  description: string;
  quantity: number | null;
  unit: string;
  unit_price: number | null;
  total: number | null;
  confidence: number;
  flags: string[];
  is_new?: boolean;
}

interface ExtractionMetadata {
  source_type: string;
  total_positions: number;
  flagged_positions: number;
  extraction_time_ms: number;
  project_suggestion: string | null;
  document_title: string | null;
  cfc_chapter: string | null;
  currency: string;
}

interface SavedSubmission {
  id: string;
  name: string;
  source_filename: string;
  source_type: string;
  positions: ExtractedPosition[];
  metadata: ExtractionMetadata | null;
  status: "extracting" | "draft" | "reviewed" | "exported" | "archived";
  total_positions: number;
  flagged_positions: number;
  created_at: string;
  updated_at: string;
  exported_at: string | null;
  export_format: string | null;
}

type ViewMode = "list" | "editor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureIds(positions: any[]): ExtractedPosition[] {
  return positions.map((p) => ({
    ...p,
    id: p.id || crypto.randomUUID(),
  }));
}

function createEmptyPosition(): ExtractedPosition {
  return {
    id: crypto.randomUUID(),
    position_number: "",
    can_code: null,
    description: "",
    quantity: null,
    unit: "",
    unit_price: null,
    total: null,
    confidence: 1,
    flags: [],
    is_new: true,
  };
}

function getStorageKey(prefix: string) {
  return `cantaia_submissions_${prefix}`;
}

function loadSubmissionsFromStorage(): SavedSubmission[] {
  try {
    const raw = localStorage.getItem(getStorageKey("list"));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSubmissionsToStorage(submissions: SavedSubmission[]) {
  localStorage.setItem(getStorageKey("list"), JSON.stringify(submissions));
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin}min`;
  if (diffHr < 24) return `il y a ${diffHr}h`;
  if (diffDay < 7) return `il y a ${diffDay}j`;
  return date.toLocaleDateString();
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function SubmissionsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [activeSubmission, setActiveSubmission] =
    useState<SavedSubmission | null>(null);
  const [submissions, setSubmissions] = useState<SavedSubmission[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  // Load history on mount
  useEffect(() => {
    setSubmissions(loadSubmissionsFromStorage());
    setIsLoadingList(false);
  }, []);

  function openSubmission(sub: SavedSubmission) {
    setActiveSubmission(sub);
    setViewMode("editor");
  }

  function handleNewExtraction(sub: SavedSubmission) {
    setActiveSubmission(sub);
    setViewMode("editor");
  }

  function backToList() {
    setViewMode("list");
    setActiveSubmission(null);
    // Refresh list
    setSubmissions(loadSubmissionsFromStorage());
  }

  function handleDeleteSubmission(id: string) {
    const updated = submissions.filter((s) => s.id !== id);
    saveSubmissionsToStorage(updated);
    setSubmissions(updated);
  }

  if (viewMode === "editor" && activeSubmission) {
    return (
      <SubmissionEditor
        initialSubmission={activeSubmission}
        onBack={backToList}
      />
    );
  }

  return (
    <SubmissionsList
      submissions={submissions}
      isLoading={isLoadingList}
      onOpen={openSubmission}
      onNewExtraction={handleNewExtraction}
      onDelete={handleDeleteSubmission}
    />
  );
}

// ---------------------------------------------------------------------------
// SubmissionsList — History view
// ---------------------------------------------------------------------------

function SubmissionsList({
  submissions,
  isLoading,
  onOpen,
  onNewExtraction,
  onDelete,
}: {
  submissions: SavedSubmission[];
  isLoading: boolean;
  onOpen: (sub: SavedSubmission) => void;
  onNewExtraction: (sub: SavedSubmission) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("products.submissions");
  const tCommon = useTranslations("common");

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (f: File) => {
      const validExtensions = [".pdf", ".xlsx", ".xls", ".csv"];
      const ext = f.name.toLowerCase().substring(f.name.lastIndexOf("."));
      if (!validExtensions.includes(ext)) {
        setError(t("invalid_format"));
        return;
      }
      if (f.size > 20 * 1024 * 1024) {
        setError(t("file_too_large"));
        return;
      }
      setFile(f);
      setError(null);
    },
    [t]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleExtract = useCallback(async () => {
    if (!file) return;
    setExtracting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/submissions/extract", {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        console.error("[extract] Non-JSON response:", res.status, text);
        throw new Error(t("extraction_error"));
      }

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || t("extraction_error"));
      }

      const positions = ensureIds(json.data.positions);
      const metadata: ExtractionMetadata = json.data.metadata;

      // Create new submission
      const ext = file.name
        .toLowerCase()
        .substring(file.name.lastIndexOf(".") + 1);
      const newSub: SavedSubmission = {
        id: crypto.randomUUID(),
        name: metadata.document_title || file.name.replace(/\.[^.]+$/, ""),
        source_filename: file.name,
        source_type: ext === "pdf" ? "pdf" : ext,
        positions,
        metadata,
        status: "draft",
        total_positions: positions.length,
        flagged_positions: positions.filter((p) => p.flags.length > 0).length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        exported_at: null,
        export_format: null,
      };

      // Save to storage
      const existing = loadSubmissionsFromStorage();
      saveSubmissionsToStorage([newSub, ...existing]);

      // Reset file input
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      onNewExtraction(newSub);
    } catch (err: any) {
      setError(err.message || t("extraction_error"));
    } finally {
      setExtracting(false);
    }
  }, [file, t, onNewExtraction]);

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8 overflow-auto h-full">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">
            {t("title")}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("subtitle_count", { count: submissions.length })}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              {tCommon("close")}
            </button>
          </div>
        )}

        {/* Upload zone */}
        <div
          className={`border-2 border-dashed rounded-2xl p-6 md:p-8 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-brand bg-brand/5"
              : file
                ? "border-green-300 bg-green-50"
                : "border-gray-300 hover:border-brand/50 bg-white"
          }`}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => !extracting && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx,.xls,.csv"
            onChange={handleFileInput}
            className="hidden"
          />

          {extracting ? (
            <div className="flex flex-col items-center py-2">
              <Loader2 className="h-8 w-8 text-brand animate-spin mb-3" />
              <p className="text-sm font-medium text-gray-900">
                {t("analyzing")}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {t("analyzing_subtitle")}
              </p>
            </div>
          ) : file ? (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-3">
                <FileSpreadsheet className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm font-medium text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-500 mt-1">
                {(file.size / 1024).toFixed(0)} KB
              </p>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExtract();
                  }}
                  className="flex items-center gap-2 px-6 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {t("analyze_button")}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                >
                  {tCommon("delete")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                <Upload className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">
                {t("upload_title")}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {t("upload_subtitle")}
              </p>
              <p className="text-[10px] text-gray-400 mt-2">
                {t("upload_formats")}
              </p>
            </div>
          )}
        </div>

        {/* Submissions history list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 bg-gray-100 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : submissions.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <FileSpreadsheet className="h-7 w-7 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">
              {t("no_history")}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {t("no_history_desc")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {t("history")}
            </h2>

            {submissions.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-brand/30 hover:bg-gray-50/50 transition-all group"
              >
                <button
                  onClick={() => onOpen(sub)}
                  className="flex items-center gap-4 flex-1 min-w-0 text-left"
                >
                  {/* File icon */}
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    {sub.source_type === "pdf" ? (
                      <FileText className="h-5 w-5 text-red-500" />
                    ) : (
                      <FileSpreadsheet className="h-5 w-5 text-green-600" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">
                      {sub.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {sub.source_filename} · {sub.total_positions}{" "}
                      {t("positions")}
                    </p>
                  </div>

                  {/* Status badge */}
                  <SubmissionStatusBadge status={sub.status} />

                  {/* Date */}
                  <p className="text-xs text-gray-400 shrink-0">
                    {formatRelativeDate(sub.created_at)}
                  </p>

                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                </button>

                {/* Delete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t("delete_confirm"))) {
                      onDelete(sub.id);
                    }
                  }}
                  className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubmissionStatusBadge
// ---------------------------------------------------------------------------

function SubmissionStatusBadge({ status }: { status: string }) {
  const t = useTranslations("products.submissions");
  const config: Record<string, { label: string; className: string }> = {
    draft: {
      label: t("status_draft"),
      className: "bg-amber-100 text-amber-700",
    },
    reviewed: {
      label: t("status_reviewed"),
      className: "bg-blue-100 text-blue-700",
    },
    exported: {
      label: t("status_exported"),
      className: "bg-green-100 text-green-700",
    },
    archived: {
      label: t("status_archived"),
      className: "bg-gray-100 text-gray-500",
    },
    extracting: {
      label: t("status_extracting"),
      className: "bg-purple-100 text-purple-700",
    },
  };

  const c = config[status] || {
    label: status,
    className: "bg-gray-100 text-gray-500",
  };

  return (
    <span
      className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${c.className}`}
    >
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SubmissionEditor — Editable table with DnD, save, autosave
// ---------------------------------------------------------------------------

function SubmissionEditor({
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

  // ---- Save ----
  function handleSave(_showFeedback = true) {
    setSaving(true);
    try {
      const updatedSub: SavedSubmission = {
        ...submission,
        positions,
        total_positions: positions.length,
        flagged_positions: positions.filter((p) => p.flags.length > 0).length,
        updated_at: new Date().toISOString(),
      };

      // Update in storage
      const all = loadSubmissionsFromStorage();
      const idx = all.findIndex((s) => s.id === updatedSub.id);
      if (idx >= 0) {
        all[idx] = updatedSub;
      } else {
        all.unshift(updatedSub);
      }
      saveSubmissionsToStorage(all);

      setSubmission(updatedSub);
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
    } catch (err) {
      console.error("Save error:", err);
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
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const extensions: Record<string, string> = {
          xlsx: "xlsx",
          csv: "csv",
          sia451: "01s",
        };
        a.download = `soumission_${Date.now()}.${extensions[format]}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

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
      } catch (err: any) {
        setError(err.message || "Export error");
      } finally {
        setExporting(false);
      }
    },
    [positions, metadata, t, submission]
  );

  const flaggedCount = positions.filter((p) => p.flags.length > 0).length;

  const confidenceColor = (c: number) => {
    if (c >= 0.9) return "bg-green-100 text-green-700";
    if (c >= 0.7) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 md:px-6 py-3 bg-white sticky top-0 z-20 shrink-0">
        {/* Left: back + title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => {
              if (hasUnsavedChanges) handleSave(false);
              onBack();
            }}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4 text-gray-500" />
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
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="hidden sm:inline">{t("saving")}</span>
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
            disabled={saving || !hasUnsavedChanges}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
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
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-500 hover:text-red-700"
              >
                {tCommon("close")}
              </button>
            </div>
          )}

          {/* Success */}
          {exportSuccess && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              <CheckCircle className="h-4 w-4 shrink-0" />
              {exportSuccess}
            </div>
          )}

          {/* Stats bar */}
          <div className="flex flex-wrap items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">
                {t("positions_extracted", { count: positions.length })}
              </span>
            </div>
            {flaggedCount > 0 && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-700">
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
            <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-2">
              {t("project_detected", { name: metadata.project_suggestion })}
            </div>
          )}

          {/* Editable table with DnD */}
          {positions.length > 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={positions.map((p) => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <table className="w-full min-w-[850px]">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="w-[36px]" />
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[120px]">
                            {t("position_number")}
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[100px]">
                            {t("can_code")}
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase">
                            {t("description_col")}
                          </th>
                          <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[90px]">
                            {t("quantity")}
                          </th>
                          <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[60px]">
                            {t("unit")}
                          </th>
                          <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[110px]">
                            {t("unit_price")}
                          </th>
                          <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[110px]">
                            {t("total")}
                          </th>
                          <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[70px]">
                            {t("confidence")}
                          </th>
                          <th className="w-[40px]" />
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map((pos, idx) => (
                          <React.Fragment key={pos.id}>
                            <InsertLineButton
                              onInsert={handleInsertAt}
                              index={idx}
                              label={t("insert_line_here")}
                            />
                            <SortableRow
                              position={pos}
                              editingCell={editingCell}
                              onStartEdit={(col) =>
                                setEditingCell({ row: idx, col })
                              }
                              onCellEdit={(col, value) =>
                                handleCellEdit(pos.id, col, value)
                              }
                              onDelete={() => handleDeleteRow(pos.id)}
                              confidenceColor={confidenceColor}
                              deleteLabel={t("delete_row")}
                            />
                          </React.Fragment>
                        ))}
                        <InsertLineButton
                          onInsert={handleInsertAt}
                          index={positions.length}
                          label={t("insert_line_here")}
                        />
                      </tbody>
                    </table>
                  </SortableContext>
                </DndContext>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <FileSpreadsheet className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">
                {t("no_positions")}
              </h3>
            </div>
          )}

          {/* Bottom bar: add row + drag hint + export buttons */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleInsertAt(positions.length)}
                className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                {t("add_line_bottom")}
              </button>
              <p className="text-xs text-gray-400 hidden md:block">
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
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <Download className="h-4 w-4" />
                {t("export_csv")}
              </button>
              <button
                onClick={() => handleExport("sia451")}
                disabled={exporting || positions.length === 0}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
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

// ---------------------------------------------------------------------------
// InsertLineButton — Appears between rows on hover
// ---------------------------------------------------------------------------

function InsertLineButton({
  onInsert,
  index,
  label,
}: {
  onInsert: (atIndex: number) => void;
  index: number;
  label: string;
}) {
  return (
    <tr className="group/insert h-0">
      <td colSpan={10} className="p-0 relative">
        <div className="absolute inset-x-0 -top-px flex items-center justify-center opacity-0 group-hover/insert:opacity-100 transition-opacity z-10">
          <button
            onClick={() => onInsert(index)}
            className="flex items-center gap-1.5 px-3 py-0.5 bg-brand text-white text-xs rounded-full shadow-sm hover:bg-brand/90 transition-colors -translate-y-1/2"
          >
            <Plus className="h-3 w-3" />
            {label}
          </button>
        </div>
        <div className="absolute inset-x-4 -top-px h-px bg-transparent group-hover/insert:bg-brand/30 transition-colors" />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// SortableRow — A draggable table row
// ---------------------------------------------------------------------------

function SortableRow({
  position,
  editingCell,
  onStartEdit,
  onCellEdit,
  onDelete,
  confidenceColor,
  deleteLabel,
}: {
  position: ExtractedPosition;
  editingCell: { row: number; col: string } | null;
  onStartEdit: (col: string) => void;
  onCellEdit: (col: string, value: string) => void;
  onDelete: () => void;
  confidenceColor: (c: number) => string;
  deleteLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: position.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : ("auto" as any),
  };

  const pos = position;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      data-position-id={pos.id}
      className={`text-sm border-b border-gray-100 ${isDragging ? "bg-brand/5" : pos.flags.length > 0 ? "bg-amber-50/50" : "hover:bg-gray-50"} ${pos.is_new ? "bg-green-50/30" : ""}`}
    >
      {/* Drag handle */}
      <td className="w-[36px] px-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-500 transition-colors"
          aria-label="Reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>

      <EditableCell
        value={pos.position_number}
        isEditing={editingCell?.col === "position_number"}
        onStartEdit={() => onStartEdit("position_number")}
        onSave={(v) => onCellEdit("position_number", v)}
        className="px-3 py-2 font-mono text-xs text-gray-600"
      />
      <EditableCell
        value={pos.can_code || ""}
        isEditing={editingCell?.col === "can_code"}
        onStartEdit={() => onStartEdit("can_code")}
        onSave={(v) => onCellEdit("can_code", v)}
        className="px-3 py-2 font-mono text-xs text-gray-500"
      />
      <EditableCell
        value={pos.description}
        isEditing={editingCell?.col === "description"}
        onStartEdit={() => onStartEdit("description")}
        onSave={(v) => onCellEdit("description", v)}
        className="px-3 py-2 text-gray-900"
      />
      <EditableCell
        value={pos.quantity != null ? String(pos.quantity) : ""}
        isEditing={editingCell?.col === "quantity"}
        onStartEdit={() => onStartEdit("quantity")}
        onSave={(v) => onCellEdit("quantity", v)}
        className="px-3 py-2 text-right text-gray-600"
        inputType="number"
      />
      <EditableCell
        value={pos.unit}
        isEditing={editingCell?.col === "unit"}
        onStartEdit={() => onStartEdit("unit")}
        onSave={(v) => onCellEdit("unit", v)}
        className="px-3 py-2 text-center text-xs text-gray-500"
      />
      <EditableCell
        value={pos.unit_price != null ? String(pos.unit_price) : ""}
        isEditing={editingCell?.col === "unit_price"}
        onStartEdit={() => onStartEdit("unit_price")}
        onSave={(v) => onCellEdit("unit_price", v)}
        className="px-3 py-2 text-right text-gray-600"
        inputType="number"
      />
      <EditableCell
        value={pos.total != null ? String(pos.total) : ""}
        isEditing={editingCell?.col === "total"}
        onStartEdit={() => onStartEdit("total")}
        onSave={(v) => onCellEdit("total", v)}
        className="px-3 py-2 text-right font-medium text-gray-900"
        inputType="number"
      />
      <td className="px-3 py-2 text-center">
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${confidenceColor(pos.confidence)}`}
        >
          {Math.round(pos.confidence * 100)}%
        </span>
      </td>
      <td className="px-1 py-2">
        <button
          onClick={onDelete}
          className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
          title={deleteLabel}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// EditableCell
// ---------------------------------------------------------------------------

function EditableCell({
  value,
  isEditing,
  onStartEdit,
  onSave,
  className,
  inputType = "text",
}: {
  value: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (value: string) => void;
  className?: string;
  inputType?: "text" | "number";
}) {
  const [editValue, setEditValue] = useState(value);

  // Sync when value changes externally
  useEffect(() => {
    if (!isEditing) setEditValue(value);
  }, [value, isEditing]);

  if (isEditing) {
    return (
      <td className={className}>
        <input
          type="text"
          inputMode={inputType === "number" ? "decimal" : "text"}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => onSave(editValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(editValue);
            if (e.key === "Escape") onSave(value);
          }}
          autoFocus
          className="w-full bg-white border border-brand rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </td>
    );
  }

  return (
    <td
      className={`${className} cursor-pointer hover:bg-blue-50 group/cell`}
      onClick={onStartEdit}
    >
      <div className="flex items-center gap-1">
        <span className="flex-1 truncate">{value || "—"}</span>
        <Pencil className="h-3 w-3 text-gray-300 opacity-0 group-hover/cell:opacity-100 shrink-0" />
      </div>
    </td>
  );
}
