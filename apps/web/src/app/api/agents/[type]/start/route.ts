// ============================================================
// POST /api/agents/[type]/start
// Creates an agent session record and returns the session ID.
// The actual work happens in the stream route (agentic loop).
//
// No Anthropic provisioning needed — the Messages API is stateless.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentConfig, AGENT_TYPES } from "@cantaia/core/agents";
import type { AgentType } from "@cantaia/core/agents";
import { trackApiUsage } from "@cantaia/core/tracking";

export const maxDuration = 10;
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
    // ── Generate local session ID ─────────────────────────
    const sessionId = crypto.randomUUID();
    const sessionTitle =
      body.title || `${agentConfig.name} — ${new Date().toISOString().slice(0, 10)}`;

    // ── Create DB record ──────────────────────────────────
    // Store the initial message in input_payload so the stream route can read it
    const { data: dbSession, error: dbError } = await (admin as any)
      .from("agent_sessions")
      .insert({
        organization_id: userProfile.organization_id,
        user_id: user.id,
        agent_type: agentType,
        agent_id: null,
        environment_id: null,
        session_id: sessionId,
        title: sessionTitle,
        input_payload: {
          ...(body.input || {}),
          _initial_message: body.message,
        },
        status: "pending",
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

    // ── Track usage ───────────────────────────────────────
    const actionType = `agent_${agentType}` as `agent_${AgentType}`;
    trackApiUsage({
      supabase: admin,
      userId: user.id,
      organizationId: userProfile.organization_id,
      actionType,
      apiProvider: "anthropic",
      model: agentConfig.model,
      inputTokens: 0, // Updated by stream route after completion
      outputTokens: 0,
    }).catch(() => {}); // Fire and forget

    return NextResponse.json({
      id: dbSession.id,          // Internal DB session ID
      session_id: sessionId,      // For streaming URL
      agent_type: agentType,
      status: "pending",
      title: sessionTitle,
    });
  } catch (err) {
    console.error(`[agents/start] Error for ${agentType}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start agent session" },
      { status: 500 }
    );
  }
}
