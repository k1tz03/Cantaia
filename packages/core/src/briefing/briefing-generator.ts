// ============================================================
// Cantaia — AI Briefing Generator
// ============================================================
// Uses Claude to generate a structured daily briefing from raw data.
// Also provides a fallback mode without AI.

import type { BriefingContent } from "@cantaia/database";
import type { BriefingRawData } from "./briefing-collector";
import type { ApiUsageCallback } from "../tracking/api-cost-tracker";

// ---------- Prompt builder ----------

function buildBriefingPrompt(data: BriefingRawData): string {
  const lang = data.locale === "de" ? "Deutsch" : data.locale === "en" ? "English" : "French";

  const projectsSummary = data.projects
    .map(
      (p) =>
        `- ${p.name} (${p.code || "—"}): ${p.tasks_overdue} overdue tasks, ${p.tasks_due_today} due today, ${p.emails_unread} unread emails, ${p.emails_action_required} action required, ${p.emails_urgent} urgent${p.next_meeting ? `, next meeting: ${p.next_meeting.date}` : ""}${p.recent_email_subjects.length > 0 ? `\n  Recent emails: ${p.recent_email_subjects.join("; ")}` : ""}`
    )
    .join("\n");

  const overdueList = data.overdue_tasks
    .slice(0, 15)
    .map(
      (t) =>
        `- [${t.priority.toUpperCase()}] ${t.title} (${t.project_name}, due: ${t.due_date}${t.assigned_to ? `, → ${t.assigned_to}` : ""})`
    )
    .join("\n");

  const urgentEmailsList = data.urgent_emails
    .slice(0, 10)
    .map(
      (e) =>
        `- "${e.subject}" from ${e.sender}${e.project_name ? ` (${e.project_name})` : ""}`
    )
    .join("\n");

  const meetingsList = data.meetings_today
    .map(
      (m) =>
        `- ${m.time}: ${m.title} — ${m.project_name}${m.location ? ` @ ${m.location}` : ""} (${m.participants_count} participants)`
    )
    .join("\n");

  return `You are an AI assistant for Swiss construction project managers. Generate a daily morning briefing in ${lang}.

USER: ${data.user_name}
DATE: ${data.date}

GLOBAL STATS:
- ${data.stats.total_projects} active projects
- ${data.stats.emails_unread} unread emails (${data.stats.emails_action_required} action required)
- ${data.stats.tasks_overdue} overdue tasks, ${data.stats.tasks_due_today} due today
- ${data.stats.meetings_today} meetings today

PROJECTS:
${projectsSummary || "(no active projects)"}

OVERDUE TASKS:
${overdueList || "(none)"}

URGENT/ACTION REQUIRED EMAILS:
${urgentEmailsList || "(none)"}

TODAY'S MEETINGS:
${meetingsList || "(none)"}

INSTRUCTIONS:
Generate a structured JSON briefing. The tone should be professional, concise, and actionable — like a trusted assistant briefing a busy construction PM in the morning.

1. "greeting": A short, personalized greeting with the date. Example: "Bonjour Julien — lundi 17 février 2026"
2. "priority_alerts": Array of 0-5 short alert strings for critical items (overdue tasks, urgent emails, today's deadlines). Be specific.
3. "projects": For EACH active project, provide:
   - "project_id": the project ID
   - "name": project name
   - "status_emoji": one emoji summarizing health (🟢 good, 🟡 attention, 🔴 critical)
   - "summary": 1-2 sentences about the project status today
   - "action_items": 0-3 specific actions for today
4. "meetings_today": List of meetings with time, project name, title
5. "global_summary": 1-2 sentences overall summary for the day

Output ONLY valid JSON matching this structure. No markdown, no explanation.

{
  "greeting": "...",
  "priority_alerts": ["..."],
  "projects": [{"project_id":"...","name":"...","status_emoji":"...","summary":"...","action_items":["..."]}],
  "meetings_today": [{"time":"...","project":"...","title":"..."}],
  "global_summary": "..."
}`;
}

// ---------- AI Generator ----------

export async function generateBriefingAI(
  anthropicApiKey: string,
  rawData: BriefingRawData,
  model = "claude-sonnet-4-5-20250929",
  onUsage?: ApiUsageCallback
): Promise<BriefingContent> {
  console.log(`[generateBriefingAI] Generating briefing for ${rawData.user_name}, ${rawData.date}`);
  console.log(`[generateBriefingAI] Stats:`, rawData.stats);

  const prompt = buildBriefingPrompt(rawData);

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    // Track usage
    try {
      onUsage?.({
        model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });
    } catch { /* tracking must never fail */ }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[generateBriefingAI] No text content in Claude response");
      return generateBriefingFallback(rawData);
    }

    // Parse JSON
    let jsonStr = textBlock.text.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    console.log("[generateBriefingAI] AI briefing generated successfully");

    return {
      mode: "ai",
      greeting: parsed.greeting || "",
      priority_alerts: parsed.priority_alerts || [],
      projects: (parsed.projects || []).map((p: Record<string, unknown>) => ({
        project_id: p.project_id as string,
        name: p.name as string,
        status_emoji: p.status_emoji as string,
        summary: p.summary as string,
        action_items: (p.action_items as string[]) || [],
      })),
      meetings_today: (parsed.meetings_today || []).map((m: Record<string, unknown>) => ({
        time: m.time as string,
        project: m.project as string,
        title: m.title as string,
      })),
      stats: rawData.stats,
      global_summary: parsed.global_summary || "",
    };
  } catch (err) {
    console.error("[generateBriefingAI] Error:", err instanceof Error ? err.message : err);
    return generateBriefingFallback(rawData);
  }
}

