import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectBriefingData, fetchBriefingSources } from "@cantaia/core/briefing";
import { generateBriefingAI, generateBriefingFallback } from "@cantaia/core/briefing";
import { trackApiUsage, logActivityAsync } from "@cantaia/core/tracking";
import { MODEL_FOR_TASK } from "@cantaia/core/ai";
import { isAuthorizedCron } from "@/lib/cron-auth";

/** Date `YYYY-MM-DD` in the product timezone (Europe/Zurich), not UTC. */
function zurichDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Minimal HTML escaping for values interpolated into the briefing email. */
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const maxDuration = 300;

/**
 * GET /api/cron/briefing
 * Vercel Cron invokes scheduled paths with GET — delegate to POST.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * POST /api/cron/briefing
 * Generates daily briefings for all users with briefing_enabled = true.
 * Optionally sends briefing email via Resend if briefing_email = true.
 * Protected by CRON_SECRET.
 * Scheduled: daily at 6:45 AM (before email sync at 7:00).
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = zurichDateString();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;

  // Get all users with briefing enabled.
  // `briefing_enabled` is an opt-OUT model: NULL (the default for new users)
  // means enabled — matching /api/briefing/generate, which only refuses when
  // the flag is explicitly false. Filtering on `.eq(true)` alone would silently
  // exclude every user who never toggled the setting.
  const { data: allUsers } = await (admin as any)
    .from("users")
    .select("id, first_name, last_name, email, preferred_language, organization_id, briefing_enabled, briefing_email, briefing_projects, briefing_time")
    .or("briefing_enabled.is.null,briefing_enabled.eq.true")
    .eq("is_active", true);

  if (!allUsers || allUsers.length === 0) {
    return NextResponse.json({ message: "No users with briefing enabled", count: 0 });
  }

  // ── briefing_time ─────────────────────────────────────────────────
  // This cron runs once a day (06:45 in vercel.json). Rather than dropping
  // users whose preferred hour falls outside a narrow window — which meant
  // they never received any briefing at all — we serve EVERY enabled user at
  // the single daily run. `briefing_time` is honoured only when the schedule
  // becomes hourly (a vercel.json change owned by another workstream).
  const users = allUsers;

  console.log(
    `[cron/briefing] Processing ${users.length} users (daily run — briefing_time not yet honoured per-hour)`
  );

  const results: { userId: string; generated: boolean; emailed: boolean; error?: string }[] = [];

  // Global time budget: stop cleanly before Vercel kills the function
  // (maxDuration = 300s) so already-generated briefings are reported.
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 240_000;
  let timedOut = false;

  for (const userProfile of users) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      timedOut = true;
      console.warn(
        `[cron/briefing] Time budget reached — stopping after ${results.length}/${users.length} users`
      );
      break;
    }

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

      // Same source fetcher as /api/briefing/generate — including C2 market
      // trends and the empty-filter fallback the cron used to be missing.
      const sources = await fetchBriefingSources({
        client: admin as any,
        userId: userProfile.id,
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
                actionType: "briefing_generate",
                apiProvider: "anthropic",
                model: usage.model,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
              }).catch(() => {});
            },
            sources.marketTrends
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
  console.log(
    `[cron/briefing] Done: ${generated}/${users.length} generated, ${emailed} emailed${timedOut ? " (time budget reached)" : ""}`
  );

  return NextResponse.json({
    total_users: allUsers.length,
    processed: results.length,
    generated,
    emailed,
    skipped: users.length - generated,
    timed_out: timedOut,
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
    from: "Cantaia <briefing@cantaia.io>",
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
    fr: { alerts: "Alertes prioritaires", projects: "Projets", meetings: "Reunions", summary: "Resume", deadlines: "Deadlines soumissions", open: "Ouvrir dans Cantaia", statProjects: "projets", statOverdue: "en retard", statUnread: "non lus", statMeetings: "reunions" },
    en: { alerts: "Priority alerts", projects: "Projects", meetings: "Meetings", summary: "Summary", deadlines: "Submission deadlines", open: "Open in Cantaia", statProjects: "projects", statOverdue: "overdue", statUnread: "unread", statMeetings: "meetings" },
    de: { alerts: "Prioritaetsalarme", projects: "Projekte", meetings: "Besprechungen", summary: "Zusammenfassung", deadlines: "Einreichungsfristen", open: "In Cantaia oeffnen", statProjects: "Projekte", statOverdue: "ueberfaellig", statUnread: "ungelesen", statMeetings: "Besprechungen" },
  };
  const l = labels[locale] || labels.fr;

  // Localised deep link — the app is locale-prefixed, "/fr/" was hardcoded.
  const safeLocale = ["fr", "en", "de"].includes(locale) ? locale : "fr";
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://cantaia.io").replace(/\/+$/, "");
  const briefingUrl = `${appUrl}/${safeLocale}/briefing`;

  const alertsHtml = briefing.priority_alerts.length > 0
    ? `<h2 style="color:#B45309;font-size:14px;margin:16px 0 8px">${l.alerts}</h2>` +
      briefing.priority_alerts.map((a: string) =>
        `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:10px 14px;margin-bottom:6px;font-size:13px;color:#92400E">${escapeHtml(a)}</div>`
      ).join("")
    : "";

  const deadlinesHtml = briefing.submission_deadlines && briefing.submission_deadlines.length > 0
    ? `<h2 style="color:#7C3AED;font-size:14px;margin:16px 0 8px">${l.deadlines}</h2>` +
      briefing.submission_deadlines.map((d: any) =>
        `<div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:6px;padding:10px 14px;margin-bottom:6px;font-size:13px;color:#5B21B6">${escapeHtml(d.title)} — ${escapeHtml(d.deadline)} (${escapeHtml(d.days_remaining)}j)</div>`
      ).join("")
    : "";

  const projectsHtml = briefing.projects.length > 0
    ? `<h2 style="font-size:14px;margin:16px 0 8px;color:#1F2937">${l.projects}</h2>` +
      briefing.projects.map((p: any) =>
        `<div style="border:1px solid #E5E7EB;border-radius:8px;padding:12px;margin-bottom:8px"><strong>${escapeHtml(p.status_emoji)} ${escapeHtml(p.name)}</strong><p style="margin:4px 0 0;font-size:13px;color:#4B5563">${escapeHtml(p.summary)}</p>${
          p.action_items?.length > 0
            ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:12px;color:#374151">${p.action_items.map((a: string) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>`
            : ""
        }</div>`
      ).join("")
    : "";

  const meetingsHtml = briefing.meetings_today.length > 0
    ? `<h2 style="font-size:14px;margin:16px 0 8px;color:#1F2937">${l.meetings}</h2>` +
      briefing.meetings_today.map((m: any) =>
        `<div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;padding:10px 14px;margin-bottom:6px;font-size:13px"><strong style="color:#1E40AF">${escapeHtml(m.time)}</strong> — ${escapeHtml(m.title)} <span style="color:#6B7280">(${escapeHtml(m.project)})</span></div>`
      ).join("")
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1F2937">
<div style="border-bottom:3px solid #2563EB;padding-bottom:12px;margin-bottom:16px">
  <h1 style="font-size:18px;margin:0;color:#111827">${escapeHtml(briefing.greeting)}</h1>
</div>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
  <span style="background:#F3F4F6;border-radius:6px;padding:6px 12px;font-size:12px">${escapeHtml(briefing.stats.total_projects)} ${l.statProjects}</span>
  <span style="background:#FEF2F2;border-radius:6px;padding:6px 12px;font-size:12px;color:#991B1B">${escapeHtml(briefing.stats.tasks_overdue)} ${l.statOverdue}</span>
  <span style="background:#EFF6FF;border-radius:6px;padding:6px 12px;font-size:12px;color:#1E40AF">${escapeHtml(briefing.stats.emails_unread)} ${l.statUnread}</span>
  <span style="background:#ECFDF5;border-radius:6px;padding:6px 12px;font-size:12px;color:#065F46">${escapeHtml(briefing.stats.meetings_today)} ${l.statMeetings}</span>
</div>
${alertsHtml}${deadlinesHtml}${projectsHtml}${meetingsHtml}
<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px;margin-top:16px">
  <h2 style="font-size:14px;margin:0 0 6px;color:#1F2937">${l.summary}</h2>
  <p style="margin:0;font-size:13px;color:#4B5563">${escapeHtml(briefing.global_summary)}</p>
</div>
<div style="text-align:center;margin-top:24px">
  <a href="${briefingUrl}" style="display:inline-block;background:#2563EB;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">${l.open}</a>
</div>
<p style="text-align:center;font-size:10px;color:#9CA3AF;margin-top:24px">Cantaia — L'IA au service du chantier</p>
</body></html>`;
}
