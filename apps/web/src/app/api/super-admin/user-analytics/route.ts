import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// GET /api/super-admin/user-analytics
// ============================================================
// Returns user activity analytics for the super-admin dashboard.
// Actions: overview, feature-usage, per-org, per-user, trends, adoption, user-journey
// Protected by superadmin access check.

type ActionType =
  | "overview"
  | "feature-usage"
  | "per-org"
  | "per-user"
  | "trends"
  | "adoption"
  | "user-journey";

function getPeriodDays(period: string): number {
  switch (period) {
    case "90d":
      return 90;
    case "30d":
      return 30;
    case "7d":
    default:
      return 7;
  }
}

function getStartDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}

export async function GET(request: NextRequest) {
  const check = await requireSuperadmin();
  if (!check.authorized) {
    return NextResponse.json(
      { error: check.error || "Forbidden" },
      { status: 403 }
    );
  }

  const { searchParams } = request.nextUrl;
  const action = (searchParams.get("action") || "overview") as ActionType;
  const period = searchParams.get("period") || "7d";
  const days = getPeriodDays(period);
  const startDate = getStartDate(days);

  const admin = createAdminClient();

  try {
    switch (action) {
      case "overview":
        return await handleOverview(admin, startDate, days);
      case "feature-usage":
        return await handleFeatureUsage(admin, startDate);
      case "per-org":
        return await handlePerOrg(admin, startDate);
      case "per-user":
        return await handlePerUser(admin, startDate);
      case "trends":
        return await handleTrends(admin, startDate);
      case "adoption":
        return await handleAdoption(admin, startDate);
      case "user-journey": {
        const userId = searchParams.get("user_id");
        if (!userId) {
          return NextResponse.json(
            { error: "user_id param required" },
            { status: 400 }
          );
        }
        return await handleUserJourney(admin, userId, startDate);
      }
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("[user-analytics] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

// ---- Action handlers ----

async function handleOverview(
  admin: AdminClient,
  startDate: string,
  days: number
) {
  // Fetch aggregated daily data
  const { data: dailyRows } = await (admin as any)
    .from("user_activity_daily")
    .select("user_id, page_views, feature_uses, total_duration_ms, session_count, stat_date")
    .gte("stat_date", startDate);

  const rows = dailyRows || [];

  // DAU: unique users per day, then average
  const dayUsers = new Map<string, Set<string>>();
  let totalPageViews = 0;
  let totalFeatureUses = 0;
  let totalDuration = 0;
  let totalSessions = 0;
  const allUsers = new Set<string>();

  for (const r of rows) {
    const day = r.stat_date;
    if (!dayUsers.has(day)) dayUsers.set(day, new Set());
    dayUsers.get(day)!.add(r.user_id);
    allUsers.add(r.user_id);
    totalPageViews += r.page_views || 0;
    totalFeatureUses += r.feature_uses || 0;
    totalDuration += Number(r.total_duration_ms) || 0;
    totalSessions += r.session_count || 0;
  }

  const dauValues = Array.from(dayUsers.values()).map((s) => s.size);
  const dau =
    dauValues.length > 0
      ? Math.round(dauValues.reduce((a, b) => a + b, 0) / dauValues.length)
      : 0;

  // WAU: unique users in last 7 days from the data
  const wauDate = getStartDate(7);
  const wauUsers = new Set<string>();
  for (const r of rows) {
    if (r.stat_date >= wauDate) wauUsers.add(r.user_id);
  }

  const avgSessionDuration =
    totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;
  const pagesPerSession =
    totalSessions > 0
      ? Math.round((totalPageViews / totalSessions) * 10) / 10
      : 0;

  return NextResponse.json({
    dau,
    wau: wauUsers.size,
    mau: allUsers.size,
    avg_session_duration_ms: avgSessionDuration,
    pages_per_session: pagesPerSession,
    total_events: totalPageViews + totalFeatureUses,
    total_page_views: totalPageViews,
    total_feature_uses: totalFeatureUses,
    period_days: days,
  });
}

async function handleFeatureUsage(admin: AdminClient, startDate: string) {
  const { data: dailyRows } = await (admin as any)
    .from("user_activity_daily")
    .select("feature, page_views, feature_uses, user_id")
    .gte("stat_date", startDate);

  const rows = dailyRows || [];

  const featureMap = new Map<
    string,
    { page_views: number; feature_uses: number; users: Set<string> }
  >();

  for (const r of rows) {
    const f = r.feature || "unknown";
    let bucket = featureMap.get(f);
    if (!bucket) {
      bucket = { page_views: 0, feature_uses: 0, users: new Set() };
      featureMap.set(f, bucket);
    }
    bucket.page_views += r.page_views || 0;
    bucket.feature_uses += r.feature_uses || 0;
    bucket.users.add(r.user_id);
  }

  const features = Array.from(featureMap.entries())
    .map(([feature, data]) => ({
      feature,
      page_views: data.page_views,
      feature_uses: data.feature_uses,
      unique_users: data.users.size,
    }))
    .sort((a, b) => b.page_views + b.feature_uses - (a.page_views + a.feature_uses));

  return NextResponse.json({ features });
}

async function handlePerOrg(admin: AdminClient, startDate: string) {
  const { data: dailyRows } = await (admin as any)
    .from("user_activity_daily")
    .select("organization_id, feature, page_views, feature_uses, user_id, stat_date")
    .gte("stat_date", startDate);

  const rows = dailyRows || [];

  // Fetch org names
  const orgIds = Array.from(
    new Set<string>(
      rows.filter((r: any) => r.organization_id).map((r: any) => r.organization_id)
    )
  );

  let orgNames: Record<string, { name: string; plan: string }> = {};
  if (orgIds.length > 0) {
    const { data: orgs } = await (admin as any)
      .from("organizations")
      .select("id, name, subscription_plan")
      .in("id", orgIds);
    if (orgs) {
      for (const o of orgs) {
        orgNames[o.id] = {
          name: o.name || "Unknown",
          plan: o.subscription_plan || "trial",
        };
      }
    }
  }

  // Group by org
  const orgMap = new Map<
    string,
    {
      total_events: number;
      users: Set<string>;
      features: Map<string, number>;
      last_date: string;
    }
  >();

  for (const r of rows) {
    const oid = r.organization_id || "none";
    let bucket = orgMap.get(oid);
    if (!bucket) {
      bucket = {
        total_events: 0,
        users: new Set(),
        features: new Map(),
        last_date: "",
      };
      orgMap.set(oid, bucket);
    }
    const evts = (r.page_views || 0) + (r.feature_uses || 0);
    bucket.total_events += evts;
    bucket.users.add(r.user_id);
    const feat = r.feature || "unknown";
    bucket.features.set(feat, (bucket.features.get(feat) || 0) + evts);
    if (r.stat_date > bucket.last_date) bucket.last_date = r.stat_date;
  }

  const orgs = Array.from(orgMap.entries())
    .map(([org_id, data]) => {
      let topFeature = "";
      let topCount = 0;
      for (const [f, c] of data.features) {
        if (c > topCount) {
          topFeature = f;
          topCount = c;
        }
      }
      const info = orgNames[org_id];
      return {
        org_id,
        org_name: info?.name || (org_id === "none" ? "No org" : org_id),
        plan: info?.plan || "unknown",
        active_users: data.users.size,
        top_feature: topFeature,
        total_events: data.total_events,
        last_active: data.last_date,
      };
    })
    .sort((a, b) => b.total_events - a.total_events);

  return NextResponse.json({ orgs });
}

async function handlePerUser(admin: AdminClient, startDate: string) {
  const { data: dailyRows } = await (admin as any)
    .from("user_activity_daily")
    .select("user_id, organization_id, feature, page_views, feature_uses, stat_date")
    .gte("stat_date", startDate);

  const rows = dailyRows || [];

  // Group by user
  const userMap = new Map<
    string,
    {
      org_id: string | null;
      total_events: number;
      features: Map<string, number>;
      last_date: string;
    }
  >();

  for (const r of rows) {
    let bucket = userMap.get(r.user_id);
    if (!bucket) {
      bucket = {
        org_id: r.organization_id,
        total_events: 0,
        features: new Map(),
        last_date: "",
      };
      userMap.set(r.user_id, bucket);
    }
    const evts = (r.page_views || 0) + (r.feature_uses || 0);
    bucket.total_events += evts;
    const feat = r.feature || "unknown";
    bucket.features.set(feat, (bucket.features.get(feat) || 0) + evts);
    if (r.stat_date > bucket.last_date) bucket.last_date = r.stat_date;
  }

  // Fetch user details
  const userIds = Array.from(userMap.keys());
  let userDetails: Record<
    string,
    { name: string; email: string; org_name: string }
  > = {};
  if (userIds.length > 0) {
    const { data: users } = await (admin as any)
      .from("users")
      .select("id, first_name, last_name, email, organization_id")
      .in("id", userIds.slice(0, 200));

    const orgIdsNeeded = new Set<string>();
    if (users) {
      for (const u of users) {
        if (u.organization_id) orgIdsNeeded.add(u.organization_id);
      }
    }

    let orgLookup: Record<string, string> = {};
    if (orgIdsNeeded.size > 0) {
      const { data: orgs } = await (admin as any)
        .from("organizations")
        .select("id, name")
        .in("id", Array.from(orgIdsNeeded));
      if (orgs) {
        for (const o of orgs) orgLookup[o.id] = o.name || "Unknown";
      }
    }

    if (users) {
      for (const u of users) {
        userDetails[u.id] = {
          name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email,
          email: u.email,
          org_name: u.organization_id
            ? orgLookup[u.organization_id] || "Unknown"
            : "No org",
        };
      }
    }
  }

  const result = Array.from(userMap.entries())
    .map(([user_id, data]) => {
      let topFeature = "";
      let topCount = 0;
      for (const [f, c] of data.features) {
        if (c > topCount) {
          topFeature = f;
          topCount = c;
        }
      }
      const details = userDetails[user_id];
      return {
        user_id,
        name: details?.name || user_id,
        email: details?.email || "",
        org: details?.org_name || "Unknown",
        total_events: data.total_events,
        top_feature: topFeature,
        last_active: data.last_date,
      };
    })
    .sort((a, b) => b.total_events - a.total_events);

  return NextResponse.json({ users: result });
}

async function handleTrends(admin: AdminClient, startDate: string) {
  const { data: dailyRows } = await (admin as any)
    .from("user_activity_daily")
    .select("stat_date, user_id, page_views, feature_uses")
    .gte("stat_date", startDate)
    .order("stat_date", { ascending: true });

  const rows = dailyRows || [];

  const dayMap = new Map<
    string,
    { users: Set<string>; page_views: number; feature_uses: number }
  >();

  for (const r of rows) {
    let bucket = dayMap.get(r.stat_date);
    if (!bucket) {
      bucket = { users: new Set(), page_views: 0, feature_uses: 0 };
      dayMap.set(r.stat_date, bucket);
    }
    bucket.users.add(r.user_id);
    bucket.page_views += r.page_views || 0;
    bucket.feature_uses += r.feature_uses || 0;
  }

  const trends = Array.from(dayMap.entries()).map(([date, data]) => ({
    date,
    dau: data.users.size,
    page_views: data.page_views,
    feature_uses: data.feature_uses,
  }));

  return NextResponse.json({ trends });
}

async function handleAdoption(admin: AdminClient, startDate: string) {
  // Get feature usage
  const { data: dailyRows } = await (admin as any)
    .from("user_activity_daily")
    .select("feature, user_id")
    .gte("stat_date", startDate);

  const rows = dailyRows || [];

  const featureUsers = new Map<string, Set<string>>();
  const allUsers = new Set<string>();

  for (const r of rows) {
    allUsers.add(r.user_id);
    const f = r.feature || "unknown";
    if (!featureUsers.has(f)) featureUsers.set(f, new Set());
    featureUsers.get(f)!.add(r.user_id);
  }

  // Get total users in platform
  const { count: totalUsersCount } = await (admin as any)
    .from("users")
    .select("id", { count: "exact", head: true });

  const totalUsers = totalUsersCount || allUsers.size || 1;

  const adoption = Array.from(featureUsers.entries())
    .map(([feature, users]) => ({
      feature,
      users_used: users.size,
      total_users: totalUsers,
      pct: Math.round((users.size / totalUsers) * 1000) / 10,
    }))
    .sort((a, b) => b.pct - a.pct);

  return NextResponse.json({ adoption });
}

async function handleUserJourney(
  admin: AdminClient,
  userId: string,
  startDate: string
) {
  // Get raw events for this user grouped by session
  const { data: events } = await (admin as any)
    .from("usage_events")
    .select(
      "id, event_type, page, feature, action, metadata, session_id, duration_ms, referrer_page, created_at"
    )
    .eq("user_id", userId)
    .gte("created_at", `${startDate}T00:00:00Z`)
    .order("created_at", { ascending: true })
    .limit(500);

  const rows = events || [];

  // Group by session
  const sessionMap = new Map<
    string,
    Array<{
      event_type: string;
      page: string | null;
      feature: string | null;
      action: string | null;
      metadata: Record<string, unknown> | null;
      duration_ms: number | null;
      created_at: string;
    }>
  >();

  for (const evt of rows) {
    const sid = evt.session_id || "unknown";
    if (!sessionMap.has(sid)) sessionMap.set(sid, []);
    sessionMap.get(sid)!.push({
      event_type: evt.event_type,
      page: evt.page,
      feature: evt.feature,
      action: evt.action,
      metadata: evt.metadata,
      duration_ms: evt.duration_ms,
      created_at: evt.created_at,
    });
  }

  const sessions = Array.from(sessionMap.entries()).map(
    ([session_id, evts]) => ({
      session_id,
      event_count: evts.length,
      started_at: evts[0]?.created_at,
      events: evts,
    })
  );

  return NextResponse.json({ user_id: userId, sessions });
}
