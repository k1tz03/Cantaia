// ============================================================
// @cantaia/core/agents — Public API
// ============================================================

// Types
export type {
  AgentType,
  SessionStatus,
  AgentModel,
  MAModel, // deprecated alias
  MACustomTool,
  MessagesAPITool,
  MATextContent,
  MAToolUseContent,
  MAToolResultContent,
  MAContentBlock,
  CantaiaAgentConfig,
  AgentSessionRecord,
  AgentConfigRecord,
  AgentLoopResult,
  OnAgentEvent,
  ToolExecutor,
} from "./types";

// Functions
export { AGENT_TYPES, convertToolsForAPI } from "./types";

// Registry
export { AGENT_REGISTRY, getAgentConfig, getRegisteredAgentTypes } from "./registry";

// Agent runner (agentic tool-use loop)
export { runAgentLoop, AgentError, ManagedAgentError } from "./managed-agent-client";
