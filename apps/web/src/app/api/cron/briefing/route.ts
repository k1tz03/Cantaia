import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectBriefingData } from "@cantaia/core/briefing";
import { generateBriefingAI, generateBriefingFallback } from "@cantaia/core/briefing";
import { trackApiUsage, logActivityAsync } from "@cantaia/core/tracking";
import { MODEL_FOR_TASK } from "@cantaia/core/ai";

export const maxDuration = 300;

/**
 * POST /api/cron/briefing
 * Generates daily briefings for all users with briefing_enabled = true.
 * Optionally sends briefing email via Resend if briefing_email = true.
 * Protected by CRON_SECRET.
 * Scheduled: daily at 6:45 AM (before email sync at 7:00).
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;

  // Get all users with briefing enabled
  const { data: users } = await (admin as any)
    .from("users")
    .select("id, first_name, last_name, email, preferred_language, organization_id, briefing_enabled, briefing_email, briefing_projects, briefing_time")
    .eq("briefing_enabled", true)
    .eq("is_active", true);

  if (!users || users.length === 0) {
    return NextResponse.json({ message: "No users with briefing enabled", count: 0 });
  }

  console.log(`[cron/briefing] Processing ${users.length} users`);

  const results: { userId: string; generated: boolean; emailed: boolean; error?: string }[] = [];

  for (const userProfile of users) {
    try {
      // Check if briefing already exists for today
      const { data: existing } = await (admin as any)
        .from("daily_briefings")
        .select("id")
        .eq("user_id", userProfile.id)
        .eq("briefing_date", today)
        .maybeSingle();

      if (existing) {
        results.push({ userId: userProfile.id, generated: false, emailed: false });
        continue;
      }

      const userName = `${userProfile.first_name} ${userProfile.last_name}`;
      const locale = userProfile.preferred_language || "fr";
      const orgId = userProfile.organization_id;

      // Fetch projects
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
        .eq("user_id", userProfile.id)
        .gte("received_at", sevenDaysAgo.toISOString());

      // Fetch tasks
      const projectIds = (projects || []).map((p: { id: string }) => p.id);
      const { data: tasks } = await (admin as any)
        .from("tasks")
        .select("id, project_id, title, status, due_date, assigned_to_name, priority")
        .in("project_id", projectIds.length > 0 ? projectIds : ["__none__"])
        .in("status", ["todo", "in_progress", "waiting"]);

      // Fetch meetings (next 7 days)
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const { data: meetings } = await (admin as any)
        .from("meetings")
        .select("id, project_id, title, meeting_date, location, status, participants")
        .in("project_id", projectIds.length > 0 ? projectIds : ["__none__"])
        .gte("meeting_date", today)
        .lte("meeting_date", nextWeek.toISOString());

      // Fetch submissions with approaching deadlines
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

      // Collect and generate
      const rawData = collectBriefingData({
        user_name: userName,
        projects: projects || [],
        emails: emails || [],
        tasks: tasks || [],
        meetings: meetings || [],
        submissions: submissions || [],
        locale,
      });

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
                userId: userProfile.id,
                organizationId: orgId,
                actionType: "email_summary",
                apiProvider: "anthropic",
                model: usage.model,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
              }).catch(() => {});
            }
          );
        } catch {
          briefingContent = generateBriefingFallback(rawData);
        }
      } else {
        briefingContent = generateBriefingFallback(rawData);
      }

      // Store
      const { data: stored } = await (admin as any)
        .from("daily_briefings")
        .upsert(
          { user_id: userProfile.id, briefing_date: today, content: briefingContent },
          { onConflict: "user_id,briefing_date" }
        )
        .select("id")
        .single();

      // Send email if enabled
      let emailed = false;
      if (userProfile.briefing_email && resendApiKey && userProfile.email) {
        try {
          emailed = await sendBriefingEmail(
            resendApiKey,
            userProfile.email,
            userName,
            briefingContent,
            locale
          );
          if (emailed && stored?.id) {
            await (admin as any)
              .from("daily_briefings")
              .update({ is_sent: true, sent_at: new Date().toISOString() })
              .eq("id", stored.id);
          }
        } catch (err: any) {
          console.error(`[cron/briefing] Email error for ${userProfile.id}:`, err?.message);
        }
      }

      logActivityAsync({
        supabase: admin,
        userId: userProfile.id,
        organizationId: orgId,
        action: "generate_briefing",
        metadata: { mode: briefingContent.mode, source: "cron", emailed },
      });

      results.push({ userId: userProfile.id, generated: true, emailed });
    } catch (err: any) {
      console.error(`[cron/briefing] Error for user ${userProfile.id}:`, err?.message);
      results.push({ userId: userProfile.id, generated: false, emailed: false, error: err?.message });
    }
  }

  const generated = results.filter((r) => r.generated).length;
  const emailed = results.filter((r) => r.emailed).length;
  console.log(`[cron/briefing] Done: ${generated}/${users.length} generated, ${emailed} emailed`);

  return NextResponse.json({
    total_users: users.length,
    generated,
    emailed,
    skipped: users.length - generated,
    results,
  });
}

// ---------- Email sending via Resend ----------

async function sendBriefingEmail(
  apiKey: string,
  to: string,
  userName: string,
  briefing: any,
  locale: string
): Promise<boolean> {
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const subjectMap: Record<string, string> = {
    fr: `Briefing du jour — ${briefing.stats.total_projects} projets`,
    en: `Daily briefing — ${briefing.stats.total_projects} projects`,
    de: `Tagesbriefing — ${briefing.stats.total_projects} Projekte`,
  };

  const html = buildBriefingEmailHtml(briefing, userName, locale);

  const { error } = await resend.emails.send({
    from: "Cantaia <briefing@cantaia.ch>",
    to: [to],
    subject: subjectMap[locale] || subjectMap.fr,
    html,
  });

  if (error) {
    console.error("[cron/briefing] Resend error:", error);
    return false;
  }
  return true;
}

function buildBriefingEmailHtml(briefing: any, _userName: string, locale: string): string {
  const labels: Record<string, Record<string, string>> = {
    fr: { alerts: "Alertes prioritaires", projects: "Projets", meetings: "Reunions", summary: "Resume", deadlines: "Deadlines soumissions", open: "Ouvrir dans Cantaia" },
    en: { alerts: "Priority alerts", projects: "Projects", meetings: "Meetings", summary: "Summary", deadlines: "Submission deadlines", open: "Open in Cantaia" },
    de: { alerts: "Prioritaetsalarme", projects: "Projekte", meetings: "Besprechungen", summary: "Zusammenfassung", deadlines: "Einreichungsfristen", open: "In Cantaia oeffnen" },
  };
  const l = labels[locale] || labels.fr;

  const alertsHtml = briefing.priority_alerts.length > 0
    ? `<h2 style="color:#B45309;font-size:14px;margin:16px 0 8px">${l.alerts}</h2>` +
      briefing.priority_alerts.map((a: string) =>
        `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:10px 14px;margin-bottom:6px;font-size:13px;color:#92400E">${a}</div>`
      ).join("")
    : "";

  const deadlinesHtml = briefing.submission_deadlines && briefing.submission_deadlines.length > 0
    ? `<h2 style="color:#7C3AED;font-size:14px;margin:16px 0 8px">${l.deadlines}</h2>` +
      briefing.submission_deadlines.map((d: any) =>
        `<div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:6px;padding:10px 14px;margin-bottom:6px;font-size:13px;color:#5B21B6">${d.title} — ${d.deadline} (${d.days_remaining}j)</div>`
      ).join("")
    : "";

  const projectsHtml = briefing.projects.length > 0
    ? `<h2 style="font-size:14px;margin:16px 0 8px;color:#1F2937">${l.projects}</h2>` +
      briefing.projects.map((p: any) =>
        `<div style="border:1px solid #E5E7EB;border-radius:8px;padding:12px;margin-bottom:8px"><strong>${p.status_emoji} ${p.name}</strong><p style="margin:4px 0 0;font-size:13px;color:#4B5563">${p.summary}</p>${
          p.action_items?.length > 0
            ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:12px;color:#374151">${p.action_items.map((a: string) => `<li>${a}</li>`).join("")}</ul>`
            : ""
        }</div>`
      ).join("")
    : "";

  const meetingsHtml = briefing.meetings_today.length > 0
    ? `<h2 style="font-size:14px;margin:16px 0 8px;color:#1F2937">${l.meetings}</h2>` +
      briefing.meetings_today.map((m: any) =>
        `<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;padding:10px 14px;margin-bottom:6px;font-size:13px"><strong style="color:#1E40AF">${m.time}</strong> — ${m.title} <span style="color:#6B7280">(${m.project})</span></div>`
      ).join("")
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1F2937">
<div style="border-bottom:3px solid #2563EB;padding-bottom:12px;margin-bottom:16px">
  <h1 style="font-size:18px;margin:0;color:#111827">${briefing.greeting}</h1>
</div>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
  <span style="background:#F3F4F6;border-radius:6px;padding:6px 12px;font-size:12px">${briefing.stats.total_projects} projets</span>
  <span style="background:#FEF2F2;border-radius:6px;padding:6px 12px;font-size:12px;color:#991B1B">${briefing.stats.tasks_overdue} en retard</span>
  <span style="background:#EFF6FF;border-radius:6px;padding:6px 12px;font-size:12px;color:#1E40AF">${briefing.stats.emails_unread} non lus</span>
  <span style="background:#ECFDF5;border-radius:6px;padding:6px 12px;font-size:12px;color:#065F46">${briefing.stats.meetings_today} reunions</span>
</div>
${alertsHtml}${deadlinesHtml}${projectsHtml}${meetingsHtml}
<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px;margin-top:16px">
  <h2 style="font-size:14px;margin:0 0 6px;color:#1F2937">${l.summary}</h2>
  <p style="margin:0;font-size:13px;color:#4B5563">${briefing.global_summary}</p>
</div>
<div style="text-align:center;margin-top:24px">
  <a href="https://cantaia.ch/fr/briefing" style="display:inline-block;background:#2563EB;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">${l.open}</a>
</div>
<p style="text-align:center;font-size:10px;color:#9CA3AF;margin-top:24px">Cantaia — L'IA au service du chantier</p>
</body></html>`;
}
