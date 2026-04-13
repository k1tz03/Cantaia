// ============================================================
// Intelligence Feed — Cross-module aggregation for Calendar Hub
// ============================================================
// Collects data from all Cantaia modules to feed the Intelligence
// panel in the Calendar Hub. Uses dependency injection.

import type { IntelligenceFeedItem, TeamMemberAvailability, CalendarWeather } from "./types";

// ── Data Input Types ───────────────────────────────────────

export interface IntelligenceFeedInput {
  userId: string;
  orgId: string;
  /** Supabase admin client (any type to avoid circular deps) */
  admin: any;
  /** Today's date ISO string */
  today: string;
}

// ── Main Aggregator ────────────────────────────────────────

/**
 * Collect intelligence feed items from all Cantaia modules.
 * Each source is wrapped in try/catch for graceful degradation.
 * Returns items sorted by urgency then timestamp.
 */
export async function collectIntelligenceFeed(
  input: IntelligenceFeedInput
): Promise<IntelligenceFeedItem[]> {
  const { admin, orgId, today } = input;
  const items: IntelligenceFeedItem[] = [];

  // Run all collectors in parallel
  const [
    submissionItems,
    planningItems,
    mailItems,
    taskItems,
    supplierItems,
    reportItems,
    draftItems,
    followupItems,
  ] = await Promise.all([
    collectSubmissionDeadlines(admin, orgId, today).catch(() => []),
    collectPlanningDelays(admin, orgId).catch(() => []),
    collectUrgentEmails(admin, orgId, input.userId).catch(() => []),
    collectOverdueTasks(admin, orgId, today).catch(() => []),
    collectSupplierAlerts(admin, orgId).catch(() => []),
    collectPendingReports(admin, orgId, today).catch(() => []),
    collectAIDrafts(admin, orgId, input.userId).catch(() => []),
    collectFollowups(admin, orgId, input.userId).catch(() => []),
  ]);

  items.push(
    ...submissionItems,
    ...planningItems,
    ...mailItems,
    ...taskItems,
    ...supplierItems,
    ...reportItems,
    ...draftItems,
    ...followupItems
  );

  // Sort: critical first, then by timestamp desc
  const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => {
    const ua = urgencyOrder[a.urgency] ?? 3;
    const ub = urgencyOrder[b.urgency] ?? 3;
    if (ua !== ub) return ua - ub;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return items.slice(0, 20); // Cap at 20 items
}

// ── Collectors ─────────────────────────────────────────────

async function collectSubmissionDeadlines(
  admin: any, orgId: string, today: string
): Promise<IntelligenceFeedItem[]> {
  const in14Days = new Date(Date.now() + 14 * 86400000).toISOString();

  const { data } = await admin
    .from("submissions")
    .select("id, title, deadline, status, project_id, projects!inner(name, organization_id)")
    .eq("projects.organization_id", orgId)
    .gte("deadline", today)
    .lte("deadline", in14Days)
    .in("status", ["sent", "responses", "comparing"])
    .order("deadline", { ascending: true })
    .limit(5);

  return (data || []).map((s: any) => {
    const daysLeft = Math.ceil(
      (new Date(s.deadline).getTime() - Date.now()) / 86400000
    );
    return {
      id: `sub-${s.id}`,
      type: "submission_deadline" as const,
      module: "soumissions" as const,
      title: `Deadline soumission${daysLeft <= 1 ? " aujourd'hui !" : ""}`,
      description: `${s.title} — J-${daysLeft}`,
      urgency: daysLeft <= 1 ? "critical" as const : daysLeft <= 3 ? "high" as const : "medium" as const,
      project_id: s.project_id,
      project_name: s.projects?.name || null,
      link: `/submissions/${s.id}`,
      timestamp: s.deadline,
      metadata: { days_left: daysLeft },
    };
  });
}

async function collectPlanningDelays(
  admin: any, orgId: string
): Promise<IntelligenceFeedItem[]> {
  const { data } = await admin
    .from("planning_tasks")
    .select("id, name, cfc_code, end_date, progress, planning_id, project_plannings!inner(project_id, organization_id, projects!inner(name))")
    .eq("project_plannings.organization_id", orgId)
    .lt("end_date", new Date().toISOString())
    .lt("progress", 1)
    .order("end_date", { ascending: true })
    .limit(5);

  return (data || []).map((t: any) => {
    const daysLate = Math.ceil(
      (Date.now() - new Date(t.end_date).getTime()) / 86400000
    );
    return {
      id: `plan-${t.id}`,
      type: "planning_delay" as const,
      module: "planning" as const,
      title: `Retard planning — ${t.name}`,
      description: `${daysLate}j de retard${t.cfc_code ? ` (CFC ${t.cfc_code})` : ""}`,
      urgency: daysLate > 7 ? "critical" as const : daysLate > 3 ? "high" as const : "medium" as const,
      project_id: t.project_plannings?.project_id || null,
      project_name: t.project_plannings?.projects?.name || null,
      link: null,
      timestamp: t.end_date,
      metadata: { days_late: daysLate, progress: t.progress },
    };
  });
}

async function collectUrgentEmails(
  admin: any, _orgId: string, userId: string
): Promise<IntelligenceFeedItem[]> {
  const { data, count } = await admin
    .from("email_records")
    .select("id, subject, sender_name, received_at, classification, project_id, projects(name)", { count: "exact" })
    .eq("user_id", userId)
    .in("classification", ["action_required", "urgent"])
    .eq("is_processed", false)
    .order("received_at", { ascending: false })
    .limit(1);

  if (!count || count === 0) return [];

  return [{
    id: "mail-urgent",
    type: "email_urgent" as const,
    module: "mail" as const,
    title: `${count} email${count > 1 ? "s" : ""} action requise`,
    description: data?.[0]
      ? `Dont : ${data[0].subject?.slice(0, 60) || "Sans objet"}`
      : "",
    urgency: count > 5 ? "high" as const : "medium" as const,
    project_id: null,
    project_name: null,
    link: "/mail",
    timestamp: data?.[0]?.received_at || new Date().toISOString(),
    metadata: { total: count },
  }];
}

async function collectOverdueTasks(
  admin: any, orgId: string, today: string
): Promise<IntelligenceFeedItem[]> {
  const { data } = await admin
    .from("tasks")
    .select("id, title, due_date, priority, lot_code, project_id, projects!inner(name, organization_id)")
    .eq("projects.organization_id", orgId)
    .in("status", ["todo", "in_progress", "waiting"])
    .lt("due_date", today)
    .order("due_date", { ascending: true })
    .limit(5);

  return (data || []).map((t: any) => {
    const daysOverdue = Math.ceil(
      (Date.now() - new Date(t.due_date).getTime()) / 86400000
    );
    return {
      id: `task-${t.id}`,
      type: "task_overdue" as const,
      module: "taches" as const,
      title: `Tache en retard — ${t.title}`,
      description: `${daysOverdue}j de retard${t.lot_code ? ` · Lot ${t.lot_code}` : ""}`,
      urgency: t.priority === "urgent" ? "critical" as const
        : daysOverdue > 7 ? "high" as const : "medium" as const,
      project_id: t.project_id,
      project_name: t.projects?.name || null,
      link: `/tasks`,
      timestamp: t.due_date,
      metadata: { days_overdue: daysOverdue, priority: t.priority },
    };
  });
}

async function collectSupplierAlerts(
  admin: any, orgId: string
): Promise<IntelligenceFeedItem[]> {
  const { data } = await admin
    .from("supplier_alerts")
    .select("id, title, description, alert_type, supplier_id, suppliers(company_name), created_at")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(3);

  return (data || []).map((a: any) => ({
    id: `supplier-${a.id}`,
    type: "supplier_alert" as const,
    module: "fournisseurs" as const,
    title: a.title,
    description: a.suppliers?.company_name ? `${a.suppliers.company_name} — ${a.description?.slice(0, 60) || ""}` : a.description?.slice(0, 80) || "",
    urgency: a.alert_type === "critical" ? "critical" as const
      : a.alert_type === "warning" ? "high" as const : "medium" as const,
    project_id: null,
    project_name: null,
    link: `/suppliers`,
    timestamp: a.created_at,
    metadata: { alert_type: a.alert_type },
  }));
}

async function collectPendingReports(
  admin: any, orgId: string, today: string
): Promise<IntelligenceFeedItem[]> {
  const { data, count } = await admin
    .from("site_reports")
    .select("id, project_id, report_date, submitted_by_name, projects!inner(name, organization_id)", { count: "exact" })
    .eq("projects.organization_id", orgId)
    .eq("status", "draft")
    .limit(1);

  if (!count || count === 0) return [];

  return [{
    id: "reports-pending",
    type: "report_pending" as const,
    module: "rapports" as const,
    title: `${count} rapport${count > 1 ? "s" : ""} non soumis`,
    description: data?.[0]?.projects?.name
      ? `Projet ${data[0].projects.name}`
      : "Rapports chantier en brouillon",
    urgency: "low" as const,
    project_id: null,
    project_name: null,
    link: "/site-reports",
    timestamp: today,
    metadata: { total: count },
  }];
}

async function collectAIDrafts(
  admin: any, orgId: string, userId: string
): Promise<IntelligenceFeedItem[]> {
  const { count } = await admin
    .from("email_drafts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("status", "pending");

  if (!count || count === 0) return [];

  return [{
    id: "drafts-ready",
    type: "offer_received" as const,
    module: "mail" as const,
    title: `${count} brouillon${count > 1 ? "s" : ""} IA pret${count > 1 ? "s" : ""}`,
    description: "L'agent Email Drafter a prepare des reponses",
    urgency: "medium" as const,
    project_id: null,
    project_name: null,
    link: "/mail",
    timestamp: new Date().toISOString(),
    metadata: { count },
  }];
}

async function collectFollowups(
  admin: any, orgId: string, userId: string
): Promise<IntelligenceFeedItem[]> {
  const { data } = await admin
    .from("followup_items")
    .select("id, title, urgency, followup_type, project_id, projects(name), created_at")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(3);

  return (data || []).map((f: any) => ({
    id: `followup-${f.id}`,
    type: "task_overdue" as const,
    module: "soumissions" as const,
    title: f.title,
    description: f.projects?.name ? `Projet ${f.projects.name}` : "",
    urgency: f.urgency === "critical" ? "critical" as const
      : f.urgency === "high" ? "high" as const : "medium" as const,
    project_id: f.project_id,
    project_name: f.projects?.name || null,
    link: "/briefing",
    timestamp: f.created_at,
    metadata: { followup_type: f.followup_type },
  }));
}

// ── Team Availability ──────────────────────────────────────

/**
 * Build team availability strip from calendar events.
 */
export async function buildTeamAvailability(
  admin: any,
  orgId: string,
  today: string
): Promise<TeamMemberAvailability[]> {
  // Get org members
  const { data: members } = await admin
    .from("users")
    .select("id, first_name, last_name, email")
    .eq("organization_id", orgId)
    .limit(10);

  if (!members?.length) return [];

  const dayStart = new Date(today);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(today);
  dayEnd.setHours(23, 59, 59, 999);

  // Get all events for the org today
  const { data: events } = await admin
    .from("calendar_events")
    .select("user_id, start_at, end_at, status")
    .eq("organization_id", orgId)
    .gte("start_at", dayStart.toISOString())
    .lte("start_at", dayEnd.toISOString())
    .neq("status", "cancelled");

  const eventsByUser = new Map<string, Array<{ start: Date; end: Date }>>();
  for (const e of events || []) {
    const list = eventsByUser.get(e.user_id) || [];
    list.push({ start: new Date(e.start_at), end: new Date(e.end_at) });
    eventsByUser.set(e.user_id, list);
  }

  // Build 5 time slots: 08-10, 10-12, 12-14, 14-16, 16-18
  const slotBoundaries = [8, 10, 12, 14, 16, 18];
  const colors = ["#3B82F6", "#10B981", "#A855F7", "#F59E0B", "#EF4444", "#F97316", "#06B6D4", "#EC4899"];

  return members.map((m: any, idx: number) => {
    const userEvents = eventsByUser.get(m.id) || [];
    const slots: TeamMemberAvailability["slots"] = [];

    for (let i = 0; i < 5; i++) {
      const slotStart = new Date(today);
      slotStart.setHours(slotBoundaries[i], 0, 0, 0);
      const slotEnd = new Date(today);
      slotEnd.setHours(slotBoundaries[i + 1], 0, 0, 0);

      const overlapping = userEvents.filter(
        (e) => e.start < slotEnd && e.end > slotStart
      );

      if (overlapping.length === 0) {
        slots.push("free");
      } else {
        // Check how much of the slot is occupied
        const totalMinutes = (slotBoundaries[i + 1] - slotBoundaries[i]) * 60;
        let busyMinutes = 0;
        for (const e of overlapping) {
          const overlapStart = Math.max(e.start.getTime(), slotStart.getTime());
          const overlapEnd = Math.min(e.end.getTime(), slotEnd.getTime());
          busyMinutes += (overlapEnd - overlapStart) / 60000;
        }
        const ratio = busyMinutes / totalMinutes;
        slots.push(ratio > 0.75 ? "busy" : ratio > 0.25 ? "meeting" : "partial");
      }
    }

    const firstName = m.first_name || "";
    const lastName = m.last_name || "";
    const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase() || "?";

    return {
      user_id: m.id,
      name: `${firstName} ${lastName}`.trim() || m.email,
      email: m.email,
      avatar_color: colors[idx % colors.length],
      initials,
      slots,
      events_today: userEvents.length,
    };
  });
}

// ── Weather (Open-Meteo, free, no API key) ─────────────────

/**
 * Fetch weather for a location (defaults to Geneva, CH).
 */
export async function fetchConstructionWeather(
  lat = 46.2044,
  lon = 6.1432,
  locationName = "Geneve"
): Promise<CalendarWeather> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=precipitation_probability&timezone=Europe/Zurich&forecast_days=1`;
    const res = await fetch(url, { next: { revalidate: 1800 } }); // cache 30min
    const data = await res.json();

    const temp = Math.round(data.current?.temperature_2m || 0);
    const code = data.current?.weather_code || 0;

    // Check for rain in upcoming hours
    const precipProbs = data.hourly?.precipitation_probability || [];
    const currentHour = new Date().getHours();
    let rainAlert: string | null = null;
    for (let i = currentHour; i < Math.min(currentHour + 6, precipProbs.length); i++) {
      if (precipProbs[i] > 60) {
        rainAlert = `Pluie ${i}h`;
        break;
      }
    }

    return {
      temperature: temp,
      description: weatherCodeToDescription(code),
      location: locationName,
      alert: rainAlert,
      icon: weatherCodeToIcon(code),
    };
  } catch {
    return {
      temperature: 0,
      description: "Indisponible",
      location: locationName,
      alert: null,
      icon: "☁",
    };
  }
}

function weatherCodeToDescription(code: number): string {
  if (code === 0) return "Ciel degage";
  if (code <= 3) return "Partiellement nuageux";
  if (code <= 48) return "Brouillard";
  if (code <= 57) return "Bruine";
  if (code <= 67) return "Pluie";
  if (code <= 77) return "Neige";
  if (code <= 82) return "Averse";
  if (code <= 86) return "Averse de neige";
  if (code <= 99) return "Orage";
  return "Variable";
}

function weatherCodeToIcon(code: number): string {
  if (code === 0) return "☀";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫";
  if (code <= 67) return "🌧";
  if (code <= 77) return "🌨";
  if (code <= 86) return "❄";
  if (code <= 99) return "⛈";
  return "☁";
}
