import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import crypto from "crypto";

/**
 * Helper: verify the current user is a super-admin.
 * Returns { userId, admin } or a 403 response.
 */
async function verifySuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const admin = createAdminClient();
  const { data: userData } = await (admin.from("users") as any)
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (!userData?.is_superadmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { userId: user.id, admin };
}

const RESERVED_SUBDOMAINS = [
  "www", "app", "api", "admin", "super-admin", "superadmin",
  "mail", "smtp", "ftp", "dev", "staging", "test", "demo",
  "help", "support", "docs", "status", "blog", "cdn", "static",
  "assets", "media", "img", "images", "ns1", "ns2",
];

/**
 * GET /api/super-admin?action=list-organizations
 * GET /api/super-admin?action=check-subdomain&subdomain=xxx
 * GET /api/super-admin?action=get-organization&id=xxx
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");

  const result = await verifySuperAdmin();
  if ("error" in result) return result.error;
  const { userId, admin } = result;

  if (action === "check-access") {
    const { data } = await (admin.from("users") as any)
      .select("first_name, last_name")
      .eq("id", userId)
      .maybeSingle();
    return NextResponse.json({
      authorized: true,
      userName: data ? `${data.first_name} ${data.last_name}` : "",
    });
  }

  if (action === "list-organizations") {
    const { data, error } = await (admin.from("organizations") as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich with member count and project count
    const orgIds = (data || []).map((o: { id: string }) => o.id);
    const [membersRes, projectsRes] = await Promise.all([
      (admin.from("users") as any)
        .select("organization_id")
        .in("organization_id", orgIds),
      (admin.from("projects") as any)
        .select("organization_id")
        .in("organization_id", orgIds),
    ]);

    const memberCounts: Record<string, number> = {};
    const projectCounts: Record<string, number> = {};
    (membersRes.data || []).forEach((m: { organization_id: string }) => {
      memberCounts[m.organization_id] = (memberCounts[m.organization_id] || 0) + 1;
    });
    (projectsRes.data || []).forEach((p: { organization_id: string }) => {
      projectCounts[p.organization_id] = (projectCounts[p.organization_id] || 0) + 1;
    });

    const enriched = (data || []).map((org: Record<string, unknown>) => ({
      ...org,
      member_count: memberCounts[org.id as string] || 0,
      project_count: projectCounts[org.id as string] || 0,
    }));

    return NextResponse.json({ organizations: enriched });
  }

  if (action === "check-subdomain") {
    const subdomain = searchParams.get("subdomain")?.toLowerCase().trim();
    if (!subdomain) return NextResponse.json({ error: "Missing subdomain" }, { status: 400 });

    // Check format
    if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(subdomain)) {
      return NextResponse.json({ available: false, reason: "invalid_format" });
    }

    // Check reserved
    if (RESERVED_SUBDOMAINS.includes(subdomain)) {
      return NextResponse.json({ available: false, reason: "reserved" });
    }

    // Check DB
    const { data } = await (admin.from("organizations") as any)
      .select("id")
      .eq("subdomain", subdomain)
      .maybeSingle();

    return NextResponse.json({ available: !data, reason: data ? "taken" : null });
  }

  if (action === "get-organization") {
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data, error } = await (admin.from("organizations") as any)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 404 });

    // Get members
    const { data: members } = await (admin.from("users") as any)
      .select("id, first_name, last_name, email, role, is_active, last_sync_at, created_at")
      .eq("organization_id", id);

    // Get invites
    const { data: invites } = await (admin.from("organization_invites") as any)
      .select("*")
      .eq("organization_id", id)
      .order("created_at", { ascending: false });

    // Get project count
    const { count: projectCount } = await (admin.from("projects") as any)
      .select("id", { count: "exact" })
      .eq("organization_id", id);

    return NextResponse.json({
      organization: data,
      members: members || [],
      invites: invites || [],
      projectCount: projectCount || 0,
    });
  }

  // ── All users cross-org ──
  if (action === "all-users") {
    const { data: users } = await (admin as any)
      .from("users")
      .select("id, email, first_name, last_name, role, organization_id, created_at, last_sync_at")
      .order("created_at", { ascending: false });

    const orgIds = [...new Set((users || []).map((u: any) => u.organization_id).filter(Boolean))];
    const { data: orgs } = orgIds.length > 0
      ? await (admin as any).from("organizations").select("id, name").in("id", orgIds)
      : { data: [] };
    const orgMap = new Map((orgs || []).map((o: any) => [o.id, o.name]));

    return NextResponse.json({
      users: (users || []).map((u: any) => ({
        ...u,
        org_name: orgMap.get(u.organization_id) || null,
      })),
    });
  }

  // ── Platform metrics ──
  if (action === "platform-metrics") {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [users, orgs, emails, pvs, tasks, suppliers, offers, plans, ingestedPlans, orgsList] = await Promise.all([
      (admin as any).from("users").select("id", { count: "exact", head: true }),
      (admin as any).from("organizations").select("id", { count: "exact", head: true }),
      (admin as any).from("email_records").select("id", { count: "exact", head: true }),
      (admin as any).from("meetings").select("id", { count: "exact", head: true }),
      (admin as any).from("tasks").select("id", { count: "exact", head: true }),
      (admin as any).from("suppliers").select("id", { count: "exact", head: true }),
      (admin as any).from("supplier_offers").select("id", { count: "exact", head: true }),
      (admin as any).from("plan_registry").select("id", { count: "exact", head: true }),
      (admin as any).from("ingested_plan_quantities").select("source_file"),
      (admin as any).from("organizations").select("subscription_plan, plan"),
    ]);

    // Count distinct source_file from ingested_plan_quantities
    const distinctIngestedFiles = new Set(
      (ingestedPlans.data || []).map((r: { source_file: string }) => r.source_file)
    ).size;

    // AI calls this month (try/catch if table absent)
    let aiCallsThisMonth = 0;
    let aiCostThisMonth = 0;
    try {
      const { data: aiData } = await (admin as any)
        .from("api_usage_logs")
        .select("estimated_cost_chf")
        .gte("created_at", monthStart.toISOString());
      if (aiData) {
        aiCallsThisMonth = aiData.length;
        aiCostThisMonth = aiData.reduce((sum: number, r: { estimated_cost_chf: number }) =>
          sum + (Number(r.estimated_cost_chf) || 0), 0);
      }
    } catch { /* table may not exist */ }

    // MRR calculation from org plans
    const PLAN_PRICES: Record<string, number> = { trial: 0, starter: 149, pro: 349, enterprise: 790 };
    let mrr = 0;
    for (const o of (orgsList.data || [])) {
      const plan = o.plan || o.subscription_plan || "trial";
      mrr += PLAN_PRICES[plan] || 0;
    }

    // Storage usage across all buckets
    let storageTotalBytes = 0;
    const STORAGE_BUCKETS = ["plans", "audio", "submissions", "organization-assets", "meeting-audio", "email-archives"];
    for (const bucket of STORAGE_BUCKETS) {
      try {
        // List root-level folders/files
        const { data: rootItems } = await admin.storage.from(bucket).list("", { limit: 1000 });
        if (!rootItems) continue;
        for (const item of rootItems) {
          if (item.metadata?.size) {
            storageTotalBytes += Number(item.metadata.size) || 0;
          } else if (item.id === null) {
            // It's a folder — list its contents
            const { data: subItems } = await admin.storage.from(bucket).list(item.name, { limit: 1000 });
            if (subItems) {
              for (const sub of subItems) {
                storageTotalBytes += Number(sub.metadata?.size) || 0;
              }
            }
          }
        }
      } catch { /* bucket may not exist */ }
    }
    const storageGb = storageTotalBytes / (1024 * 1024 * 1024);

    return NextResponse.json({
      metrics: {
        totalUsers: users.count || 0,
        totalOrgs: orgs.count || 0,
        totalEmails: emails.count || 0,
        totalPlans: (plans.count || 0) + distinctIngestedFiles,
        totalPlanUploaded: plans.count || 0,
        totalPlanIngested: distinctIngestedFiles,
        totalPvs: pvs.count || 0,
        totalTasks: tasks.count || 0,
        totalSuppliers: suppliers.count || 0,
        totalOffers: offers.count || 0,
        aiCallsThisMonth,
        aiCostThisMonth: Math.round(aiCostThisMonth * 100) / 100,
        mrr,
        storageGb: Math.round(storageGb * 100) / 100,
      },
    });
  }

  // ── Recent Activity ──
  if (action === "recent-activity") {
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);
    const activities: any[] = [];

    // Fetch org + user lookups
    const [orgsRes, usersRes] = await Promise.all([
      (admin as any).from("organizations").select("id, name"),
      (admin as any).from("users").select("id, first_name, last_name, organization_id"),
    ]);
    const orgMap = new Map<string, string>((orgsRes.data || []).map((o: any) => [o.id, o.name]));
    const userMap = new Map<string, { id: string; first_name: string; last_name: string; organization_id: string }>(
      (usersRes.data || []).map((u: any) => [u.id, u])
    );

    // 1. Recent AI calls from api_usage_logs
    try {
      const { data: aiLogs } = await (admin as any)
        .from("api_usage_logs")
        .select("id, user_id, organization_id, action_type, estimated_cost_chf, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      for (const log of (aiLogs || [])) {
        const user = userMap.get(log.user_id);
        const ACTION_LABELS: Record<string, string> = {
          email_classify: "Classification email IA",
          email_reply: "Réponse email IA",
          email_summary: "Résumé email IA",
          task_extract: "Extraction tâches IA",
          reclassify: "Reclassification batch",
          plan_analyze: "Analyse plan IA",
          chat_message: "Message chat IA",
          price_extract: "Extraction prix IA",
          price_estimate: "Estimation prix IA",
          supplier_enrichment: "Enrichissement fournisseur IA",
          supplier_search: "Recherche fournisseur IA",
          pv_generate: "Génération PV IA",
          pv_transcribe: "Transcription audio",
          submission_parse: "Analyse soumission IA",
        };
        activities.push({
          id: `ai-${log.id}`,
          type: "ai",
          orgName: orgMap.get(log.organization_id) || "—",
          userName: user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : "—",
          description: ACTION_LABELS[log.action_type] || log.action_type.replace(/_/g, " "),
          time: log.created_at,
          icon: "ai",
        });
      }
    } catch { /* table may not exist */ }

    // 2. Recent emails synced
    try {
      const { data: emails } = await (admin as any)
        .from("email_records")
        .select("id, user_id, subject, created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, 10));

      for (const email of (emails || [])) {
        const user = userMap.get(email.user_id);
        const orgId = user?.organization_id;
        activities.push({
          id: `email-${email.id}`,
          type: "email",
          orgName: orgId ? (orgMap.get(orgId) || "—") : "—",
          userName: user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : "—",
          description: `Email sync: ${(email.subject || "").slice(0, 50)}${(email.subject || "").length > 50 ? "..." : ""}`,
          time: email.created_at,
          icon: "email",
        });
      }
    } catch { /* table may not exist */ }

    // 3. Recent tasks created
    try {
      const { data: tasks } = await (admin as any)
        .from("tasks")
        .select("id, created_by, title, project_id, created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, 10));

      for (const task of (tasks || [])) {
        const user = userMap.get(task.created_by);
        const orgId = user?.organization_id;
        activities.push({
          id: `task-${task.id}`,
          type: "task",
          orgName: orgId ? (orgMap.get(orgId) || "—") : "—",
          userName: user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : "—",
          description: `Tâche créée: ${(task.title || "").slice(0, 50)}`,
          time: task.created_at,
          icon: "project",
        });
      }
    } catch { /* table may not exist */ }

    // 4. Recent projects created
    try {
      const { data: projects } = await (admin as any)
        .from("projects")
        .select("id, name, organization_id, created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, 5));

      for (const proj of (projects || [])) {
        activities.push({
          id: `proj-${proj.id}`,
          type: "project",
          orgName: orgMap.get(proj.organization_id) || "—",
          userName: "—",
          description: `Projet créé: ${proj.name}`,
          time: proj.created_at,
          icon: "project",
        });
      }
    } catch { /* table may not exist */ }

    // Sort by time desc, take top N
    activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    return NextResponse.json({ activities: activities.slice(0, limit) });
  }

  // ── Analytics ──
  if (action === "analytics") {
    const scope = searchParams.get("scope") || "platform";
    const orgId = searchParams.get("org_id");
    const period = searchParams.get("period") || "30d";

    const daysMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
    const days = daysMap[period] || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    try {
      // Fetch usage logs
      let query = (admin as any)
        .from("api_usage_logs")
        .select("action_type, api_provider, model, estimated_cost_chf, user_id, organization_id, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true });

      if (scope === "org" && orgId) {
        query = query.eq("organization_id", orgId);
      }

      const { data: logs, error: logsErr } = await query;
      if (logsErr) throw logsErr;
      const rows = logs || [];

      // Overview
      const totalCost = rows.reduce((s: number, r: any) => s + (Number(r.estimated_cost_chf) || 0), 0);
      const totalCalls = rows.length;
      const avgCostPerCall = totalCalls > 0 ? totalCost / totalCalls : 0;
      const projectedMonthly = days > 0 ? (totalCost / days) * 30 : 0;

      // Per action
      const actionMap = new Map<string, { calls: number; cost: number }>();
      for (const r of rows) {
        const key = r.action_type || "unknown";
        const entry = actionMap.get(key) || { calls: 0, cost: 0 };
        entry.calls++;
        entry.cost += Number(r.estimated_cost_chf) || 0;
        actionMap.set(key, entry);
      }
      const perAction = [...actionMap.entries()]
        .map(([action_type, v]) => ({ action_type, ...v }))
        .sort((a, b) => b.cost - a.cost);

      // Per org
      const orgMap = new Map<string, { calls: number; cost: number }>();
      for (const r of rows) {
        if (!r.organization_id) continue;
        const entry = orgMap.get(r.organization_id) || { calls: 0, cost: 0 };
        entry.calls++;
        entry.cost += Number(r.estimated_cost_chf) || 0;
        orgMap.set(r.organization_id, entry);
      }

      // Enrich orgs
      const orgIds = [...orgMap.keys()];
      let orgsData: any[] = [];
      let memberCountMap = new Map<string, number>();
      if (orgIds.length > 0) {
        const { data: orgsRaw } = await (admin as any)
          .from("organizations")
          .select("id, name, subscription_plan, plan")
          .in("id", orgIds);
        orgsData = orgsRaw || [];

        const { data: membersRaw } = await (admin as any)
          .from("users")
          .select("organization_id")
          .in("organization_id", orgIds);
        for (const m of (membersRaw || [])) {
          memberCountMap.set(m.organization_id, (memberCountMap.get(m.organization_id) || 0) + 1);
        }
      }
      const orgLookup = new Map(orgsData.map((o: any) => [o.id, o]));
      const PLAN_PRICES: Record<string, number> = { trial: 0, starter: 149, pro: 349, enterprise: 790 };

      const perOrg = orgIds.map((oid) => {
        const stats = orgMap.get(oid)!;
        const orgInfo = orgLookup.get(oid);
        const plan = orgInfo?.plan || orgInfo?.subscription_plan || "trial";
        const revenueMonthly = PLAN_PRICES[plan] || 0;
        const costMonthly = days > 0 ? (stats.cost / days) * 30 : 0;
        return {
          org_id: oid,
          org_name: orgInfo?.name || oid.slice(0, 8),
          plan,
          member_count: memberCountMap.get(oid) || 0,
          calls: stats.calls,
          cost: Math.round(stats.cost * 100) / 100,
          revenue_monthly: revenueMonthly,
          profit: Math.round((revenueMonthly - costMonthly) * 100) / 100,
        };
      }).sort((a, b) => b.cost - a.cost);

      // Per user
      const userMap = new Map<string, { calls: number; cost: number; org_id: string }>();
      for (const r of rows) {
        if (!r.user_id) continue;
        const entry = userMap.get(r.user_id) || { calls: 0, cost: 0, org_id: r.organization_id || "" };
        entry.calls++;
        entry.cost += Number(r.estimated_cost_chf) || 0;
        userMap.set(r.user_id, entry);
      }
      const userIds = [...userMap.keys()];
      let usersData: any[] = [];
      if (userIds.length > 0) {
        const { data: usersRaw } = await (admin as any)
          .from("users")
          .select("id, first_name, last_name, email, organization_id")
          .in("id", userIds);
        usersData = usersRaw || [];
      }
      const userLookup = new Map(usersData.map((u: any) => [u.id, u]));

      const perUser = userIds.map((uid) => {
        const stats = userMap.get(uid)!;
        const uInfo = userLookup.get(uid);
        const orgInfo = orgLookup.get(uInfo?.organization_id || stats.org_id);
        return {
          user_id: uid,
          name: uInfo ? `${uInfo.first_name || ""} ${uInfo.last_name || ""}`.trim() : uid.slice(0, 8),
          email: uInfo?.email || "",
          org_name: orgInfo?.name || "",
          calls: stats.calls,
          cost: Math.round(stats.cost * 100) / 100,
        };
      }).sort((a, b) => b.cost - a.cost);

      // Daily trend
      const dailyMap = new Map<string, { calls: number; cost: number }>();
      for (const r of rows) {
        const day = r.created_at.slice(0, 10);
        const entry = dailyMap.get(day) || { calls: 0, cost: 0 };
        entry.calls++;
        entry.cost += Number(r.estimated_cost_chf) || 0;
        dailyMap.set(day, entry);
      }
      const dailyTrend = [...dailyMap.entries()]
        .map(([date, v]) => ({ date, calls: v.calls, cost: Math.round(v.cost * 100) / 100 }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Hourly distribution
      const hourlyArr = Array.from({ length: 24 }, (_, i) => ({ hour: i, calls: 0 }));
      for (const r of rows) {
        const h = new Date(r.created_at).getHours();
        hourlyArr[h].calls++;
      }

      // Day-of-week distribution
      const DOW_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
      const dowArr = Array.from({ length: 7 }, (_, i) => ({ day: DOW_NAMES[i], calls: 0 }));
      for (const r of rows) {
        const d = new Date(r.created_at).getDay();
        dowArr[d].calls++;
      }

      return NextResponse.json({
        overview: {
          total_cost_chf: Math.round(totalCost * 100) / 100,
          total_calls: totalCalls,
          avg_cost_per_call: Math.round(avgCostPerCall * 10000) / 10000,
          projected_monthly: Math.round(projectedMonthly * 100) / 100,
        },
        per_action: perAction,
        per_org: perOrg,
        per_user: perUser,
        daily_trend: dailyTrend,
        hourly_distribution: hourlyArr,
        dow_distribution: dowArr,
      });
    } catch (err) {
      console.warn("[super-admin] analytics query failed (table may not exist):", err);
      return NextResponse.json({
        overview: { total_cost_chf: 0, total_calls: 0, avg_cost_per_call: 0, projected_monthly: 0 },
        per_action: [],
        per_org: [],
        per_user: [],
        daily_trend: [],
        hourly_distribution: Array.from({ length: 24 }, (_, i) => ({ hour: i, calls: 0 })),
        dow_distribution: ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map(d => ({ day: d, calls: 0 })),
      });
    }
  }

  // ── Platform config ──
  if (action === "platform-config") {
    return NextResponse.json({
      config: {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        hasCronSecret: !!process.env.CRON_SECRET,
        hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
        nodeEnv: process.env.NODE_ENV || "development",
        vercelEnv: process.env.VERCEL_ENV || "local",
      },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/**
 * POST /api/super-admin
 * body.action: "create-organization" | "update-organization" | "suspend-organization" | "delete-organization" | "send-invite"
 */
export async function POST(request: NextRequest) {
  const result = await verifySuperAdmin();
  if ("error" in result) return result.error;
  const { userId, admin } = result;

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const validationError = validateRequired(body, ["action"]);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { action } = body;

  if (action === "create-organization") {
    const {
      name, display_name, address, city, country, phone, website,
      subdomain, plan, max_users, max_projects, branding, notes,
      invite_email, invite_first_name, invite_last_name, invite_job_title, invite_message,
    } = body;

    // Validate required
    if (!name || !subdomain) {
      return NextResponse.json({ error: "Name and subdomain are required" }, { status: 400 });
    }

    // Validate subdomain
    if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(subdomain)) {
      return NextResponse.json({ error: "Invalid subdomain format" }, { status: 400 });
    }
    if (RESERVED_SUBDOMAINS.includes(subdomain)) {
      return NextResponse.json({ error: "Subdomain is reserved" }, { status: 400 });
    }

    // Check subdomain availability
    const { data: existing } = await (admin.from("organizations") as any)
      .select("id").eq("subdomain", subdomain).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Subdomain already taken" }, { status: 409 });
    }

    // Determine status and subscription plan
    const orgStatus = plan === "trial" ? "trial" : "active";
    const subscriptionPlan = plan || "trial";
    const trialEndsAt = plan === "trial"
      ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Create organization — build payload with only safe columns
    // Some columns may not exist in all environments (display_name, phone, website, branding, notes, created_by)
    const orgPayload: Record<string, unknown> = {
      name,
      address: address || null,
      city: city || "",
      country: country || "CH",
      subdomain,
      subscription_plan: subscriptionPlan,
      max_users: max_users || 5,
      max_projects: max_projects || 10,
      trial_ends_at: trialEndsAt,
    };
    // Add optional columns that may exist depending on migrations applied
    if (display_name) orgPayload.display_name = display_name;
    if (phone) orgPayload.phone = phone;
    if (website) orgPayload.website = website;
    if (notes) orgPayload.notes = notes;
    // status and plan columns added by migration 056
    orgPayload.status = orgStatus;
    orgPayload.plan = subscriptionPlan;

    const { data: org, error: orgError } = await (admin.from("organizations") as any)
      .insert(orgPayload)
      .select()
      .single();

    if (orgError) {
      console.error("[super-admin] Create org error:", orgError);
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    // Create invite for first admin if email provided
    let invite = null;
    if (invite_email) {
      try {
        const token = crypto.randomBytes(32).toString("hex");
        const { data: inviteData, error: inviteError } = await (admin.from("organization_invites") as any)
          .insert({
            organization_id: org.id,
            email: invite_email,
            first_name: invite_first_name || null,
            last_name: invite_last_name || null,
            role: "admin",
            job_title: invite_job_title || null,
            token,
            message: invite_message || null,
            invited_by: userId,
          })
          .select()
          .single();

        if (inviteError) {
          console.error("[super-admin] Create invite error:", inviteError);
        } else {
          invite = inviteData;

          // Send invite email via Resend (fire-and-forget)
          if (process.env.RESEND_API_KEY) {
            const { sendInviteEmail } = await import("@cantaia/core/emails/invite");
            sendInviteEmail({
              resendApiKey: process.env.RESEND_API_KEY,
              inviteeEmail: invite_email,
              inviterName: "Cantaia Admin",
              organizationName: name,
              subdomain,
              role: "admin",
              message: invite_message,
              token,
              locale: "fr",
            }).catch((err: unknown) => console.error("[invite-email]", err));
          }
        }
      } catch (inviteErr) {
        // organization_invites table may not exist — org is still created successfully
        console.warn("[super-admin] Invite creation failed (table may not exist):", inviteErr);
      }
    }

    return NextResponse.json({ organization: org, invite });
  }

  if (action === "update-organization") {
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Remove action from updates
    delete updates.action;

    const { data, error } = await (admin.from("organizations") as any)
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ organization: data });
  }

  if (action === "suspend-organization") {
    const { id } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data, error } = await (admin.from("organizations") as any)
      .update({ status: "suspended" })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ organization: data });
  }

  if (action === "unsuspend-organization") {
    const { id } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data, error } = await (admin.from("organizations") as any)
      .update({ status: "active" })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ organization: data });
  }

  if (action === "delete-organization") {
    const { id, confirm_name } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Verify name matches
    const { data: org } = await (admin.from("organizations") as any)
      .select("name").eq("id", id).maybeSingle();

    if (!org || org.name !== confirm_name) {
      return NextResponse.json({ error: "Organization name does not match" }, { status: 400 });
    }

    const { error } = await (admin.from("organizations") as any)
      .delete()
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
  }

  if (action === "send-invite") {
    const { organization_id, email, first_name, last_name, role, job_title, message } = body;
    if (!organization_id || !email) {
      return NextResponse.json({ error: "organization_id and email required" }, { status: 400 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const { data, error } = await (admin.from("organization_invites") as any)
      .insert({
        organization_id,
        email,
        first_name: first_name || null,
        last_name: last_name || null,
        role: role || "member",
        job_title: job_title || null,
        token,
        message: message || null,
        invited_by: userId,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Send invite email via Resend (fire-and-forget)
    if (process.env.RESEND_API_KEY) {
      // Fetch inviter profile and org info for the email
      const { data: userProfile } = await (admin.from("users") as any)
        .select("first_name, last_name, preferred_language")
        .eq("id", userId)
        .maybeSingle();
      const { data: org } = await (admin.from("organizations") as any)
        .select("name, subdomain")
        .eq("id", organization_id)
        .maybeSingle();

      const { sendInviteEmail } = await import("@cantaia/core/emails/invite");
      sendInviteEmail({
        resendApiKey: process.env.RESEND_API_KEY,
        inviteeEmail: email,
        inviterName: userProfile?.first_name ? `${userProfile.first_name} ${userProfile.last_name || ""}`.trim() : "Admin",
        organizationName: org?.name || "Organisation",
        subdomain: org?.subdomain,
        role: role || "member",
        message: message,
        token,
        locale: userProfile?.preferred_language || "fr",
      }).catch((err: unknown) => console.error("[invite-email]", err));
    }

    return NextResponse.json({ invite: data });
  }

  if (action === "cancel-invite") {
    const { invite_id } = body;
    if (!invite_id) return NextResponse.json({ error: "Missing invite_id" }, { status: 400 });

    const { error } = await (admin.from("organization_invites") as any)
      .update({ status: "cancelled" })
      .eq("id", invite_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ cancelled: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
