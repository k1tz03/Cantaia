import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectBriefingData } from "@cantaia/core/briefing";
import { generateBriefingAI, generateBriefingFallback } from "@cantaia/core/briefing";
import { trackApiUsage, logActivityAsync } from "@cantaia/core/tracking";
import { MODEL_FOR_TASK, classifyAIError } from "@cantaia/core/ai";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get user profile
  const { data: userProfile } = await (admin as any)
    .from("users")
    .select("first_name, last_name, preferred_language, organization_id, briefing_enabled, briefing_projects")
    .eq("id", user.id)
    .maybeSingle();

  if (!userProfile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  if (!userProfile.briefing_enabled) {
    return NextResponse.json({ error: "Briefing disabled" }, { status: 400 });
  }

  const userName = `${userProfile.first_name} ${userProfile.last_name}`;
  const locale = userProfile.preferred_language || "fr";
  const orgId = userProfile.organization_id;

  // Fetch projects (filtered if user has preferences)
  let projectsQuery = (admin as any)
    .from("projects")
    .select("id, name, code, status, color")
    .eq("organization_id", orgId)
    .in("status", ["active", "planning"]);

  if (userProfile.briefing_projects && userProfile.briefing_projects.length > 0) {
    projectsQuery = projectsQuery.in("id", userProfile.briefing_projects);
  }

  const { data: projects } = await projectsQuery;

  // Fetch emails (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: emails } = await (admin as any)
    .from("email_records")
    .select("id, project_id, subject, sender_email, sender_name, received_at, classification, is_processed")
    .eq("user_id", user.id)
    .gte("received_at", sevenDaysAgo.toISOString());

  // Fetch tasks (open)
  const projectIds = (projects || []).map((p: { id: string }) => p.id);
  const { data: tasks } = await (admin as any)
    .from("tasks")
    .select("id, project_id, title, status, due_date, assigned_to_name, priority")
    .in("project_id", projectIds.length > 0 ? projectIds : ["__none__"])
    .in("status", ["todo", "in_progress", "waiting"]);

  // Fetch meetings (next 7 days)
  const today = new Date().toISOString().split("T")[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const { data: meetings } = await (admin as any)
    .from("meetings")
    .select("id, project_id, title, meeting_date, location, status, participants")
    .in("project_id", projectIds.length > 0 ? projectIds : ["__none__"])
    .gte("meeting_date", today)
    .lte("meeting_date", nextWeek.toISOString());

  // Fetch submissions with approaching deadlines (next 30 days)
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const { data: submissions } = await (admin as any)
    .from("submissions")
    .select("id, title, reference, status, deadline, project_id")
    .in("project_id", projectIds.length > 0 ? projectIds : ["__none__"])
    .in("status", ["draft", "sent", "responses", "comparing"])
    .not("deadline", "is", null)
    .lte("deadline", thirtyDaysFromNow.toISOString().split("T")[0])
    .order("deadline", { ascending: true });

  // Collect raw data
  const rawData = collectBriefingData({
    user_name: userName,
    projects: projects || [],
    emails: emails || [],
    tasks: tasks || [],
    meetings: meetings || [],
    submissions: submissions || [],
    locale,
  });

  // Fetch C2 market price trends if org has opted in (non-blocking)
  let marketTrends = "";
  try {
    const { data: priceConsent } = await (admin as any)
      .from("aggregation_consent")
      .select("opted_in")
      .eq("organization_id", orgId)
      .eq("module", "prix")
      .maybeSingle();

    if (priceConsent?.opted_in === true) {
      const { data: trends } = await (admin as any)
        .from("regional_price_index")
        .select("region, basket_index, trend_pct, period")
        .order("period", { ascending: false })
        .limit(5);

      if (trends && trends.length > 0) {
        marketTrends = "\n\nMARKET PRICE TRENDS (C2 anonymised benchmarks):\n" +
          trends.map((t: { region: string; trend_pct: number; period: string }) =>
            `- ${t.region}: ${t.trend_pct > 0 ? "+" : ""}${t.trend_pct}% (${t.period})`
          ).join("\n");
      }
    }
  } catch (c2Err) {
    console.warn("[briefing/generate] C2 market trends skipped (non-blocking):", c2Err);
  }

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
            actionType: "email_summary",
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
