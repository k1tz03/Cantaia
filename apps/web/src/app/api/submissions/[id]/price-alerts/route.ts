import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/submissions/[id]/price-alerts
 * Cross-project price comparison for quoted items.
 * Compares each quoted item against historical prices from:
 * 1. submission_quotes from other projects (last 6 months)
 * 2. ingested_offer_lines (historical price data)
 *
 * Alert levels:
 * - red: > 20% above market
 * - yellow: 5-20% above market
 * - ok: within 5% of market
 * - no_data: no reference price available
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Get user's org for scoping
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    // Verify submission belongs to user's org
    const { data: submissionCheck } = await (admin as any)
      .from("submissions")
      .select("project_id, projects!submissions_project_id_fkey(organization_id)")
      .eq("id", submissionId)
      .maybeSingle();

    if (!submissionCheck) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }
    const proj = (submissionCheck as any).projects;
    if (proj && profile?.organization_id && proj.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get submission items with quotes (cast: migration 049 tables not in TS types)
    const { data: items } = await (admin as any)
      .from("submission_items")
      .select("*")
      .eq("submission_id", submissionId);

    if (!items || items.length === 0) {
      return NextResponse.json({ success: true, alerts: [] });
    }

    // Get quotes for this submission
    const { data: quotes } = await (admin as any)
      .from("submission_quotes")
      .select("*")
      .eq("submission_id", submissionId);

    if (!quotes || quotes.length === 0) {
      return NextResponse.json({ success: true, alerts: [] });
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Get historical prices from ingested_offer_lines
    const cfcCodes = [...new Set(items.map((i: any) => i.cfc_code).filter(Boolean))];
    let historicalPrices: Record<string, number[]> = {};

    if (cfcCodes.length > 0 && profile?.organization_id) {
      const { data: historicalLines } = await (admin as any)
        .from("ingested_offer_lines")
        .select("cfc_code, unit_price_ht, unit")
        .eq("organization_id", profile.organization_id)
        .in("cfc_code", cfcCodes)
        .gte("created_at", sixMonthsAgo.toISOString());

      if (historicalLines) {
        for (const line of historicalLines) {
          if (line.unit_price_ht != null && line.cfc_code) {
            if (!historicalPrices[line.cfc_code]) historicalPrices[line.cfc_code] = [];
            historicalPrices[line.cfc_code].push(Number(line.unit_price_ht));
          }
        }
      }
    }

    // Get prices from other submissions' quotes (cross-project comparison)
    const { data: otherQuotes } = await (admin as any)
      .from("submission_quotes")
      .select("item_id, unit_price_ht, submission_items!inner(description, cfc_code, unit)")
      .neq("submission_id", submissionId)
      .gte("extracted_at", sixMonthsAgo.toISOString())
      .not("unit_price_ht", "is", null);

    const crossProjectPrices: Record<string, number[]> = {};
    if (otherQuotes) {
      for (const q of otherQuotes) {
        const itemData = (q as any).submission_items;
        if (itemData?.cfc_code && q.unit_price_ht != null) {
          if (!crossProjectPrices[itemData.cfc_code]) crossProjectPrices[itemData.cfc_code] = [];
          crossProjectPrices[itemData.cfc_code].push(Number(q.unit_price_ht));
        }
      }
    }

    // Build alerts
    const alerts = [];
    for (const item of items) {
      const itemQuotes = quotes.filter((q: any) => q.item_id === item.id && q.unit_price_ht != null);
      if (itemQuotes.length === 0) continue;

      const bestPrice = Math.min(...itemQuotes.map((q: any) => Number(q.unit_price_ht)));
      const cfcCode = item.cfc_code || "";

      // Combine reference prices
      const refPrices = [
        ...(historicalPrices[cfcCode] || []),
        ...(crossProjectPrices[cfcCode] || []),
      ];

      if (refPrices.length === 0) {
        alerts.push({
          item_id: item.id,
          item_number: item.item_number,
          description: item.description,
          cfc_code: cfcCode,
          unit: item.unit,
          quantity: item.quantity,
          best_price: bestPrice,
          reference_price: null,
          difference_percent: null,
          level: "no_data" as const,
          num_references: 0,
        });
        continue;
      }

      // Calculate median reference price
      const sorted = [...refPrices].sort((a, b) => a - b);
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

      const diffPercent = median > 0 ? ((bestPrice - median) / median) * 100 : 0;
      let level: "red" | "yellow" | "ok" | "no_data" = "ok";
      if (diffPercent > 20) level = "red";
      else if (diffPercent > 5) level = "yellow";

      alerts.push({
        item_id: item.id,
        item_number: item.item_number,
        description: item.description,
        cfc_code: cfcCode,
        unit: item.unit,
        quantity: item.quantity,
        best_price: bestPrice,
        reference_price: Math.round(median * 100) / 100,
        difference_percent: Math.round(diffPercent * 10) / 10,
        level,
        num_references: refPrices.length,
      });
    }

    // Sort: red first, then yellow, then ok, then no_data
    const levelOrder = { red: 0, yellow: 1, ok: 2, no_data: 3 };
    alerts.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);

    return NextResponse.json({
      success: true,
      alerts,
      summary: {
        total: alerts.length,
        red: alerts.filter((a) => a.level === "red").length,
        yellow: alerts.filter((a) => a.level === "yellow").length,
        ok: alerts.filter((a) => a.level === "ok").length,
        no_data: alerts.filter((a) => a.level === "no_data").length,
      },
    });

  } catch (err: any) {
    console.error("[price-alerts] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
