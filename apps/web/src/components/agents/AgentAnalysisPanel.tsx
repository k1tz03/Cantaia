// ============================================================
// AgentAnalysisPanel — Real-time display of Managed Agent activity
// Shows streaming events: tool calls, messages, progress, metrics.
// Used by the submission detail page for agent-powered analysis.
// ============================================================

"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileSearch,
  Database,
  Save,
  Wrench,
  ChevronDown,
  Clock,
  Bot,
  Globe,
} from "lucide-react";
import type { AgentEvent, AgentResult } from "@/lib/hooks/use-agent";
import type { AgentType, SessionStatus } from "@cantaia/core/agents";

// ── Tool name → icon + i18n key (labels live in messages/*.json, "agents.tools") ──

type Translator = (key: string, values?: Record<string, string | number | Date>) => string;

const TOOL_ICONS: Record<string, React.ComponentType<any>> = {
  // Submission analyzer tools
  fetch_submission_file: FileSearch,
  get_submission_context: Database,
  save_analysis_result: Save,
  // Briefing generator tools
  fetch_cantaia_context: Database,
  save_briefing: Save,
  // Email classifier tools
  fetch_emails_batch: FileSearch,
  get_projects_list: Database,
  save_classifications: Save,
  // Plan estimator tools
  fetch_plan_image: FileSearch,
  query_reference_prices: Database,
  save_estimation: Save,
  // Price extractor tools
  fetch_file_content: FileSearch,
  save_extracted_prices: Save,
  // Built-in tools
  bash: Wrench,
  read: FileSearch,
  write: Save,
  web_fetch: Globe,
};

function getToolInfo(t: Translator, toolName: string) {
  const icon = TOOL_ICONS[toolName];
  if (!icon) return { label: toolName, icon: Wrench };
  return { label: t(`tools.${toolName}`), icon };
}

// ── Agent-type display config (strings in messages/*.json, "agents.display") ──

const AGENT_TYPES: ReadonlyArray<AgentType> = [
  "submission-analyzer",
  "briefing-generator",
  "email-classifier",
  "plan-estimator",
  "price-extractor",
  "email-drafter",
  "followup-engine",
  "supplier-monitor",
  "project-memory",
  "meeting-prep",
];

const DEFAULT_AGENT_TYPE: AgentType = "submission-analyzer";

// ── Types ─────────────────────────────────────────────────────

interface AgentAnalysisPanelProps {
  /** Current session status */
  status: SessionStatus | "idle" | "starting";
  /** All events from the SSE stream */
  events: AgentEvent[];
  /** Latest agent text message (for future use) */
  lastMessage: string | null;
  /** Final result after completion */
  result: AgentResult | null;
  /** Error message if failed */
  error: string | null;
  /** Whether agent is actively running */
  isRunning: boolean;
  /** Cancel the running session */
  onCancel: () => void;
  /** Number of items saved (extracted from events) */
  itemsSaved?: number;
  /** Agent type — controls display strings */
  agentType?: AgentType;
}

// ── Component ─────────────────────────────────────────────────

