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
  Send,
  LayoutTemplate,
  Users,
} from "lucide-react";
import { withFallback } from "./pv-i18n";

interface PVTopBarProps {
  meeting: any;
  isFinalized: boolean;
  /** True once the PV has been circulated (`status = 'sent'`). */
  isSent: boolean;
  /** True when the PV is finalized and has content to circulate. */
  canSend: boolean;
  saving: boolean;
  saveMessage: string | null;
  regenerating: boolean;
  onBack: () => void;
  onSave: () => void;
  onFinalize: () => void;
  onExportPDF: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
  onSend: () => void;
  onOpenTemplate: () => void;
}

/** "12.03.2026 à 14:32" */
function formatSentAt(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const date = `${String(d.getDate()).padStart(2, "0")}.${String(
    d.getMonth() + 1
  ).padStart(2, "0")}.${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
  return `${date} à ${time}`;
}

export function PVTopBar({
  meeting,
  isFinalized,
  isSent,
  canSend,
  saving,
  saveMessage,
  regenerating,
  onBack,
  onSave,
  onFinalize,
  onExportPDF,
  onRegenerate,
  onDelete,
  onSend,
  onOpenTemplate,
}: PVTopBarProps) {
  const rawT = useTranslations("pv");
  const t = withFallback(rawT);

  const recipients: string[] = Array.isArray(meeting?.sent_to) ? meeting.sent_to : [];
  const sentAt = formatSentAt(meeting?.sent_at);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#27272A] px-4 py-3">
      <div className="flex items-center gap-3">
        <button aria-label="Retour"
          onClick={onBack}
          className="rounded-md p-1.5 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-[#FAFAFA]">
              {meeting.title}
            </h1>
            {/* Circulation state — the one fact a conducteur checks first */}
            {isSent && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-400"
                title={
                  recipients.length > 0
                    ? recipients.join(", ")
                    : undefined
                }
              >
                <Send className="h-3 w-3" />
                {t("sent_badge")}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#A1A1AA]">
            {meeting.projects && (
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: meeting.projects.color }}
                />
                {meeting.projects.name}
              </span>
            )}
            {isSent && sentAt && (
              <span className="flex items-center gap-1 text-green-400/80">
                <span className="text-[#3F3F46]">·</span>
                {t("sent_on")} {sentAt}
                {recipients.length > 0 && (
                  <>
                    <span className="text-[#3F3F46]">·</span>
                    <Users className="h-3 w-3" />
                    {recipients.length} {t("sent_to_count")}
                  </>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {saveMessage && (
          <span className="text-sm text-green-500">{saveMessage}</span>
        )}

        {!isFinalized && (
          <button
            onClick={onOpenTemplate}
            title={t("template_intro")}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-sm font-medium text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            {t("template_button")}
          </button>
        )}

        {!isFinalized && (
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {rawT("save_draft")}
          </button>
        )}

        {!isFinalized && (
          <button
            onClick={onFinalize}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {rawT("finalize")}
          </button>
        )}

        <button
          onClick={onExportPDF}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A]"
        >
          <FileDown className="h-3.5 w-3.5" />
          {rawT("export_pdf")}
        </button>

        {/* Circulation — the step that makes the PV opposable */}
        {canSend && (
          <button
            onClick={onSend}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              isSent
                ? "border border-[#27272A] text-[#FAFAFA] hover:bg-[#27272A]"
                : "bg-[#F97316] text-[#0F0F11] hover:bg-[#EA580C]"
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            {isSent ? t("resend_pv") : t("send_pv")}
          </button>
        )}

        {/* Regenerate needs a transcription to work from — a manual PV has none
            (generate-pv would 400). Offered too when a generation left the
            meeting stuck in `generating_pv`, so it is not a dead end. */}
        {!!meeting.transcription_raw &&
          (meeting.status === "review" || meeting.status === "generating_pv") && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A]"
          >
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            {rawT("regenerate")}
          </button>
        )}

        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-500/20 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {rawT("delete_pv")}
        </button>
      </div>
    </div>
  );
}
