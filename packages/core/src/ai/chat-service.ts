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
  type: "text" | "done";
  data: string | { input_tokens: number; output_tokens: number };
}

/**
 * Stream a chat response from Claude.
 * Yields text chunks as they arrive, then a final "done" event with token usage.
 */
export async function* streamChatResponse(
  anthropicApiKey: string,
  systemPrompt: string,
  messages: ChatMessage[],
  model = MODEL_FOR_TASK.chat,
): AsyncGenerator<ChatStreamChunk> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 60_000 });

  let stream;
  try {
    stream = await client.messages.create({
      model,
      max_tokens: 4096,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: messages.map((m) => ({ role: m.role, content: m.content as any })),
      stream: true,
    });
  } catch (err: any) {
    console.error("[chat-service] AI error:", err?.message || err);
    throw err; // propagate to API route for proper HTTP status handling
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | null = null;

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield { type: "text", data: event.delta.text };
    } else if (event.type === "message_delta") {
      if (event.usage) {
        outputTokens = event.usage.output_tokens;
      }
      if (event.delta?.stop_reason) {
        stopReason = event.delta.stop_reason;
      }
    } else if (event.type === "message_start") {
      if (event.message.usage) {
        // Include cache counters — cache reads/writes are billed input too
        const u = event.message.usage as {
          input_tokens: number;
          cache_read_input_tokens?: number | null;
          cache_creation_input_tokens?: number | null;
        };
        inputTokens =
          (u.input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0);
      }
    }
  }

  // Signal truncation to the client when the response hit max_tokens
  if (stopReason === "max_tokens") {
    yield {
      type: "text",
      data: "\n\n_[Réponse tronquée — limite de longueur atteinte. Reformulez ou demandez la suite.]_",
    };
  }

  yield {
    type: "done",
    data: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}