export function AgentAnalysisPanel({
  status,
  events,
  lastMessage: _lastMessage,
  result,
  error,
  isRunning,
  onCancel,
  itemsSaved,
  agentType,
}: AgentAnalysisPanelProps) {
  const t = useTranslations("agents");
  const displayType: AgentType =
    agentType && AGENT_TYPES.includes(agentType) ? agentType : DEFAULT_AGENT_TYPE;
  const [expanded, setExpanded] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Timer — tick every second while running.
  // FIX: Only set startTimeRef once (on first transition to active), not on every
  // status change. Previously, going running→tool_pending→running would reset the
  // start time on each transition because the effect depended on [isRunning, status].
  const isActive = isRunning || status === "starting";

  useEffect(() => {
    if (!isActive) {
      // Session ended — freeze timer, reset start ref for next session
      startTimeRef.current = null;
      return;
    }
    // Only set start time once per session
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - (startTimeRef.current ?? Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  // Auto-scroll event list to bottom
  useEffect(() => {
    if (scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length, expanded]);

  // Auto-collapse 5s after completion
  useEffect(() => {
    if (status === "completed" || status === "failed") {
      const timer = setTimeout(() => setExpanded(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Extract items count from the save_analysis_result tool result event
  const savedCount = itemsSaved ?? extractItemsCount(events);

  // ── Derive display info from status ───────────────────────

  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  const headerBg = isCompleted
    ? "bg-green-500/10 border-green-500/20"
    : isFailed
    ? "bg-red-500/10 border-red-500/20"
    : "bg-[#F97316]/10 border-[#F97316]/20";

  const headerIcon = isCompleted ? (
    <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
  ) : isFailed ? (
    <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
  ) : (
    <Loader2 className="h-5 w-5 text-[#F97316] animate-spin shrink-0" />
  );

  const headerTitle = isCompleted
    ? t(`display.${displayType}.completed`, { count: savedCount })
    : isFailed
    ? t("analysisError")
    : status === "starting"
    ? t(`display.${displayType}.starting`)
    : t(`display.${displayType}.running`);

  const headerSubtitle = isCompleted
    ? formatDuration(result?.metrics?.duration_ms ?? elapsedMs)
    : isFailed
    ? error || t("genericError")
    : getActivityDescription(t, events, t(`display.${displayType}.activity`));

  return (
    <div className={`mx-6 mt-6 border rounded-xl overflow-hidden ${headerBg}`}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        {headerIcon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#FAFAFA]">{headerTitle}</p>
          <p className={`text-xs ${isCompleted ? "text-green-400/80" : isFailed ? "text-red-400/80" : "text-[#F97316]"}`}>
            {headerSubtitle}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isActive && (
            <>
              <span className="text-xs font-mono text-[#A1A1AA]">
                {formatDuration(elapsedMs)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
                className="text-xs px-2 py-1 rounded border border-[#27272A] text-[#A1A1AA] hover:text-red-400 hover:border-red-500/30"
              >
                {t("cancel")}
              </button>
            </>
          )}
          <ChevronDown
            className={`h-4 w-4 text-[#A1A1AA] transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* Event feed — collapsible */}
      {expanded && events.length > 0 && (
        <div
          ref={scrollRef}
          className="border-t border-[#27272A]/50 max-h-[280px] overflow-y-auto px-4 py-2 space-y-1.5"
        >
          {events.map((event, idx) => (
            <AgentEventRow key={idx} event={event} />
          ))}
        </div>
      )}

      {/* Metrics footer on completion */}
      {isCompleted && result?.metrics && expanded && (
        <div className="border-t border-[#27272A]/50 px-4 py-2.5 flex items-center gap-4 text-xs text-[#A1A1AA]">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(result.metrics.duration_ms ?? 0)}
          </span>
          <span className="flex items-center gap-1">
            <Wrench className="h-3 w-3" />
            {t("toolCalls", { count: result.metrics.tool_calls_count })}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Individual event row ──────────────────────────────────────

function AgentEventRow({ event }: { event: AgentEvent }) {
  const t = useTranslations("agents");
  if (event.type === "agent.tool_use") {
    const toolInfo = getToolInfo(t, event.tool_name || "unknown");
    const Icon = toolInfo.icon;
    return (
      <div className="flex items-center gap-2 py-1">
        <Icon className="h-3.5 w-3.5 text-[#F97316] shrink-0" />
        <span className="text-xs text-[#A1A1AA]">{toolInfo.label}</span>
        {event.tool_name === "save_analysis_result" && (
          <span className="text-[10px] bg-[#27272A] text-[#A1A1AA] px-1.5 py-0.5 rounded-full ml-auto">
            JSON
          </span>
        )}
      </div>
    );
  }

  if (event.type === "custom_tool_result") {
    const toolName = (event.data?.tool_name as string) || "";
    const toolInfo = getToolInfo(t, toolName);
    const preview = (event.data?.result_preview as string) || "";
    const isError = preview.includes('"error":true') || preview.includes('"error": true');

    return (
      <div className="flex items-center gap-2 py-1">
        {isError ? (
          <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
        )}
        <span className="text-xs text-[#A1A1AA]">
          {toolInfo.label} — {isError ? t("statusError") : t("statusOk")}
        </span>
      </div>
    );
  }

  if (event.type === "agent.message" && event.text) {
    // Truncate long messages for the event feed
    const text = event.text.length > 200 ? event.text.slice(0, 200) + "..." : event.text;
    return (
      <div className="flex items-start gap-2 py-1">
        <Bot className="h-3.5 w-3.5 text-[#3B82F6] shrink-0 mt-0.5" />
        <span className="text-xs text-[#A1A1AA] leading-relaxed">{text}</span>
      </div>
    );
  }

  if (event.type === "error") {
    return (
      <div className="flex items-center gap-2 py-1">
        <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
        <span className="text-xs text-red-400">{(event.data?.error as string) || t("error")}</span>
      </div>
    );
  }

  // Skip other event types (session status, done, etc.)
  return null;
}

// ── Helpers ───────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function getActivityDescription(
  t: Translator,
  events: AgentEvent[],
  defaultActivity: string
): string {
  // Find the last tool call or message to describe current activity
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "agent.tool_use" && e.tool_name) {
      const info = getToolInfo(t, e.tool_name);
      return info.label + "...";
    }
    if (e.type === "custom_tool_result") {
      return t("processing");
    }
  }
  return defaultActivity;
}

function extractItemsCount(events: AgentEvent[]): number {
  // Look for any save tool result with a count field.
  // Handles multiple agents:
  //   save_analysis_result  → "items_saved": N  (submission-analyzer)
  //   save_classifications  → "saved": N, "total": M  (email-classifier)
  //   save_extracted_prices → "saved": N        (price-extractor)
  //
  // We use Math.max(total, saved) because:
  // - "total" = items the agent processed/attempted
  // - "saved" = items successfully written to DB
  // The user cares about how many were processed, not DB write success count.
  const SAVE_TOOLS = new Set([
    "save_analysis_result",
    "save_classifications",
    "save_extracted_prices",
  ]);
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "custom_tool_result" && SAVE_TOOLS.has(e.data?.tool_name as string)) {
      const preview = (e.data?.result_preview as string) || "";
      const savedMatch = preview.match(/"(?:items_)?saved"\s*:\s*(\d+)/);
      const totalMatch = preview.match(/"total"\s*:\s*(\d+)/);
      const saved = savedMatch ? parseInt(savedMatch[1], 10) : 0;
      const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
      const count = Math.max(total, saved);
      if (count > 0) return count;
    }
  }
  return 0;
}
