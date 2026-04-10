// ============================================================
// GET /api/agents/[type]/stream?session_id=xxx
// Opens an SSE stream to the Managed Agent session.
// Proxies events from Anthropic → client, handling custom tools
// in between by delegating to tool handlers.
// ============================================================

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createManagedAgentClient } from "@cantaia/core/agents";
import { AGENT_TYPES } from "@cantaia/core/agents";
import type { AgentType } from "@cantaia/core/agents";
import { executeCustomTool } from "./tool-handlers";

export const maxDuration = 300; // 5 min — the stream itself runs on Anthropic's infra
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
    .select("id, organization_id, user_id, agent_type, session_id, started_at")
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

  // ── Open SSE stream ─────────────────────────────────────
  const maClient = createManagedAgentClient();
  const agentType = type as AgentType;

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      let toolCallsCount = 0;
      let customToolCallsCount = 0;
      let eventsCount = 0;
      let lastEventType = "";
      const toolsUsed = new Set<string>();

      try {
        const stream = await maClient.openStream(sessionId);
        const reader = stream.getReader();

        while (true) {
          const { done, value: event } = await reader.read();
          if (done) break;

          eventsCount++;
          lastEventType = event.type;

          // Forward event to client as SSE
          const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseData));

          // Handle custom tool calls — execute and send result back
          if (event.type === "agent.tool_use" && event.tool_name) {
            toolCallsCount++;
            toolsUsed.add(event.tool_name);

            // Check if this is a custom tool (not built-in)
            const isCustomTool = !isBuiltinTool(event.tool_name);

            if (isCustomTool && event.tool_use_id) {
              customToolCallsCount++;

              // Execute the custom tool
              try {
                const toolResult = await executeCustomTool(
                  agentType,
                  event.tool_name,
                  event.tool_input || {},
                  {
                    userId: user.id,
                    organizationId: sessionRecord.organization_id,
                    sessionId: sessionRecord.id,
                    admin,
                  }
                );

                // Send result back to the agent
                await maClient.sendToolResult(
                  sessionId,
                  event.tool_use_id,
                  typeof toolResult === "string"
                    ? toolResult
                    : JSON.stringify(toolResult)
                );

                // Forward the tool result as SSE to client
                const resultEvent = `event: custom_tool_result\ndata: ${JSON.stringify({
                  tool_name: event.tool_name,
                  tool_use_id: event.tool_use_id,
                  result_preview: typeof toolResult === "string"
                    ? toolResult.slice(0, 500)
                    : JSON.stringify(toolResult).slice(0, 500),
                })}\n\n`;
                controller.enqueue(encoder.encode(resultEvent));
              } catch (toolError) {
                console.error(
                  `[agents/stream] Tool ${event.tool_name} failed:`,
                  toolError
                );
                // Send error back to agent so it can adapt
                await maClient.sendToolResult(
                  sessionId,
                  event.tool_use_id,
                  JSON.stringify({
                    error: true,
                    message:
                      toolError instanceof Error
                        ? toolError.message
                        : "Tool execution failed",
                  })
                );
              }
            }
          }

          // Session completed — update DB and close
          if (
            event.type === "session.status_idle" ||
            event.type === "session.status_completed" ||
            event.type === "session.status_failed"
          ) {
            const finalStatus =
              event.type === "session.status_failed" ? "failed" : "completed";

            // Update session record in DB
            await (admin as any)
              .from("agent_sessions")
              .update({
                status: finalStatus,
                completed_at: new Date().toISOString(),
                duration_ms: sessionRecord.started_at
                  ? Date.now() - new Date(sessionRecord.started_at).getTime()
                  : null,
                events_count: eventsCount,
                last_event_type: lastEventType,
                last_event_at: new Date().toISOString(),
                tool_calls_count: toolCallsCount,
                custom_tool_calls_count: customToolCallsCount,
                tools_used: Array.from(toolsUsed),
              })
              .eq("session_id", sessionId);

            // Send final status to client
            const doneEvent = `event: done\ndata: ${JSON.stringify({
              status: finalStatus,
              events_count: eventsCount,
              tool_calls_count: toolCallsCount,
              custom_tool_calls_count: customToolCallsCount,
            })}\n\n`;
            controller.enqueue(encoder.encode(doneEvent));

            break;
          }
        }
      } catch (err) {
        console.error("[agents/stream] Stream error:", err);

        // Update session as failed
        await (admin as any)
          .from("agent_sessions")
          .update({
            status: "failed",
            error_message:
              err instanceof Error ? err.message : "Stream error",
            completed_at: new Date().toISOString(),
          })
          .eq("session_id", sessionId);

        // Send error to client
        const errorEvent = `event: error\ndata: ${JSON.stringify({
          error: err instanceof Error ? err.message : "Stream error",
        })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
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
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}

// ── Built-in tool check ───────────────────────────────────────

const BUILTIN_TOOLS = new Set([
  "bash",
  "read",
  "write",
  "edit",
  "glob",
  "grep",
  "web_fetch",
  "web_search",
]);

function isBuiltinTool(name: string): boolean {
  return BUILTIN_TOOLS.has(name);
}