// ---------- Fallback Generator (no AI) ----------

export function generateBriefingFallback(rawData: BriefingRawData): BriefingContent {
  console.log(`[generateBriefingFallback] Generating factual briefing for ${rawData.user_name}`);

  const greetings: Record<string, string> = {
    fr: `Bonjour ${rawData.user_name} — ${formatDateLocale(rawData.date, "fr")}`,
    en: `Good morning ${rawData.user_name} — ${formatDateLocale(rawData.date, "en")}`,
    de: `Guten Morgen ${rawData.user_name} — ${formatDateLocale(rawData.date, "de")}`,
  };

  const alerts: string[] = [];

  // Generate alerts in user's language
  if (rawData.stats.tasks_overdue > 0) {
    const msgs: Record<string, string> = {
      fr: `${rawData.stats.tasks_overdue} tâche(s) en retard`,
      en: `${rawData.stats.tasks_overdue} overdue task(s)`,
      de: `${rawData.stats.tasks_overdue} überfällige Aufgabe(n)`,
    };
    alerts.push(msgs[rawData.locale]);
  }

  if (rawData.urgent_emails.length > 0) {
    const msgs: Record<string, string> = {
      fr: `${rawData.urgent_emails.length} email(s) urgent(s) non traité(s)`,
      en: `${rawData.urgent_emails.length} unprocessed urgent email(s)`,
      de: `${rawData.urgent_emails.length} unbearbeitete dringende E-Mail(s)`,
    };
    alerts.push(msgs[rawData.locale]);
  }

  if (rawData.stats.tasks_due_today > 0) {
    const msgs: Record<string, string> = {
      fr: `${rawData.stats.tasks_due_today} tâche(s) à finir aujourd'hui`,
      en: `${rawData.stats.tasks_due_today} task(s) due today`,
      de: `${rawData.stats.tasks_due_today} Aufgabe(n) fällig heute`,
    };
    alerts.push(msgs[rawData.locale]);
  }

  // Project summaries (factual)
  const projects = rawData.projects.map((p) => {
    const emoji =
      p.tasks_overdue > 2 || p.emails_urgent > 0
        ? "🔴"
        : p.tasks_overdue > 0 || p.emails_action_required > 2
          ? "🟡"
          : "🟢";

    const summaryParts: string[] = [];
    if (p.tasks_overdue > 0) summaryParts.push(`${p.tasks_overdue} overdue`);
    if (p.tasks_due_today > 0) summaryParts.push(`${p.tasks_due_today} due today`);
    if (p.emails_unread > 0) summaryParts.push(`${p.emails_unread} unread emails`);
    if (p.tasks_in_progress > 0) summaryParts.push(`${p.tasks_in_progress} in progress`);

    const summaryMsgs: Record<string, string> = {
      fr: summaryParts.length > 0
        ? `${p.tasks_total} tâches ouvertes. ${summaryParts.join(", ")}.`
        : `${p.tasks_total} tâches ouvertes. Tout est à jour.`,
      en: summaryParts.length > 0
        ? `${p.tasks_total} open tasks. ${summaryParts.join(", ")}.`
        : `${p.tasks_total} open tasks. Everything up to date.`,
      de: summaryParts.length > 0
        ? `${p.tasks_total} offene Aufgaben. ${summaryParts.join(", ")}.`
        : `${p.tasks_total} offene Aufgaben. Alles auf dem neuesten Stand.`,
    };

    return {
      project_id: p.project_id,
      name: p.name,
      status_emoji: emoji,
      summary: summaryMsgs[rawData.locale],
      action_items: [] as string[],
    };
  });

  // Meetings today
  const meetingsToday = rawData.meetings_today.map((m) => ({
    time: m.time,
    project: m.project_name,
    title: m.title,
  }));

  // Global summary
  const globalMsgs: Record<string, string> = {
    fr: `${rawData.stats.total_projects} projets actifs, ${rawData.stats.emails_unread} emails non lus, ${rawData.stats.tasks_overdue} tâches en retard, ${rawData.stats.meetings_today} réunion(s) aujourd'hui.`,
    en: `${rawData.stats.total_projects} active projects, ${rawData.stats.emails_unread} unread emails, ${rawData.stats.tasks_overdue} overdue tasks, ${rawData.stats.meetings_today} meeting(s) today.`,
    de: `${rawData.stats.total_projects} aktive Projekte, ${rawData.stats.emails_unread} ungelesene E-Mails, ${rawData.stats.tasks_overdue} überfällige Aufgaben, ${rawData.stats.meetings_today} Besprechung(en) heute.`,
  };

  return {
    mode: "fallback",
    greeting: greetings[rawData.locale],
    priority_alerts: alerts,
    projects,
    meetings_today: meetingsToday,
    stats: rawData.stats,
    global_summary: globalMsgs[rawData.locale],
  };
}

// ---------- Helpers ----------

function formatDateLocale(dateStr: string, locale: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  };
  const localeMap: Record<string, string> = {
    fr: "fr-CH",
    en: "en-GB",
    de: "de-CH",
  };
  return date.toLocaleDateString(localeMap[locale] || "fr-CH", options);
}
