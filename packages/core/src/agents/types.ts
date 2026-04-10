// ============================================================
// Managed Agents — Type definitions
// Covers: agent config, session lifecycle, SSE events, custom tools
// ============================================================

// ── Agent Types (Cantaia-specific) ──────────────────────────

export type AgentType =
  | "submission-analyzer"
  | "plan-estimator"
  | "email-classifier"
  | "price-extractor"
  | "briefing-generator";

export const AGENT_TYPES: AgentType[] = [
  "submission-analyzer",
  "plan-estimator",
  "email-classifier",
  "price-extractor",
  "briefing-generator",
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

// ── Anthropic API Types ─────────────────────────────────────

/** Beta header required for all MA endpoints */
export const MA_BETA_HEADER = "managed-agents-2026-04-01";

/** Built-in toolset identifier */
export const MA_TOOLSET = "agent_toolset_20260401";

/** Models supported by Managed Agents */
export type MAModel = "claude-sonnet-4-6" | "claude-sonnet-4-5-20250929";

/** Tool configuration for built-in toolset */
export interface MAToolsetConfig {
  type: typeof MA_TOOLSET;
  configs?: Array<{
    name: string;
    enabled: boolean;
  }>;
}

/** Custom tool definition */
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

/** Union of all tool types */
export type MATool = MAToolsetConfig | MACustomTool;

/** Agent creation request */
export interface MAAgentCreateRequest {
  name: string;
  model: MAModel;
  system: string;
  tools: MATool[];
}

/** Agent creation response */
export interface MAAgentCreateResponse {
  id: string;
  name: string;
  model: string;
  created_at: string;
}

/** Environment creation request */
export interface MAEnvironmentCreateRequest {
  name: string;
  config: {
    type: "cloud";
    networking: { type: "unrestricted" | "restricted" };
    packages?: {
      pip?: string[];
      npm?: string[];
      apt?: string[];
    };
  };
}

/** Environment creation response */
export interface MAEnvironmentCreateResponse {
  id: string;
  name: string;
  created_at: string;
}

/** Session creation request */
export interface MASessionCreateRequest {
  agent: string;         // agent_id
  environment_id: string;
  title?: string;
}

/** Session creation response */
export interface MASessionCreateResponse {
  id: string;
  agent: string;
  environment_id: string;
  status: string;
  created_at: string;
}

// ── SSE Event Types ─────────────────────────────────────────

export type MAEventType =
  | "user.message"
  | "agent.message"
  | "agent.tool_use"
  | "agent.tool_result"
  | "session.status_running"
  | "session.status_idle"
  | "session.status_completed"
  | "session.status_failed";

/** Content block in messages */
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
  content: string;
}

export type MAContentBlock = MATextContent | MAToolUseContent | MAToolResultContent;

/** SSE event from the stream */
export interface MAStreamEvent {
  type: MAEventType;
  timestamp?: string;
  content?: MAContentBlock[];
  /** For agent.tool_use — the tool being called */
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  /** For status events */
  status?: string;
  /** Raw event data */
  data?: unknown;
}

/** User message event (sent TO the agent) */
export interface MAUserMessageEvent {
  type: "user.message";
  content: MAContentBlock[];
}

/** Tool result event (sent TO the agent after custom tool execution) */
export interface MAToolResultEvent {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

export type MASendableEvent = MAUserMessageEvent | MAToolResultEvent;

// ── Cantaia Agent Config ────────────────────────────────────

/** Full agent configuration for Cantaia */
export interface CantaiaAgentConfig {
  type: AgentType;
  name: string;
  description: string;
  model: MAModel;
  systemPrompt: string;
  tools: MATool[];
  /** Disable specific built-in tools */
  disabledBuiltinTools?: string[];
  /** Max session duration before auto-cancel (ms) */
  maxDurationMs: number;
  /** Whether to create a shared environment or per-session */
  sharedEnvironment: boolean;
  environmentConfig: MAEnvironmentCreateRequest["config"];
}

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
