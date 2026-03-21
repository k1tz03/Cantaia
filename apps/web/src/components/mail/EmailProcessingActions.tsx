"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@cantaia/ui";
import {
  Check,
  Reply,
  ListTodo,
  Forward,
  X,
  Clock,
  Tag,
  Archive,
  Loader2,
  ChevronDown,
} from "lucide-react";
import type { EmailRecord, Project } from "@cantaia/database";

interface EmailProcessingActionsProps {
  email: EmailRecord;
  projects: Project[];
  onProcessed: () => void;
  compact?: boolean;
}

const SNOOZE_OPTIONS = [
  { key: "1h", ms: 3600000 },
  { key: "4h", ms: 14400000 },
  { key: "tomorrow", ms: 0 }, // computed dynamically
  { key: "next_week", ms: 0 }, // computed dynamically
] as const;

function getSnoozeUntil(key: string): string {
  const now = new Date();
  switch (key) {
    case "1h":
      return new Date(now.getTime() + 3600000).toISOString();
    case "4h":
      return new Date(now.getTime() + 14400000).toISOString();
    case "tomorrow": {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      return tomorrow.toISOString();
    }
    case "next_week": {
      const nextMonday = new Date(now);
      const day = nextMonday.getDay();
      const daysUntilMonday = day === 0 ? 1 : 8 - day;
      nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
      nextMonday.setHours(8, 0, 0, 0);
      return nextMonday.toISOString();
    }
    default:
      return new Date(now.getTime() + 3600000).toISOString();
  }
}

export function EmailProcessingActions({
  email,
  projects,
  onProcessed,
  compact = false,
}: EmailProcessingActionsProps) {
  const t = useTranslations("mail");
  const [processing, setProcessing] = useState<string | null>(null);
  const [showSnooze, setShowSnooze] = useState(false);
  const [showReclassify, setShowReclassify] = useState(false);

  const processEmail = useCallback(
    async (action: string, data?: Record<string, unknown>) => {
      setProcessing(action);
      try {
        const res = await fetch(`/api/email/${email.id}/process`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, data }),
        });
        if (res.ok) {
          onProcessed();
        }
      } catch {
        // ignore
      } finally {
        setProcessing(null);
        setShowSnooze(false);
        setShowReclassify(false);
      }
    },
    [email.id, onProcessed]
  );

  const snoozeEmail = useCallback(
    async (key: string) => {
      setProcessing("snooze");
      try {
        const until = getSnoozeUntil(key);
        const res = await fetch(`/api/email/${email.id}/snooze`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ until }),
        });
        if (res.ok) {
          onProcessed();
        }
      } catch {
        // ignore
      } finally {
        setProcessing(null);
        setShowSnooze(false);
      }
    },
    [email.id, onProcessed]
  );

  const archiveEmail = useCallback(async () => {
    setProcessing("archive");
    try {
      const res = await fetch(`/api/email/${email.id}/archive`, {
        method: "POST",
      });
      if (res.ok) {
        await processEmail("read_ok");
      }
    } catch {
      // ignore
    } finally {
      setProcessing(null);
    }
  }, [email.id, processEmail]);

  const actions = [
    {
      key: "read_ok",
      icon: Check,
      color: "text-green-600 hover:bg-green-500/10",
      onClick: () => processEmail("read_ok"),
    },
    {
      key: "replied",
      icon: Reply,
      color: "text-primary hover:bg-primary/10",
      onClick: () => processEmail("replied"),
    },
    {
      key: "task_created",
      icon: ListTodo,
      color: "text-purple-600 hover:bg-purple-500/10",
      onClick: () => processEmail("task_created"),
    },
    {
      key: "forwarded",
      icon: Forward,
      color: "text-orange-600 hover:bg-orange-500/10",
      onClick: () => processEmail("forwarded"),
    },
    {
      key: "dismissed",
      icon: X,
      color: "text-muted-foreground hover:bg-muted",
      onClick: () => processEmail("dismissed"),
    },
  ];

  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        {actions.map((a) => {
          const Icon = a.icon;
          const isLoading = processing === a.key;
          return (
            <button
              key={a.key}
              onClick={(e) => {
                e.stopPropagation();
                a.onClick();
              }}
              disabled={!!processing}
              className={cn(
                "rounded p-1 transition-colors disabled:opacity-50",
                a.color
              )}
              title={t(`process_${a.key}`)}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
            </button>
          );
        })}
        {/* Snooze */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSnooze(!showSnooze);
            }}
            disabled={!!processing}
            className="rounded p-1 text-amber-600 transition-colors hover:bg-amber-500/100/10 disabled:opacity-50"
            title={t("process_snoozed")}
          >
            {processing === "snooze" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
          </button>
          {showSnooze && (
            <div className="absolute right-0 top-full z-30 mt-1 w-36 rounded-md border border-border bg-background py-1 shadow-lg">
              {SNOOZE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    snoozeEmail(opt.key);
                  }}
                  className="flex w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  {t(`snooze_${opt.key}`)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full layout for detail panel
  return (
    <div className="space-y-2">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("actions")}
      </h4>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((a) => {
          const Icon = a.icon;
          const isLoading = processing === a.key;
          return (
            <button
              key={a.key}
              onClick={a.onClick}
              disabled={!!processing}
              className={cn(
                "flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50",
                a.color
              )}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              {t(`process_${a.key}`)}
            </button>
          );
        })}

        {/* Snooze dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSnooze(!showSnooze)}
            disabled={!!processing}
            className="flex w-full items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
          >
            {processing === "snooze" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
            {t("process_snoozed")}
            <ChevronDown className="ml-auto h-3 w-3" />
          </button>
          {showSnooze && (
            <div className="absolute left-0 top-full z-30 mt-1 w-full rounded-md border border-border bg-background py-1 shadow-lg">
              {SNOOZE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => snoozeEmail(opt.key)}
                  className="flex w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  {t(`snooze_${opt.key}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reclassify dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowReclassify(!showReclassify)}
            disabled={!!processing}
            className="flex w-full items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {processing === "reclassify" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Tag className="h-3.5 w-3.5" />
            )}
            {t("process_reclassify")}
            <ChevronDown className="ml-auto h-3 w-3" />
          </button>
          {showReclassify && (
            <div className="absolute left-0 top-full z-30 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-background py-1 shadow-lg">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => processEmail("reclassify", { project_id: p.id })}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Archive */}
        <button
          onClick={archiveEmail}
          disabled={!!processing}
          className="col-span-2 flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {processing === "archive" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
          {t("process_archive")}
        </button>
      </div>
    </div>
  );
}
