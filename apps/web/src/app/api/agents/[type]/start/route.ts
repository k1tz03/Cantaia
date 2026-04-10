// ============================================================
// POST /api/agents/[type]/start
// Creates a Managed Agent session and sends the initial user message.
// Returns the internal session record ID + Anthropic session_id.
//
// FIX #3: Retry-with-reprovision on stale cached agent (404)
// FIX #8: Invalidate stale config and re-provision automatically
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createManagedAgentClient,
  ManagedAgentError,
} from "@cantaia/core/agents";
import { getAgentConfig, AGENT_TYPES } from "@cantaia/core/agents";
import type { AgentType, AgentConfigRecord } from "@cantaia/core/agents";
import { trackApiUsage } from "@cantaia/core/tracking";

export const maxDuration = 30; // Just provisions + creates session, no heavy work
export const dynamic = "force-dynamic";

interface StartRequestBody {
  /** Input payload for the agent (e.g., { submission_id: "xxx" }) */
  input: Record<string, unknown>;
  /** Optional human-readable title */
  title?: string;
  /** Initial user message to send to the agent */
  message: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  // ── Validate agent type ────────────────────────────────
  if (!AGENT_TYPES.includes(type as AgentType)) {
    return NextResponse.json(
      { error: `Unknown agent type: ${type}` },
      { status: 400 }
    );
  }
  const agentType = type as AgentType;

  // ── Auth ────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userProfile } = await (admin as any)
    .from("users")
    .select("organization_id, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!userProfile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // ── Parse body ──────────────────────────────────────────
  let body: StartRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.message?.trim()) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 }
    );
  }

  // ── Check API key ───────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const agentConfig = getAgentConfig(agentType);

  try {
    const maClient = createManagedAgentClient();

    // ── Get or create agent + environment ──────────────────
    // FIX #3/#8: Provision with retry on stale cache
    const { agentId, environmentId } = await provisionWithRetry(
      maClient,
      agentType,
      admin
    );

    // ── Create session ────────────────────────────────────
    const sessionTitle =
      body.title || `${agentConfig.name} — ${new Date().toISOString().slice(0, 10)}`;

    let session: { id: string };
    try {
      session = await maClient.createSession(
        agentId,
        environmentId,
        sessionTitle
      );
    } catch (sessionErr) {
      // FIX #8: If session creation fails with 404, the cached agent is stale
      if (sessionErr instanceof ManagedAgentError && sessionErr.status === 404) {
        console.warn(`[agents/start] Stale agent config for ${agentType}, re-provisioning...`);

        // Invalidate cached config
        await (admin as any)
          .from("agent_configs")
          .update({ is_active: false })
          .eq("agent_type", agentType);

        // Re-provision from scratch
        const fresh = await maClient.provisionAgent(agentType, null);

        // Cache the new config
        await (admin as any).from("agent_configs").upsert(
          {
            agent_type: agentType,
            agent_id: fresh.agentId,
            environment_id: fresh.environmentId,
            config: {
              model: agentConfig.model,
              tools: agentConfig.tools.map((t: any) =>
                "name" in t ? t.name : t.type
              ),
            },
            version: 1,
            is_active: true,
          },
          { onConflict: "agent_type" }
        );

        // Retry session creation with fresh IDs
        session = await maClient.createSession(
          fresh.agentId,
          fresh.environmentId,
          sessionTitle
        );
      } else {
        throw sessionErr;
      }
    }

    // ── Create DB record ──────────────────────────────────
    const { data: dbSession, error: dbError } = await (admin as any)
      .from("agent_sessions")
      .insert({
        organization_id: userProfile.organization_id,
        user_id: user.id,
        agent_type: agentType,
        agent_id: agentId,
        environment_id: environmentId,
        session_id: session.id,
        title: sessionTitle,
        input_payload: body.input || {},
        status: "running",
        started_at: new Date().toISOString(),
        model: agentConfig.model,
      })
      .select("id")
      .single();

    if (dbError) {
      console.error("[agents/start] DB insert error:", dbError);
      return NextResponse.json(
        { error: "Failed to create session record" },
        { status: 500 }
      );
    }

    // ── Send initial user message ─────────────────────────
    await maClient.sendUserMessage(session.id, body.message);

    // ── Track usage ───────────────────────────────────────
    const actionType = `agent_${agentType}` as `agent_${AgentType}`;
    trackApiUsage({
      supabase: admin,
      userId: user.id,
      organizationId: userProfile.organization_id,
      actionType,
      apiProvider: "anthropic",
      model: agentConfig.model,
      inputTokens: 0, // Will be tracked via stream completion
      outputTokens: 0,
    }).catch(() => {}); // Fire and forget

    return NextResponse.json({
      id: dbSession.id,             // Internal DB session ID
      session_id: session.id,       // Anthropic session ID (for streaming)
      agent_type: agentType,
      status: "running",
      title: sessionTitle,
    });
  } catch (err) {
    console.error(`[agents/start] Error for ${agentType}:`, err);

    if (err instanceof ManagedAgentError) {
      return NextResponse.json(
        {
          error: err.message,
          status: err.status,
          retryable: err.isRetryable,
        },
        { status: err.status >= 400 && err.status < 600 ? err.status : 500 }
      );
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start agent session" },
      { status: 500 }
    );
  }
}

// ── Provision with retry on stale cache ───────────────────

async function provisionWithRetry(
  maClient: ReturnType<typeof createManagedAgentClient>,
  agentType: AgentType,
  admin: ReturnType<typeof createAdminClient>
): Promise<{ agentId: string; environmentId: string }> {
  const agentConfig = getAgentConfig(agentType);

  // Check cached config
  const { data: cachedConfig } = await (admin as any)
    .from("agent_configs")
    .select("*")
    .eq("agent_type", agentType)
    .eq("is_active", true)
    .maybeSingle();

  const { agentId, environmentId } = await maClient.provisionAgent(
    agentType,
    cachedConfig as AgentConfigRecord | null
  );

  // Cache if newly created
  if (!cachedConfig) {
    // FIX #3: Use upsert with onConflict to handle race conditions
    // If two concurrent requests both create agents, one wins and the other's
    // Anthropic resources are orphaned — log for cleanup
    const { error: upsertError } = await (admin as any).from("agent_configs").upsert(
      {
        agent_type: agentType,
        agent_id: agentId,
        environment_id: environmentId,
        config: {
          model: agentConfig.model,
          tools: agentConfig.tools.map((t: any) =>
            "name" in t ? t.name : t.type
          ),
        },
        version: 1,
        is_active: true,
      },
      { onConflict: "agent_type" }
    );

    if (upsertError) {
      console.warn(
        `[agents/start] Race condition: agent_configs upsert failed for ${agentType}.`,
        `Orphaned Anthropic agent_id=${agentId}, environment_id=${environmentId}`,
        upsertError
      );
      // Re-read the winning config and use those IDs instead
      const { data: winningConfig } = await (admin as any)
        .from("agent_configs")
        .select("agent_id, environment_id")
        .eq("agent_type", agentType)
        .eq("is_active", true)
        .maybeSingle();

      if (winningConfig?.agent_id && winningConfig?.environment_id) {
        return {
          agentId: winningConfig.agent_id,
          environmentId: winningConfig.environment_id,
        };
      }
    }
  }

  return { agentId, environmentId };
}
