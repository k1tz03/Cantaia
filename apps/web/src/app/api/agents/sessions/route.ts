import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AGENT_TYPES, getAgentConfig } from "@cantaia/core/agents";
import type { AgentType } from "@cantaia/core/agents";
import { orgHasNightlyAgents } from "@cantaia/config/plan-features";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * GET /api/agents/sessions
 *
 * Backing data for the /agents page: the most recent run of EACH agent type
 * for the caller's organization, plus the org-level nightly toggle.
 *
 * `?type=<agent>` returns the last 20 runs of that single agent instead.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id, role, is_superadmin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    const orgId = profile.organization_id;

    const requestedType = request.nextUrl.searchParams.get("type");

    const SESSION_COLUMNS =
      "id, agent_type, session_id, title, status, started_at, completed_at, duration_ms, " +
      "input_tokens, output_tokens, tool_calls_count, custom_tool_calls_count, tools_used, " +
      "result_payload, error_message, model, user_id, input_payload";

    // ── Single-agent history ────────────────────────────────
    if (requestedType) {
      if (!AGENT_TYPES.includes(requestedType as AgentType)) {
        return NextResponse.json(
          { error: `Unknown agent type: ${requestedType}` },
          { status: 400 }
        );
      }
      const { data: sessions, error } = await (admin as any)
        .from("agent_sessions")
        .select(SESSION_COLUMNS)
        .eq("organization_id", orgId)
        .eq("agent_type", requestedType)
        .order("started_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("[agents/sessions] History query failed:", error.message);
        return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        agent_type: requestedType,
        sessions: await withUserNames(admin, sessions || []),
      });
    }

    // ── Latest run per agent type ───────────────────────────
    // One query, then reduce: an org has few sessions and this avoids ten
    // round-trips.
    const { data: recent, error } = await (admin as any)
      .from("agent_sessions")
      .select(SESSION_COLUMNS)
      .eq("organization_id", orgId)
      .order("started_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[agents/sessions] Query failed:", error.message);
      return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
    }

    const latestByType = new Map<string, any>();
    const runCounts = new Map<string, number>();
    for (const s of recent || []) {
      runCounts.set(s.agent_type, (runCounts.get(s.agent_type) || 0) + 1);
      if (!latestByType.has(s.agent_type)) latestByType.set(s.agent_type, s);
    }

    const enriched = await withUserNames(
      admin,
      Array.from(latestByType.values())
    );
    const latestMap = new Map(enriched.map((s: any) => [s.agent_type, s]));

    const nightlyByPlan = await orgHasNightlyAgents(admin, orgId);
    const { data: org } = await (admin as any)
      .from("organizations")
      .select("settings, subscription_plan")
      .eq("id", orgId)
      .maybeSingle();

    // Missing key = enabled (opt-out, not opt-in).
    const nightlyEnabledByOrg = org?.settings?.nightly_agents !== false;

    const agents = AGENT_TYPES.map((type) => {
      const config = getAgentConfig(type);
      return {
        type,
        name: config.name,
        description: config.description,
        model: config.model,
        // Which agents the user can relaunch from the page. The three
        // autonomous ones only make sense on their nightly schedule.
        interactive: INTERACTIVE_AGENTS.includes(type),
        nightly: NIGHTLY_AGENTS.includes(type),
        last_session: latestMap.get(type) || null,
        recent_runs: runCounts.get(type) || 0,
      };
    });

    return NextResponse.json({
      success: true,
      agents,
      nightly: {
        plan_allows: nightlyByPlan,
        org_enabled: nightlyEnabledByOrg,
        effective: nightlyByPlan && nightlyEnabledByOrg,
        plan: org?.subscription_plan || "trial",
        can_toggle:
          profile.role === "admin" ||
          profile.role === "director" ||
          profile.is_superadmin === true,
      },
    });
  } catch (error) {
    console.error("[agents/sessions] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Agents a user can relaunch with a single click, because they need no input
 * beyond the org context.
 *
 * Excluded on purpose:
 *  • submission-analyzer / plan-estimator / price-extractor — need a specific
 *    document, so they are launched from their own module.
 *  • the five nightly ones — they need CRON_SECRET and org-wide context.
 */
const INTERACTIVE_AGENTS: AgentType[] = [
  "briefing-generator",
  "email-classifier",
];

const NIGHTLY_AGENTS: AgentType[] = [
  "email-drafter",
  "followup-engine",
  "supplier-monitor",
  "project-memory",
  "meeting-prep",
];

/** Attach a display name for whoever the run was attributed to. */
async function withUserNames(admin: any, sessions: any[]): Promise<any[]> {
  const userIds = Array.from(
    new Set(sessions.map((s) => s.user_id).filter(Boolean))
  ) as string[];
  if (userIds.length === 0) return sessions;

  const { data: users } = await admin
    .from("users")
    .select("id, first_name, last_name, email")
    .in("id", userIds);

  const byId: Record<string, any> = {};
  for (const u of users || []) byId[u.id] = u;

  return sessions.map((s) => {
    const u = byId[s.user_id];
    return {
      ...s,
      user_name: u
        ? `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email
        : null,
      trigger: s.input_payload?.trigger || "interactive",
    };
  });
}
