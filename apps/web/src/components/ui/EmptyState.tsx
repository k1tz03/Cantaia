"use client";

import { type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";

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

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-full bg-[#27272A] flex items-center justify-center">
        <Icon className="w-8 h-8 text-[#71717A]" />
      </div>
      <h3 className="text-lg font-semibold text-[#FAFAFA] mt-4">{title}</h3>
      <p className="text-sm text-[#71717A] mt-2 max-w-sm text-center">{description}</p>
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-[#F97316] text-white text-sm font-medium rounded-md hover:bg-[#F97316]/90 transition-colors"
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-[#F97316] text-white text-sm font-medium rounded-md hover:bg-[#F97316]/90 transition-colors"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
