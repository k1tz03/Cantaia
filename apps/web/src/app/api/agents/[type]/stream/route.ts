// ============================================================
// GET /api/agents/[type]/stream?session_id=xxx
// Runs the agentic tool-use loop via Anthropic Messages API.
//
// Flow:
// 1. Auth + read session from DB (including initial message)
// 2. Get agent config (system prompt + tools) from registry
// 3. Run agentic loop: message → tool_use → execute → tool_result → repeat
// 4. Forward all events to client as SSE
// 5. Update DB with metrics on completion
//
// The loop runs entirely server-side. Custom tools are executed via
// tool-handlers.ts. The client receives SSE events for real-time UI.
// ============================================================

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AGENT_TYPES, getAgentConfig, runAgentLoop } from "@cantaia/core/agents";
import type { AgentType } from "@cantaia/core/agents";
import { executeCustomTool } from "./tool-handlers";
import { trackApiUsage } from "@cantaia/core/tracking";

export const maxDuration = 300; // 5 min — the agentic loop can take a while
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const sessionId = request.nextUrl.searchParams.get("session_id");

  // ── Validate ────────────────────────────────────────────
  if (!AGENT_TYPES.includes(type as AgentType)) {
    return new Response(JSON.stringify({ error: `Unknown agent type: ${type}` }), {
      status: 400,
    });
  }

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "session_id required" }), {
      status: 400,
    });
  }

  // ── Auth ────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const admin = createAdminClient();

  // Verify the session belongs to the user's org
  const { data: sessionRecord } = await (admin as any)
    .from("agent_sessions")
    .select("id, organization_id, user_id, agent_type, session_id, input_payload, started_at, status")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!sessionRecord) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
    });
  }

  const { data: userProfile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (sessionRecord.organization_id !== userProfile?.organization_id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
    });
  }

  // ── Single-run guard (AGT.C2) ───────────────────────────
  // Re-streaming a session that already ran would replay the whole agentic
  // loop: duplicate tool side-effects (inserts, emails drafted) and duplicate
  // Anthropic costs. Only a freshly created "pending" session may be streamed.
  if (sessionRecord.status !== "pending") {
    return new Response(
      JSON.stringify({
        error: "session_not_pending",
        status: sessionRecord.status,
        message:
          "Cette session a déjà été exécutée. Démarrez une nouvelle session pour relancer l'agent.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Read initial message & config ───────────────────────
  const agentType = type as AgentType;
  const agentConfig = getAgentConfig(agentType);

  const initialMessage = sessionRecord.input_payload?._initial_message;
  if (!initialMessage || typeof initialMessage !== "string") {
    return new Response(JSON.stringify({ error: "No initial message in session" }), {
      status: 400,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
    });
  }

  // ── Claim the session (atomic pending → running) ────────
  // The conditional update is the real guard: if two clients open the stream
  // concurrently, only one transitions the row and the other gets 409.
  const { data: claimed } = await (admin as any)
    .from("agent_sessions")
    .update({ status: "running", last_event_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("status", "pending")
    .select("id");

  if (!claimed || claimed.length === 0) {
    return new Response(
      JSON.stringify({
        error: "session_not_pending",
        message: "Cette session est déjà en cours d'exécution.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  // The agentic loop must finish inside the Vercel function budget with room
  // to persist the result — cap it at maxDuration minus a 30s safety margin
  // (the per-agent maxDurationMs is otherwise unreachable and misleading).
  const loopBudgetMs = Math.max(
    30_000,
    Math.min(agentConfig.maxDurationMs ?? Infinity, maxDuration * 1000 - 30_000)
  );

  // ── Setup SSE stream ────────────────────────────────────
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      // SSE emitter helper
      function emit(eventType: string, data: Record<string, unknown>) {
        const sseData = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(sseData));
        } catch {
          // Controller may be closed if client disconnected
        }
      }

      // Heartbeat: a single non-streamed Messages call can run 60-120s without
      // emitting a byte; some proxies drop idle SSE connections. A periodic
      // comment frame keeps the pipe warm without affecting event parsing.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // client gone
        }
      }, 15_000);

      // AGT — `agent_sessions.result_payload` was never written for
      // interactive runs, so /api/agents/[type]/result and the /agents page
      // could only ever show "no result". The final assistant message and the
      // outcome of each save_* tool are captured here as the run's summary.
      let lastAssistantText: string | null = null;
      const toolOutcomes: Array<{ tool: string; ok: boolean; preview: string }> = [];

      function captureAndEmit(eventType: string, data: Record<string, unknown>) {
        if (eventType === "agent.message") {
          const text = extractText(data);
          if (text) lastAssistantText = text;
        } else if (eventType === "custom_tool_result") {
          const preview =
            typeof data.result_preview === "string" ? data.result_preview : "";
          toolOutcomes.push({
            tool: String(data.tool_name || "unknown"),
            ok: data.is_error !== true && !/"error"\s*:\s*true/.test(preview),
            preview: preview.slice(0, 300),
          });
        }
        emit(eventType, data);
      }

      try {
        // Run the agentic tool-use loop
        const result = await runAgentLoop({
          apiKey,
          model: agentConfig.model,
          systemPrompt: agentConfig.systemPrompt,
          tools: agentConfig.tools,
          initialMessage,
          maxDurationMs: loopBudgetMs,
          onEvent: captureAndEmit,
          toolExecutor: (toolName, toolInput) =>
            executeCustomTool(
              agentType,
              toolName,
              toolInput,
              {
                userId: user.id,
                organizationId: sessionRecord.organization_id,
                sessionId: sessionRecord.id,
                admin,
              }
            ),
        });

        // Update session record in DB with metrics
        await (admin as any)
          .from("agent_sessions")
          .update({
            status: result.status,
            completed_at: new Date().toISOString(),
            duration_ms: sessionRecord.started_at
              ? Date.now() - new Date(sessionRecord.started_at).getTime()
              : null,
            input_tokens: result.inputTokens,
            output_tokens: result.outputTokens,
            events_count: result.eventsCount,
            last_event_type: result.status === "completed" ? "session.status_completed" : "session.status_failed",
            last_event_at: new Date().toISOString(),
            tool_calls_count: result.toolCallsCount,
            custom_tool_calls_count: result.customToolCallsCount,
            tools_used: result.toolsUsed,
            result_payload: {
              summary: lastAssistantText,
              tool_outcomes: toolOutcomes.slice(-20),
              succeeded_tools: toolOutcomes.filter((t) => t.ok).length,
              failed_tools: toolOutcomes.filter((t) => !t.ok).length,
              trigger: "interactive",
            },
            ...(result.error ? { error_message: result.error } : {}),
          })
          .eq("session_id", sessionId);

        // ── Cost tracking: the REAL tokens ────────────────
        // /start wrote a 0-token placeholder because the agentic loop had not
        // run yet. Replace it with the actual aggregate so `api_usage_logs`
        // shows one row per session carrying the true cost — a 25-iteration
        // Sonnet run was previously recorded as costing nothing at all.
        // Delete-then-insert (not update) so the CHF figure is recomputed by
        // the canonical tracker instead of being duplicated here.
        try {
          await (admin as any)
            .from("api_usage_logs")
            .delete()
            .eq("organization_id", sessionRecord.organization_id)
            .contains("metadata", { session_id: sessionId, phase: "start" });
        } catch (cleanupErr) {
          // Non-fatal: worst case the placeholder row survives next to the
          // real one, inflating the call count but not the cost.
          console.warn("[agents/stream] placeholder cleanup failed:", cleanupErr);
        }

        await trackApiUsage({
          supabase: admin as any,
          userId: sessionRecord.user_id || user.id,
          organizationId: sessionRecord.organization_id,
          actionType: `agent_${agentType}` as any,
          apiProvider: "anthropic",
          model: agentConfig.model,
          inputTokens: result.inputTokens || 0,
          outputTokens: result.outputTokens || 0,
          metadata: {
            session_id: sessionId,
            phase: "completion",
            status: result.status,
            events_count: result.eventsCount,
            tool_calls_count: result.toolCallsCount,
          },
        }).catch(() => {});

        // Send final status to client
        emit("done", {
          status: result.status,
          events_count: result.eventsCount,
          tool_calls_count: result.toolCallsCount,
          custom_tool_calls_count: result.customToolCallsCount,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
        });
      } catch (err) {
        console.error("[agents/stream] Fatal error:", err);

        const errorMsg = err instanceof Error ? err.message : "Stream error";

        // Update session as failed
        await (admin as any)
          .from("agent_sessions")
          .update({
            status: "failed",
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
          })
          .eq("session_id", sessionId);

        // Send error to client
        emit("error", { error: errorMsg });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Pull plain text out of an `agent.message` event payload. */
function extractText(data: Record<string, unknown>): string | null {
  const content = (data.content ?? data.text) as unknown;
  if (typeof content === "string") return content.trim() || null;
  if (Array.isArray(content)) {
    const text = content
      .filter((b: any) => b?.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
    return text || null;
  }
  return null;
}
