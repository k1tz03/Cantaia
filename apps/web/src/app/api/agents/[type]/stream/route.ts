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
    .select("id, organization_id, user_id, agent_type, session_id, input_payload, started_at")
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

  // ── Mark session as running ─────────────────────────────
  await (admin as any)
    .from("agent_sessions")
    .update({ status: "running" })
    .eq("session_id", sessionId);

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

      try {
        // Run the agentic tool-use loop
        const result = await runAgentLoop({
          apiKey,
          model: agentConfig.model,
          systemPrompt: agentConfig.systemPrompt,
          tools: agentConfig.tools,
          initialMessage,
          onEvent: emit,
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
            ...(result.error ? { error_message: result.error } : {}),
          })
          .eq("session_id", sessionId);

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
