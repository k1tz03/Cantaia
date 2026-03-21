"use client";

import { useTranslations } from "next-intl";
import {
  Save,
  CheckCircle,
  FileDown,
  RotateCcw,
  Loader2,
  ArrowLeft,
  Trash2,
} from "lucide-react";

interface PVTopBarProps {
  meeting: any;
  isFinalized: boolean;
  saving: boolean;
  saveMessage: string | null;
  regenerating: boolean;
  onBack: () => void;
  onSave: () => void;
  onFinalize: () => void;
  onExportPDF: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
}

export function PVTopBar({
  meeting,
  isFinalized,
  saving,
  saveMessage,
  regenerating,
  onBack,
  onSave,
  onFinalize,
  onExportPDF,
  onRegenerate,
  onDelete,
}: PVTopBarProps) {
  const t = useTranslations("pv");

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-base font-semibold text-foreground">
            {meeting.title}
          </h1>
          {meeting.projects && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: meeting.projects.color,
                }}
              />
              {meeting.projects.name}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {saveMessage && (
          <span className="text-sm text-green-600">{saveMessage}</span>
        )}

        {!isFinalized && (
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {t("save_draft")}
          </button>
        )}

        {!isFinalized && (
          <button
            onClick={onFinalize}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {t("finalize")}
          </button>
        )}

        <button
          onClick={onExportPDF}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <FileDown className="h-3.5 w-3.5" />
          {t("export_pdf")}
        </button>

        {meeting.status === "review" && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            {t("regenerate")}
          </button>
        )}

        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-500/20 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("delete_pv")}
        </button>
      </div>
    </div>
  );
}
