import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Helper: verify the current user is a super-admin.
 */
async function verifySuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };

  const admin = createAdminClient();
  const { data: userData } = await (admin.from("users") as any)
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (!userData?.is_superadmin) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { userId: user.id, admin };
}

const C2_TABLES = [
  { table: "market_benchmarks", label: "Prix marché" },
  { table: "supplier_market_scores", label: "Scores fournisseurs" },
  { table: "project_benchmarks", label: "Benchmarks projets" },
  { table: "pv_quality_benchmarks", label: "Qualité PV" },
  { table: "task_benchmarks", label: "Benchmarks tâches" },
  { table: "visit_benchmarks", label: "Benchmarks visites" },
  { table: "email_benchmarks", label: "Benchmarks email" },
  { table: "chat_analytics", label: "Analytique chat" },
  { table: "regional_price_index", label: "Indice prix régional" },
  { table: "material_correlations", label: "Corrélations matériaux" },
  { table: "normalization_rules", label: "Règles normalisation" },
];

const CONSENT_MODULES = [
  "prix",
  "fournisseurs",
  "plans",
  "pv",
  "visites",
  "chat",
  "mail",
  "taches",
  "briefing",
];

/**
 * GET /api/super-admin/data-intelligence?action=pipeline-status|consent-overview|c2-coverage|c3-quality
 */
