"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Dialog } from "./Dialog";
import { cn } from "../../lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `destructive` paints the confirm button red and adds a warning icon. */
  variant?: "default" | "destructive";
  /** Extra content between the description and the buttons. */
  children?: React.ReactNode;
}

/**
 * Confirmation modal built on Dialog — focus-trapped, Escape-closable,
 * and it keeps itself open while `onConfirm` is in flight so a slow
 * delete cannot be double-fired.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "default",
  children,
}: ConfirmDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const destructive = variant === "destructive";

  React.useEffect(() => {
    if (!open) setLoading(false);
  }, [open]);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !loading) onClose();
      }}
      size="sm"
      dismissible={!loading}
      title={
        destructive ? (
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#EF4444]" />
            {title}
          </span>
        ) : (
          title
        )
      }
      description={description}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-[#27272A] px-4 py-2 text-[13px] font-medium text-[#D4D4D8] transition-colors hover:bg-[#27272A] hover:text-[#FAFAFA] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60",
              destructive
                ? "bg-[#EF4444] text-white hover:bg-[#DC2626]"
                : "bg-[#F97316] text-[#0F0F11] hover:bg-[#EA580C]"
            )}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
