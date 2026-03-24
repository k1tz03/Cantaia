"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";

interface PVConfirmDialogProps {
  variant: "finalize" | "regenerate" | "delete";
  loading: boolean;
  selectedActionsCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PVConfirmDialog({
  variant,
  loading,
  selectedActionsCount,
  onConfirm,
  onCancel,
}: PVConfirmDialogProps) {
  const t = useTranslations("pv");
  const tCommon = useTranslations("common");

  if (variant === "finalize") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="w-full max-w-md rounded-lg bg-[#0F0F11] p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <h3 className="text-base font-semibold text-[#FAFAFA]">
              {t("finalize")}
            </h3>
          </div>
          <p className="mb-4 text-sm text-[#71717A]">
            {t("finalize_confirm")}
          </p>
          <p className="mb-4 text-sm text-[#71717A]">
            {selectedActionsCount} {t("actions_selected")}
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded-md border border-[#27272A] px-4 py-2 text-sm text-[#FAFAFA] hover:bg-[#27272A]"
            >
              {tCommon("cancel")}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {loading && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              {t("finalize")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "regenerate") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="w-full max-w-md rounded-lg bg-[#0F0F11] p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <h3 className="text-base font-semibold text-[#FAFAFA]">
              {t("regenerate")}
            </h3>
          </div>
          <p className="mb-4 text-sm text-[#71717A]">
            {t("regenerate_confirm")}
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded-md border border-[#27272A] px-4 py-2 text-sm text-[#FAFAFA] hover:bg-[#27272A]"
            >
              {tCommon("cancel")}
            </button>
            <button
              onClick={onConfirm}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("regenerate")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-sm rounded-lg bg-[#0F0F11] p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <h3 className="text-base font-semibold text-[#FAFAFA]">
            {t("delete_pv")}
          </h3>
        </div>
        <p className="mb-4 text-sm text-[#71717A]">
          {t("delete_pv_confirm")}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-[#27272A] px-4 py-2 text-sm text-[#FAFAFA] hover:bg-[#27272A]"
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            {t("delete_pv")}
          </button>
        </div>
      </div>
    </div>
  );
}
