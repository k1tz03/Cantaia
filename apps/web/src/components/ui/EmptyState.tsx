"use client";

import { type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EmptyState as UIEmptyState } from "@cantaia/ui";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

/**
 * App wrapper over the shared @cantaia/ui EmptyState.
 *
 * The shared primitive is router-agnostic, so this layer supplies the
 * locale-aware `Link` for `href` actions and keeps the existing
 * `{ label, href, onClick }` action shape used across the app.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <UIEmptyState
      icon={icon}
      title={title}
      description={description}
      action={
        action
          ? {
              label: action.label,
              onClick: action.onClick,
              render: action.href
                ? (className, label) => (
                    <Link href={action.href!} className={className}>
                      {label}
                    </Link>
                  )
                : undefined,
            }
          : undefined
      }
    />
  );
}
