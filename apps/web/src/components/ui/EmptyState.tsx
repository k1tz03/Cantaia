"use client";

import { type LucideIcon } from "lucide-react";
import Link from "next/link";

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
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
        <Icon className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-700 mt-4">{title}</h3>
      <p className="text-sm text-slate-500 mt-2 max-w-sm text-center">{description}</p>
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-gold text-white text-sm font-medium rounded-md hover:bg-gold-dark transition-colors"
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-gold text-white text-sm font-medium rounded-md hover:bg-gold-dark transition-colors"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
