"use client";

import { FileText, Send, Mail, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";

export interface TimelineItem {
  id: string;
  type: "offer" | "request" | "email";
  date: string;
  description: string;
  meta?: Record<string, unknown>;
}

interface SupplierTimelineProps {
  items: TimelineItem[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore?: () => void;
}

const TYPE_CONFIG: Record<string, { icon: typeof FileText; color: string; bgColor: string }> = {
  offer: {
    icon: FileText,
    color: "text-green-600",
    bgColor: "bg-green-500/10 ring-green-200",
  },
  request: {
    icon: Send,
    color: "text-primary",
    bgColor: "bg-primary/10 ring-blue-200",
  },
  email: {
    icon: Mail,
    color: "text-amber-600",
    bgColor: "bg-amber-500/10 ring-amber-200",
  },
};

function formatTimelineDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "Hier";
    if (diffDays < 7) return `Il y a ${diffDays} jours`;

    return date.toLocaleDateString("fr-CH", {
      day: "numeric",
      month: "short",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return dateStr;
  }
}

export function SupplierTimeline({ items, hasMore, loading, onLoadMore }: SupplierTimelineProps) {
  const [expanded, setExpanded] = useState(true);

  if (loading && items.length === 0) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Aucune interaction enregistrée
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-3 hover:text-foreground"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`}
        />
        Historique
        <span className="text-xs text-muted-foreground font-normal ml-1">
          ({items.length}{hasMore ? "+" : ""})
        </span>
      </button>

      {expanded && (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[13px] top-2 bottom-2 w-px bg-muted" />

          <div className="space-y-3">
            {items.map((item) => {
              const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.email;
              const Icon = config.icon;

              return (
                <div key={item.id} className="relative flex items-start gap-3 pl-0">
                  {/* Icon dot */}
                  <div
                    className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${config.bgColor}`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-xs text-foreground leading-snug break-words">
                      {item.description}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatTimelineDate(item.date)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loading}
              className="mt-3 w-full text-center text-xs text-primary hover:text-primary font-medium disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Chargement...
                </span>
              ) : (
                "Voir tout"
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
