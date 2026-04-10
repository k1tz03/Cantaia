// ============================================================
// POST /api/agents/[type]/respond
// Send a follow-up user message or tool result to a running session.
// Used when the client needs to steer the agent mid-execution.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createManagedAgentClient } from "@cantaia/core/agents";
import { AGENT_TYPES } from "@cantaia/core/agents";
import type { AgentType } from "@cantaia/core/agents";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

interface RespondBody {
  session_id: string;
  /** User message to send */
  message?: string;
  /** Tool result to send back (for manual tool approval flows) */
  tool_use_id?: string;
  tool_result?: string;
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

  if (!body.message && !body.tool_use_id) {
    return NextResponse.json(
      { error: "Either message or tool_use_id + tool_result required" },
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

  // FIX #10: Guard — don't send messages to terminal sessions
  const activeStatuses = ["running", "tool_pending", "idle", "pending"];
  if (!activeStatuses.includes(sessionRecord.status)) {
    return NextResponse.json(
      { error: `Session is ${sessionRecord.status} and cannot receive messages` },
      { status: 409 }
    );
  }

  const { data: userProfile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (sessionRecord.organization_id !== userProfile?.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Send event ──────────────────────────────────────────
  try {
    const maClient = createManagedAgentClient();

    if (body.message) {
      await maClient.sendUserMessage(body.session_id, body.message);
    } else if (body.tool_use_id && body.tool_result) {
      await maClient.sendToolResult(
        body.session_id,
        body.tool_use_id,
        body.tool_result
      );
    }

    // Update session status
    await (admin as any)
      .from("agent_sessions")
      .update({ status: "running" })
      .eq("session_id", body.session_id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[agents/respond] Error:", err);
    return NextResponse.json(
      { error: "Failed to send event to agent" },
      { status: 500 }
    );
  }
}
