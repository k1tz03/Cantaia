import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectBriefingData, fetchBriefingSources } from "@cantaia/core/briefing";
import { generateBriefingAI, generateBriefingFallback } from "@cantaia/core/briefing";
import { trackApiUsage, logActivityAsync } from "@cantaia/core/tracking";
import { MODEL_FOR_TASK, classifyAIError } from "@cantaia/core/ai";
import { rateLimit } from "@/lib/rate-limit";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // briefing_generate costs 0 credits (product decision), so a rate limit is
  // the only guard against a user looping POSTs to run unbounded (billed) AI
  // calls. 5/hour comfortably covers manual refreshes.
  const rl = await rateLimit(`briefing:user:${user.id}`, { limit: 5, windowSec: 3600 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retry_after_sec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const admin = createAdminClient();

  // Get user profile — use basic columns first, then try extended columns
  let userProfile: any = null;
  const { data: profile1 } = await (admin as any)
    .from("users")
    .select("first_name, last_name, preferred_language, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile1) {
    userProfile = profile1;
    // Try to fetch extended columns (may not exist if migration not applied)
    try {
      const { data: profile2 } = await (admin as any)
        .from("users")
        .select("briefing_enabled, briefing_projects")
        .eq("id", user.id)
        .maybeSingle();
      if (profile2) {
        userProfile.briefing_enabled = profile2.briefing_enabled;
        userProfile.briefing_projects = profile2.briefing_projects;
      }
    } catch { /* columns don't exist yet — ignore */ }
  }

  if (!userProfile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  // briefing_enabled defaults to null (new users) — treat as enabled (opt-out model)
  if (userProfile.briefing_enabled === false) {
    return NextResponse.json({ error: "Briefing disabled" }, { status: 400 });
  }

  const userName = `${userProfile.first_name} ${userProfile.last_name}`;
  const locale = userProfile.preferred_language || "fr";
  const orgId = userProfile.organization_id;

  // Europe/Zurich day key — matches the cron and the collector so the same
  // calendar day is used everywhere (UTC would roll over ~2h early locally).
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Shared with /api/cron/briefing — one definition of "what a briefing sees",
  // so an on-demand briefing and a scheduled one can never diverge.
  const sources = await fetchBriefingSources({
    client: admin as any,
    userId: user.id,
    organizationId: orgId,
    briefingProjects: userProfile.briefing_projects,
  });

  const rawData = collectBriefingData({
    user_name: userName,
    projects: sources.projects,
    emails: sources.emails,
    tasks: sources.tasks,
    meetings: sources.meetings,
    submissions: sources.submissions,
    calendar_events: sources.calendarEvents,
    followups: sources.followups,
    supplier_alerts: sources.supplierAlerts,
    locale,
  });

  const marketTrends = sources.marketTrends;

  // Generate briefing (AI or fallback)
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  let briefingContent;

  if (anthropicApiKey) {
    try {
      briefingContent = await generateBriefingAI(
        anthropicApiKey,
        rawData,
        MODEL_FOR_TASK.briefing,
        (usage) => {
          trackApiUsage({
            supabase: admin,
            userId: user.id,
            organizationId: orgId,
            actionType: "briefing_generate",
            apiProvider: "anthropic",
            model: usage.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
          }).catch(() => {});
        },
        marketTrends
      );
    } catch (error: any) {
      console.error("[briefing/generate] AI error:", error?.message);
      const err = classifyAIError(error);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
  } else {
    if (process.env.NODE_ENV === "development") console.log("[briefing/generate] No Anthropic API key, using fallback");
    briefingContent = generateBriefingFallback(rawData);
  }

  // Store in daily_briefings
  const { data: stored, error: storeError } = await (admin as any)
    .from("daily_briefings")
    .upsert(
      {
        user_id: user.id,
        briefing_date: today,
        content: briefingContent,
      },
      { onConflict: "user_id,briefing_date" }
    )
    .select()
    .single();

  if (storeError) {
    console.error("[briefing/generate] Store error:", storeError);
  }

  // Log activity
  logActivityAsync({
    supabase: admin,
    userId: user.id,
    organizationId: orgId,
    action: "generate_briefing",
    metadata: { mode: briefingContent.mode },
  });

  return NextResponse.json({
    briefing: briefingContent,
    stored_id: stored?.id ?? null,
    generated_at: new Date().toISOString(),
  });
}
