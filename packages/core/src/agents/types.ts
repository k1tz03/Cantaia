// ============================================================
// Agent Types — Type definitions for Cantaia agents
// Uses standard Anthropic Messages API (agentic tool-use loop)
// ============================================================

// ── Agent Types (Cantaia-specific) ──────────────────────────

export type AgentType =
  | "submission-analyzer"
  | "plan-estimator"
  | "email-classifier"
  | "price-extractor"
  | "briefing-generator"
  | "email-drafter"
  | "followup-engine"
  | "supplier-monitor"
  | "project-memory"
  | "meeting-prep";

export const AGENT_TYPES: AgentType[] = [
  "submission-analyzer",
  "plan-estimator",
  "email-classifier",
  "price-extractor",
  "briefing-generator",
  "email-drafter",
  "followup-engine",
  "supplier-monitor",
  "project-memory",
  "meeting-prep",
];

// ── Session Lifecycle ───────────────────────────────────────

export type SessionStatus =
  | "pending"     // Session created, not yet started
  | "running"     // Agent actively processing
  | "tool_pending" // Waiting for custom tool response
  | "idle"        // Agent finished, waiting for user input
  | "completed"   // Session done successfully
  | "failed"      // Session errored
  | "cancelled";  // User cancelled

// ── Models ──────────────────────────────────────────────────

export type AgentModel = "claude-sonnet-4-6" | "claude-sonnet-4-5-20250929";

/** @deprecated Use AgentModel instead */
export type MAModel = AgentModel;

// ── Tool Definitions ────────────────────────────────────────

/** Custom tool definition (compatible with Anthropic Messages API) */
export interface MACustomTool {
  type: "custom";
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

/** Messages API tool format (what we send to Anthropic) */
export interface MessagesAPITool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** Convert our tool definitions to Messages API format */
export function convertToolsForAPI(tools: MACustomTool[]): MessagesAPITool[] {
  return tools.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}

// ── Content Blocks ──────────────────────────────────────────

export interface MATextContent {
  type: "text";
  text: string;
}

export interface MAToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface MAToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<{ type: string; [key: string]: unknown }>;
}

export type MAContentBlock = MATextContent | MAToolUseContent | MAToolResultContent;

// ── Cantaia Agent Config ────────────────────────────────────

/** Full agent configuration for Cantaia */
export interface CantaiaAgentConfig {
  type: AgentType;
  name: string;
  description: string;
  model: AgentModel;
  systemPrompt: string;
  tools: MACustomTool[];
  /** Max session duration before auto-cancel (ms) */
  maxDurationMs: number;
}

// ── Agentic Loop Types ──────────────────────────────────────

/** Result of running the agentic tool-use loop */
export interface AgentLoopResult {
  status: "completed" | "failed";
  inputTokens: number;
  outputTokens: number;
  toolCallsCount: number;
  customToolCallsCount: number;
  eventsCount: number;
  toolsUsed: string[];
  error?: string;
}

/** Callback for emitting SSE events during the loop */
export type OnAgentEvent = (
  eventType: string,
  data: Record<string, unknown>
) => void;

/** Function that executes a custom tool and returns the result */
export type ToolExecutor = (
  toolName: string,
  toolInput: Record<string, unknown>
) => Promise<string | Record<string, unknown>>;

// ── DB Record Types ─────────────────────────────────────────

export interface AgentSessionRecord {
  id: string;
  organization_id: string;
  user_id: string;
  agent_type: AgentType;
  agent_id: string | null;
  environment_id: string | null;
  session_id: string | null;
  title: string | null;
  input_payload: Record<string, unknown>;
  status: SessionStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  result_payload: Record<string, unknown> | null;
  error_message: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_chf: number;
  session_hours: number;
  tool_calls_count: number;
  custom_tool_calls_count: number;
  events_count: number;
  last_event_type: string | null;
  last_event_at: string | null;
  model: string | null;
  tools_used: string[];
  created_at: string;
  updated_at: string;
}

export interface AgentConfigRecord {
  id: string;
  agent_type: AgentType;
  agent_id: string;
  environment_id: string;
  config: Record<string, unknown>;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
