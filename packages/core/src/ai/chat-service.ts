// ============================================================
// Cantaia — AI Chat Service (Streaming)
// Streams chat responses from Claude for the JM assistant
// Uses SSE-compatible AsyncGenerator pattern
// ============================================================

import { MODEL_FOR_TASK } from "./ai-utils";

export type ChatMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | {
          type: "image";
          source: {
            type: "base64";
            media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
            data: string;
          };
        }
    >;

export interface ChatMessage {
  role: "user" | "assistant";
  content: ChatMessageContent;
}

export interface ChatStreamChunk {
  type: "text" | "done" | "tool";
  data: string | { input_tokens: number; output_tokens: number } | { name: string };
}

/** Anthropic tool definition (Messages API `tools` entry). */
export interface ChatToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: readonly string[];
  };
}

/** Executes one tool call and returns a JSON-serialisable result. */
export type ChatToolExecutor = (
  name: string,
  input: Record<string, unknown>
) => Promise<unknown>;

// ============================================================
// Tool-enabled streaming
// ============================================================

/** Truncation notice appended when the model hits max_tokens. */
const TRUNCATION_NOTICE =
  "\n\n_[Réponse tronquée — limite de longueur atteinte. Reformulez ou demandez la suite.]_";

/** Tool results are capped so one fat query can't blow the context window. */
const MAX_TOOL_RESULT_CHARS = 20_000;

/**
 * Stream a chat response, letting Claude call read-only data tools first.
 *
 * Runs a bounded agentic loop: each turn streams (so text the model emits
 * while reasoning reaches the user immediately), then any `tool_use` blocks
 * are executed and fed back as a single `tool_result` user message — the
 * Messages API requires all results for one assistant turn in one message,
 * otherwise parallel tool use silently degrades.
 *
 * On the final permitted iteration `tool_choice: none` forces a text answer,
 * so the loop can never terminate mid-tool-call with nothing to show.
 */
export async function* streamChatResponseWithTools(
  anthropicApiKey: string,
  systemPrompt: string,
  messages: ChatMessage[],
  tools: readonly ChatToolDefinition[],
  executeTool: ChatToolExecutor,
  model = MODEL_FOR_TASK.chat,
  maxIterations = 5,
): AsyncGenerator<ChatStreamChunk> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 60_000 });

  // Working conversation — grows with assistant tool calls + their results.
  const convo: Array<{ role: "user" | "assistant"; content: unknown }> =
    messages.map((m) => ({ role: m.role, content: m.content }));

  let inputTokens = 0;
  let outputTokens = 0;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const isLastIteration = iteration === maxIterations - 1;

    let stream;
    try {
      stream = client.messages.stream({
        model,
        max_tokens: 4096,
        system: [
          { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
        ],
        messages: convo as any,
        tools: tools as any,
        // Force a text answer on the last pass so the loop always terminates
        // with something the user can read.
        ...(isLastIteration ? { tool_choice: { type: "none" as const } } : {}),
      });
    } catch (err: any) {
      console.error("[chat-service] AI error:", err?.message || err);
      throw err; // propagate to API route for proper HTTP status handling
    }

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "text", data: event.delta.text };
      }
    }

    let final;
    try {
      final = await stream.finalMessage();
    } catch (err: any) {
      console.error("[chat-service] Stream failed:", err?.message || err);
      throw err;
    }

    // Cache reads/writes are billed as input too — count them all.
    const usage = final.usage as {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
    };
    inputTokens +=
      (usage.input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0);
    outputTokens += usage.output_tokens ?? 0;

    if (final.stop_reason !== "tool_use") {
      if (final.stop_reason === "max_tokens") {
        yield { type: "text", data: TRUNCATION_NOTICE };
      }
      break;
    }

    const toolUses = final.content.filter(
      (b): b is Extract<typeof b, { type: "tool_use" }> => b.type === "tool_use",
    );

    // No tool blocks despite the stop reason — nothing to execute, bail out
    // rather than looping forever on an identical request.
    if (toolUses.length === 0) break;

    convo.push({ role: "assistant", content: final.content });

    // Surface the tool indicators BEFORE running the queries, so the UI can
    // show "consultation des données…" during the round-trip rather than only
    // after every query has already resolved.
    for (const tu of toolUses) {
      yield { type: "tool", data: { name: tu.name } };
    }

    // Execute in parallel; results must all land in ONE user message.
    const results = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          // `input` escaping varies by model — it is already parsed JSON here,
          // never string-match the serialised form.
          const output = await executeTool(
            tu.name,
            (tu.input ?? {}) as Record<string, unknown>,
          );
          return {
            type: "tool_result" as const,
            tool_use_id: tu.id,
            content: JSON.stringify(output).slice(0, MAX_TOOL_RESULT_CHARS),
          };
        } catch (err: any) {
          return {
            type: "tool_result" as const,
            tool_use_id: tu.id,
            content: `Erreur d'exécution : ${err?.message || "inconnue"}`,
            is_error: true,
          };
        }
      }),
    );

    convo.push({ role: "user", content: results });
  }

  yield {
    type: "done",
    data: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}
