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
      max_tokens: 2048,
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
    } else if (event.type === "message_start") {
      if (event.message.usage) {
        inputTokens = event.message.usage.input_tokens;
      }
    }
  }

  yield {
    type: "done",
    data: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}
