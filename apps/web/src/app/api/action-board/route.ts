import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

interface ActionButton {
  label: string;
  action: string;
  variant: "primary" | "secondary" | "ghost";
}

interface ActionItem {
  id: string;
  type: "email" | "task" | "submission" | "plan" | "guarantee";
  priority: "critical" | "high" | "medium" | "info";
  title: string;
  subtitle: string;
  projectName: string | null;
  projectColor: string | null;
  entityId: string;
  createdAt: string;
  actions: ActionButton[];
}

/**
 * GET /api/action-board
 * Aggregates 5 data sources into a unified decision feed.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Get user profile + org
    const { data: profile } = await (admin as any)
      .from("users")
      .select("first_name, organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    const orgId = profile.organization_id;
    const now = new Date();
    const sevenDaysFromNow = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const thirtyDaysFromNow = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    const todayStr = now.toISOString().split("T")[0];

    // Build project map for the org (needed by multiple sources)
    let projectMap: Record<string, { name: string; color: string | null }> = {};
    try {
      const { data: projects } = await admin
        .from("projects")
        .select("id, name, color, status")
        .eq("organization_id", orgId)
        .not("status", "eq", "archived");
      if (projects) {
        for (const p of projects) {
          projectMap[p.id] = { name: p.name, color: p.color };
        }
      }
    } catch {
      // projects table missing — continue
    }

    const activeProjectIds = Object.keys(projectMap);

    // Fetch all 5 sources in parallel
    const [emailsResult, tasksResult, submissionsResult, planAlertsResult, guaranteesResult] =
      await Promise.all([
        // 1. Urgent + action_required emails
        fetchEmails(admin, user.id).catch(() => [] as ActionItem[]),

        // 2. Overdue + due_today tasks
        fetchTasks(admin, orgId, todayStr, activeProjectIds, projectMap).catch(
          () => [] as ActionItem[]
        ),

        // 3. Submissions with deadline < 7 days
        fetchSubmissions(
          admin,
          orgId,
          todayStr,
          sevenDaysFromNow,
          activeProjectIds,
          projectMap
        ).catch(() => [] as ActionItem[]),

        // 4. Plan alerts (versions obsoletes, pending approval)
        fetchPlanAlerts(admin, orgId, activeProjectIds, projectMap).catch(
          () => [] as ActionItem[]
        ),

        // 5. Guarantees expiring < 30 days
        fetchGuarantees(
          admin,
          orgId,
          todayStr,
          thirtyDaysFromNow,
          activeProjectIds,
          projectMap
        ).catch(() => [] as ActionItem[]),
      ]);

    // Merge and sort by priority
    const allItems: ActionItem[] = [
      ...emailsResult,
      ...tasksResult,
      ...submissionsResult,
      ...planAlertsResult,
      ...guaranteesResult,
    ];

    const priorityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      info: 3,
    };
    allItems.sort((a, b) => {
      const pDiff = (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
      if (pDiff !== 0) return pDiff;
      // Within same priority, sort by date desc
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Compute stats
    const urgent = allItems.filter(
      (i) => i.priority === "critical" || i.priority === "high"
    ).length;
    const thisWeek = allItems.filter(
      (i) => i.priority === "medium"
    ).length;
    const overdue = allItems.filter(
      (i) =>
        i.type === "task" &&
        i.priority === "critical"
    ).length;

    // Last sync
    let lastSyncAt: string | null = null;
    try {
      const { data: conn } = await (admin as any)
        .from("email_connections")
        .select("last_sync_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("last_sync_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (conn?.last_sync_at) lastSyncAt = conn.last_sync_at;
    } catch {
      // table might not exist
    }

    // Briefing summary
    let briefingSummary: string | null = null;
    try {
      const { data: briefing } = await (admin as any)
        .from("daily_briefings")
        .select("content")
        .eq("user_id", user.id)
        .eq("briefing_date", todayStr)
        .maybeSingle();
      if (briefing?.content?.summary) {
        briefingSummary = briefing.content.summary;
      }
    } catch {
      // table might not exist
    }

    return NextResponse.json({
      stats: {
        urgent,
        thisWeek,
        overdue,
        activeProjects: activeProjectIds.length,
      },
      items: allItems,
      lastSyncAt,
      briefingSummary,
    });
  } catch (err: any) {
    console.error("[action-board] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── Source 1: Emails ────────────────────────────────────────────────────────

async function fetchEmails(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<ActionItem[]> {
  const fortyEightHoursAgo = new Date(
    Date.now() - 48 * 60 * 60 * 1000
  ).toISOString();

  const { data: emails } = await (admin as any)
    .from("email_records")
    .select(
      "id, subject, sender_name, sender_email, received_at, classification, ai_summary, project_id"
    )
    .eq("user_id", userId)
    .eq("is_processed", false)
    .in("classification", ["action_required", "urgent"])
    .order("received_at", { ascending: false })
    .limit(30);

  if (!emails) return [];

  // Get project names for emails
  const projectIds = [
    ...new Set<string>(emails.map((e: any) => e.project_id).filter(Boolean)),
  ];
  let emailProjectMap: Record<
    string,
    { name: string; color: string | null }
  > = {};
  if (projectIds.length > 0) {
    const { data: projects } = await admin
      .from("projects")
      .select("id, name, color")
      .in("id", projectIds);
    if (projects) {
      for (const p of projects) {
        emailProjectMap[p.id] = { name: p.name, color: p.color };
      }
    }
  }

  return emails.map((email: any) => {
    const isUrgent =
      email.classification === "urgent" ||
      (email.classification === "action_required" &&
        email.received_at < fortyEightHoursAgo);

    const proj = email.project_id
      ? emailProjectMap[email.project_id]
      : null;

    return {
      id: `email-${email.id}`,
      type: "email" as const,
      priority: isUrgent ? ("critical" as const) : ("high" as const),
      title: email.subject || "(Sans objet)",
      subtitle: email.sender_name || email.sender_email || "",
      projectName: proj?.name || null,
      projectColor: proj?.color || null,
      entityId: email.id,
      createdAt: email.received_at,
      actions: [
        { label: "reply", action: "reply", variant: "primary" as const },
        { label: "archive", action: "archive", variant: "ghost" as const },
      ],
    };
  });
}

// ─── Source 2: Tasks ─────────────────────────────────────────────────────────

async function fetchTasks(
  admin: ReturnType<typeof createAdminClient>,
  _orgId: string,
  todayStr: string,
  activeProjectIds: string[],
  projectMap: Record<string, { name: string; color: string | null }>
): Promise<ActionItem[]> {
  if (activeProjectIds.length === 0) return [];

  // Overdue tasks
  const { data: overdueTasks } = await (admin as any)
    .from("tasks")
    .select("id, title, due_date, priority, project_id, created_at")
    .in("project_id", activeProjectIds)
    .in("status", ["todo", "in_progress", "waiting"])
    .lt("due_date", todayStr)
    .not("due_date", "is", null)
    .order("due_date", { ascending: true })
    .limit(20);

  // Due today
  const { data: todayTasks } = await (admin as any)
    .from("tasks")
    .select("id, title, due_date, priority, project_id, created_at")
    .in("project_id", activeProjectIds)
    .in("status", ["todo", "in_progress", "waiting"])
    .eq("due_date", todayStr)
    .order("priority", { ascending: true })
    .limit(20);

  // Due this week (next 7 days, excluding today and overdue)
  const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const { data: weekTasks } = await (admin as any)
    .from("tasks")
    .select("id, title, due_date, priority, project_id, created_at")
    .in("project_id", activeProjectIds)
    .in("status", ["todo", "in_progress", "waiting"])
    .gte("due_date", tomorrowStr)
    .lte("due_date", sevenDaysLater)
    .order("due_date", { ascending: true })
    .limit(20);

  const items: ActionItem[] = [];

  for (const task of overdueTasks || []) {
    const proj = projectMap[task.project_id];
    const daysOverdue = Math.ceil(
      (Date.now() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    items.push({
      id: `task-${task.id}`,
      type: "task",
      priority: "critical",
      title: task.title,
      subtitle: `${daysOverdue}j en retard`,
      projectName: proj?.name || null,
      projectColor: proj?.color || null,
      entityId: task.id,
      createdAt: task.created_at,
      actions: [
        { label: "mark_done", action: "mark_done", variant: "primary" },
        { label: "postpone", action: "postpone", variant: "secondary" },
        { label: "view", action: "view", variant: "ghost" },
      ],
    });
  }

  for (const task of todayTasks || []) {
    const proj = projectMap[task.project_id];
    items.push({
      id: `task-${task.id}`,
      type: "task",
      priority: "high",
      title: task.title,
      subtitle: "Aujourd'hui",
      projectName: proj?.name || null,
      projectColor: proj?.color || null,
      entityId: task.id,
      createdAt: task.created_at,
      actions: [
        { label: "mark_done", action: "mark_done", variant: "primary" },
        { label: "postpone", action: "postpone", variant: "secondary" },
        { label: "view", action: "view", variant: "ghost" },
      ],
    });
  }

  for (const task of weekTasks || []) {
    // Skip if already in today or overdue
    if (items.some((i) => i.entityId === task.id)) continue;
    const proj = projectMap[task.project_id];
    const daysUntil = Math.ceil(
      (new Date(task.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    items.push({
      id: `task-${task.id}`,
      type: "task",
      priority: "medium",
      title: task.title,
      subtitle: `Dans ${daysUntil}j`,
      projectName: proj?.name || null,
      projectColor: proj?.color || null,
      entityId: task.id,
      createdAt: task.created_at,
      actions: [
        { label: "mark_done", action: "mark_done", variant: "primary" },
        { label: "view", action: "view", variant: "ghost" },
      ],
    });
  }

  return items;
}

// ─── Source 3: Submissions ───────────────────────────────────────────────────

async function fetchSubmissions(
  admin: ReturnType<typeof createAdminClient>,
  _orgId: string,
  todayStr: string,
  sevenDaysFromNow: string,
  activeProjectIds: string[],
  projectMap: Record<string, { name: string; color: string | null }>
): Promise<ActionItem[]> {
  if (activeProjectIds.length === 0) return [];

  const { data: subs } = await (admin as any)
    .from("submissions")
    .select("id, title, reference, deadline, status, project_id, created_at")
    .in("project_id", activeProjectIds)
    .in("status", ["draft", "sent", "responses", "comparing"])
    .not("deadline", "is", null)
    .lte("deadline", sevenDaysFromNow)
    .gte("deadline", todayStr)
    .order("deadline", { ascending: true })
    .limit(20);

  if (!subs) return [];

  return subs.map((sub: any) => {
    const proj = projectMap[sub.project_id];
    const daysLeft = Math.ceil(
      (new Date(sub.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    const priority =
      daysLeft <= 3 ? ("high" as const) : ("medium" as const);

    return {
      id: `submission-${sub.id}`,
      type: "submission" as const,
      priority,
      title: sub.title || sub.reference || "Soumission",
      subtitle: `${daysLeft}j avant deadline`,
      projectName: proj?.name || null,
      projectColor: proj?.color || null,
      entityId: sub.id,
      createdAt: sub.created_at,
      actions: [
        { label: "view", action: "view", variant: "primary" as const },
        { label: "remind", action: "remind", variant: "secondary" as const },
      ],
    };
  });
}

// ─── Source 4: Plan alerts ───────────────────────────────────────────────────

async function fetchPlanAlerts(
  admin: ReturnType<typeof createAdminClient>,
  _orgId: string,
  activeProjectIds: string[],
  projectMap: Record<string, { name: string; color: string | null }>
): Promise<ActionItem[]> {
  if (activeProjectIds.length === 0) return [];

  // Plans with validation_status pending or outdated versions
  const { data: pendingVersions } = await (admin as any)
    .from("plan_versions")
    .select(
      "id, plan_id, version_code, validation_status, created_at, plan_registry!inner(project_id, plan_title, plan_number)"
    )
    .eq("validation_status", "pending")
    .in(
      "plan_registry.project_id",
      activeProjectIds
    )
    .order("created_at", { ascending: false })
    .limit(10);

  if (!pendingVersions) return [];

  return pendingVersions.map((v: any) => {
    const planReg = v.plan_registry;
    const proj = planReg?.project_id ? projectMap[planReg.project_id] : null;
    return {
      id: `plan-${v.id}`,
      type: "plan" as const,
      priority: "medium" as const,
      title: `${planReg?.plan_number || ""} ${planReg?.plan_title || "Plan"}`.trim(),
      subtitle: `Version ${v.version_code} en attente`,
      projectName: proj?.name || null,
      projectColor: proj?.color || null,
      entityId: v.plan_id,
      createdAt: v.created_at,
      actions: [
        { label: "view", action: "view", variant: "primary" as const },
      ],
    };
  });
}

// ─── Source 5: Guarantees ────────────────────────────────────────────────────

async function fetchGuarantees(
  admin: ReturnType<typeof createAdminClient>,
  _orgId: string,
  todayStr: string,
  thirtyDaysFromNow: string,
  activeProjectIds: string[],
  projectMap: Record<string, { name: string; color: string | null }>
): Promise<ActionItem[]> {
  if (activeProjectIds.length === 0) return [];

  let receptions: any[] = [];
  try {
    const { data } = await (admin as any)
      .from("project_receptions")
      .select(
        "id, project_id, reception_type, guarantee_2y_end, guarantee_5y_end, created_at"
      )
      .in("project_id", activeProjectIds);
    if (data) receptions = data;
  } catch {
    return [];
  }

  const items: ActionItem[] = [];

  for (const rec of receptions) {
    const proj = projectMap[rec.project_id];
    for (const field of ["guarantee_2y_end", "guarantee_5y_end"] as const) {
      const dateStr = rec[field];
      if (!dateStr) continue;
      if (dateStr >= todayStr && dateStr <= thirtyDaysFromNow) {
        const daysLeft = Math.ceil(
          (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        const isUrgent = daysLeft <= 7;
        const guaranteeType = field === "guarantee_2y_end" ? "2 ans" : "5 ans";
        items.push({
          id: `guarantee-${rec.id}-${field}`,
          type: "guarantee",
          priority: isUrgent ? "critical" : "medium",
          title: `Garantie ${guaranteeType} expire`,
          subtitle: `${daysLeft}j restants`,
          projectName: proj?.name || null,
          projectColor: proj?.color || null,
          entityId: rec.id,
          createdAt: rec.created_at,
          actions: [
            { label: "view", action: "view", variant: "primary" },
          ],
        });
      }
    }
  }

  return items;
}
