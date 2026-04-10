// ============================================================
// Managed Agent Client — Wrapper around Anthropic MA API
// Handles: agent creation, environment creation, session lifecycle,
// SSE streaming, custom tool responses
// ============================================================

import type {
  AgentType,
  MAAgentCreateResponse,
  MAEnvironmentCreateResponse,
  MASessionCreateResponse,
  MAStreamEvent,
  MASendableEvent,
  CantaiaAgentConfig,
  AgentConfigRecord,
} from "./types";
import { MA_BETA_HEADER } from "./types";
import { getAgentConfig } from "./registry";

// ── Configuration ───────────────────────────────────────────

const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1";

interface ManagedAgentClientOptions {
  apiKey: string;
  /** Optional: override API base URL (for testing) */
  apiBase?: string;
}

// ── Client Class ────────────────────────────────────────────

export class ManagedAgentClient {
  private apiKey: string;
  private apiBase: string;

  constructor(options: ManagedAgentClientOptions) {
    this.apiKey = options.apiKey;
    this.apiBase = options.apiBase || ANTHROPIC_API_BASE;
  }

  // ── HTTP helpers ────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "anthropic-beta": MA_BETA_HEADER,
      "content-type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new ManagedAgentError(
        `MA API ${method} ${path} failed: ${response.status} ${response.statusText}`,
        response.status,
        errorText
      );
    }

    return response.json() as Promise<T>;
  }

  // ── Agent Management ────────────────────────────────────

  /**
   * Create or retrieve an agent on Anthropic's infrastructure.
   * Agents are created once and reused across sessions.
   */
  async createAgent(config: CantaiaAgentConfig): Promise<MAAgentCreateResponse> {
    return this.request<MAAgentCreateResponse>("POST", "/agents", {
      name: config.name,
      model: config.model,
      system: config.systemPrompt,
      tools: config.tools,
    });
  }

  /**
   * Create a container environment for agent sessions.
   */
  async createEnvironment(
    config: CantaiaAgentConfig
  ): Promise<MAEnvironmentCreateResponse> {
    return this.request<MAEnvironmentCreateResponse>("POST", "/environments", {
      name: `${config.type}-env`,
      config: config.environmentConfig,
    });
  }

  // ── Session Lifecycle ───────────────────────────────────

  /**
   * Start a new session for an agent.
   * Returns session metadata (not the stream — use streamEvents for that).
   */
  async createSession(
    agentId: string,
    environmentId: string,
    title?: string
  ): Promise<MASessionCreateResponse> {
    return this.request<MASessionCreateResponse>("POST", "/sessions", {
      agent: agentId,
      environment_id: environmentId,
      title,
    });
  }

  /**
   * Send events to a running session (user messages, tool results).
   */
  async sendEvents(
    sessionId: string,
    events: MASendableEvent[]
  ): Promise<void> {
    await this.request("POST", `/sessions/${sessionId}/events`, { events });
  }

  /**
   * Send a user message to start the agent working.
   */
  async sendUserMessage(sessionId: string, text: string): Promise<void> {
    await this.sendEvents(sessionId, [
      {
        type: "user.message",
        content: [{ type: "text", text }],
      },
    ]);
  }

  /**
   * Send a tool result back to the agent (after executing a custom tool).
   */
  async sendToolResult(
    sessionId: string,
    toolUseId: string,
    result: string
  ): Promise<void> {
    await this.sendEvents(sessionId, [
      {
        type: "tool_result",
        tool_use_id: toolUseId,
        content: result,
      },
    ]);
  }

  // ── SSE Streaming ───────────────────────────────────────

  /**
   * Open an SSE stream for a session.
   * Returns a ReadableStream of MAStreamEvent objects.
   * The caller is responsible for reading events and handling custom tools.
   */
  async openStream(sessionId: string): Promise<ReadableStream<MAStreamEvent>> {
    const url = `${this.apiBase}/sessions/${sessionId}/stream`;
    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "anthropic-beta": MA_BETA_HEADER,
      Accept: "text/event-stream",
    };

    const response = await fetch(url, { method: "GET", headers });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new ManagedAgentError(
        `MA SSE stream failed: ${response.status}`,
        response.status,
        errorText
      );
    }

    if (!response.body) {
      throw new ManagedAgentError("No response body for SSE stream", 0, "");
    }

    // Transform the raw SSE byte stream into parsed MAStreamEvent objects
    return response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new SSEParserTransform());
  }

  // ── High-Level: Provision Agent ─────────────────────────

  /**
   * Ensure an agent and environment exist on Anthropic's infra.
   * Creates them if they don't exist, returns cached IDs if they do.
   *
   * @param agentType - The Cantaia agent type
   * @param cachedConfig - Optional cached config from DB (avoids re-creation)
   * @returns { agentId, environmentId } ready to create sessions
   */
  async provisionAgent(
    agentType: AgentType,
    cachedConfig?: AgentConfigRecord | null
  ): Promise<{ agentId: string; environmentId: string }> {
    // If we have a cached config, use it directly
    if (cachedConfig?.is_active) {
      return {
        agentId: cachedConfig.agent_id,
        environmentId: cachedConfig.environment_id,
      };
    }

    // Create from scratch
    const config = getAgentConfig(agentType);
    const [agent, environment] = await Promise.all([
      this.createAgent(config),
      this.createEnvironment(config),
    ]);

    return {
      agentId: agent.id,
      environmentId: environment.id,
    };
  }
}