export async function GET(request: NextRequest) {
  const result = await verifySuperAdmin();
  if ("error" in result) return result.error;
  const { admin } = result;

  const action = request.nextUrl.searchParams.get("action");

  try {
    switch (action) {
      case "pipeline-status":
        return NextResponse.json(await getPipelineStatus(admin));
      case "consent-overview":
        return NextResponse.json(await getConsentOverview(admin));
      case "c2-coverage":
        return NextResponse.json(await getC2Coverage(admin));
      case "c3-quality":
        return NextResponse.json(await getC3Quality(admin));
      default:
        return NextResponse.json(
          { error: "Invalid action. Use: pipeline-status, consent-overview, c2-coverage, c3-quality" },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    console.error("[super-admin/data-intelligence] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/super-admin/data-intelligence
 * Manual CRON triggers: { action: "trigger-aggregate" | "trigger-patterns" }
 */
export async function POST(request: NextRequest) {
  const result = await verifySuperAdmin();
  if ("error" in result) return result.error;

  const body = await request.json();
  const action = body?.action;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré sur le serveur" },
      { status: 500 }
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

  try {
    let endpoint = "";
    if (action === "trigger-aggregate") {
      endpoint = "/api/cron/aggregate-benchmarks";
    } else if (action === "trigger-patterns") {
      endpoint = "/api/cron/extract-patterns";
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use: trigger-aggregate, trigger-patterns" },
        { status: 400 }
      );
    }

    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const data = await res.json();
    return NextResponse.json({ success: res.ok, ...data });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "CRON trigger failed" },
      { status: 500 }
    );
  }
}

// ─── Pipeline Status ───────────────────────────────────────────

async function getPipelineStatus(admin: ReturnType<typeof createAdminClient>) {
  const a = admin as any;

  const [pendingRes, processedRes, lastProcessedRes, lastC3Res] =
    await Promise.all([
      a
        .from("aggregation_queue")
        .select("*", { count: "exact", head: true })
        .is("processed_at", null),
      a
        .from("aggregation_queue")
        .select("*", { count: "exact", head: true })
        .not("processed_at", "is", null),
      a
        .from("aggregation_queue")
        .select("processed_at")
        .not("processed_at", "is", null)
        .order("processed_at", { ascending: false })
        .limit(1),
      a
        .from("ai_quality_metrics")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1),
    ]);

  const pendingCount = pendingRes.count ?? 0;
  const processedCount = processedRes.count ?? 0;
  const lastHourlyCron = lastProcessedRes.data?.[0]?.processed_at ?? null;
  const lastWeeklyCron = lastC3Res.data?.[0]?.updated_at ?? null;

  // Queue breakdown by source_table
  const { data: pendingRows } = await a
    .from("aggregation_queue")
    .select("source_table")
    .is("processed_at", null);

  const queueBreakdown: Record<string, number> = {};
  for (const row of pendingRows || []) {
    queueBreakdown[row.source_table] =
      (queueBreakdown[row.source_table] || 0) + 1;
  }

  // Health assessment
  let health: "healthy" | "warning" | "error" | "empty" = "empty";
  if (processedCount === 0 && pendingCount === 0) {
    health = "empty";
  } else if (lastHourlyCron) {
    const hoursSinceLastRun =
      (Date.now() - new Date(lastHourlyCron).getTime()) / 3600000;
    if (hoursSinceLastRun < 2 && pendingCount < 100) {
      health = "healthy";
    } else if (hoursSinceLastRun < 6 || pendingCount < 500) {
      health = "warning";
    } else {
      health = "error";
    }
  } else if (pendingCount > 0) {
    health = "warning";
  }

  return {
    pending_count: pendingCount,
    processed_count: processedCount,
    last_hourly_cron: lastHourlyCron,
    last_weekly_cron: lastWeeklyCron,
    health,
    queue_breakdown: queueBreakdown,
  };
}

// ─── Consent Overview ──────────────────────────────────────────

async function getConsentOverview(
  admin: ReturnType<typeof createAdminClient>
) {
  const a = admin as any;

  const [orgsRes, consentsRes] = await Promise.all([
    a.from("organizations").select("*", { count: "exact", head: true }),
    a.from("aggregation_consent").select("module, opted_in"),
  ]);

  const totalOrgs = orgsRes.count ?? 0;
  const allConsents = consentsRes.data ?? [];

  const modules = CONSENT_MODULES.map((mod) => {
    const rows = allConsents.filter(
      (c: { module: string }) => c.module === mod
    );
    const optedIn = rows.filter(
      (c: { opted_in: boolean }) => c.opted_in
    ).length;
    return { module: mod, opted_in: optedIn, total_orgs: totalOrgs };
  });

  const totalOptIn = modules.reduce((s, m) => s + m.opted_in, 0);
  const maxPossible = CONSENT_MODULES.length * totalOrgs;

  return {
    modules,
    total_opt_in_rate:
      maxPossible > 0 ? Math.round((totalOptIn / maxPossible) * 100) : 0,
    total_orgs: totalOrgs,
  };
}

// ─── C2 Coverage ───────────────────────────────────────────────

async function getC2Coverage(admin: ReturnType<typeof createAdminClient>) {
  const a = admin as any;

  const counts = await Promise.all(
    C2_TABLES.map(async ({ table, label }) => {
      try {
        const { count } = await a
          .from(table)
          .select("*", { count: "exact", head: true });
        return { table, label, count: count ?? 0 };
      } catch {
        return { table, label, count: 0, error: true };
      }
    })
  );

  // Distinct CFC codes in market_benchmarks
  let cfcCoverage = 0;
  try {
    const { data: cfcRows } = await a
      .from("market_benchmarks")
      .select("cfc_code");
    cfcCoverage = new Set(
      (cfcRows || []).map((r: { cfc_code: string }) => r.cfc_code)
    ).size;
  } catch {
    // Table may not exist yet
  }

  const totalC2Records = counts.reduce((s, c) => s + c.count, 0);

  return {
    tables: counts,
    cfc_coverage: cfcCoverage,
    total_c2_records: totalC2Records,
  };
}

// ─── C3 AI Quality ─────────────────────────────────────────────

async function getC3Quality(admin: ReturnType<typeof createAdminClient>) {
  const a = admin as any;

  const [metricsRes, patternsRes, promptLogsRes] = await Promise.all([
    a
      .from("ai_quality_metrics")
      .select("*")
      .eq("scope", "global")
      .order("period", { ascending: false })
      .limit(100),
    a.from("pattern_library").select("module, confidence, usage_count"),
    a
      .from("prompt_optimization_log")
      .select("*")
      .order("deployed_at", { ascending: false })
      .limit(10),
  ]);

  const metrics = metricsRes.data ?? [];
  const patterns = patternsRes.data ?? [];
  const promptLogs = promptLogsRes.data ?? [];

  // Group metrics by module
  const metricsByModule: Record<
    string,
    {
      metric_type: string;
      current_value: number;
      current_period: string;
      previous_value: number | null;
      trend: number | null;
    }[]
  > = {};

  const grouped: Record<string, any[]> = {};
  for (const m of metrics) {
    const key = `${m.module}:${m.metric_type}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }

  for (const [key, items] of Object.entries(grouped)) {
    const [mod] = key.split(":");
    if (!metricsByModule[mod]) metricsByModule[mod] = [];
    const current = items[0];
    const previous = items[1] ?? null;
    const trend =
      previous && previous.value > 0
        ? ((current.value - previous.value) / previous.value) * 100
        : null;
    metricsByModule[mod].push({
      metric_type: current.metric_type,
      current_value: current.value,
      current_period: current.period,
      previous_value: previous?.value ?? null,
      trend: trend !== null ? Math.round(trend * 10) / 10 : null,
    });
  }

  // Group patterns by module
  const patternsByModule: Record<
    string,
    { count: number; avg_confidence: number }
  > = {};
  for (const p of patterns) {
    if (!patternsByModule[p.module]) {
      patternsByModule[p.module] = { count: 0, avg_confidence: 0 };
    }
    patternsByModule[p.module].count++;
    patternsByModule[p.module].avg_confidence += p.confidence ?? 0;
  }
  for (const mod of Object.keys(patternsByModule)) {
    const s = patternsByModule[mod];
    s.avg_confidence =
      s.count > 0 ? Math.round((s.avg_confidence / s.count) * 100) / 100 : 0;
  }

  return {
    metrics_by_module: metricsByModule,
    patterns_by_module: patternsByModule,
    recent_optimizations: promptLogs,
    total_metrics: metrics.length,
    total_patterns: patterns.length,
  };
}
