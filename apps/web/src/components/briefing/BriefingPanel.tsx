"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Sparkles,
  Calendar,
  Loader2,
} from "lucide-react";
import type { BriefingContent } from "@cantaia/database";

interface BriefingPanelProps {
  compact?: boolean;
}

export function BriefingPanel({ compact = true }: BriefingPanelProps) {
  const t = useTranslations("briefing");
  const [briefing, setBriefing] = useState<BriefingContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBriefing = async (forceRegenerate = false) => {
    setLoading(true);
    setError(null);
    try {
      if (forceRegenerate) {
        const res = await fetch("/api/briefing/generate", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setBriefing(data.briefing);
        } else {
          setError("Failed to generate briefing");
        }
      } else {
        const res = await fetch("/api/briefing/today");
        if (res.ok) {
          const data = await res.json();
          setBriefing(data.briefing);
        } else if (res.status === 404) {
          // No briefing yet, generate one
          const genRes = await fetch("/api/briefing/generate", { method: "POST" });
          if (genRes.ok) {
            const data = await genRes.json();
            setBriefing(data.briefing);
          }
        }
      }
    } catch {
      // Use mock briefing as fallback
      setBriefing(getMockBriefing(t));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Try real API first, fall back to mock data
    fetchBriefing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        <span className="ml-2 text-xs text-gray-500">{t("generating")}</span>
      </div>
    );
  }

  if (error || !briefing) {
    return (
      <div className="rounded-md border border-red-100 bg-red-50/50 p-3">
        <p className="text-xs text-red-600">{error || t("errorGeneral")}</p>
        <button
          onClick={() => fetchBriefing(true)}
          className="mt-2 text-xs font-medium text-red-700 underline"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  // Compact mode (dashboard side panel)
  if (compact) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            {t("title")}
          </h3>
          <Link
            href="/briefing"
            className="text-[10px] font-medium text-brand hover:underline"
          >
            {t("viewFull")}
          </Link>
        </div>

        <div className="mt-2 space-y-1.5">
          {/* Priority alerts */}
          {briefing.priority_alerts.slice(0, 3).map((alert, i) => (
            <div
              key={i}
              className="rounded-md border border-amber-100 bg-amber-50/50 px-3 py-2"
            >
              <p className="text-xs font-medium text-amber-800">{alert}</p>
            </div>
          ))}

          {/* Project summaries (first 3) */}
          {briefing.projects.slice(0, 3).map((project) => (
            <div
              key={project.project_id}
              className="rounded-md border border-gray-200 bg-white px-3 py-2"
            >
              <p className="text-xs text-gray-600">
                <span className="mr-1">{project.status_emoji}</span>
                <span className="font-medium text-gray-800">
                  {project.name}
                </span>
                {" — "}
                {project.summary}
              </p>
            </div>
          ))}

          {/* Today's meetings */}
          {briefing.meetings_today.length > 0 && (
            <div className="rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-blue-800">
                <Calendar className="h-3 w-3" />
                {briefing.meetings_today.length} {t("meetingsToday")}
              </div>
              {briefing.meetings_today.slice(0, 2).map((m, i) => (
                <p key={i} className="mt-0.5 text-[10px] text-blue-700">
                  {m.time} · {m.project} · {m.title}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full mode (dedicated /briefing page) — handled by BriefingFullPage
  return null;
}

// ---------- Mock briefing (used until API is connected) ----------

function getMockBriefing(_t: ReturnType<typeof useTranslations>): BriefingContent {
  return {
    mode: "ai" as const,
    greeting: "",
    priority_alerts: [],
    projects: [],
    meetings_today: [],
    stats: {
      total_projects: 0,
      emails_unread: 0,
      emails_action_required: 0,
      tasks_overdue: 0,
      tasks_due_today: 0,
      meetings_today: 0,
    },
    global_summary: "",
  };
}
