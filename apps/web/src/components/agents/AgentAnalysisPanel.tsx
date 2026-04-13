// ============================================================
// AgentAnalysisPanel — Real-time display of Managed Agent activity
// Shows streaming events: tool calls, messages, progress, metrics.
// Used by the submission detail page for agent-powered analysis.
// ============================================================

"use client";

import React, { useEffect, useRef, useState } from "react";
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

// ── Tool name → French label mapping ──────────────────────────

const TOOL_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  // Submission analyzer tools
  fetch_submission_file: { label: "Lecture du document", icon: FileSearch },
  get_submission_context: { label: "Chargement du contexte projet", icon: Database },
  save_analysis_result: { label: "Sauvegarde des postes extraits", icon: Save },
  // Briefing generator tools
  fetch_cantaia_context: { label: "Récupération des données du jour", icon: Database },
  save_briefing: { label: "Sauvegarde du briefing", icon: Save },
  // Email classifier tools
  fetch_emails_batch: { label: "Chargement des emails", icon: FileSearch },
  get_projects_list: { label: "Chargement des projets", icon: Database },
  save_classifications: { label: "Sauvegarde des classifications", icon: Save },
  // Plan estimator tools
  fetch_plan_image: { label: "Téléchargement du plan", icon: FileSearch },
  query_reference_prices: { label: "Recherche des prix de référence", icon: Database },
  save_estimation: { label: "Sauvegarde de l'estimation", icon: Save },
  // Price extractor tools
  fetch_file_content: { label: "Lecture du fichier", icon: FileSearch },
  save_extracted_prices: { label: "Sauvegarde des prix extraits", icon: Save },
  // Built-in tools
  bash: { label: "Exécution de commande", icon: Wrench },
  read: { label: "Lecture de fichier", icon: FileSearch },
  write: { label: "Écriture de fichier", icon: Save },
  web_fetch: { label: "Requête web", icon: Globe },
};

function getToolInfo(toolName: string) {
  return TOOL_LABELS[toolName] || { label: toolName, icon: Wrench };
}

// ── Agent-type display config ────────────────────────────────

const AGENT_DISPLAY: Record<AgentType, {
  completedTitle: (count: number) => string;
  runningTitle: string;
  startingTitle: string;
  defaultActivity: string;
}> = {
  "submission-analyzer": {
    completedTitle: (n) => `Analyse terminée — ${n} postes extraits`,
    runningTitle: "Agent IA en cours d'analyse...",
    startingTitle: "Démarrage de l'agent IA...",
    defaultActivity: "Extraction des postes du descriptif",
  },
  "briefing-generator": {
    completedTitle: () => "Briefing généré avec succès",
    runningTitle: "Génération du briefing en cours...",
    startingTitle: "Démarrage de l'agent IA...",
    defaultActivity: "Préparation du briefing quotidien",
  },
  "email-classifier": {
    completedTitle: (n) => `Classification terminée — ${n} emails traités`,
    runningTitle: "Classification des emails en cours...",
    startingTitle: "Démarrage de l'agent IA...",
    defaultActivity: "Analyse des emails",
  },
  "plan-estimator": {
    completedTitle: () => "Estimation du plan terminée",
    runningTitle: "Estimation en cours...",
    startingTitle: "Démarrage de l'agent IA...",
    defaultActivity: "Analyse du plan de construction",
  },
  "price-extractor": {
    completedTitle: (n) => `Extraction terminée — ${n} prix extraits`,
    runningTitle: "Extraction des prix en cours...",
    startingTitle: "Démarrage de l'agent IA...",
    defaultActivity: "Lecture des documents prix",
  },
  "email-drafter": {
    completedTitle: (n) => `${n} brouillon${n > 1 ? "s" : ""} préparé${n > 1 ? "s" : ""}`,
    runningTitle: "Rédaction des brouillons en cours...",
    startingTitle: "Démarrage de l'agent Email Drafter...",
    defaultActivity: "Analyse des emails en attente de réponse",
  },
  "followup-engine": {
    completedTitle: (n) => `${n} relance${n > 1 ? "s" : ""} identifiée${n > 1 ? "s" : ""}`,
    runningTitle: "Détection des relances en cours...",
    startingTitle: "Démarrage du Followup Engine...",
    defaultActivity: "Analyse des demandes sans réponse",
  },
  "supplier-monitor": {
    completedTitle: (n) => `${n} alerte${n > 1 ? "s" : ""} fournisseur détectée${n > 1 ? "s" : ""}`,
    runningTitle: "Analyse des fournisseurs en cours...",
    startingTitle: "Démarrage du Supplier Monitor...",
    defaultActivity: "Évaluation des performances fournisseurs",
  },
  "project-memory": {
    completedTitle: (n) => `${n} projets analysés`,
    runningTitle: "Analyse des projets en cours...",
    startingTitle: "Démarrage de l'analyse projet...",
    defaultActivity: "Scan cross-module des projets",
  },
  "meeting-prep": {
    completedTitle: (n) => `${n} préparations générées`,
    runningTitle: "Préparation des réunions en cours...",
    startingTitle: "Démarrage de la préparation...",
    defaultActivity: "Génération des dossiers de réunion",
  },
};

