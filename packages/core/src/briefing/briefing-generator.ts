// ============================================================
// Cantaia — AI Briefing Generator
// ============================================================
// Uses Claude to generate a structured daily briefing from raw data.
// Also provides a fallback mode without AI.

import type { BriefingContent } from "@cantaia/database";
import type { BriefingRawData } from "./briefing-collector";
import type { ApiUsageCallback } from "../tracking/api-cost-tracker";
import { MODEL_FOR_TASK, callAnthropicWithRetry, parseAIJson } from "../ai/ai-utils";

// ---------- Prompt builder ----------

function buildBriefingPrompt(data: BriefingRawData, marketTrends = ""): string {
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

  const deadlinesList = data.submission_deadlines
    .slice(0, 8)
    .map(
      (s) =>
        `- "${s.title}"${s.reference ? ` (${s.reference})` : ""} — ${s.project_name} — deadline: ${s.deadline} (${s.days_remaining} days remaining, status: ${s.status})`
    )
    .join("\n");

  const calendarList = (data.calendar_today || [])
    .map(
      (e) =>
        `- ${e.all_day ? "ALL DAY" : e.time}: ${e.title}${e.event_type ? ` [${e.event_type}]` : ""}${e.project_name ? ` — ${e.project_name}` : ""}${e.location ? ` @ ${e.location}` : ""}`
    )
    .join("\n");

  const followupsList = (data.pending_followups || [])
    .map(
      (f) =>
        `- [${String(f.urgency).toUpperCase()}] ${f.title}${f.project_name ? ` (${f.project_name})` : ""}${f.recipient_name ? ` → ${f.recipient_name}` : ""}${f.days_overdue ? `, ${f.days_overdue}d overdue` : ""}${f.suggested_action ? ` — suggested: ${f.suggested_action}` : ""}`
    )
    .join("\n");

  const supplierAlertsList = (data.supplier_alerts || [])
    .map(
      (a) =>
        `- [${a.alert_type.toUpperCase()}/${a.category}] ${a.title}: ${a.description}${a.recommended_action ? ` — recommended: ${a.recommended_action}` : ""}`
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

TODAY'S CALENDAR (meetings, site visits, deadlines, milestones):
${calendarList || "(none)"}

PENDING FOLLOW-UPS (detected by the Followup Engine — awaiting the user's approval):
${followupsList || "(none)"}

ACTIVE SUPPLIER ALERTS (detected by the Supplier Monitor):
${supplierAlertsList || "(none)"}

SUBMISSION DEADLINES (next 30 days):
${deadlinesList || "(none)"}${marketTrends}

INSTRUCTIONS:
Generate a structured JSON briefing. The tone should be professional, concise, and actionable — like a trusted assistant briefing a busy construction PM in the morning.

1. "greeting": A short, personalized greeting with the date. Example: "Bonjour Julien — lundi 17 février 2026"
2. "priority_alerts": Array of 0-5 short alert strings for critical items (overdue tasks, urgent emails, today's deadlines, critical follow-ups, critical supplier alerts). Be specific.
   Ground every alert in the data above — never invent a number, and never restate a section that says "(none)".
3. "projects": For EACH active project, provide:
   - "project_id": the project ID
   - "name": project name
   - "status_emoji": one emoji summarizing health (🟢 good, 🟡 attention, 🔴 critical)
   - "summary": 1-2 sentences about the project status today
   - "action_items": 0-3 specific actions for today
4. "meetings_today": List of meetings with time, project name, title
5. "submission_deadlines": For each upcoming submission deadline, provide title, deadline date, days_remaining, project name, and urgency note. Only include if there are deadlines within 30 days.
6. "global_summary": 1-2 sentences overall summary for the day

Output ONLY valid JSON matching this structure. No markdown, no explanation.

{
  "greeting": "...",
  "priority_alerts": ["..."],
  "projects": [{"project_id":"...","name":"...","status_emoji":"...","summary":"...","action_items":["..."]}],
  "meetings_today": [{"time":"...","project":"...","title":"..."}],
  "submission_deadlines": [{"title":"...","deadline":"...","days_remaining":0,"project":"...","note":"..."}],
  "global_summary": "..."
}`;
}

// ---------- AI Generator ----------

export async function generateBriefingAI(
  anthropicApiKey: string,
  rawData: BriefingRawData,
  model = MODEL_FOR_TASK.briefing,
  onUsage?: ApiUsageCallback,
  marketTrends = ""
): Promise<BriefingContent> {
  console.log(`[generateBriefingAI] Generating briefing for ${rawData.user_name}, ${rawData.date}`);
  console.log(`[generateBriefingAI] Stats:`, rawData.stats);

  const prompt = buildBriefingPrompt(rawData, marketTrends);

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    // maxRetries:0 on the SDK — the retry policy lives in callAnthropicWithRetry.
    const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 60_000, maxRetries: 0 });

    // The briefing prompt is unique per user per day — never cache it
    // (cache_control on unique content is a +25% write with no reuse).
    const response = await callAnthropicWithRetry(() =>
      client.messages.create({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      })
    );

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

    const parsed = parseAIJson<Record<string, any>>(textBlock.text);
    if (!parsed) {
      console.error("[generateBriefingAI] Failed to parse briefing JSON");
      return generateBriefingFallback(rawData);
    }

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
      submission_deadlines: (parsed.submission_deadlines || []).map((s: Record<string, unknown>) => ({
        title: s.title as string,
        deadline: s.deadline as string,
        days_remaining: s.days_remaining as number,
        project: s.project as string,
        note: (s.note as string) || "",
      })),
      stats: rawData.stats,
      global_summary: parsed.global_summary || "",
    };
  } catch (err: any) {
    console.error("[generateBriefingAI] AI error:", err?.message || err);
    const status = err?.status;
    if (status === 429 || status === 503 || status === 529) throw err;
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

  // Meetings today — merged with the calendar feed so the briefing shows the
  // same "today" as the calendar module (site visits, deadlines, milestones).
  const meetingsToday = rawData.meetings_today.map((m) => ({
    time: m.time,
    project: m.project_name,
    title: m.title,
  }));
  const seenSlots = new Set(meetingsToday.map((m) => `${m.time}|${m.title}`));
  for (const e of rawData.calendar_today || []) {
    const slot = `${e.time}|${e.title}`;
    if (seenSlots.has(slot)) continue;
    seenSlots.add(slot);
    meetingsToday.push({
      time: e.time,
      project: e.project_name ?? "—",
      title: e.title,
    });
  }

  // Submission deadlines
  const submissionDeadlines = rawData.submission_deadlines.map((s) => {
    const urgencyMsgs: Record<string, string> = {
      fr: s.days_remaining <= 3 ? "Urgent" : s.days_remaining <= 7 ? "Cette semaine" : "",
      en: s.days_remaining <= 3 ? "Urgent" : s.days_remaining <= 7 ? "This week" : "",
      de: s.days_remaining <= 3 ? "Dringend" : s.days_remaining <= 7 ? "Diese Woche" : "",
    };
    return {
      title: s.title,
      deadline: s.deadline,
      days_remaining: s.days_remaining,
      project: s.project_name,
      note: urgencyMsgs[rawData.locale] || "",
    };
  });

  // Add deadline alerts
  const urgentDeadlines = rawData.submission_deadlines.filter((s) => s.days_remaining <= 7);
  if (urgentDeadlines.length > 0) {
    const msgs: Record<string, string> = {
      fr: `${urgentDeadlines.length} deadline(s) soumission dans les 7 prochains jours`,
      en: `${urgentDeadlines.length} submission deadline(s) within 7 days`,
      de: `${urgentDeadlines.length} Einreichungsfrist(en) innerhalb von 7 Tagen`,
    };
    alerts.push(msgs[rawData.locale]);
  }

  // Pending follow-ups awaiting approval
  const urgentFollowups = (rawData.pending_followups || []).filter(
    (f) => f.urgency === "critical" || f.urgency === "high"
  );
  if (urgentFollowups.length > 0) {
    const msgs: Record<string, string> = {
      fr: `${urgentFollowups.length} relance(s) prioritaire(s) à valider`,
      en: `${urgentFollowups.length} priority follow-up(s) to approve`,
      de: `${urgentFollowups.length} vorrangige Nachfassaktion(en) zu bestätigen`,
    };
    alerts.push(msgs[rawData.locale]);
  }

  // Active supplier alerts
  const criticalSupplierAlerts = (rawData.supplier_alerts || []).filter(
    (a) => a.alert_type === "critical" || a.alert_type === "warning"
  );
  if (criticalSupplierAlerts.length > 0) {
    const msgs: Record<string, string> = {
      fr: `${criticalSupplierAlerts.length} alerte(s) fournisseur active(s)`,
      en: `${criticalSupplierAlerts.length} active supplier alert(s)`,
      de: `${criticalSupplierAlerts.length} aktive Lieferantenwarnung(en)`,
    };
    alerts.push(msgs[rawData.locale]);
  }

  // Today's calendar
  if ((rawData.calendar_today || []).length > 0) {
    const count = rawData.calendar_today.length;
    const msgs: Record<string, string> = {
      fr: `${count} événement(s) au calendrier aujourd'hui`,
      en: `${count} calendar event(s) today`,
      de: `${count} Kalendereintrag/-einträge heute`,
    };
    alerts.push(msgs[rawData.locale]);
  }

  // Global summary
  const globalMsgs: Record<string, string> = {
    fr: `${rawData.stats.total_projects} projets actifs, ${rawData.stats.emails_unread} emails non lus, ${rawData.stats.tasks_overdue} tâches en retard, ${rawData.stats.meetings_today} réunion(s) aujourd'hui.`,
    en: `${rawData.stats.total_projects} active projects, ${rawData.stats.emails_unread} unread emails, ${rawData.stats.tasks_overdue} overdue tasks, ${rawData.stats.meetings_today} meeting(s) today.`,
    de: `${rawData.stats.total_projects} aktive Projekte, ${rawData.stats.emails_unread} ungelesene E-Mails, ${rawData.stats.tasks_overdue} überfällige Aufgaben, ${rawData.stats.meetings_today} Besprechung(en) heute.`,
  };

  return {
    // "data", never "ai": this briefing is assembled from real rows with no
    // model involved. Mislabelling it as AI-generated would be a lie to the
    // user about where the content came from.
    mode: "data",
    greeting: greetings[rawData.locale],
    priority_alerts: alerts,
    projects,
    meetings_today: meetingsToday,
    submission_deadlines: submissionDeadlines,
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
