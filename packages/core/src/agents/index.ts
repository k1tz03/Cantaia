// ============================================================
// @cantaia/core/agents — Public API
// ============================================================

// Types
export type {
  AgentType,
  SessionStatus,
  MAModel,
  MAToolsetConfig,
  MACustomTool,
  MATool,
  MAAgentCreateRequest,
  MAAgentCreateResponse,
  MAEnvironmentCreateRequest,
  MAEnvironmentCreateResponse,
  MASessionCreateRequest,
  MASessionCreateResponse,
  MAEventType,
  MAStreamEvent,
  MAUserMessageEvent,
  MAToolResultEvent,
  MASendableEvent,
  MATextContent,
  MAToolUseContent,
  MAToolResultContent,
  MAContentBlock,
  CantaiaAgentConfig,
  AgentSessionRecord,
  AgentConfigRecord,
} from "./types";

// Constants
export { AGENT_TYPES, MA_BETA_HEADER, MA_TOOLSET } from "./types";

// Registry
export { AGENT_REGISTRY, getAgentConfig, getRegisteredAgentTypes } from "./registry";

// Client
export {
  ManagedAgentClient,
  ManagedAgentError,
  createManagedAgentClient,
} from "./managed-agent-client";