const DEFAULT_DISPLAY = AGENT_DISPLAY["submission-analyzer"];

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
  const display = (agentType && AGENT_DISPLAY[agentType]) || DEFAULT_DISPLAY;
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
    ? display.completedTitle(savedCount)
    : isFailed
    ? "Erreur lors de l'analyse"
    : status === "starting"
    ? display.startingTitle
    : display.runningTitle;

  const headerSubtitle = isCompleted
    ? formatDuration(result?.metrics?.duration_ms ?? elapsedMs)
    : isFailed
    ? error || "Une erreur est survenue"
    : getActivityDescription(events, display.defaultActivity);

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
              <span className="text-xs font-mono text-[#71717A]">
                {formatDuration(elapsedMs)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
                className="text-xs px-2 py-1 rounded border border-[#27272A] text-[#71717A] hover:text-red-400 hover:border-red-500/30"
              >
                Annuler
              </button>
            </>
          )}
          <ChevronDown
            className={`h-4 w-4 text-[#71717A] transition-transform ${expanded ? "rotate-180" : ""}`}
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
        <div className="border-t border-[#27272A]/50 px-4 py-2.5 flex items-center gap-4 text-xs text-[#71717A]">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(result.metrics.duration_ms ?? 0)}
          </span>
          <span className="flex items-center gap-1">
            <Wrench className="h-3 w-3" />
            {result.metrics.tool_calls_count} appels d&apos;outil
          </span>
        </div>
      )}
    </div>
  );
}

// ── Individual event row ──────────────────────────────────────

function AgentEventRow({ event }: { event: AgentEvent }) {
  if (event.type === "agent.tool_use") {
    const toolInfo = getToolInfo(event.tool_name || "unknown");
    const Icon = toolInfo.icon;
    return (
      <div className="flex items-center gap-2 py-1">
        <Icon className="h-3.5 w-3.5 text-[#F97316] shrink-0" />
        <span className="text-xs text-[#A1A1AA]">{toolInfo.label}</span>
        {event.tool_name === "save_analysis_result" && (
          <span className="text-[10px] bg-[#27272A] text-[#71717A] px-1.5 py-0.5 rounded-full ml-auto">
            JSON
          </span>
        )}
      </div>
    );
  }

  if (event.type === "custom_tool_result") {
    const toolName = (event.data?.tool_name as string) || "";
    const toolInfo = getToolInfo(toolName);
    const preview = (event.data?.result_preview as string) || "";
    const isError = preview.includes('"error":true') || preview.includes('"error": true');

    return (
      <div className="flex items-center gap-2 py-1">
        {isError ? (
          <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
        )}
        <span className="text-xs text-[#71717A]">
          {toolInfo.label} {isError ? "— erreur" : "— OK"}
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
        <span className="text-xs text-red-400">{(event.data?.error as string) || "Erreur"}</span>
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

function getActivityDescription(events: AgentEvent[], defaultActivity: string): string {
  // Find the last tool call or message to describe current activity
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "agent.tool_use" && e.tool_name) {
      const info = getToolInfo(e.tool_name);
      return info.label + "...";
    }
    if (e.type === "custom_tool_result") {
      return "Traitement en cours...";
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
