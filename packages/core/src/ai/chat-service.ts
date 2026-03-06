// ============================================================
// Cantaia — AI Chat Service (Streaming)
// Streams chat responses from Claude for the JM assistant
// Uses SSE-compatible AsyncGenerator pattern
// ============================================================

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
  model = "claude-sonnet-4-5-20250929",
): AsyncGenerator<ChatStreamChunk> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 60_000 });

  const stream = await client.messages.create({
    model,
    max_tokens: 2048,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  });

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
