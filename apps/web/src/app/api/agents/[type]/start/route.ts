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
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { agentActionType, creditCostFor } from "@cantaia/config/credit-costs";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { insufficientCreditsResponse, grantCredits } from "@/lib/credits";

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

  // Only the interactive agents may be started on demand by a user. The five
  // nightly agents (email-drafter, followup-engine, supplier-monitor,
  // project-memory, meeting-prep) are Pro+ / cron-only — their credit cost is
  // bundled at 0, so starting them here would run a full agent loop for free
  // and bypass the Pro gate that lives only in the crons.
  const INTERACTIVE_AGENT_TYPES: AgentType[] = [
    "submission-analyzer",
    "plan-estimator",
    "email-classifier",
    "price-extractor",
    "briefing-generator",
  ];
  if (!INTERACTIVE_AGENT_TYPES.includes(agentType)) {
    return NextResponse.json(
      { error: "This agent runs on a schedule and cannot be started manually." },
      { status: 403 }
    );
  }

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

  // ── Rate limit (AGT.C2) ─────────────────────────────────
  // An agent run costs up to 25 Sonnet iterations, so cap starts per user.
  const rl = await rateLimit(`agents:user:${user.id}`, { limit: 10, windowSec: 3600 });
  if (!rl.allowed) {
    return rateLimitResponse(rl);
  }

  // ── Parse & validate body + env BEFORE consuming credits ──
  // checkUsageLimit() calls consume_credits (a debit). Doing it last means an
  // invalid body, empty message or missing API key would 400/500 with the
  // credits already gone and no refund. Validate everything cheap first.
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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  // ── Plan usage limit (AGT.C2) ───────────────────────────
  const { data: org } = await (admin as any)
    .from("organizations")
    .select("subscription_plan")
    .eq("id", userProfile.organization_id)
    .maybeSingle();

  // Per-type pricing. The flat "agent_session" key charged 10 credits for
  // EVERY agent, including `email-classifier` and `briefing-generator`, which
  // the credit grid deliberately bundles at 0. `agentActionType()` resolves
  // `agent_<type>` when the grid knows it and falls back to `agent_session`
  // (10 credits) for an unlisted type — never to the 1-credit default.
  const creditAction = agentActionType(agentType);

  const usageCheck = await checkUsageLimit(
    admin,
    userProfile.organization_id,
    org?.subscription_plan || "trial",
    creditAction
  );
  if (!usageCheck.allowed) {
    if (usageCheck.insufficient_credits) {
      return insufficientCreditsResponse(usageCheck.required_credits ?? 1, usageCheck.remaining_credits ?? 0);
    }
    return NextResponse.json(
      {
        error: "usage_limit_reached",
        current: usageCheck.current,
        limit: usageCheck.limit,
        required_plan: usageCheck.requiredPlan,
      },
      { status: 429 }
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
      // The credit debit already happened in checkUsageLimit; the session
      // never got created, so refund it (best-effort, non-fatal).
      const refund = creditCostFor(creditAction);
      if (refund > 0) {
        await grantCredits(
          userProfile.organization_id,
          refund,
          "refund",
          `agent-start-failed:${sessionId}`,
          user.id
        ).catch(() => {});
      }
      return NextResponse.json(
        { error: "Failed to create session record" },
        { status: 500 }
      );
    }

    // ── Track usage ───────────────────────────────────────
    // Placeholder row: the real token counts are only known once the stream
    // route finishes the agentic loop, which then REPLACES this row (it is
    // matched on `metadata.session_id` + `metadata.phase = "start"`). Writing
    // it here means a session that is started but never streamed still leaves
    // a trace of the debit.
    const actionType = `agent_${agentType}` as `agent_${AgentType}`;
    trackApiUsage({
      supabase: admin,
      userId: user.id,
      organizationId: userProfile.organization_id,
      actionType,
      apiProvider: "anthropic",
      model: agentConfig.model,
      inputTokens: 0,
      outputTokens: 0,
      metadata: { session_id: sessionId, phase: "start", credit_action: creditAction },
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
