"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  /** Render prop for router-aware links (next-intl `Link`, etc.). */
  render?: (className: string, label: string) => React.ReactNode;
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  /** Secondary, lower-emphasis action. */
  secondaryAction?: EmptyStateAction;
  /** `inline` is the compact variant for empty panels inside a page. */
  size?: "default" | "inline";
  className?: string;
  children?: React.ReactNode;
}

const PRIMARY_BTN =
  "mt-6 inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-4 py-2 text-[13px] font-semibold text-[#0F0F11] transition-colors hover:bg-[#EA580C]";
const SECONDARY_BTN =
  "mt-3 inline-flex items-center gap-2 rounded-lg border border-[#27272A] px-4 py-2 text-[13px] font-medium text-[#A1A1AA] transition-colors hover:bg-[#27272A] hover:text-[#FAFAFA]";

function renderAction(action: EmptyStateAction, className: string) {
  if (action.render) return action.render(className, action.label);
  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
}

/**
 * Empty / zero-data placeholder. Generalises the app-local version:
 * the icon is optional, actions can render as links, and `inline`
 * shrinks it for use inside a card rather than a full page.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  size = "default",
  className,
  children,
}: EmptyStateProps) {
  const compact = size === "inline";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-4 text-center",
        compact ? "py-8" : "py-16",
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-[#27272A]",
            compact ? "h-11 w-11" : "h-16 w-16"
          )}
        >
          <Icon className={cn("text-[#A1A1AA]", compact ? "h-5 w-5" : "h-8 w-8")} />
        </div>
      )}
      <h3
        className={cn(
          "font-semibold text-[#FAFAFA]",
          Icon ? "mt-4" : "",
          compact ? "text-sm" : "text-lg"
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            "mt-2 max-w-sm text-[#A1A1AA]",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {description}
        </p>
      )}
      {children}
      {action && renderAction(action, PRIMARY_BTN)}
      {secondaryAction && renderAction(secondaryAction, SECONDARY_BTN)}
    </div>
  );
}
