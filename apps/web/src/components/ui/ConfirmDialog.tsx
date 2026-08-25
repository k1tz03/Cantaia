"use client";

import { useTranslations } from "next-intl";
import { ConfirmDialog as UIConfirmDialog } from "@cantaia/ui";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` is kept as an alias of the shared `destructive` variant. */
  variant?: "danger" | "default";
  children?: React.ReactNode;
}

/**
 * Thin i18n wrapper over the shared @cantaia/ui ConfirmDialog.
 *
 * The shared primitive owns the behaviour (portal, focus trap, Escape,
 * in-flight locking); this file only supplies translated default labels
 * and keeps the historic `variant="danger"` name working at call sites.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = "default",
  children,
}: ConfirmDialogProps) {
  const t = useTranslations("common");

  return (
    <UIConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      description={description}
      confirmLabel={confirmLabel || t("confirm")}
      cancelLabel={cancelLabel || t("cancel")}
      variant={variant === "danger" ? "destructive" : "default"}
    >
      {children}
    </UIConfirmDialog>
  );
}
