import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// GET /api/super-admin/data-pipeline
// ============================================================
// Returns data pipeline health, learning progress, module enrichment,
// data quality, and cost-vs-intelligence metrics for the super-admin
// Data Pipeline Dashboard.
// Actions: health-overview, learning-progress, module-enrichment,
//          data-quality, cost-vs-intelligence
// Protected by superadmin access check.

export const dynamic = "force-dynamic";

type ActionType =
  | "health-overview"
  | "learning-progress"
  | "module-enrichment"
  | "data-quality"
  | "cost-vs-intelligence";

function getPeriodDays(period: string): number {
  switch (period) {
    case "90d":
      return 90;
    case "7d":
      return 7;
    case "30d":
    default:
      return 30;
  }
}

function getStartDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}

type AdminClient = any;

export async function GET(request: NextRequest) {
  const check = await requireSuperadmin();
  if (!check.authorized) {
    return NextResponse.json(
      { error: check.error || "Unauthorized" },
      { status: 403 }
    );
  }

  const { searchParams } = request.nextUrl;
  const action = (searchParams.get("action") || "health-overview") as ActionType;
  const period = searchParams.get("period") || "30d";
  const days = getPeriodDays(period);
  const startDate = getStartDate(days);

  const admin = createAdminClient();

  try {
    switch (action) {
      case "health-overview":
        return await handleHealthOverview(admin, startDate);
      case "learning-progress":
        return await handleLearningProgress(admin, startDate);
      case "module-enrichment":
        return await handleModuleEnrichment(admin, startDate);
      case "data-quality":
        return await handleDataQuality(admin, startDate);
      case "cost-vs-intelligence":
        return await handleCostVsIntelligence(admin, startDate);
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("[data-pipeline] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

// ---- Helpers ----

interface TableDef {
  key: string;
  table: string;
  module: string;
  orgCol: string;
}

const C1_TABLES: TableDef[] = [
  { key: "email_feedback", table: "email_classification_feedback", module: "mail", orgCol: "organization_id" },
  { key: "email_rules", table: "email_classification_rules", module: "mail", orgCol: "organization_id" },
  { key: "qty_corrections", table: "quantity_corrections", module: "plans", orgCol: "org_id" },
  { key: "price_calibrations", table: "price_calibrations", module: "prix", orgCol: "org_id" },
  { key: "plan_corrections", table: "plan_analysis_corrections", module: "plans", orgCol: "org_id" },
  { key: "pv_corrections", table: "pv_corrections", module: "pv", orgCol: "organization_id" },
  { key: "visit_corrections", table: "visit_report_corrections", module: "visites", orgCol: "organization_id" },
  { key: "submission_corrections", table: "submission_corrections", module: "soumissions", orgCol: "organization_id" },
  { key: "chat_feedback", table: "chat_feedback", module: "chat", orgCol: "organization_id" },
  { key: "task_status_log", table: "task_status_log", module: "taches", orgCol: "organization_id" },
  { key: "supplier_prefs", table: "supplier_preferences", module: "fournisseurs", orgCol: "organization_id" },
  { key: "ingested_prices", table: "ingested_offer_lines", module: "prix", orgCol: "org_id" },
];

async function safeCount(
  admin: AdminClient,
  table: string,
  startDate?: string
): Promise<number> {
  try {
    let query = (admin as any).from(table).select("id", { count: "exact", head: true });
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    const { count } = await query;
    return count || 0;
  } catch {
    return 0;
  }
}

async function safeSelect(
  admin: AdminClient,
  table: string,
  columns: string,
  startDate?: string,
  extra?: (q: any) => any
): Promise<any[]> {
  try {
    let query = (admin as any).from(table).select(columns);
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (extra) {
      query = extra(query);
    }
    const { data } = await query;
    return data || [];
  } catch {
    return [];
  }
}

// ---- Action 1: health-overview ----

async function handleHealthOverview(admin: AdminClient, startDate: string) {
  // Query all 12 C1 tables for total and period counts in parallel
  const tableResults = await Promise.all(
    C1_TABLES.map(async (t) => {
      const [total, periodCount] = await Promise.all([
        safeCount(admin, t.table),
        safeCount(admin, t.table, startDate),
      ]);
      return {
        key: t.key,
        module: t.module,
        total,
        period_count: periodCount,
      };
    })
  );

  // Aggregation queue: pending vs processed
  let queuePending = 0;
  let queueProcessed = 0;
  try {
    const { count: pending } = await (admin as any)
      .from("aggregation_queue")
      .select("id", { count: "exact", head: true })
      .is("processed_at", null);
    queuePending = pending || 0;
  } catch {
    // table may not exist
  }
  try {
    const { count: processed } = await (admin as any)
      .from("aggregation_queue")
      .select("id", { count: "exact", head: true })
      .not("processed_at", "is", null);
    queueProcessed = processed || 0;
  } catch {
    // table may not exist
  }

  // AI usage in period
  let aiCalls = 0;
  let aiCost = 0;
  try {
    const { count } = await (admin as any)
      .from("api_usage_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startDate);
    aiCalls = count || 0;
  } catch {
    // table may not exist
  }
  try {
    const { data: costRows } = await (admin as any)
      .from("api_usage_logs")
      .select("estimated_cost_chf")
      .gte("created_at", startDate);
    if (costRows) {
      for (const r of costRows) {
        aiCost += Number(r.estimated_cost_chf) || 0;
      }
    }
  } catch {
    // table may not exist
  }

  return NextResponse.json({
    success: true,
    data: {
      tables: tableResults,
      queue: { pending: queuePending, processed: queueProcessed },
      ai: { calls: aiCalls, cost: Math.round(aiCost * 100) / 100 },
    },
  });
}

// ---- Action 2: learning-progress ----

async function handleLearningProgress(admin: AdminClient, startDate: string) {
  // 1. Email rules: auto-promoted (times_confirmed >= 2), totals
  let autoPromotedRules = 0;
  let totalConfirmed = 0;
  let totalOverridden = 0;
  try {
    const { count } = await (admin as any)
      .from("email_classification_rules")
      .select("id", { count: "exact", head: true })
      .gte("times_confirmed", 2);
    autoPromotedRules = count || 0;
  } catch {
    // table may not exist
  }
  try {
    const { data: ruleRows } = await (admin as any)
      .from("email_classification_rules")
      .select("times_confirmed, times_overridden");
    if (ruleRows) {
      for (const r of ruleRows) {
        totalConfirmed += Number(r.times_confirmed) || 0;
        totalOverridden += Number(r.times_overridden) || 0;
      }
    }
  } catch {
    // table may not exist
  }

  // 2. Price calibrations: avg ecart, avg coefficient, count, last 10
  let priceAvgEcart = 0;
  let priceAvgCoeff = 0;
  let priceCount = 0;
  let priceRecent: Array<{ cfc_code: string; ecart_pct: number; coefficient: number; created_at: string }> = [];
  try {
    const { data: priceRows } = await (admin as any)
      .from("price_calibrations")
      .select("ecart_pct, coefficient, cfc_code, created_at")
      .gte("created_at", startDate);
    if (priceRows && priceRows.length > 0) {
      priceCount = priceRows.length;
      let sumEcart = 0;
      let sumCoeff = 0;
      for (const r of priceRows) {
        sumEcart += Math.abs(Number(r.ecart_pct) || 0);
        sumCoeff += Number(r.coefficient) || 0;
      }
      priceAvgEcart = Math.round((sumEcart / priceCount) * 100) / 100;
      priceAvgCoeff = Math.round((sumCoeff / priceCount) * 1000) / 1000;
    }
  } catch {
    // table may not exist
  }
  try {
    const { data: recent } = await (admin as any)
      .from("price_calibrations")
      .select("cfc_code, ecart_pct, coefficient, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (recent) {
      priceRecent = recent.map((r: any) => ({
        cfc_code: r.cfc_code || "",
        ecart_pct: Number(r.ecart_pct) || 0,
        coefficient: Number(r.coefficient) || 0,
        created_at: r.created_at,
      }));
    }
  } catch {
    // table may not exist
  }

  // 3. Chat feedback: up vs down
  let chatUp = 0;
  let chatDown = 0;
  try {
    const { count: up } = await (admin as any)
      .from("chat_feedback")
      .select("id", { count: "exact", head: true })
      .eq("rating", "up")
      .gte("created_at", startDate);
    chatUp = up || 0;
  } catch {
    // table may not exist
  }
  try {
    const { count: down } = await (admin as any)
      .from("chat_feedback")
      .select("id", { count: "exact", head: true })
      .eq("rating", "down")
      .gte("created_at", startDate);
    chatDown = down || 0;
  } catch {
    // table may not exist
  }

  // 4. Task status log: count by new_status, avg duration for done
  const taskStatusCounts: Record<string, number> = {};
  let taskAvgDurationDays = 0;
  try {
    const { data: taskRows } = await (admin as any)
      .from("task_status_log")
      .select("new_status, duration_days")
      .gte("created_at", startDate);
    if (taskRows) {
      let doneCount = 0;
      let doneSum = 0;
      for (const r of taskRows) {
        const status = r.new_status || "unknown";
        taskStatusCounts[status] = (taskStatusCounts[status] || 0) + 1;
        if (status === "done" && r.duration_days != null) {
          doneCount++;
          doneSum += Number(r.duration_days) || 0;
        }
      }
      if (doneCount > 0) {
        taskAvgDurationDays = Math.round((doneSum / doneCount) * 10) / 10;
      }
    }
  } catch {
    // table may not exist
  }

  // 5. Other corrections counts
  const [pvCorrections, submissionCorrections, visitCorrections] = await Promise.all([
    safeCount(admin, "pv_corrections", startDate),
    safeCount(admin, "submission_corrections", startDate),
    safeCount(admin, "visit_report_corrections", startDate),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      email_rules: {
        auto_promoted: autoPromotedRules,
        total_confirmed: totalConfirmed,
        total_overridden: totalOverridden,
      },
      price_calibrations: {
        count: priceCount,
        avg_ecart_pct: priceAvgEcart,
        avg_coefficient: priceAvgCoeff,
        recent: priceRecent,
      },
      chat_feedback: {
        up: chatUp,
        down: chatDown,
        satisfaction_pct: chatUp + chatDown > 0
          ? Math.round((chatUp / (chatUp + chatDown)) * 100)
          : 0,
      },
      task_status: {
        counts: taskStatusCounts,
        avg_duration_days: taskAvgDurationDays,
      },
      other_corrections: {
        pv: pvCorrections,
        submissions: submissionCorrections,
        visits: visitCorrections,
      },
    },
  });
}

// ---- Action 3: module-enrichment ----

interface ModuleDef {
  module: string;
  icon: string;
  tables: string[];
}

const MODULE_DEFS: ModuleDef[] = [
  { module: "mail", icon: "Mail", tables: ["email_classification_feedback", "email_classification_rules"] },
  { module: "soumissions", icon: "FileText", tables: ["submission_corrections"] },
  { module: "plans", icon: "Map", tables: ["plan_analysis_corrections", "quantity_corrections"] },
  { module: "prix", icon: "DollarSign", tables: ["price_calibrations", "ingested_offer_lines"] },
  { module: "pv", icon: "ClipboardList", tables: ["pv_corrections"] },
  { module: "visites", icon: "HardHat", tables: ["visit_report_corrections"] },
  { module: "chat", icon: "MessageSquare", tables: ["chat_feedback"] },
  { module: "taches", icon: "CheckSquare", tables: ["task_status_log"] },
  { module: "fournisseurs", icon: "Users", tables: ["supplier_preferences"] },
];

async function handleModuleEnrichment(admin: AdminClient, startDate: string) {
  // For each module, get total + period count + last activity
  const modules = await Promise.all(
    MODULE_DEFS.map(async (mod) => {
      let total = 0;
      let periodCount = 0;
      let lastActivity: string | null = null;

      for (const table of mod.tables) {
        const [t, p] = await Promise.all([
          safeCount(admin, table),
          safeCount(admin, table, startDate),
        ]);
        total += t;
        periodCount += p;

        // Get last activity date
        try {
          const { data: lastRow } = await (admin as any)
            .from(table)
            .select("created_at")
            .order("created_at", { ascending: false })
            .limit(1);
          if (lastRow && lastRow.length > 0) {
            const rowDate = lastRow[0].created_at;
            if (!lastActivity || rowDate > lastActivity) {
              lastActivity = rowDate;
            }
          }
        } catch {
          // table may not exist
        }
      }

      return {
        module: mod.module,
        icon: mod.icon,
        total,
        period_count: periodCount,
        last_activity: lastActivity,
      };
    })
  );

  // Daily trend for last 30 days across all modules
  // Use the largest tables for performance
  const trendTables = [
    { table: "email_classification_feedback", module: "mail" },
    { table: "task_status_log", module: "taches" },
    { table: "ingested_offer_lines", module: "prix" },
    { table: "price_calibrations", module: "prix" },
    { table: "chat_feedback", module: "chat" },
    { table: "quantity_corrections", module: "plans" },
  ];

  const thirtyDaysAgo = getStartDate(30);
  const dailyTrend: Record<string, Record<string, number>> = {};

  for (const t of trendTables) {
    const rows = await safeSelect(admin, t.table, "created_at", thirtyDaysAgo);
    for (const r of rows) {
      if (!r.created_at) continue;
      const day = r.created_at.split("T")[0];
      if (!dailyTrend[day]) dailyTrend[day] = {};
      dailyTrend[day][t.module] = (dailyTrend[day][t.module] || 0) + 1;
    }
  }

  const trend = Object.entries(dailyTrend)
    .map(([date, modules_data]) => ({ date, ...modules_data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    success: true,
    data: {
      modules,
      daily_trend: trend,
    },
  });
}

// ---- Action 4: data-quality ----

async function handleDataQuality(admin: AdminClient, startDate: string) {
  // 1. Price calibration accuracy
  let priceAccuracyCount = 0;
  let priceAccurateCount = 0;
  let priceAvgEcart = 0;
  try {
    const { data: priceRows } = await (admin as any)
      .from("price_calibrations")
      .select("ecart_pct")
      .gte("created_at", startDate);
    if (priceRows && priceRows.length > 0) {
      priceAccuracyCount = priceRows.length;
      let sumEcart = 0;
      for (const r of priceRows) {
        const ecart = Math.abs(Number(r.ecart_pct) || 0);
        sumEcart += ecart;
        if (ecart < 10) priceAccurateCount++;
      }
      priceAvgEcart = Math.round((sumEcart / priceAccuracyCount) * 100) / 100;
    }
  } catch {
    // table may not exist
  }

  // 2. Email classification confidence buckets
  const confidenceBuckets = {
    excellent: 0,   // > 0.95
    good: 0,        // 0.85 - 0.95
    moderate: 0,    // 0.75 - 0.85
    low: 0,         // 0.65 - 0.75
    very_low: 0,    // < 0.65
  };
  try {
    const { data: emailRows } = await (admin as any)
      .from("email_records")
      .select("ai_classification_confidence")
      .gte("received_at", startDate)
      .not("ai_classification_confidence", "is", null);
    if (emailRows) {
      for (const r of emailRows) {
        const conf = Number(r.ai_classification_confidence) || 0;
        if (conf > 0.95) confidenceBuckets.excellent++;
        else if (conf >= 0.85) confidenceBuckets.good++;
        else if (conf >= 0.75) confidenceBuckets.moderate++;
        else if (conf >= 0.65) confidenceBuckets.low++;
        else confidenceBuckets.very_low++;
      }
    }
  } catch {
    // table may not exist
  }

  // 3. Price calibration coefficient stats
  let coeffAvg = 0;
  let coeffMin = 0;
  let coeffMax = 0;
  try {
    const { data: coeffRows } = await (admin as any)
      .from("price_calibrations")
      .select("coefficient")
      .gte("created_at", startDate);
    if (coeffRows && coeffRows.length > 0) {
      let sum = 0;
      let min = Infinity;
      let max = -Infinity;
      for (const r of coeffRows) {
        const c = Number(r.coefficient) || 0;
        sum += c;
        if (c < min) min = c;
        if (c > max) max = c;
      }
      coeffAvg = Math.round((sum / coeffRows.length) * 1000) / 1000;
      coeffMin = Math.round(min * 1000) / 1000;
      coeffMax = Math.round(max * 1000) / 1000;
    }
  } catch {
    // table may not exist
  }

  // 4. Chat satisfaction rate
  let chatUp = 0;
  let chatDown = 0;
  try {
    const { count: up } = await (admin as any)
      .from("chat_feedback")
      .select("id", { count: "exact", head: true })
      .eq("rating", "up")
      .gte("created_at", startDate);
    chatUp = up || 0;
  } catch {
    // table may not exist
  }
  try {
    const { count: down } = await (admin as any)
      .from("chat_feedback")
      .select("id", { count: "exact", head: true })
      .eq("rating", "down")
      .gte("created_at", startDate);
    chatDown = down || 0;
  } catch {
    // table may not exist
  }

  const chatTotal = chatUp + chatDown;
  const chatSatisfactionPct = chatTotal > 0 ? Math.round((chatUp / chatTotal) * 100) : 0;

  return NextResponse.json({
    success: true,
    data: {
      price_accuracy: {
        total: priceAccuracyCount,
        accurate_count: priceAccurateCount,
        accuracy_pct: priceAccuracyCount > 0
          ? Math.round((priceAccurateCount / priceAccuracyCount) * 100)
          : 0,
        avg_ecart_pct: priceAvgEcart,
      },
      email_confidence: confidenceBuckets,
      price_coefficient: {
        avg: coeffAvg,
        min: coeffMin,
        max: coeffMax,
      },
      chat_satisfaction: {
        up: chatUp,
        down: chatDown,
        total: chatTotal,
        satisfaction_pct: chatSatisfactionPct,
      },
    },
  });
}

// ---- Action 5: cost-vs-intelligence ----

async function handleCostVsIntelligence(admin: AdminClient, startDate: string) {
  // 1. Daily AI cost from api_usage_logs
  const dailyCostMap = new Map<string, { cost: number; calls: number }>();
  try {
    const { data: aiRows } = await (admin as any)
      .from("api_usage_logs")
      .select("estimated_cost_chf, created_at")
      .gte("created_at", startDate);
    if (aiRows) {
      for (const r of aiRows) {
        if (!r.created_at) continue;
        const day = r.created_at.split("T")[0];
        const existing = dailyCostMap.get(day) || { cost: 0, calls: 0 };
        existing.cost += Number(r.estimated_cost_chf) || 0;
        existing.calls += 1;
        dailyCostMap.set(day, existing);
      }
    }
  } catch {
    // table may not exist
  }

  // 2. Daily learning points from largest C1 tables
  const learningTables = [
    "email_classification_feedback",
    "task_status_log",
    "ingested_offer_lines",
    "price_calibrations",
  ];

  const dailyLearningMap = new Map<string, number>();
  for (const table of learningTables) {
    const rows = await safeSelect(admin, table, "created_at", startDate);
    for (const r of rows) {
      if (!r.created_at) continue;
      const day = r.created_at.split("T")[0];
      dailyLearningMap.set(day, (dailyLearningMap.get(day) || 0) + 1);
    }
  }

  // 3. Merge into daily array
  const allDays = new Set<string>([
    ...dailyCostMap.keys(),
    ...dailyLearningMap.keys(),
  ]);

  let totalCost = 0;
  let totalPoints = 0;

  const daily = Array.from(allDays)
    .map((date) => {
      const costData = dailyCostMap.get(date) || { cost: 0, calls: 0 };
      const learningPoints = dailyLearningMap.get(date) || 0;
      totalCost += costData.cost;
      totalPoints += learningPoints;
      return {
        date,
        ai_cost: Math.round(costData.cost * 100) / 100,
        ai_calls: costData.calls,
        learning_points: learningPoints,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const costPerPoint = totalPoints > 0
    ? Math.round((totalCost / totalPoints) * 1000) / 1000
    : 0;

  return NextResponse.json({
    success: true,
    data: {
      daily,
      totals: {
        cost: Math.round(totalCost * 100) / 100,
        points: totalPoints,
        cost_per_point: costPerPoint,
      },
    },
  });
}
