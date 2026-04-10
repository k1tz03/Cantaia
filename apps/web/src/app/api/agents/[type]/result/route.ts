// ============================================================
// GET /api/agents/[type]/result?session_id=xxx
// Retrieve the final result of a completed agent session.
// Also returns cost, duration, and tool usage metrics.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AGENT_TYPES } from "@cantaia/core/agents";
import type { AgentType } from "@cantaia/core/agents";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const sessionId = request.nextUrl.searchParams.get("session_id");

  if (!AGENT_TYPES.includes(type as AgentType)) {
    return NextResponse.json(
      { error: `Unknown agent type: ${type}` },
      { status: 400 }
    );
  }

  if (!sessionId) {
    return NextResponse.json(
      { error: "session_id required" },
      { status: 400 }
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

  // ── Fetch session ───────────────────────────────────────
  const { data: session, error } = await (admin as any)
    .from("agent_sessions")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // ── Verify org ownership ────────────────────────────────
  const { data: userProfile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (session.organization_id !== userProfile?.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: session.id,
    agent_type: session.agent_type,
    session_id: session.session_id,
    status: session.status,
    title: session.title,

    // Result
    result: session.result_payload,
    error_message: session.error_message,

    // Metrics
    metrics: {
      duration_ms: session.duration_ms,
      input_tokens: session.input_tokens,
      output_tokens: session.output_tokens,
      estimated_cost_chf: session.estimated_cost_chf,
      session_hours: session.session_hours,
      tool_calls_count: session.tool_calls_count,
      custom_tool_calls_count: session.custom_tool_calls_count,
      events_count: session.events_count,
      tools_used: session.tools_used,
    },

    // Timestamps
    started_at: session.started_at,
    completed_at: session.completed_at,
  });
}
