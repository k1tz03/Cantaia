// ============================================================
// useAgent — React hook for Managed Agent sessions
// State machine: idle → starting → running → tool_pending → completed/failed
// Streams SSE events and exposes them for UI rendering.
// ============================================================

import { useState, useCallback, useRef, useEffect } from "react";
import type { AgentType, SessionStatus } from "@cantaia/core/agents";

// ── Types ───────────────────────────────────────────────────

export interface AgentEvent {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  /** For agent.message — the text content */
  text?: string;
  /** For agent.tool_use — tool info */
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

export interface AgentMetrics {
  duration_ms: number | null;
  events_count: number;
  tool_calls_count: number;
  custom_tool_calls_count: number;
  tools_used: string[];
  estimated_cost_chf: number | null;
}

export interface AgentResult {
  id: string;
  session_id: string;
  status: SessionStatus;
  result: Record<string, unknown> | null;
  error_message: string | null;
  metrics: AgentMetrics;
}

export interface UseAgentReturn {
  /** Current session status */
  status: SessionStatus | "idle" | "starting";
  /** All events received from the stream */
  events: AgentEvent[];
  /** Latest agent text message (convenience) */
  lastMessage: string | null;
  /** Final result (available after completion) */
  result: AgentResult | null;
  /** Error message if failed */
  error: string | null;
  /** Whether the agent is actively running */
  isRunning: boolean;
  /** Start a new agent session */
  start: (input: Record<string, unknown>, message: string, title?: string) => Promise<void>;
  /** Send a follow-up message to the running agent */
  respond: (message: string) => Promise<void>;
  /** Cancel the current session */
  cancel: () => void;
  /** Reset to idle state */
  reset: () => void;
}

// ── Hook ────────────────────────────────────────────────────

export function useAgent(agentType: AgentType): UseAgentReturn {
  const [status, setStatus] = useState<SessionStatus | "idle" | "starting">("idle");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dbSessionIdRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Start session ─────────────────────────────────────

  const start = useCallback(
    async (input: Record<string, unknown>, message: string, title?: string) => {
      // FIX #9: Abort any previous session before starting a new one
      abortRef.current?.abort();
      abortRef.current = null;
      sessionIdRef.current = null;
      dbSessionIdRef.current = null;

      // Reset state
      setStatus("starting");
      setEvents([]);
      setLastMessage(null);
      setResult(null);
      setError(null);

      try {
        // 1. Create session via start route
        const startRes = await fetch(`/api/agents/${agentType}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input, message, title }),
        });

        if (!startRes.ok) {
          const errData = await startRes.json().catch(() => ({}));
          throw new Error(errData.error || `Start failed: ${startRes.status}`);
        }

        const startData = await startRes.json();
        sessionIdRef.current = startData.session_id;
        dbSessionIdRef.current = startData.id;

        setStatus("running");

        // 2. Open SSE stream
        const abort = new AbortController();
        abortRef.current = abort;

        const streamUrl = `/api/agents/${agentType}/stream?session_id=${startData.session_id}`;
        const streamRes = await fetch(streamUrl, {
          signal: abort.signal,
          headers: { Accept: "text/event-stream" },
        });

        if (!streamRes.ok || !streamRes.body) {
          throw new Error(`Stream failed: ${streamRes.status}`);
        }

        // 3. Read SSE stream
        const reader = streamRes.body
          .pipeThrough(new TextDecoderStream())
          .getReader();

        let sseBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += value;
          const parts = sseBuffer.split("\n\n");
          sseBuffer = parts.pop() || "";

          for (const part of parts) {
            if (!part.trim()) continue;

            const lines = part.split("\n");
            let eventType = "";
            let eventData = "";

            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                eventData = line.slice(5).trim();
              }
            }

            if (!eventType || !eventData) continue;

            try {
              const parsed = JSON.parse(eventData);
              const event: AgentEvent = {
                type: eventType,
                timestamp: parsed.timestamp || new Date().toISOString(),
                data: parsed,
              };

              // Enrich event based on type
              if (eventType === "agent.message") {
                const text = extractTextFromContent(parsed.content || parsed);
                event.text = text;
                if (text) setLastMessage(text);
              } else if (eventType === "agent.tool_use") {
                event.tool_name = parsed.tool_name || parsed.name;
                event.tool_input = parsed.tool_input || parsed.input;
                setStatus("tool_pending");
              } else if (
                eventType === "session.status_idle" ||
                eventType === "session.status_completed"
              ) {
                setStatus("completed");
              } else if (eventType === "session.status_failed") {
                setStatus("failed");
                setError(parsed.error || "Agent session failed");
              } else if (eventType === "done") {
                // Final event from our proxy
                setStatus(parsed.status === "failed" ? "failed" : "completed");
              } else if (eventType === "error") {
                setStatus("failed");
                setError(parsed.error || "Stream error");
              } else if (eventType === "custom_tool_result") {
                // Custom tool was handled server-side, agent is running again
                setStatus("running");
              }

              setEvents((prev) => [...prev, event]);
            } catch {
              // Non-JSON event — skip
            }
          }
        }

        // 4. Fetch final result after stream ends
        if (sessionIdRef.current) {
          try {
            const resultRes = await fetch(
              `/api/agents/${agentType}/result?session_id=${sessionIdRef.current}`
            );
            if (resultRes.ok) {
              const resultData = await resultRes.json();
              setResult(resultData);
            }
          } catch {
            // Result fetch failed — not critical, we have events
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStatus("cancelled");
          return;
        }
        console.error(`[useAgent] Error:`, err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setStatus("failed");
      }
    },
    [agentType]
  );

  // ── Respond to agent ──────────────────────────────────

  const respond = useCallback(
    async (message: string) => {
      if (!sessionIdRef.current) {
        setError("No active session");
        return;
      }

      try {
        setStatus("running");
        const res = await fetch(`/api/agents/${agentType}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            message,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Respond failed");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to respond");
      }
    },
    [agentType]
  );

  // ── Cancel ────────────────────────────────────────────

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus("cancelled");
  }, []);

  // ── Reset ─────────────────────────────────────────────

  const reset = useCallback(() => {
    abortRef.current?.abort();
    sessionIdRef.current = null;
    dbSessionIdRef.current = null;
    setStatus("idle");
    setEvents([]);
    setLastMessage(null);
    setResult(null);
    setError(null);
  }, []);

  // ── Derived state ─────────────────────────────────────

  const isRunning =
    status === "starting" || status === "running" || status === "tool_pending";

  return {
    status,
    events,
    lastMessage,
    result,
    error,
    isRunning,
    start,
    respond,
    cancel,
    reset,
  };
}

// ── Helpers ─────────────────────────────────────────────────

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n");
  }
  if (content && typeof content === "object" && "text" in content) {
    return (content as { text: string }).text;
  }
  return "";
}
