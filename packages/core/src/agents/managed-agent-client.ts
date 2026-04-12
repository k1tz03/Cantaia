// ============================================================
// Agent Runner — Agentic tool-use loop via Anthropic Messages API
//
// Pattern: message → tool_use → execute tool → tool_result → repeat
// No persistent sessions on Anthropic's side — each API call is stateless.
// The "loop" is managed server-side by our stream route.
// ============================================================

import type {
  AgentModel,
  MACustomTool,
  AgentLoopResult,
  OnAgentEvent,
  ToolExecutor,
} from "./types";
import { convertToolsForAPI } from "./types";

// ── Configuration ───────────────────────────────────────────

const MAX_ITERATIONS = 25;
const MAX_DURATION_MS = 270_000; // 4.5 min (leave 30s buffer for Vercel cleanup)
const MAX_TOKENS_PER_TURN = 8192;

// ── Main Agentic Loop ───────────────────────────────────────

/**
 * Run an agentic tool-use loop using the Anthropic Messages API.
 *
 * Flow:
 * 1. Send system prompt + user message + tools to Claude
 * 2. Claude responds with text and/or tool_use blocks
 * 3. If tool_use → execute tools, add results to messages, goto 1
 * 4. If end_turn → done
 *
 * Events are emitted via the `onEvent` callback for SSE forwarding.
 */
export async function runAgentLoop(params: {
  apiKey: string;
  model: AgentModel;
  systemPrompt: string;
  tools: MACustomTool[];
  initialMessage: string;
  toolExecutor: ToolExecutor;
  onEvent: OnAgentEvent;
  maxIterations?: number;
  maxDurationMs?: number;
}): Promise<AgentLoopResult> {
  const {
    apiKey,
    model,
    systemPrompt,
    tools,
    initialMessage,
    toolExecutor,
    onEvent,
    maxIterations = MAX_ITERATIONS,
    maxDurationMs = MAX_DURATION_MS,
  } = params;

  // Dynamic import to avoid bundling on client side
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  const apiTools = convertToolsForAPI(tools);

  // Build initial messages array
  const messages: Array<{ role: string; content: any }> = [
    { role: "user", content: initialMessage },
  ];

  // Metrics
  let inputTokens = 0;
  let outputTokens = 0;
  let toolCallsCount = 0;
  let customToolCallsCount = 0;
  let eventsCount = 0;
  const toolsUsed = new Set<string>();
  const startTime = Date.now();

  try {
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Check timeout
      if (Date.now() - startTime > maxDurationMs) {
        onEvent("error", { error: "Agent loop timed out" });
        return buildResult("failed", "Agent loop timed out after " + Math.round((Date.now() - startTime) / 1000) + "s");
      }

      // Call Anthropic Messages API
      const response = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS_PER_TURN,
        system: systemPrompt,
        tools: apiTools as any,
        messages: messages as any,
      });

      // Track token usage
      inputTokens += response.usage?.input_tokens || 0;
      outputTokens += response.usage?.output_tokens || 0;

      // Process response content blocks
      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      for (const block of response.content) {
        eventsCount++;

        if (block.type === "text" && block.text) {
          onEvent("agent.message", {
            content: [{ type: "text", text: block.text }],
          });
        } else if (block.type === "tool_use") {
          toolCallsCount++;
          customToolCallsCount++;
          toolsUsed.add(block.name);

          toolUseBlocks.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });

          // Emit tool_use event to client
          onEvent("agent.tool_use", {
            tool_name: block.name,
            tool_use_id: block.id,
            tool_input: block.input,
          });
        }
      }

      // If no tool calls, we're done
      if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        // Agent finished
        onEvent("session.status_completed", { status: "completed" });
        return buildResult("completed");
      }

      // Execute tools and collect results
      // Add the assistant response to messages first
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Array<{
        type: "tool_result";
        tool_use_id: string;
        content: string | Array<{ type: string; [key: string]: unknown }>;
      }> = [];

      for (const toolBlock of toolUseBlocks) {
        try {
          const result = await toolExecutor(toolBlock.name, toolBlock.input);

          // Format the result — handle images specially for Vision
          const formattedContent = formatToolResult(result);

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: formattedContent,
          });

          // Emit tool result to client
          const preview = typeof result === "string"
            ? result.slice(0, 500)
            : JSON.stringify(result).slice(0, 500);
          onEvent("custom_tool_result", {
            tool_name: toolBlock.name,
            tool_use_id: toolBlock.id,
            result_preview: preview,
          });
        } catch (toolError) {
          console.error(`[agent-loop] Tool ${toolBlock.name} failed:`, toolError);

          const errorMsg = toolError instanceof Error
            ? toolError.message
            : "Tool execution failed";

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: JSON.stringify({ error: true, message: errorMsg }),
          });

          onEvent("custom_tool_result", {
            tool_name: toolBlock.name,
            tool_use_id: toolBlock.id,
            result_preview: `Error: ${errorMsg}`,
            is_error: true,
          });
        }
      }

      // Add tool results as user message and continue the loop
      messages.push({ role: "user", content: toolResults });
    }

    // Exceeded max iterations
    onEvent("error", { error: "Max iterations reached" });
    return buildResult("failed", `Agent exceeded ${maxIterations} iterations`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown agent error";
    console.error("[agent-loop] Fatal error:", err);
    onEvent("session.status_failed", { status: "failed", error: errorMsg });
    return buildResult("failed", errorMsg);
  }

  // Helper to build the result object
  function buildResult(status: "completed" | "failed", error?: string): AgentLoopResult {
    return {
      status,
      inputTokens,
      outputTokens,
      toolCallsCount,
      customToolCallsCount,
      eventsCount,
      toolsUsed: Array.from(toolsUsed),
      ...(error ? { error } : {}),
    };
  }
}

// ── Tool Result Formatting ──────────────────────────────────

/**
 * Format a tool result for the Messages API.
 * Handles images specially: if the result contains `image_base64` with a data URI,
 * it's sent as an image content block so Claude can "see" it via Vision.
 */
function formatToolResult(
  result: string | Record<string, unknown>
): string | Array<{ type: string; [key: string]: unknown }> {
  if (typeof result === "string") return result;

  // Check for image content (e.g., from fetch_plan_image)
  if (result.image_base64 && typeof result.image_base64 === "string") {
    const match = (result.image_base64 as string).match(
      /^data:(.+?);base64,(.+)$/
    );
    if (match) {
      const [, mediaType, data] = match;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { image_base64, ...rest } = result;
      return [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data },
        },
        { type: "text", text: JSON.stringify(rest) },
      ];
    }
  }

  return JSON.stringify(result);
}

// ── Error Class ─────────────────────────────────────────────

export class AgentError extends Error {
  public status: number;
  public responseBody: string;

  constructor(message: string, status: number, responseBody: string) {
    super(message);
    this.name = "AgentError";
    this.status = status;
    this.responseBody = responseBody;
  }

  get isRetryable(): boolean {
    return this.status === 429 || this.status === 503 || this.status === 529;
  }
}

/** @deprecated Use AgentError instead */
export const ManagedAgentError = AgentError;