// ── SSE Parser Transform Stream ─────────────────────────────

/**
 * TransformStream that parses raw SSE text into MAStreamEvent objects.
 * Handles the standard SSE format: "event: type\ndata: json\n\n"
 */
class SSEParserTransform extends TransformStream<string, MAStreamEvent> {
  constructor() {
    let buffer = "";
    let currentEvent: string | null = null;
    let currentData: string[] = [];

    super({
      transform(chunk, controller) {
        buffer += chunk;
        const lines = buffer.split("\n");
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            currentData.push(line.slice(5).trim());
          } else if (line === "" && currentEvent) {
            // Empty line = end of event
            const dataStr = currentData.join("\n");
            try {
              const parsed = JSON.parse(dataStr);
              const event: MAStreamEvent = {
                type: currentEvent as MAStreamEvent["type"],
                timestamp: parsed.timestamp,
                ...parsed,
              };
              controller.enqueue(event);
            } catch {
              // Non-JSON data — emit as raw text event
              controller.enqueue({
                type: currentEvent as MAStreamEvent["type"],
                data: dataStr,
              });
            }
            currentEvent = null;
            currentData = [];
          }
        }
      },
      flush(controller) {
        // Handle any remaining buffered data
        if (currentEvent && currentData.length > 0) {
          const dataStr = currentData.join("\n");
          try {
            const parsed = JSON.parse(dataStr);
            controller.enqueue({
              type: currentEvent as MAStreamEvent["type"],
              ...parsed,
            });
          } catch {
            controller.enqueue({
              type: currentEvent as MAStreamEvent["type"],
              data: dataStr,
            });
          }
        }
      },
    });
  }
}

// ── Error Class ─────────────────────────────────────────────

export class ManagedAgentError extends Error {
  public status: number;
  public responseBody: string;

  constructor(message: string, status: number, responseBody: string) {
    super(message);
    this.name = "ManagedAgentError";
    this.status = status;
    this.responseBody = responseBody;
  }

  get isRetryable(): boolean {
    return this.status === 429 || this.status === 503 || this.status === 529;
  }
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Create a ManagedAgentClient instance.
 * Uses ANTHROPIC_API_KEY from environment.
 */
export function createManagedAgentClient(): ManagedAgentClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for Managed Agents");
  }
  return new ManagedAgentClient({ apiKey });
}
