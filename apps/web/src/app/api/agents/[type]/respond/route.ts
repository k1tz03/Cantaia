// ============================================================
// POST /api/agents/[type]/respond
// Send a follow-up user message to an agent session.
//
// NOTE: With the Messages API architecture, the agentic loop runs
// entirely within the stream route. This route is reserved for
// future multi-turn support (e.g., user sends a follow-up after
// the agent completes). Currently, all 5 agents are single-turn.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AGENT_TYPES } from "@cantaia/core/agents";
import type { AgentType } from "@cantaia/core/agents";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

interface RespondBody {
  session_id: string;
  message?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  if (!AGENT_TYPES.includes(type as AgentType)) {
    return NextResponse.json(
      { error: `Unknown agent type: ${type}` },
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

  // ── Parse body ──────────────────────────────────────────
  let body: RespondBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.session_id) {
    return NextResponse.json(
      { error: "session_id required" },
      { status: 400 }
    );
  }

  // ── Verify session ownership ────────────────────────────
  const admin = createAdminClient();

  const { data: sessionRecord } = await (admin as any)
    .from("agent_sessions")
    .select("id, organization_id, session_id, status")
    .eq("session_id", body.session_id)
    .maybeSingle();

  if (!sessionRecord) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data: userProfile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (sessionRecord.organization_id !== userProfile?.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Check session status ────────────────────────────────
  // The agentic loop runs within the stream route. Follow-up messages
  // are not supported during an active loop. This route is for future
  // multi-turn support only.
  return NextResponse.json(
    {
      error: "Follow-up messages are not supported during agent execution. " +
        "The agent runs autonomously until completion.",
      session_status: sessionRecord.status,
    },
    { status: 409 }
  );
}
