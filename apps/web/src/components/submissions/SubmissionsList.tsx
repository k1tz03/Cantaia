"use client";

import React, { useState, useCallback, useRef, useMemo } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useTranslations } from "next-intl";
import {
  FileSpreadsheet,
  FileText,
  Upload,
  Loader2,
  AlertTriangle,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { SubmissionStatusBadge } from "./SubmissionStatusBadge";
import type { SavedSubmission, ExtractionMetadata } from "./types";
import {
  ensureIds,
  loadSubmissionsFromStorage,
  saveSubmissionsToStorage,
  formatRelativeDate,
} from "./types";

export function SubmissionsList({
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

  // Deduplicate submissions by source_filename, keep most recent
  const deduped = useMemo(() => {
    const seen = new Map<string, SavedSubmission>();
    for (const sub of submissions) {
      const key = sub.source_filename || sub.name;
      const existing = seen.get(key);
      if (!existing || new Date(sub.created_at) > new Date(existing.created_at)) {
        seen.set(key, sub);
      }
    }
    return Array.from(seen.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [submissions]);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("extraction_error"));
    } finally {
      setExtracting(false);
    }
  }, [file, t, onNewExtraction]);

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8 overflow-auto h-full">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("subtitle_count", { count: deduped.length })}
          </p>
        </div>

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

        {/* Upload zone */}
        <div
          className={`border-2 border-dashed rounded-2xl p-6 md:p-8 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-brand bg-brand/5"
              : file
                ? "border-green-300 bg-green-500/10"
                : "border-border hover:border-brand/50 bg-background"
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
              <p className="text-sm font-medium text-foreground">
                {t("analyzing")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("analyzing_subtitle")}
              </p>
            </div>
          ) : file ? (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center mb-3">
                <FileSpreadsheet className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
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
                  className="text-xs text-muted-foreground hover:text-red-500 transition-colors"
                >
                  {tCommon("delete")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {t("upload_title")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("upload_subtitle")}
              </p>
              <p className="text-[10px] text-muted-foreground mt-2">
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
                className="h-16 bg-muted rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : deduped.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
              <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {t("no_history")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("no_history_desc")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t("history")}
            </h2>

            {deduped.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center gap-4 p-4 bg-background border border-border rounded-xl hover:border-brand/30 hover:bg-muted/50 transition-all group"
              >
                <button
                  onClick={() => onOpen(sub)}
                  className="flex items-center gap-4 flex-1 min-w-0 text-left"
                >
                  {/* File icon */}
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    {sub.source_type === "pdf" ? (
                      <FileText className="h-5 w-5 text-red-500" />
                    ) : (
                      <FileSpreadsheet className="h-5 w-5 text-green-600" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">
                      {sub.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sub.source_filename} · {sub.total_positions}{" "}
                      {t("positions")}
                    </p>
                  </div>

                  {/* Status badge */}
                  <SubmissionStatusBadge status={sub.status} />

                  {/* Date */}
                  <p className="text-xs text-muted-foreground shrink-0">
                    {formatRelativeDate(sub.created_at)}
                  </p>

                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-muted-foreground transition-colors shrink-0" />
                </button>

                {/* Delete */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteId(sub.id);
                  }}
                  className="p-1.5 text-muted-foreground hover:text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) onDelete(deleteId); }}
        title={t("delete_confirm")}
        description={t("delete_description")}
        variant="danger"
      />
    </div>
  );
}
