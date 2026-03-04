import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/cron/extract-patterns
 * Vercel CRON — runs weekly (Sunday 3am) to extract C3 patterns from C2 data.
 * Analyzes corrections, feedbacks, and quality metrics to update the pattern library.
 * Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const modules = ["mail", "pv", "plans", "prix", "chat", "tasks", "visits", "briefing", "soumissions"];
  const results: { module: string; patterns_updated: number; error?: string }[] = [];

  try {
    const currentWeek = `${new Date().getFullYear()}-W${String(getWeekNumber(new Date())).padStart(2, "0")}`;

    for (const module of modules) {
      try {
        let patternsUpdated = 0;

        // 1. Compute quality metrics for this module
        const metrics = await computeModuleMetrics(admin, module, currentWeek);

        // 2. Store metrics in ai_quality_metrics
        for (const metric of metrics) {
          await (admin as any).from("ai_quality_metrics").upsert(
            {
              module,
              metric_type: metric.type,
              value: metric.value,
              period: currentWeek,
              scope: "global",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "module,metric_type,period,scope" }
          );
        }

        // 3. Extract patterns from corrections data
        const patterns = await extractModulePatterns(admin, module);
        for (const pattern of patterns) {
          const { error } = await (admin as any).from("pattern_library").upsert(
            {
              module,
              pattern_type: pattern.type,
              pattern_data: pattern.data,
              confidence: pattern.confidence,
              usage_count: pattern.usage_count || 0,
              last_validated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "module,pattern_type" }
          );
          if (!error) patternsUpdated++;
        }

        results.push({ module, patterns_updated: patternsUpdated });
      } catch (err: any) {
        console.error(`[cron/patterns] Error for module ${module}:`, err?.message);
        results.push({ module, patterns_updated: 0, error: err?.message });
      }
    }

    const totalPatterns = results.reduce((s, r) => s + r.patterns_updated, 0);
    console.log(`[cron/patterns] Done: ${totalPatterns} patterns updated across ${modules.length} modules`);

    return NextResponse.json({
      success: true,
      results,
      total_patterns_updated: totalPatterns,
    });
  } catch (err: any) {
    console.error("[cron/patterns] Fatal error:", err);
    return NextResponse.json(
      { error: err?.message || "Pattern extraction failed" },
      { status: 500 }
    );
  }
}

// ---------- Helpers ----------

function getWeekNumber(d: Date): number {
  const oneJan = new Date(d.getFullYear(), 0, 1);
  const numberOfDays = Math.floor((d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
}

interface MetricResult {
  type: string;
  value: number;
}

async function computeModuleMetrics(
  admin: any,
  module: string,
  _period: string
): Promise<MetricResult[]> {
  const metrics: MetricResult[] = [];

  switch (module) {
    case "prix": {
      // Count total line items and corrections
      const { count: totalItems } = await admin
        .from("offer_line_items")
        .select("*", { count: "exact", head: true });
      const { count: corrections } = await admin
        .from("submission_corrections")
        .select("*", { count: "exact", head: true });
      metrics.push({
        type: "total_data_points",
        value: totalItems || 0,
      });
      metrics.push({
        type: "correction_rate",
        value: totalItems ? (corrections || 0) / totalItems : 0,
      });
      break;
    }
    case "mail": {
      const { count: totalEmails } = await admin
        .from("email_records")
        .select("*", { count: "exact", head: true });
      const { count: feedbacks } = await admin
        .from("email_classification_feedback")
        .select("*", { count: "exact", head: true });
      metrics.push({
        type: "total_emails",
        value: totalEmails || 0,
      });
      metrics.push({
        type: "correction_rate",
        value: totalEmails ? (feedbacks || 0) / totalEmails : 0,
      });
      break;
    }
    case "chat": {
      const { count: totalConversations } = await admin
        .from("chat_conversations")
        .select("*", { count: "exact", head: true });
      const { count: positiveFeedback } = await admin
        .from("chat_feedback")
        .select("*", { count: "exact", head: true })
        .eq("rating", "up");
      const { count: totalFeedback } = await admin
        .from("chat_feedback")
        .select("*", { count: "exact", head: true });
      metrics.push({
        type: "total_conversations",
        value: totalConversations || 0,
      });
      metrics.push({
        type: "satisfaction_rate",
        value: totalFeedback ? (positiveFeedback || 0) / totalFeedback : 0,
      });
      break;
    }
    default: {
      // For modules not yet fully active, record a basic metric
      metrics.push({ type: "active", value: 0 });
      break;
    }
  }

  return metrics;
}

interface PatternResult {
  type: string;
  data: Record<string, unknown>;
  confidence: number;
  usage_count?: number;
}

async function extractModulePatterns(
  admin: any,
  module: string
): Promise<PatternResult[]> {
  const patterns: PatternResult[] = [];

  switch (module) {
    case "prix": {
      // Pattern: most common CFC codes with correction rates
      const { data: corrections } = await admin
        .from("submission_corrections")
        .select("field, old_value, new_value")
        .eq("field", "cfc_code")
        .limit(100);

      if (corrections && corrections.length > 0) {
        const correctionMap: Record<string, number> = {};
        for (const c of corrections) {
          const key = `${c.old_value}→${c.new_value}`;
          correctionMap[key] = (correctionMap[key] || 0) + 1;
        }
        patterns.push({
          type: "cfc_correction_patterns",
          data: { corrections: correctionMap },
          confidence: 0.7,
          usage_count: corrections.length,
        });
      }
      break;
    }
    case "mail": {
      // Pattern: common reclassification patterns
      const { data: feedbacks } = await admin
        .from("email_classification_feedback")
        .select("original_classification, corrected_classification")
        .limit(200);

      if (feedbacks && feedbacks.length > 0) {
        const classificationMap: Record<string, number> = {};
        for (const f of feedbacks) {
          if (f.original_classification && f.corrected_classification) {
            const key = `${f.original_classification}→${f.corrected_classification}`;
            classificationMap[key] = (classificationMap[key] || 0) + 1;
          }
        }
        patterns.push({
          type: "classification_correction_patterns",
          data: { corrections: classificationMap },
          confidence: 0.6,
          usage_count: feedbacks.length,
        });
      }
      break;
    }
    case "chat": {
      // Pattern: common question themes from feedback
      const { data: feedback } = await admin
        .from("chat_feedback")
        .select("rating, comment")
        .limit(100);

      if (feedback && feedback.length > 0) {
        const positiveCount = feedback.filter((f: any) => f.rating === "up").length;
        patterns.push({
          type: "satisfaction_patterns",
          data: {
            total_feedback: feedback.length,
            positive_rate: positiveCount / feedback.length,
            sample_comments: feedback
              .filter((f: any) => f.comment)
              .slice(0, 10)
              .map((f: any) => f.comment),
          },
          confidence: 0.5,
          usage_count: feedback.length,
        });
      }
      break;
    }
    default:
      break;
  }

  return patterns;
}
