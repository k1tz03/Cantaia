"use client";

import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * Cantaia Dialog — the single modal primitive for the app.
 *
 * Wraps @radix-ui/react-dialog so every modal gets, for free:
 *  - a real portal (no more z-index races against the sidebar/header)
 *  - focus trap + focus restore on close
 *  - Escape to close, scroll lock, aria-modal wiring
 *  - a labelled title (aria-labelledby) — required for screen readers
 *
 * Colours are the hardcoded design-system hexes on purpose: globals.css
 * keys its light-mode overrides off those exact class names.
 */

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

export type DialogSize = keyof typeof SIZES;

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Visible title. Also used as the accessible name. */
  title: React.ReactNode;
  /** Optional supporting line under the title. */
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Footer actions — rendered right-aligned under a divider. */
  footer?: React.ReactNode;
  size?: DialogSize;
  /** Hide the top-right close button (rare — e.g. blocking flows). */
  hideCloseButton?: boolean;
  /** Escape / overlay click will not close the dialog. */
  dismissible?: boolean;
  className?: string;
  contentLabel?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  hideCloseButton = false,
  dismissible = true,
  className,
  contentLabel,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={cn(
            "fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          )}
        />
        <RadixDialog.Content
          aria-label={contentLabel}
          onEscapeKeyDown={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          className={cn(
            "fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2",
            "flex max-h-[90vh] w-full max-w-[90vw] flex-col",
            "rounded-xl border border-[#27272A] bg-[#18181B] shadow-2xl shadow-black/50",
            "focus:outline-none",
            SIZES[size],
            className
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[#27272A] px-5 py-4">
            <div className="min-w-0 flex-1">
              <RadixDialog.Title className="font-display text-[15px] font-bold text-[#FAFAFA]">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-[13px] leading-relaxed text-[#A1A1AA]">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            {!hideCloseButton && (
              <RadixDialog.Close
                aria-label="Fermer"
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#27272A] hover:text-[#FAFAFA]"
              >
                <X className="h-4 w-4" />
              </RadixDialog.Close>
            )}
          </div>

          {children != null && (
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          )}

          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#27272A] px-5 py-3.5">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Escape hatch for dialogs that need full control of the frame. */
export const DialogRoot = RadixDialog.Root;
export const DialogPortal = RadixDialog.Portal;
export const DialogOverlay = RadixDialog.Overlay;
export const DialogContent = RadixDialog.Content;
export const DialogTitle = RadixDialog.Title;
export const DialogDescription = RadixDialog.Description;
export const DialogClose = RadixDialog.Close;
export const DialogTrigger = RadixDialog.Trigger;
